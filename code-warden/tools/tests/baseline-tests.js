#!/usr/bin/env node
'use strict';

/**
 * baseline-tests.js
 * Behavioral tests for baseline / ratchet mode (lib/baseline.js and the
 * governance-report --write-baseline / --baseline flags).
 *
 * Unit tests cover create/apply partitioning; the CLI test exercises the
 * full flag path end-to-end against a temp project: legacy unchanged passes,
 * grown files fail, new secrets fail, contextHash survives line moves, and
 * legacy findings never reach SARIF. Spawned reports set
 * CODE_WARDEN_SKIP_BEHAVIORAL_TESTS so the suite never recurses into itself.
 */

const { test } = require('node:test');
const assert        = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path          = require('node:path');
const fs            = require('node:fs');
const os            = require('node:os');

const { createBaseline, loadBaseline, applyBaseline, applyBaselineToChecks,
        hashLine, BASELINE_KIND, SCHEMA_VERSION } = require('../lib/baseline');

const REPORT_SCRIPT = path.join(__dirname, '..', 'governance-report.js');

// ---------------------------------------------------------------------------
// Fixture helpers — fake secrets built from parts, never contiguous literals
// ---------------------------------------------------------------------------

const makeFakeSecret = (c = 'b') => ['sk', '-', c.repeat(48)].join('');
const makeLines = n => Array.from({ length: n }, (_, i) => `const l${i + 1} = ${i + 1};`).join('\n') + '\n';
const cleanup = dir => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });

function scansFixture() {
  const secretLine = `const key = '${makeFakeSecret()}';`;
  return {
    secretLine,
    scans: {
      fileLength: { status: 'fail', filesScanned: 3, violations: 1,
        details: [{ file: 'src\\big.js', lines: 500, limit: 400 }] },
      secrets: { status: 'fail', filesScanned: 3, violations: 1,
        details: [{ file: 'src/creds.js', pattern: 'OpenAI key', line: 7, column: 14,
                    contextHash: hashLine(secretLine) }] },
    },
  };
}

// ---------------------------------------------------------------------------
// createBaseline / hashLine
// ---------------------------------------------------------------------------

test('createBaseline: schema, slash paths, and hash-only secrets', () => {
  const { scans, secretLine } = scansFixture();
  const b = createBaseline(scans);
  assert.equal(b.schemaVersion, SCHEMA_VERSION);
  assert.equal(b.kind, BASELINE_KIND);
  assert.ok(b.generatedAt);
  assert.deepEqual(b.fileLength, [{ file: 'src/big.js', lines: 500 }], 'backslashes normalised');
  assert.equal(b.secrets.length, 1);
  assert.deepEqual(Object.keys(b.secrets[0]).sort(), ['contextHash', 'file', 'label']);
  assert.ok(!JSON.stringify(b).includes(makeFakeSecret()), 'raw secret text must never enter the baseline');
  assert.equal(b.secrets[0].contextHash, hashLine(secretLine));
});

test('hashLine: trims whitespace so indentation and CR do not matter', () => {
  assert.equal(hashLine('  const x = 1;  '), hashLine('const x = 1;'));
  assert.equal(hashLine('const x = 1;\r'), hashLine('const x = 1;'));
  assert.match(hashLine('x'), /^[0-9a-f]{64}$/);
  assert.notEqual(hashLine('a'), hashLine('b'));
});

// ---------------------------------------------------------------------------
// applyBaseline partitioning
// ---------------------------------------------------------------------------

test('applyBaseline: unchanged legacy, grown file, moved secret, new secret', () => {
  const { scans, secretLine } = scansFixture();
  const baseline = createBaseline(scans);

  // Unchanged: same lines, secret moved to a different line (hash matches)
  const unchanged = {
    fileLength: { details: [{ file: 'src/big.js', lines: 500, limit: 400 }] },
    secrets: { details: [{ file: 'src/creds.js', pattern: 'OpenAI key', line: 42, column: 14,
                            contextHash: hashLine(`  ${secretLine}  `) }] },
  };
  const p1 = applyBaseline(unchanged, baseline);
  assert.equal(p1.fileLength.fresh.length, 0);
  assert.equal(p1.fileLength.legacy.length, 1);
  assert.equal(p1.secrets.fresh.length, 0, 'contextHash must survive line moves and re-indentation');
  assert.equal(p1.secrets.legacy.length, 1);

  // Ratchet: shrinking stays legacy, growing becomes fresh
  const shrunk = applyBaseline({ fileLength: { details: [{ file: 'src/big.js', lines: 450, limit: 400 }] },
                                 secrets: { details: [] } }, baseline);
  assert.equal(shrunk.fileLength.legacy.length, 1, 'shrinking below the floor stays legacy');
  const grown = applyBaseline({ fileLength: { details: [{ file: 'src/big.js', lines: 501, limit: 400 }] },
                                secrets: { details: [] } }, baseline);
  assert.equal(grown.fileLength.fresh.length, 1, 'growth past the baselined count is fresh');

  // New secret in a baselined file is still fresh (different content hash)
  const newSecret = applyBaseline({ fileLength: { details: [] },
    secrets: { details: [{ file: 'src/creds.js', pattern: 'OpenAI key', line: 7, column: 1,
                           contextHash: hashLine('const other = "changed";') }] } }, baseline);
  assert.equal(newSecret.secrets.fresh.length, 1);
});

