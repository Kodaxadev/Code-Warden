#!/usr/bin/env node
'use strict';

/**
 * hook-coverage-tests.js
 * Behavioral tests for the expanded Claude hook coverage:
 *   - warden-command-hook.js (Bash/PowerShell command secrets gate)
 *   - warden-secrets-hook.js (NotebookEdit scanning + secrets.allowlist)
 *   - warden-lint-hook.js    (NotebookEdit exemption, lint.exclude_paths,
 *                             pre_flight_trigger_lines ask gate)
 *   - install-hooks.js       (pure functions: buildMatcherGroups + strip)
 *
 * Hooks are exercised through their real stdin interface. Project configs
 * live in temp dirs under os.tmpdir() with a .git boundary so discovery never
 * escapes into the host filesystem. The user's home dir is never touched.
 */

const { test } = require('node:test');
const assert        = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path          = require('node:path');
const fs            = require('node:fs');
const os            = require('node:os');

const HOOKS = path.join(__dirname, '..', 'hooks', 'claude');
const LINT_HOOK    = path.join(HOOKS, 'warden-lint-hook.js');
const SECRETS_HOOK = path.join(HOOKS, 'warden-secrets-hook.js');
const COMMAND_HOOK = path.join(HOOKS, 'warden-command-hook.js');

// ---------------------------------------------------------------------------
// Fixture helpers — fake secrets built from parts, never contiguous literals
// ---------------------------------------------------------------------------

function makeFakeSecret() {
  return ['sk', '-', 'a'.repeat(48)].join('');
}

function makeLines(count) {
  const lines = [];
  for (let i = 1; i <= count; i++) lines.push(`const line${i} = ${i};`);
  return lines.join('\n') + '\n';
}

/** Create a temp project with a .git boundary and a codewarden.json. */
function makeProject(config) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `cw-hook-${process.pid}-`));
  fs.mkdirSync(path.join(root, '.git'), { recursive: true });
  fs.writeFileSync(path.join(root, 'codewarden.json'), JSON.stringify(config, null, 2) + '\n');
  return root;
}

const cleanup = (root) => fs.rmSync(root, { recursive: true, force: true });

function runHook(scriptPath, payload) {
  const result = spawnSync(process.execPath, [scriptPath], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
  });
  return { code: result.status ?? result.signal, stdout: result.stdout || '', stderr: result.stderr || '' };
}

function decisionOf(stdout) {
  return JSON.parse(stdout).hookSpecificOutput.permissionDecision;
}

// ---------------------------------------------------------------------------
// Command hook: Bash/PowerShell secrets gate
// ---------------------------------------------------------------------------

test('command hook: Bash command with secret exits 2 with deny', () => {
  const { code, stdout } = runHook(COMMAND_HOOK, {
    tool_name:  'Bash',
    tool_input: { command: `echo ${makeFakeSecret()} > creds.txt` },
  });
  assert.equal(code, 2, 'expected exit 2 (deny)');
  assert.equal(decisionOf(stdout), 'deny');
});

test('command hook: PowerShell command with secret exits 2 with deny', () => {
  const { code, stdout } = runHook(COMMAND_HOOK, {
    tool_name:  'PowerShell',
    tool_input: { command: `$env:X = '${makeFakeSecret()}'; Invoke-Thing` },
  });
  assert.equal(code, 2, 'expected exit 2 (deny)');
  assert.equal(decisionOf(stdout), 'deny');
});

test('command hook: clean command exits 0 with no output', () => {
  const { code, stdout } = runHook(COMMAND_HOOK, {
    tool_name:  'Bash',
    tool_input: { command: 'git status && npm test' },
  });
  assert.equal(code, 0);
  assert.equal(stdout, '');
});

test('command hook: unrelated tool passes through', () => {
  const { code } = runHook(COMMAND_HOOK, {
    tool_name:  'Write',
    tool_input: { file_path: 'x.js', content: makeFakeSecret() },
  });
  assert.equal(code, 0, 'command hook must ignore non-command tools');
});

// ---------------------------------------------------------------------------
// Secrets hook: NotebookEdit + allowlist
// ---------------------------------------------------------------------------

