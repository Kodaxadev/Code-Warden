#!/usr/bin/env node
'use strict';

/**
 * scope-tests.js
 * Behavioral tests for the Scope Lock:
 *   - lib/scope-store.js  (normalize, evaluate, discovery, summary)
 *   - tools/scope.js      (set/add/remove/clear/status via direct main calls)
 *   - warden-scope-hook.js (Claude write hook through its stdin interface)
 *   - warden-apply-patch-hook.js (Codex scope enforcement on patch targets)
 *
 * All fixtures live in temp dirs under os.tmpdir() with a .git boundary so
 * discovery never escapes into the host filesystem (or this repo). No
 * .code-warden/ directory is ever created inside the repository itself.
 */

const { test } = require('node:test');
const assert        = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path          = require('node:path');
const fs            = require('node:fs');
const os            = require('node:os');

const store = require('../lib/scope-store');
const { main: scopeMain } = require('../scope');

const SCOPE_HOOK = path.join(__dirname, '..', 'hooks', 'claude', 'warden-scope-hook.js');
const PATCH_HOOK = path.join(__dirname, '..', 'hooks', 'codex', 'warden-apply-patch-hook.js');

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/** Temp repo root with a .git boundary. */
function makeRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `cw-scope-${process.pid}-`));
  fs.mkdirSync(path.join(root, '.git'), { recursive: true });
  return root;
}

/** Write a scope file directly (bypasses the CLI for hook-side tests). */
function writeScope(root, scope) {
  return store.saveScope(root, { ...store.createScope(), ...scope });
}

const cleanup = (root) => fs.rmSync(root, { recursive: true, force: true });

function runHook(scriptPath, payload, cwd) {
  const result = spawnSync(process.execPath, [scriptPath], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    cwd: cwd || undefined,
  });
  return { code: result.status ?? result.signal, stdout: result.stdout || '' };
}

function claudeReason(stdout) {
  return JSON.parse(stdout).hookSpecificOutput.permissionDecisionReason;
}

// ---------------------------------------------------------------------------
// scope-store: normalize + evaluate
// ---------------------------------------------------------------------------

test('scope-store: normalizeScopeEntry handles slashes, dots, dirs, escapes', () => {
  const root = makeRepo();
  try {
    fs.mkdirSync(path.join(root, 'src'));
    assert.equal(store.normalizeScopeEntry('src\\app.js', root), 'src/app.js');
    assert.equal(store.normalizeScopeEntry('./lib/utils.js', root), 'lib/utils.js');
    assert.equal(store.normalizeScopeEntry('src', root), 'src/', 'existing dir gets prefix slash');
    assert.equal(store.normalizeScopeEntry(path.join(root, 'src', 'a.js'), root), 'src/a.js');
    assert.equal(store.normalizeScopeEntry('../outside.js', root), null);
    assert.equal(store.normalizeScopeEntry(path.join(os.tmpdir(), 'other.js'), root), null);
  } finally {
    cleanup(root);
  }
});

test('scope-store: evaluateScope verdict table', () => {
  const root  = makeRepo();
  try {
    const scope = store.createScope({ goal: 'Test', filesIn: ['src/', 'lib/utils.js'] });
    const ev = (p) => store.evaluateScope(p, scope, root, root);

    assert.equal(ev(path.join(root, 'src', 'deep', 'a.js')).code, 'in_scope');
    assert.equal(ev('lib/utils.js').code, 'in_scope', 'relative paths resolve against baseDir');
    assert.equal(ev(path.join(root, 'docs', 'x.md')).code, 'out_of_scope');
    assert.equal(ev(path.join(root, '.code-warden', 'scope.json')).code, 'self_protect');
    assert.equal(ev(path.join(root, '.code-warden', 'other.json')).code, 'self_protect');
    assert.equal(ev(path.join(os.tmpdir(), 'elsewhere.js')).code, 'outside_root');

    const off = { ...scope, enforce: false };
    assert.equal(store.evaluateScope(path.join(root, 'docs', 'x.md'), off, root, root).code,
      'enforce_off');
    assert.equal(store.evaluateScope(path.join(root, '.code-warden', 'scope.json'), off, root, root).code,
      'self_protect', 'self-protection wins even when enforce is false');
  } finally {
    cleanup(root);
  }
});

