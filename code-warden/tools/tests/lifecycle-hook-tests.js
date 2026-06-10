#!/usr/bin/env node
'use strict';

/**
 * lifecycle-hook-tests.js
 * Behavioral tests for the Phase 4 lifecycle surfaces:
 *   - lib/hook-events.js + install-hooks buildEventGroups (multi-event
 *     install/uninstall round trip via pure functions - the user's real
 *     ~/.claude/settings.json is NEVER touched)
 *   - warden-session-hook.js (SessionStart context injection)
 *   - warden-stop-hook.js    (opt-in Stop verification)
 *
 * All fixtures live in temp dirs under os.tmpdir() with a .git boundary.
 */

const { test } = require('node:test');
const assert        = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path          = require('node:path');
const fs            = require('node:fs');
const os            = require('node:os');

const { applyEventGroups, removeMarkedEntries, collectMarkedEntries,
        CLAUDE_HOOK_EVENTS } = require('../lib/hook-events');
const { buildEventGroups }   = require('../hooks/claude/install-hooks');
const store                  = require('../lib/scope-store');

const SKILL_DIR    = path.join(__dirname, '..', '..');
const SESSION_HOOK = path.join(__dirname, '..', 'hooks', 'claude', 'warden-session-hook.js');
const STOP_HOOK    = path.join(__dirname, '..', 'hooks', 'claude', 'warden-stop-hook.js');

const makeFakeSecret = () => ['sk', '-', 'b'.repeat(48)].join('');

function makeRepo({ config, scope, files } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `cw-life-${process.pid}-`));
  fs.mkdirSync(path.join(root, '.git'), { recursive: true });
  if (config) fs.writeFileSync(path.join(root, 'codewarden.json'), JSON.stringify(config, null, 2) + '\n');
  if (scope)  store.saveScope(root, { ...store.createScope(), ...scope });
  for (const [rel, content] of Object.entries(files || {})) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return root;
}

const cleanup = (root) => fs.rmSync(root, { recursive: true, force: true });

function runHook(scriptPath, payload) {
  const r = spawnSync(process.execPath, [scriptPath], {
    input: JSON.stringify(payload), encoding: 'utf8',
  });
  return { code: r.status ?? r.signal, stdout: r.stdout || '' };
}

const makeLines = (n) => Array.from({ length: n }, (_, i) => `const l${i} = ${i};`).join('\n') + '\n';

// ---------------------------------------------------------------------------
// Multi-event install/uninstall round trip (pure functions only)
// ---------------------------------------------------------------------------

test('hook-events: install covers all four events, uninstall preserves user hooks', () => {
  const userPre  = { matcher: 'Write', hooks: [{ type: 'command', command: 'node', args: ['mine.js'], description: 'my pre hook' }] };
  const userStop = { hooks: [{ type: 'command', command: 'node', args: ['bye.js'], description: 'my stop hook' }] };
  const settings = { hooks: { PreToolUse: [userPre], Stop: [userStop] } };

  applyEventGroups(settings, buildEventGroups(SKILL_DIR));

  for (const event of CLAUDE_HOOK_EVENTS) {
    assert.ok(Array.isArray(settings.hooks[event]), `${event} array exists`);
  }
  // stripEventGroups rebuilds group objects, so compare content, not identity
  assert.deepEqual(settings.hooks.PreToolUse[0], userPre, 'user groups stay first');
  assert.deepEqual(settings.hooks.Stop[0], userStop);
  assert.equal(settings.hooks.PostToolUse[0].matcher, 'Write|Edit|NotebookEdit|Bash|PowerShell');
  assert.equal(settings.hooks.SessionStart[0].matcher, 'startup|resume|clear');

  const marked = collectMarkedEntries(settings.hooks);
  assert.equal(marked.length, 7, '4 PreToolUse + audit + session + stop');
  const descs = marked.map(h => h.description);
  for (const d of ['code-warden: audit ledger', 'code-warden: session context',
                   'code-warden: stop verification']) {
    assert.ok(descs.includes(d), `registered: ${d}`);
  }
  for (const h of marked) {
    assert.equal(h.type, 'command');
    assert.equal(h.command, 'node');
    assert.equal(h.timeout, 30);
    assert.ok(fs.existsSync(h.args[0]), `hook script exists: ${h.args[0]}`);
  }

  // Idempotent: reinstall replaces, never duplicates
  applyEventGroups(settings, buildEventGroups(SKILL_DIR));
  assert.equal(collectMarkedEntries(settings.hooks).length, 7);

  // Uninstall: every marked entry removed, user hooks intact, empties pruned
  assert.equal(removeMarkedEntries(settings), 7);
  assert.deepEqual(settings.hooks.PreToolUse, [userPre]);
  assert.deepEqual(settings.hooks.Stop, [userStop]);
  assert.equal(settings.hooks.PostToolUse, undefined, 'empty event arrays deleted');
  assert.equal(settings.hooks.SessionStart, undefined);
  assert.equal(removeMarkedEntries(settings), 0, 'second uninstall is a no-op');

  // Fully-empty settings collapse to no hooks object at all
  const bare = { hooks: {} };
  applyEventGroups(bare, buildEventGroups(SKILL_DIR));
  removeMarkedEntries(bare);
  assert.equal(bare.hooks, undefined);
});

// ---------------------------------------------------------------------------
// SessionStart hook
// ---------------------------------------------------------------------------