test('secrets hook: NotebookEdit with secret in new_source exits 2', () => {
  const root = makeProject({});
  try {
    const { code, stdout } = runHook(SECRETS_HOOK, {
      tool_name:  'NotebookEdit',
      cwd:        root,
      tool_input: {
        file_path:  path.join(root, 'analysis.ipynb'),
        cell_id:    'cell-1',
        new_source: `key = '${makeFakeSecret()}'`,
        edit_mode:  'replace',
      },
    });
    assert.equal(code, 2, 'expected exit 2 (deny) for notebook cell secret');
    assert.equal(decisionOf(stdout), 'deny');
  } finally {
    cleanup(root);
  }
});

test('secrets hook: allowlisted path skips the scan', () => {
  const root = makeProject({ secrets: { allowlist: ['fixtures/'] } });
  try {
    const payload = (file) => ({
      tool_name:  'Write',
      cwd:        root,
      tool_input: { file_path: path.join(root, file), content: `const K = '${makeFakeSecret()}';` },
    });
    const allowed = runHook(SECRETS_HOOK, payload('fixtures/sample.js'));
    assert.equal(allowed.code, 0, 'allowlisted path must pass');

    const denied = runHook(SECRETS_HOOK, payload('src/app.js'));
    assert.equal(denied.code, 2, 'non-allowlisted path must still deny');
  } finally {
    cleanup(root);
  }
});

// ---------------------------------------------------------------------------
// Lint hook: NotebookEdit exemption + exclude_paths + project thresholds
// ---------------------------------------------------------------------------

test('lint hook: NotebookEdit is exempt from the length gate', () => {
  const root = makeProject({ thresholds: { max_file_length: 50 } });
  try {
    const { code, stdout } = runHook(LINT_HOOK, {
      tool_name:  'NotebookEdit',
      cwd:        root,
      tool_input: { file_path: path.join(root, 'big.ipynb'), new_source: makeLines(200) },
    });
    assert.equal(code, 0, 'notebook cells are not files - no length gate');
    assert.equal(stdout, '');
  } finally {
    cleanup(root);
  }
});

test('lint hook: lint.exclude_paths allows an oversized write', () => {
  const root = makeProject({
    thresholds: { max_file_length: 100, pre_flight_trigger_lines: 500 },
    lint:       { exclude_paths: ['vendor/'] },
  });
  try {
    const payload = (file) => ({
      tool_name:  'Write',
      cwd:        root,
      tool_input: { file_path: path.join(root, file), content: makeLines(120) },
    });
    const excluded = runHook(LINT_HOOK, payload('vendor/bundle.js'));
    assert.equal(excluded.code, 0, 'excluded path must pass the length gate');

    const denied = runHook(LINT_HOOK, payload('src/app.js'));
    assert.equal(denied.code, 2, 'non-excluded path must still deny');
    assert.equal(decisionOf(denied.stdout), 'deny');
  } finally {
    cleanup(root);
  }
});

test('lint hook: discovered project max_file_length overrides skill default', () => {
  const root = makeProject({ thresholds: { max_file_length: 50, pre_flight_trigger_lines: 500 } });
  try {
    const { code, stdout } = runHook(LINT_HOOK, {
      tool_name:  'Write',
      cwd:        root,
      tool_input: { file_path: path.join(root, 'src', 'app.js'), content: makeLines(60) },
    });
    assert.equal(code, 2, '60 lines must deny under a project limit of 50');
    assert.equal(decisionOf(stdout), 'deny');
  } finally {
    cleanup(root);
  }
});

// ---------------------------------------------------------------------------
// Lint hook: pre_flight_trigger_lines ask gate
// ---------------------------------------------------------------------------

test('lint hook: Write past pre-flight trigger asks for confirmation', () => {
  const root = makeProject({ thresholds: { max_file_length: 200, pre_flight_trigger_lines: 50 } });
  try {
    const { code, stdout } = runHook(LINT_HOOK, {
      tool_name:  'Write',
      cwd:        root,
      tool_input: { file_path: path.join(root, 'src', 'big.js'), content: makeLines(80) },
    });
    assert.equal(code, 0, 'ask responses exit 0');
    assert.equal(decisionOf(stdout), 'ask');
    assert.match(JSON.parse(stdout).hookSpecificOutput.permissionDecisionReason,
      /Pre-flight gate: single change of 80 lines exceeds 50/);
  } finally {
    cleanup(root);
  }
});

