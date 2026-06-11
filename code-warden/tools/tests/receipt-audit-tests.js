#!/usr/bin/env node
'use strict';

/**
 * receipt-audit-tests.js
 * Behavioral tests for receipt --from-audit (lib/receipt-audit.js + the
 * receipt.js CLI wiring) and the additive audit-block validation rules:
 *   - prefill from a temp governed root (scope + ledger + context file)
 *   - a broken hash chain is surfaced and fails complete-validation
 *   - receipts WITHOUT an audit block still validate (schema stays additive)
 * All fixtures live in temp dirs under os.tmpdir() with a .git boundary;
 * no .code-warden/ directory is ever created in this repo.
 */

const { test } = require('node:test');
const assert        = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path          = require('node:path');
const fs            = require('node:fs');
const os            = require('node:os');

const { createTemplate, validateReceipt } = require('../receipt');
const { buildAuditReceipt }               = require('../lib/receipt-audit');
const ledgerLib                           = require('../lib/audit-ledger');
const store                               = require('../lib/scope-store');

const RECEIPT_CLI = path.join(__dirname, '..', 'receipt.js');

// ---------------------------------------------------------------------------
// Fixtures - fake secrets built from parts, never contiguous literals
// ---------------------------------------------------------------------------

const makeFakeSecret = () => ['sk', '-', 'c'.repeat(48)].join('');

function makeRepo({ scope, files } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `cw-receipt-${process.pid}-`));
  fs.mkdirSync(path.join(root, '.git'), { recursive: true });
  if (scope) store.saveScope(root, { ...store.createScope(), ...scope });
  for (const [rel, content] of Object.entries(files || {})) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return root;
}

const cleanup       = (root) => fs.rmSync(root, { recursive: true, force: true });
const ledgerPathFor = (root) => path.join(root, '.code-warden', 'audit.jsonl');

function payloadFor(root, tool, tool_input) {
  return { session_id: 'sess-r', cwd: root, hook_event_name: 'PostToolUse',
           tool_name: tool, tool_input, tool_response: {} };
}

/** Seed a ledger via the real recordPostToolUse path: 1 Write + 2 commands. */
function seedLedger(root, fake) {
  ledgerLib.recordPostToolUse(payloadFor(root, 'Write',
    { file_path: path.join(root, 'src', 'a.js') }));
  ledgerLib.recordPostToolUse(payloadFor(root, 'Bash',
    { command: `curl -H "X-Key: ${fake}" https://api.example.com` }));
  ledgerLib.recordPostToolUse(payloadFor(root, 'PowerShell',
    { command: 'npm test' }));
}

/** Minimal receipt that passes complete-validation (mirrors run-tests.js). */
function makeCompleteReceipt() {
  return {
    schemaVersion: 1,
    kind: 'code-warden/governance-receipt',
    status: 'complete',
    scopeGate: {
      confirmed: true, goal: 'Add governance receipts.',
      nonGoals: ['No release'], filesIn: ['code-warden/tools/receipt.js'],
      filesOut: ['release tags'], verifyAfter: ['npm test'],
      rollback: 'git checkout HEAD -- code-warden/tools/receipt.js',
    },
    planGate: {
      confirmed: true, patchOrder: ['Add tests', 'Add implementation'],
      blastRadius: 'MODERATE', humanCheckpoint: 'YES',
      postPatchChecks: ['npm test'],
    },
    finalEvidence: { commands: ['npm test'], reports: [], notes: [] },
    validation: { canProveCompliance: true },
  };
}

// ---------------------------------------------------------------------------
// Prefill from a governed temp root
// ---------------------------------------------------------------------------

test('from-audit: prefills scope, context, chain state, and command evidence', () => {
  const fake = makeFakeSecret();
  const root = makeRepo({
    scope: { goal: 'Fix auth bug', filesIn: ['src/'] },
    files: { 'README.md': '# Receipt Fixture\n\nDetails.\n' },
  });
  try {
    seedLedger(root, fake);
    const { receipt, summary } = buildAuditReceipt({
      template: createTemplate(), cwd: root, ledgerPath: null,
    });

    assert.equal(receipt.status, 'draft', 'prefill never auto-completes');

    // Scope Gate: machine-known fields filled, human fields left empty
    assert.equal(receipt.scopeGate.confirmed, true);
    assert.equal(receipt.scopeGate.goal, 'Fix auth bug');
    assert.deepEqual(receipt.scopeGate.filesIn, ['src/']);
    assert.deepEqual(receipt.scopeGate.nonGoals, [], 'human judgement stays empty');
    assert.equal(receipt.scopeGate.rollback, '');
    assert.equal(receipt.planGate.confirmed, false, 'Plan Gate is never prefilled');

    // Architecture context discovery
    assert.match(receipt.architectureState.source, /README\.md$/);
    assert.equal(receipt.architectureState.summary, '# Receipt Fixture');

    // Audit corroboration block
    assert.equal(receipt.audit.entries, 3);
    assert.equal(receipt.audit.chainValid, true);
    assert.equal(receipt.audit.brokenAt, undefined, 'no brokenAt on a valid chain');
    assert.equal(receipt.audit.path, ledgerPathFor(root).replace(/\\/g, '/'));

    // Command evidence: Bash + PowerShell only, secret-redacted
    assert.equal(receipt.finalEvidence.commands.length, 2);
    assert.ok(receipt.finalEvidence.commands.some(c => c.includes('npm test')));
    assert.ok(!JSON.stringify(receipt).includes(fake), 'raw secret never reaches the receipt');
    assert.match(receipt.finalEvidence.commands[0], /\[REDACTED:OpenAI key\]/);
    assert.match(receipt.finalEvidence.notes[0], /prefilled from audit ledger 3 entries; chain valid/);

    // Repository metadata present (values are best-effort nulls off-repo)
    assert.ok('branch' in receipt.repository && 'commit' in receipt.repository);

    assert.match(summary, /3 ledger entries, chain valid/);
  } finally {
    cleanup(root);
  }
});

