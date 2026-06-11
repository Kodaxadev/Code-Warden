#!/usr/bin/env node
'use strict';

/**
 * audit-ledger-tests.js
 * Behavioral tests for lib/audit-ledger.js and warden-audit-hook.js:
 * append + chain verification, tamper detection, secret redaction,
 * truncation, enablement (scope-gated / audit.enabled / no root), and the
 * ok heuristic. All fixtures live in temp dirs under os.tmpdir() with a
 * .git boundary; no .code-warden/ directory is ever created in this repo.
 */

const { test } = require('node:test');
const assert        = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path          = require('node:path');
const fs            = require('node:fs');
const os            = require('node:os');

const ledgerLib = require('../lib/audit-ledger');
const store     = require('../lib/scope-store');

const AUDIT_HOOK = path.join(__dirname, '..', 'hooks', 'claude', 'warden-audit-hook.js');

// ---------------------------------------------------------------------------
// Fixtures - fake secrets built from parts, never contiguous literals
// ---------------------------------------------------------------------------

const makeFakeSecret = () => ['sk', '-', 'a'.repeat(48)].join('');

function makeRepo({ scope, config } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `cw-audit-${process.pid}-`));
  fs.mkdirSync(path.join(root, '.git'), { recursive: true });
  if (config) {
    fs.writeFileSync(path.join(root, 'codewarden.json'), JSON.stringify(config, null, 2) + '\n');
  }
  if (scope) store.saveScope(root, { ...store.createScope(), ...scope });
  return root;
}

const cleanup = (root) => fs.rmSync(root, { recursive: true, force: true });
const ledgerPathFor = (root) => path.join(root, '.code-warden', 'audit.jsonl');

function payloadFor(root, tool, tool_input, tool_response) {
  return { session_id: 'sess-1', cwd: root, hook_event_name: 'PostToolUse',
           tool_name: tool, tool_input, tool_response };
}

// ---------------------------------------------------------------------------
// Append + chain verify
// ---------------------------------------------------------------------------

test('audit: appends chained entries and verifyLedger accepts them', () => {
  const root = makeRepo({ scope: { goal: 'Audit', filesIn: ['src/'] } });
  try {
    const e1 = ledgerLib.recordPostToolUse(
      payloadFor(root, 'Write', { file_path: path.join(root, 'src', 'a.js') }, {}));
    const e2 = ledgerLib.recordPostToolUse(
      payloadFor(root, 'Bash', { command: 'npm test' }, { exitCode: 0 }));

    assert.equal(e1.prev, 'GENESIS', 'first entry chains to GENESIS');
    assert.equal(e2.prev, e1.hash, 'second entry chains to the first');
    assert.equal(e1.event, 'PostToolUse');
    assert.equal(e1.target, 'src/a.js', 'file targets are root-relative, forward-slashed');
    assert.equal(e1.session_id, 'sess-1');

    const v = ledgerLib.verifyLedger(ledgerPathFor(root));
    assert.deepEqual(v, { valid: true, entries: 2, brokenAt: null });
  } finally {
    cleanup(root);
  }
});

test('audit: tampering with any line is detected at that line', () => {
  const root = makeRepo({ scope: { goal: 'Audit', filesIn: ['src/'] } });
  try {
    for (const f of ['a.js', 'b.js', 'c.js']) {
      ledgerLib.recordPostToolUse(payloadFor(root, 'Write', { file_path: path.join(root, 'src', f) }, {}));
    }
    const lp = ledgerPathFor(root);
    const lines = fs.readFileSync(lp, 'utf8').trim().split('\n');
    const doctored = JSON.parse(lines[1]);
    doctored.target = 'src/evil.js'; // rewrite history
    lines[1] = JSON.stringify(doctored);
    fs.writeFileSync(lp, lines.join('\n') + '\n');

    const v = ledgerLib.verifyLedger(lp);
    assert.equal(v.valid, false);
    assert.equal(v.brokenAt, 2, '1-based line number of the doctored entry');
    assert.equal(v.entries, 3);

    // Deleting a line breaks the chain at the splice point too
    fs.writeFileSync(lp, [lines[0], lines[2]].join('\n') + '\n');
    const v2 = ledgerLib.verifyLedger(lp);
    assert.equal(v2.valid, false);
    assert.equal(v2.brokenAt, 2);
  } finally {
    cleanup(root);
  }
});

// ---------------------------------------------------------------------------
// Redaction + truncation
// ---------------------------------------------------------------------------