test('applyBaselineToChecks: fresh-only details, legacyDetails preserved', () => {
  const { scans } = scansFixture();
  const baseline = createBaseline(scans);
  const applied = applyBaselineToChecks(scans, baseline);
  assert.equal(applied.fileLength.status, 'pass');
  assert.equal(applied.secrets.status, 'pass');
  assert.equal(applied.fileLength.violations, 0);
  assert.equal(applied.fileLength.legacyViolations, 1);
  assert.equal(applied.fileLength.details, undefined, 'SARIF consumes details: legacy must not appear');
  assert.equal(applied.fileLength.legacyDetails.length, 1);
  assert.deepEqual(applied.legacy, { fileLength: 1, secrets: 1 });
});

test('loadBaseline: missing or foreign files throw clear errors', () => {
  assert.throws(() => loadBaseline(path.join(os.tmpdir(), 'cw-does-not-exist.json')), /baseline file not found/);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `cw-blv-${process.pid}-`));
  try {
    const bogus = path.join(dir, 'bogus.json');
    fs.writeFileSync(bogus, JSON.stringify({ kind: 'something-else' }), 'utf8');
    assert.throws(() => loadBaseline(bogus), /not a code-warden baseline/);
  } finally {
    cleanup(dir);
  }
});

// ---------------------------------------------------------------------------
// CLI: --write-baseline / --baseline end-to-end against a temp project
// ---------------------------------------------------------------------------

function runReport(proj, args) {
  return spawnSync(process.execPath, [REPORT_SCRIPT, ...args], {
    cwd: proj,
    encoding: 'utf8',
    env: { ...process.env, CODE_WARDEN_SKIP_BEHAVIORAL_TESTS: '1' },
  });
}

test('CLI: --baseline with a missing file is a hard error', () => {
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), `cw-bcli-${process.pid}-`));
  try {
    fs.writeFileSync(path.join(proj, 'ok.js'), "'use strict';\n", 'utf8');
    const r = runReport(proj, ['.', '--baseline=missing-baseline.json']);
    assert.equal(r.status, 1, 'missing baseline must not silently pass');
    assert.match(r.stderr, /baseline file not found/);
  } finally {
    cleanup(proj);
  }
});

test('CLI: write-baseline then ratchet end-to-end', () => {
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), `cw-bend-${process.pid}-`));
  try {
    fs.mkdirSync(path.join(proj, 'src'));
    fs.writeFileSync(path.join(proj, 'codewarden.json'),
      JSON.stringify({ thresholds: { max_file_length: 10 } }) + '\n', 'utf8');
    fs.writeFileSync(path.join(proj, 'src', 'long.js'), makeLines(20), 'utf8');
    fs.writeFileSync(path.join(proj, 'src', 'creds.js'), `const key = '${makeFakeSecret('d')}';\n`, 'utf8');
    const reportArgs = ['src', '--config=codewarden.json'];

    // Write the baseline: exits 0 despite live violations, never stores raw text
    const w = runReport(proj, [...reportArgs, '--write-baseline']);
    assert.equal(w.status, 0, w.stdout + w.stderr);
    assert.match(w.stdout, /Baseline written to/);
    const baselineFile = path.join(proj, '.code-warden-baseline.json');
    const raw = fs.readFileSync(baselineFile, 'utf8');
    assert.ok(!raw.includes(makeFakeSecret('d')), 'baseline must contain hashes, not secrets');
    assert.equal(JSON.parse(raw).fileLength[0].lines, 20);

    // Unchanged project: legacy-only, gate passes, summary shows new/legacy
    const pass = runReport(proj, [...reportArgs, '--baseline']);
    assert.equal(pass.status, 0, pass.stdout + pass.stderr);
    assert.match(pass.stdout, /lint 0 new \/ 1 legacy/);
    assert.match(pass.stdout, /secrets 0 new \/ 1 legacy/);

    // Line move: contextHash keeps the secret legacy
    fs.writeFileSync(path.join(proj, 'src', 'creds.js'),
      `// moved\n// down\n  const key = '${makeFakeSecret('d')}';\n`, 'utf8');
    const moved = runReport(proj, [...reportArgs, '--baseline']);
    assert.equal(moved.status, 0, 'moved/re-indented secret line must stay legacy');

    // Legacy-only findings never reach SARIF
    const sarif = runReport(proj, [...reportArgs, '--baseline', '--format=sarif']);
    assert.equal(sarif.status, 0);
    assert.equal(JSON.parse(sarif.stdout).runs[0].results.length, 0);

    // Ratchet: a grown baselined file fails again
    fs.writeFileSync(path.join(proj, 'src', 'long.js'), makeLines(25), 'utf8');
    const grown = runReport(proj, [...reportArgs, '--baseline']);
    assert.equal(grown.status, 1, 'grown file must be a fresh violation');
    assert.match(grown.stdout, /lint 1 new \/ 0 legacy/);
    fs.writeFileSync(path.join(proj, 'src', 'long.js'), makeLines(20), 'utf8'); // restore

    // New secret fails and is the only SARIF result
    fs.writeFileSync(path.join(proj, 'src', 'fresh.js'), `const t = '${makeFakeSecret('e')}';\n`, 'utf8');
    const fresh = runReport(proj, [...reportArgs, '--baseline']);
    assert.equal(fresh.status, 1, 'new secret must fail the gate');
    assert.match(fresh.stdout, /secrets 1 new \/ 1 legacy/);
    const sarif2 = runReport(proj, [...reportArgs, '--baseline', '--format=sarif']);
    const results = JSON.parse(sarif2.stdout).runs[0].results;
    assert.equal(results.length, 1, 'only the FRESH violation reaches SARIF');
    assert.match(results[0].message.text, /fresh\.js/);
  } finally {
    cleanup(proj);
  }
});