test('from-audit: missing ledger throws with a clear pointer', () => {
  const root = makeRepo({ files: { 'codewarden.json': '{}\n' } });
  try {
    assert.throws(
      () => buildAuditReceipt({ template: createTemplate(), cwd: root, ledgerPath: null }),
      /audit ledger not found/);
  } finally {
    cleanup(root);
  }
});

// ---------------------------------------------------------------------------
// Broken chains
// ---------------------------------------------------------------------------

test('from-audit: tampered ledger reports brokenAt and fails complete-validation', () => {
  const root = makeRepo({ scope: { goal: 'Tamper', filesIn: ['src/'] } });
  try {
    seedLedger(root, makeFakeSecret());
    const lp    = ledgerPathFor(root);
    const lines = fs.readFileSync(lp, 'utf8').trim().split('\n');
    const doc   = JSON.parse(lines[1]);
    doc.target  = 'src/evil.js'; // rewrite history
    lines[1]    = JSON.stringify(doc);
    fs.writeFileSync(lp, lines.join('\n') + '\n');

    const { receipt, summary } = buildAuditReceipt({
      template: createTemplate(), cwd: root, ledgerPath: null,
    });
    assert.equal(receipt.audit.chainValid, false);
    assert.equal(receipt.audit.brokenAt, 2);
    assert.match(summary, /chain BROKEN at line 2/);
    assert.match(receipt.finalEvidence.notes[0], /chain BROKEN/);

    // Completing the draft on top of the broken chain must fail validation
    const completed = { ...makeCompleteReceipt(), audit: receipt.audit };
    const errors = validateReceipt(completed);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /audit\.chainValid is false/);
    assert.match(errors[0], /broken at line 2/);
  } finally {
    cleanup(root);
  }
});

// ---------------------------------------------------------------------------
// Validation stays additive (schemaVersion 1 receipts keep working)
// ---------------------------------------------------------------------------

test('validateReceipt: audit block is optional and only blocks when broken', () => {
  assert.deepEqual(validateReceipt(makeCompleteReceipt()), [],
    'pre-existing receipts without an audit block still validate');

  const corroborated = { ...makeCompleteReceipt(),
    audit: { path: 'x/.code-warden/audit.jsonl', entries: 4, chainValid: true } };
  assert.deepEqual(validateReceipt(corroborated), [], 'valid chain adds no errors');

  const malformed = { ...makeCompleteReceipt(), audit: 'yes' };
  assert.deepEqual(validateReceipt(malformed), ['audit must be an object when present']);
});

// ---------------------------------------------------------------------------
// CLI wiring (receipt.js --from-audit through the real argv interface)
// ---------------------------------------------------------------------------

test('receipt CLI: --from-audit writes a draft; missing ledger or --out fails', () => {
  const root = makeRepo({ scope: { goal: 'CLI', filesIn: ['src/'] } });
  const bare = makeRepo({ files: { 'codewarden.json': '{}\n' } });
  try {
    seedLedger(root, makeFakeSecret());
    const out = path.join(root, 'draft-receipt.json');

    const okRun = spawnSync(process.execPath,
      [RECEIPT_CLI, '--from-audit', `--out=${out}`],
      { encoding: 'utf8', cwd: root });
    assert.equal(okRun.status, 0, okRun.stderr);
    assert.match(okRun.stdout, /Receipt prefilled from audit ledger: 3 ledger entries, chain valid/);
    assert.match(okRun.stdout, /Draft written to /);
    const written = JSON.parse(fs.readFileSync(out, 'utf8'));
    assert.equal(written.status, 'draft');
    assert.equal(written.audit.chainValid, true);

    // Explicit --from-audit=<path> works from an unrelated cwd
    const out2 = path.join(bare, 'r2.json');
    const explicit = spawnSync(process.execPath,
      [RECEIPT_CLI, `--from-audit=${ledgerPathFor(root)}`, `--out=${out2}`],
      { encoding: 'utf8', cwd: bare });
    assert.equal(explicit.status, 0, explicit.stderr);
    assert.equal(JSON.parse(fs.readFileSync(out2, 'utf8')).audit.entries, 3);

    const noLedger = spawnSync(process.execPath,
      [RECEIPT_CLI, '--from-audit', `--out=${path.join(bare, 'x.json')}`],
      { encoding: 'utf8', cwd: bare });
    assert.equal(noLedger.status, 1);
    assert.match(noLedger.stderr, /audit ledger not found/);

    const noOut = spawnSync(process.execPath, [RECEIPT_CLI, '--from-audit'],
      { encoding: 'utf8', cwd: root });
    assert.equal(noOut.status, 1);
    assert.match(noOut.stderr, /Missing required --out=<file> for --from-audit/);
  } finally {
    cleanup(root);
    cleanup(bare);
  }
});