test('scope-store: getScopeSummary reflects the scope file or null', () => {
  const root = makeRepo();
  try {
    assert.equal(store.getScopeSummary(root), null, 'no scope file means null');
    writeScope(root, { goal: 'Ship it', filesIn: ['src/'] });
    const sub = path.join(root, 'src');
    fs.mkdirSync(sub, { recursive: true });
    const summary = store.getScopeSummary(sub);
    assert.ok(summary, 'discovered by walking up');
    assert.equal(summary.goal, 'Ship it');
    assert.equal(summary.enforce, true);
    assert.deepEqual(summary.filesIn, ['src/']);
  } finally {
    cleanup(root);
  }
});

// ---------------------------------------------------------------------------
// CLI: set / add / remove / clear round trip
// ---------------------------------------------------------------------------

test('scope CLI: set/add/remove/clear/status round trip', () => {
  const root = makeRepo();
  try {
    fs.mkdirSync(path.join(root, 'src'));

    assert.equal(scopeMain(['set', '--goal=Fix auth bug', 'src/', 'lib/utils.js'], root), 0);
    const scopePath = store.scopePathFor(root);
    let scope = store.loadScope(scopePath);
    assert.equal(scope.kind, 'code-warden/scope');
    assert.equal(scope.schemaVersion, 1);
    assert.equal(scope.goal, 'Fix auth bug');
    assert.equal(scope.enforce, true);
    assert.deepEqual(scope.filesIn, ['src/', 'lib/utils.js']);
    assert.deepEqual(scope.expansions, []);

    // add: appended to filesIn AND recorded in the expansions audit trail
    assert.equal(scopeMain(['add', 'docs/notes.md'], root), 0);
    scope = store.loadScope(scopePath);
    assert.deepEqual(scope.filesIn, ['src/', 'lib/utils.js', 'docs/notes.md']);
    assert.equal(scope.expansions.length, 1);
    assert.equal(scope.expansions[0].path, 'docs/notes.md');
    assert.ok(scope.expansions[0].addedAt, 'expansion is timestamped');

    // remove: shrinks filesIn but keeps the audit trail
    assert.equal(scopeMain(['remove', 'docs/notes.md'], root), 0);
    scope = store.loadScope(scopePath);
    assert.deepEqual(scope.filesIn, ['src/', 'lib/utils.js']);
    assert.equal(scope.expansions.length, 1, 'expansions are an audit trail - never pruned');

    assert.equal(scopeMain(['status'], root), 0);

    assert.equal(scopeMain(['clear'], root), 0);
    assert.equal(fs.existsSync(scopePath), false);
    assert.equal(scopeMain(['status'], root), 0, 'status with no scope is informational, not an error');
  } finally {
    cleanup(root);
  }
});

test('scope CLI: add without a scope fails; set requires a path', () => {
  const root = makeRepo();
  try {
    assert.equal(scopeMain(['add', 'src/'], root), 1);
    assert.equal(scopeMain(['set', '--goal=No paths'], root), 1);
    assert.equal(scopeMain(['bogus'], root), 1);
  } finally {
    cleanup(root);
  }
});

// ---------------------------------------------------------------------------
// Claude hook: warden-scope-hook.js
// ---------------------------------------------------------------------------

function writePayload(root, file) {
  return {
    tool_name:  'Write',
    cwd:        root,
    tool_input: { file_path: path.join(root, file), content: 'x' },
  };
}

test('scope hook: no scope file allows silently', () => {
  const root = makeRepo();
  try {
    const { code, stdout } = runHook(SCOPE_HOOK, writePayload(root, 'anything.js'));
    assert.equal(code, 0);
    assert.equal(stdout, '');
  } finally {
    cleanup(root);
  }
});

test('scope hook: .code-warden/ writes are denied even with NO scope file', () => {
  const root = makeRepo();
  try {
    for (const file of ['.code-warden/scope.json', '.code-warden/audit.jsonl']) {
      const { code, stdout } = runHook(SCOPE_HOOK, writePayload(root, file));
      assert.equal(code, 2, `${file} must deny without any scope lock`);
      assert.match(claudeReason(stdout), /Governance artifacts under \.code-warden\/ are user-managed/);
    }
    // Segment match only: a plain 'code-warden' dir (no dot) is NOT protected
    const allowed = runHook(SCOPE_HOOK, writePayload(root, 'code-warden/tool.js'));
    assert.equal(allowed.code, 0, 'dotless code-warden directories stay writable');
  } finally {
    cleanup(root);
  }
});