test('audit: command targets are secret-redacted before logging', () => {
  const root = makeRepo({ scope: { goal: 'Audit', filesIn: ['src/'] } });
  try {
    const fake = makeFakeSecret();
    const entry = ledgerLib.recordPostToolUse(
      payloadFor(root, 'Bash', { command: `curl -H "X-Key: ${fake}" https://api.example.com` }, {}));
    assert.ok(!entry.target.includes(fake), 'raw token must never reach the ledger');
    assert.match(entry.target, /\[REDACTED:OpenAI key\]/);
    assert.ok(!fs.readFileSync(ledgerPathFor(root), 'utf8').includes(fake));
  } finally {
    cleanup(root);
  }
});

test('audit: command targets are truncated to 300 chars (after redaction)', () => {
  const root = makeRepo({ scope: { goal: 'Audit', filesIn: ['src/'] } });
  try {
    const fake  = makeFakeSecret();
    const long  = `echo start ${'x'.repeat(400)} ${fake} end`;
    const entry = ledgerLib.recordPostToolUse(payloadFor(root, 'PowerShell', { command: long }, {}));
    assert.ok(entry.target.length <= ledgerLib.COMMAND_TARGET_MAX);
    assert.ok(!entry.target.includes(fake), 'redaction runs on the FULL command before truncation');
  } finally {
    cleanup(root);
  }
});

// ---------------------------------------------------------------------------
// Enablement
// ---------------------------------------------------------------------------

test('audit: disabled without scope or audit.enabled; explicit false always wins', () => {
  const noScope = makeRepo({ config: {} });
  const optIn   = makeRepo({ config: { audit: { enabled: true } } });
  const forced  = makeRepo({ config: { audit: { enabled: false } },
                             scope: { goal: 'X', filesIn: ['src/'] } });
  const bare    = makeRepo(); // .git only: no config, no scope -> no root
  try {
    assert.equal(ledgerLib.resolveLedger(noScope), null, 'config without scope stays off');
    assert.equal(ledgerLib.recordPostToolUse(payloadFor(noScope, 'Bash', { command: 'ls' }, {})), null);
    assert.equal(fs.existsSync(path.join(noScope, '.code-warden')), false, 'no dir side effects');

    assert.ok(ledgerLib.resolveLedger(optIn), 'audit.enabled true opts in without a scope');
    assert.equal(ledgerLib.resolveLedger(forced), null, 'enabled:false beats an active scope');
    assert.equal(ledgerLib.resolveLedger(bare), null, 'no discoverable project root means off');
  } finally {
    [noScope, optIn, forced, bare].forEach(cleanup);
  }
});

test('audit: unaudited tools are ignored even when enabled', () => {
  const root = makeRepo({ config: { audit: { enabled: true } } });
  try {
    assert.equal(ledgerLib.recordPostToolUse(payloadFor(root, 'Read', { file_path: 'x' }, {})), null);
    assert.equal(fs.existsSync(ledgerPathFor(root)), false);
  } finally {
    cleanup(root);
  }
});

// ---------------------------------------------------------------------------
// ok heuristic + hook end-to-end
// ---------------------------------------------------------------------------

test('audit: ok heuristic - absence of error signals means success', () => {
  const ok = ledgerLib.okFromResponse;
  assert.equal(ok(undefined), true);
  assert.equal(ok({}), true);
  assert.equal(ok({ stdout: 'done', stderr: 'warning: x' }), true, 'stderr alone is not failure');
  assert.equal(ok({ exitCode: 0 }), true);
  assert.equal(ok({ exitCode: 1 }), false);
  assert.equal(ok({ exit_code: 2 }), false);
  assert.equal(ok({ success: false }), false);
  assert.equal(ok({ is_error: true }), false);
  assert.equal(ok({ interrupted: true }), false);
  assert.equal(ok({ error: 'boom' }), false);
});

test('audit hook: exits 0 silently and appends through stdin interface', () => {
  const root = makeRepo({ scope: { goal: 'Hook', filesIn: ['src/'] } });
  try {
    const r = spawnSync(process.execPath, [AUDIT_HOOK], {
      input: JSON.stringify(payloadFor(root, 'Edit', { file_path: path.join(root, 'src', 'a.js') }, { success: true })),
      encoding: 'utf8',
    });
    assert.equal(r.status, 0, 'PostToolUse is advisory - always exit 0');
    assert.equal(r.stdout, '', 'no stdout output');
    const v = ledgerLib.verifyLedger(ledgerPathFor(root));
    assert.deepEqual(v, { valid: true, entries: 1, brokenAt: null });
  } finally {
    cleanup(root);
  }
});