test('session hook: injects architecture context and scope status', () => {
  const root = makeRepo({
    scope: { goal: 'Ship it', filesIn: ['src/'] },
    files: { 'README.md': '# Test Project\n\nDetails here.\n' },
  });
  try {
    const { code, stdout } = runHook(SESSION_HOOK, {
      session_id: 's1', cwd: root, hook_event_name: 'SessionStart', source: 'startup',
    });
    assert.equal(code, 0);
    const out = JSON.parse(stdout).hookSpecificOutput;
    assert.equal(out.hookEventName, 'SessionStart');
    assert.match(out.additionalContext, /Architecture context from README\.md/);
    assert.match(out.additionalContext, /# Test Project/);
    assert.match(out.additionalContext, /Scope locked: goal=Ship it, 1 files in scope/);
    assert.match(out.additionalContext, /Scope Gate and Plan Gate apply before code changes/);
  } finally {
    cleanup(root);
  }
});

test('session hook: scope without context file still injects; neither is silent', () => {
  const scoped = makeRepo({ scope: { goal: 'Quiet', filesIn: ['lib/'] } });
  const empty  = makeRepo();
  try {
    const withScope = runHook(SESSION_HOOK, { cwd: scoped, source: 'resume' });
    assert.equal(withScope.code, 0);
    assert.match(JSON.parse(withScope.stdout).hookSpecificOutput.additionalContext,
      /Scope locked: goal=Quiet/);

    const silent = runHook(SESSION_HOOK, { cwd: empty, source: 'startup' });
    assert.equal(silent.code, 0);
    assert.equal(silent.stdout, '', 'no context and no scope means no output');
  } finally {
    cleanup(scoped);
    cleanup(empty);
  }
});

test('session hook: output is capped near 2000 chars and stays ASCII', () => {
  // Non-ASCII fixture (e-acute) built via charcode so this file stays ASCII.
  const eAcute = String.fromCharCode(0xe9);
  const big = '# Huge\n' + ('y'.repeat(180) + ' ' + eAcute + '\n').repeat(30);
  const root = makeRepo({ files: { 'README.md': big } });
  try {
    const { code, stdout } = runHook(SESSION_HOOK, { cwd: root, source: 'startup' });
    assert.equal(code, 0);
    const ctx = JSON.parse(stdout).hookSpecificOutput.additionalContext;
    assert.ok(ctx.length <= 2000, `capped (got ${ctx.length})`);
    assert.ok(/^[\x09\x0A\x0D\x20-\x7E]*$/.test(ctx), 'ASCII only');
  } finally {
    cleanup(root);
  }
});

// ---------------------------------------------------------------------------
// Stop hook
// ---------------------------------------------------------------------------

test('stop hook: off by default - exits 0 silently even with violations', () => {
  const root = makeRepo({
    config: { thresholds: { max_file_length: 30 } },
    files:  { 'src/long.js': makeLines(40) },
  });
  try {
    const { code, stdout } = runHook(STOP_HOOK, { cwd: root, session_id: 's1' });
    assert.equal(code, 0);
    assert.equal(stdout, '', 'verify_on_stop absent means inert');
  } finally {
    cleanup(root);
  }
});

test('stop hook: stop_hook_active loop guard exits 0 before any scan', () => {
  const root = makeRepo({
    config: { session: { verify_on_stop: true }, thresholds: { max_file_length: 30 } },
    files:  { 'src/long.js': makeLines(40) },
  });
  try {
    const { code, stdout } = runHook(STOP_HOOK, { cwd: root, stop_hook_active: true });
    assert.equal(code, 0);
    assert.equal(stdout, '');
  } finally {
    cleanup(root);
  }
});

test('stop hook: fresh violations block with counts and first offenders', () => {
  const root = makeRepo({
    config: { session: { verify_on_stop: true }, thresholds: { max_file_length: 30 } },
    files:  {
      'src/long.js':  makeLines(40),
      'src/creds.js': `const KEY = '${makeFakeSecret()}';\n`,
    },
  });
  try {
    const { code, stdout } = runHook(STOP_HOOK, { cwd: root, session_id: 's1' });
    assert.equal(code, 0, 'block goes through JSON, not the exit code');
    const out = JSON.parse(stdout);
    assert.equal(out.decision, 'block');
    assert.match(out.reason, /\[CodeWarden\] Stop verification: 2 fresh violations \(1 length, 1 secrets\)/);
    assert.match(out.reason, /src[\\/]long\.js: 40 lines \(limit 30\)/);
    assert.match(out.reason, /src[\\/]creds\.js:1: OpenAI key/);
  } finally {
    cleanup(root);
  }
});

test('stop hook: baseline suppresses legacy violations; new ones still block', () => {
  const root = makeRepo({
    config: { session: { verify_on_stop: true }, thresholds: { max_file_length: 30 } },
    files:  { 'src/long.js': makeLines(40) },
  });
  try {
    const { runScans }       = require('../lib/scan-core');
    const { createBaseline } = require('../lib/baseline');
    const baseline = createBaseline(runScans(root, null, root));
    fs.writeFileSync(path.join(root, '.code-warden-baseline.json'),
      JSON.stringify(baseline, null, 2) + '\n');

    const clean = runHook(STOP_HOOK, { cwd: root });
    assert.equal(clean.code, 0);
    assert.equal(clean.stdout, '', 'baselined legacy debt never traps a session');

    fs.writeFileSync(path.join(root, 'src', 'fresh.js'), makeLines(45));
    const blocked = runHook(STOP_HOOK, { cwd: root });
    const out = JSON.parse(blocked.stdout);
    assert.equal(out.decision, 'block');
    assert.match(out.reason, /1 fresh violations \(1 length, 0 secrets\)/);
    assert.match(out.reason, /fresh\.js/);
    assert.ok(!out.reason.includes('long.js'), 'legacy offender not listed');
  } finally {
    cleanup(root);
  }
});