test('scope hook: in-scope allows, out-of-scope denies with expansion hint', () => {
  const root = makeRepo();
  try {
    writeScope(root, { goal: 'Fix auth bug', filesIn: ['src/'] });

    const ok = runHook(SCOPE_HOOK, writePayload(root, 'src/app.js'));
    assert.equal(ok.code, 0, 'in-scope write must pass');

    const denied = runHook(SCOPE_HOOK, writePayload(root, 'docs/x.md'));
    assert.equal(denied.code, 2, 'out-of-scope write must deny');
    const reason = claudeReason(denied.stdout);
    assert.match(reason, /outside the declared scope/);
    assert.match(reason, /goal: Fix auth bug/);
    assert.match(reason, /code-warden scope add docs\/x\.md/);
  } finally {
    cleanup(root);
  }
});

test('scope hook: enforce:false allows, but self-protection still denies', () => {
  const root = makeRepo();
  try {
    writeScope(root, { goal: 'Test', filesIn: ['src/'], enforce: false });

    const allowed = runHook(SCOPE_HOOK, writePayload(root, 'docs/x.md'));
    assert.equal(allowed.code, 0, 'enforce:false disables the scope gate');

    const denied = runHook(SCOPE_HOOK, writePayload(root, '.code-warden/scope.json'));
    assert.equal(denied.code, 2, 'scope file is protected even when enforce is false');
    assert.match(claudeReason(denied.stdout), /\.code-warden\/ are user-managed/);
  } finally {
    cleanup(root);
  }
});

test('scope hook: writes outside the governed repo are denied distinctly', () => {
  const root  = makeRepo();
  const other = fs.mkdtempSync(path.join(os.tmpdir(), `cw-scope-out-${process.pid}-`));
  try {
    writeScope(root, { goal: 'Test', filesIn: ['src/'] });
    const { code, stdout } = runHook(SCOPE_HOOK, {
      tool_name:  'Edit',
      cwd:        root,
      tool_input: { file_path: path.join(other, 'x.js'), old_string: 'a', new_string: 'b' },
    });
    assert.equal(code, 2);
    assert.match(claudeReason(stdout), /outside the governed repository/);
  } finally {
    cleanup(root);
    cleanup(other);
  }
});

test('scope hook: unrelated tools pass through', () => {
  const root = makeRepo();
  try {
    writeScope(root, { goal: 'Test', filesIn: ['src/'] });
    const { code } = runHook(SCOPE_HOOK, {
      tool_name: 'Bash', cwd: root, tool_input: { command: 'echo docs/x.md' },
    });
    assert.equal(code, 0);
  } finally {
    cleanup(root);
  }
});

// ---------------------------------------------------------------------------
// Codex hook: apply_patch scope enforcement
// ---------------------------------------------------------------------------

function patchFor(file) {
  return [`--- ${file}`, `+++ ${file}`, '@@', '+const x = 1;', ''].join('\n');
}

test('codex patch hook: out-of-scope target denies, in-scope passes', () => {
  const root = makeRepo();
  try {
    writeScope(root, { goal: 'Fix auth bug', filesIn: ['src/'] });

    const denied = spawnSync(process.execPath, [PATCH_HOOK], {
      input: JSON.stringify({ tool: 'apply_patch', toolInput: { patch: patchFor('docs/x.md') } }),
      encoding: 'utf8',
      cwd: root,
    });
    assert.equal(denied.status, 2, 'out-of-scope patch must deny');
    const body = JSON.parse(denied.stdout);
    assert.equal(body.deny, true);
    assert.match(body.message, /Scope lock/);
    assert.match(body.message, /docs\/x\.md/);

    const allowed = spawnSync(process.execPath, [PATCH_HOOK], {
      input: JSON.stringify({ tool: 'apply_patch', toolInput: { patch: patchFor('src/app.js') } }),
      encoding: 'utf8',
      cwd: root,
    });
    assert.equal(allowed.status, 0, 'in-scope patch must pass');
  } finally {
    cleanup(root);
  }
});

test('codex patch hook: .code-warden/ target denies even with NO scope file', () => {
  const root = makeRepo();
  try {
    const denied = spawnSync(process.execPath, [PATCH_HOOK], {
      input: JSON.stringify({
        tool: 'apply_patch',
        toolInput: { patch: patchFor('.code-warden/scope.json') },
      }),
      encoding: 'utf8',
      cwd: root,
    });
    assert.equal(denied.status, 2, 'governance artifacts deny without a scope lock');
    assert.match(JSON.parse(denied.stdout).message, /\.code-warden\/ are user-managed/);
  } finally {
    cleanup(root);
  }
});