test('lint hook: Edit new_string past pre-flight trigger asks', () => {
  const root = makeProject({ thresholds: { max_file_length: 200, pre_flight_trigger_lines: 50 } });
  try {
    const target = path.join(root, 'src', 'mod.js');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, "'use strict';\n// PLACEHOLDER\n");
    const { code, stdout } = runHook(LINT_HOOK, {
      tool_name:  'Edit',
      cwd:        root,
      tool_input: { file_path: target, old_string: '// PLACEHOLDER', new_string: makeLines(80) },
    });
    assert.equal(code, 0, 'ask responses exit 0');
    assert.equal(decisionOf(stdout), 'ask');
  } finally {
    cleanup(root);
  }
});

test('lint hook: below trigger passes silently; above limit still denies', () => {
  const root = makeProject({ thresholds: { max_file_length: 200, pre_flight_trigger_lines: 50 } });
  try {
    const payload = (count) => ({
      tool_name:  'Write',
      cwd:        root,
      tool_input: { file_path: path.join(root, 'src', 'app.js'), content: makeLines(count) },
    });
    const small = runHook(LINT_HOOK, payload(30));
    assert.equal(small.code, 0);
    assert.equal(small.stdout, '', 'below trigger means no output at all');

    const huge = runHook(LINT_HOOK, payload(250));
    assert.equal(huge.code, 2, 'deny takes precedence over ask');
    assert.equal(decisionOf(huge.stdout), 'deny');
  } finally {
    cleanup(root);
  }
});

// ---------------------------------------------------------------------------
// Installer pure functions — no settings.json is ever written here
// ---------------------------------------------------------------------------

test('install-hooks: buildMatcherGroups covers files and commands', () => {
  const { buildMatcherGroups } = require('../hooks/claude/install-hooks');
  const groups = buildMatcherGroups(path.join(os.tmpdir(), 'skill'));

  assert.equal(groups.length, 2);
  assert.equal(groups[0].matcher, 'Write|Edit|NotebookEdit');
  assert.equal(groups[1].matcher, 'Bash|PowerShell');

  const all = groups.flatMap(g => g.hooks);
  assert.equal(all.length, 4);
  for (const h of all) {
    assert.equal(h.type, 'command');
    assert.equal(h.command, 'node');
    assert.equal(h.timeout, 30);
    assert.ok(String(h.description).startsWith('code-warden:'), 'marker prefix required');
    assert.ok(fs.existsSync(path.join(HOOKS, path.basename(h.args[0]))), `hook script exists: ${h.args[0]}`);
  }
  assert.equal(path.basename(groups[0].hooks[2].args[0]), 'warden-scope-hook.js');
  assert.equal(groups[0].hooks[2].description, 'code-warden: scope lock gate');
  assert.equal(path.basename(groups[1].hooks[0].args[0]), 'warden-command-hook.js');
  assert.equal(groups[1].hooks[0].description, 'code-warden: command secrets gate');
});

test('install-hooks: stripCodeWardenHooks removes all groups, keeps user hooks', () => {
  const { buildMatcherGroups, stripCodeWardenHooks } = require('../hooks/claude/install-hooks');
  const userGroup = {
    matcher: 'Write',
    hooks: [{ type: 'command', command: 'node', args: ['user-hook.js'], description: 'my hook' }],
  };
  const mixed = [userGroup, ...buildMatcherGroups(path.join(os.tmpdir(), 'skill'))];

  const cleaned = stripCodeWardenHooks(mixed);
  assert.equal(cleaned.length, 1, 'both code-warden matcher groups removed');
  assert.equal(cleaned[0].matcher, 'Write');
  assert.equal(cleaned[0].hooks[0].description, 'my hook');

  // Round-trip: strip is idempotent on already-clean input
  assert.deepEqual(stripCodeWardenHooks(cleaned), cleaned);
});
