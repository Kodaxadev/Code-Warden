#!/usr/bin/env node
'use strict';

/**
 * run-tests.js
 * Behavioral test suite for Code-Warden scanners and hooks.
 *
 * Verifies that enforcement tools actually enforce — not just that they exist.
 * Uses Node's built-in node:test (no external test framework required).
 *
 * Tests:
 *   CLI tools
 *   1. warden-lint     clean file    → exit 0
 *   2. warden-lint     oversized     → exit 1
 *   3. verify-secrets  clean file    → exit 0
 *   4. verify-secrets  secret file   → exit 1
 *
 *   Claude hooks (PreToolUse JSON payloads via stdin)
 *   5. warden-lint-hook    Write oversized  → exit 2
 *   6. warden-secrets-hook Write secret     → exit 2
 *
 *   Codex hooks
 *   7. warden-apply-patch-hook  patch with secret  → exit 2
 *   8. warden-bash-hook         command with secret → exit 2
 *
 * Fixture strategy:
 *   - clean.js is committed (no secrets, short).
 *   - Oversized content is generated in memory / tmpdir (committed file would
 *     trip warden-lint itself).
 *   - Secret content is generated via makeFakeSecret() which builds the
 *     pattern from parts so the scanner does not flag this source file.
 */

const { test } = require('node:test');
const assert        = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path          = require('node:path');
const fs            = require('node:fs');
const os            = require('node:os');
const { collectFiles } = require('../lib/file-collection');

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const ROOT     = path.join(__dirname, '..', '..');
const TOOLS    = path.join(ROOT, 'tools');
const FIXTURES = path.join(__dirname, 'fixtures');
const CLEAN    = path.join(FIXTURES, 'clean.js');

if (!fs.existsSync(CLEAN)) throw new Error(`Missing fixture: clean at ${CLEAN}`);

// ---------------------------------------------------------------------------
// Fixture generators — never committed, avoids false-positive self-scan
// ---------------------------------------------------------------------------

/**
 * Build a fake OpenAI-style key from parts so this source file does not
 * contain a string that matches the secret scanner's pattern literally.
 */
function makeFakeSecret() {
  return ['sk', '-', 'a'.repeat(48)].join('');
}

/** Generate content containing a hardcoded credential. */
function makeSecretContent() {
  return [
    '// Generated secret fixture — not committed to repo.',
    "'use strict';",
    `const KEY = '${makeFakeSecret()}';`,
    'module.exports = { KEY };',
  ].join('\n') + '\n';
}

function makeFakeDatabaseUrl() {
  return ['postgres', '://', 'user', ':', 'pass', '@example.invalid/db'].join('');
}

/** Generate content that exceeds the 400-line limit. */
function makeOversizedContent(limit = 400) {
  const lines = [
    '// Generated oversized fixture — not committed to repo.',
    "'use strict';",
    '',
  ];
  for (let i = 1; i <= limit + 15; i++) {
    lines.push(`const line${i} = ${i}; // padding`);
  }
  return lines.join('\n') + '\n';
}

/** Write content to a temp file; caller is responsible for cleanup. */
function writeTmp(name, content) {
  const p = path.join(os.tmpdir(), `cw-fixture-${process.pid}-${name}`);
  fs.writeFileSync(p, content);
  return p;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function runCLI(scriptPath, args = [], options = {}) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...(options.env || {}) },
  });
  return { code: result.status ?? result.signal, stdout: result.stdout || '', stderr: result.stderr || '' };
}

function runHook(scriptPath, payload) {
  const result = spawnSync(process.execPath, [scriptPath], { input: JSON.stringify(payload), encoding: 'utf8' });
  return { code: result.status ?? result.signal, stdout: result.stdout || '', stderr: result.stderr || '' };
}

function makeCompleteReceipt() {
  return {
    schemaVersion: 1,
    kind: 'code-warden/governance-receipt',
    status: 'complete',
    scopeGate: {
      confirmed: true,
      goal: 'Add governance receipts.',
      nonGoals: ['No release'],
      filesIn: ['code-warden/tools/receipt.js'],
      filesOut: ['release tags'],
      verifyAfter: ['npm test'],
      rollback: 'git checkout HEAD -- code-warden/tools/receipt.js',
    },
    planGate: {
      confirmed: true,
      patchOrder: ['Add tests', 'Add implementation'],
      blastRadius: 'MODERATE',
      humanCheckpoint: 'YES',
      postPatchChecks: ['npm test', 'npm run ci'],
    },
    finalEvidence: { commands: ['npm test'], reports: [], notes: [] },
    validation: { canProveCompliance: true },
  };
}

// ---------------------------------------------------------------------------
// CLI: warden-lint
// ---------------------------------------------------------------------------

test('warden-lint: clean file exits 0', () => {
  const { code } = runCLI(path.join(TOOLS, 'warden-lint.js'), [CLEAN]);
  assert.equal(code, 0, 'expected exit 0 for a clean, short file');
});

test('warden-lint: oversized file exits 1', () => {
  const tmp = writeTmp('oversized.js', makeOversizedContent());
  try {
    const { code, stderr } = runCLI(path.join(TOOLS, 'warden-lint.js'), [tmp]);
    assert.equal(code, 1, 'expected exit 1 for an oversized file');
    assert.ok(stderr.includes('[FAIL]'), 'expected [FAIL] in stderr');
  } finally {
    fs.rmSync(tmp, { force: true });
  }
});

// ---------------------------------------------------------------------------
// CLI: verify-secrets
// ---------------------------------------------------------------------------

test('verify-secrets: clean file exits 0', () => {
  const { code } = runCLI(path.join(TOOLS, 'verify-secrets.js'), [CLEAN]);
  assert.equal(code, 0, 'expected exit 0 for a file with no secrets');
});

test('verify-secrets: secret file exits 1', () => {
  const tmp = writeTmp('secret.js', makeSecretContent());
  try {
    const { code, stderr } = runCLI(path.join(TOOLS, 'verify-secrets.js'), [tmp]);
    assert.equal(code, 1, 'expected exit 1 for a file containing a hardcoded secret');
    assert.ok(stderr.includes('[FAIL]'), 'expected [FAIL] in stderr');
  } finally {
    fs.rmSync(tmp, { force: true });
  }
});

test('file collection: skips generated dirs, lockfiles, and logs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `cw-scan-${process.pid}-`));
  try {
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.mkdirSync(path.join(root, '.astro'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'app.js'), "'use strict';\n");
    fs.writeFileSync(path.join(root, '.astro', 'content.d.ts'), 'generated\n');
    fs.writeFileSync(path.join(root, 'pnpm-lock.yaml'), 'lock\n');
    fs.writeFileSync(path.join(root, 'dev-server.log'), `${makeFakeDatabaseUrl()}\n`);

    const files = [];
    collectFiles(root, files);
    const relative = files.map(file => path.relative(root, file)).sort();
    assert.deepEqual(relative, [path.join('src', 'app.js')]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('secret scanner: reports source location without secret text', () => {
  const { scanForSecrets } = require('../lib/secret-patterns');
  const content = [
    "'use strict';",
    'const label = "safe";',
    `const KEY = '${makeFakeSecret()}';`,
  ].join('\n');

  const hit = scanForSecrets(content);
  assert.equal(hit.label, 'OpenAI key');
  assert.equal(hit.line, 3);
  assert.equal(hit.column, 14);
  assert.equal(Object.hasOwn(hit, 'match'), false, 'secret match text must not be returned');
});

test('sarif formatter: emits source-located findings without secret text', () => {
  const { formatSarif } = require('../lib/sarif');
  const report = {
    tool: 'code-warden',
    version: '0.0.0-test',
    checks: {
      fileLength: {
        status: 'fail',
        details: [{ file: 'src/too-long.js', lines: 405, limit: 400 }],
      },
      secrets: {
        status: 'fail',
        details: [{ file: 'src/secret.js', pattern: 'OpenAI key', line: 3, column: 14 }],
      },
    },
  };

  const sarif = JSON.parse(formatSarif(report));
  assert.equal(sarif.version, '2.1.0');
  assert.equal(sarif.runs[0].tool.driver.name, 'Code-Warden');
  assert.equal(sarif.runs[0].results.length, 2);
  assert.deepEqual(
    sarif.runs[0].results.map(result => result.ruleId),
    ['CW001/max-file-length', 'CW002/hardcoded-credential']
  );
  assert.equal(sarif.runs[0].results[0].locations[0].physicalLocation.region.startLine, 401);
  assert.equal(sarif.runs[0].results[1].locations[0].physicalLocation.region.startLine, 3);
  assert.equal(sarif.runs[0].results[1].locations[0].physicalLocation.region.startColumn, 14);
  assert.equal(JSON.stringify(sarif).includes(makeFakeSecret()), false);
});

test('governance report: writes formatted output to --out path', () => {
  const out = writeTmp('report.sarif', '');
  try {
    fs.rmSync(out, { force: true });
    const { code, stdout } = runCLI(path.join(TOOLS, 'governance-report.js'), [
      '.',
      '--format=sarif',
      `--out=${out}`,
    ], { env: { CODE_WARDEN_SKIP_BEHAVIORAL_TESTS: '1' } });
    assert.equal(code, 0, 'expected SARIF report with --out to exit 0');
    assert.equal(stdout.trim(), `[CodeWarden] Report written to ${path.resolve(out)}`);
    const parsed = JSON.parse(fs.readFileSync(out, 'utf8'));
    assert.equal(parsed.version, '2.1.0');
  } finally {
    fs.rmSync(out, { force: true });
  }
});

test('code-warden CLI help: documents SARIF and --out examples', () => {
  const { code, stdout } = runCLI(path.join(ROOT, 'bin', 'code-warden.js'), ['--help']);
  assert.equal(code, 0, 'expected CLI help to exit 0');
  assert.match(stdout, /report --format=sarif --out=code-warden\.sarif/);
});

test('code-warden receipt: writes an incomplete governance receipt template', () => {
  const out = writeTmp('receipt-template.json', '');
  try {
    fs.rmSync(out, { force: true });
    const { code, stdout } = runCLI(path.join(ROOT, 'bin', 'code-warden.js'), [
      'receipt',
      '--template',
      `--out=${out}`,
    ]);
    assert.equal(code, 0, 'expected receipt template command to exit 0');
    assert.equal(stdout.trim(), `[CodeWarden] Receipt template written to ${path.resolve(out)}`);

    const receipt = JSON.parse(fs.readFileSync(out, 'utf8'));
    assert.equal(receipt.schemaVersion, 1);
    assert.equal(receipt.kind, 'code-warden/governance-receipt');
    assert.equal(receipt.status, 'draft');
    assert.equal(receipt.scopeGate.confirmed, false);
    assert.equal(receipt.planGate.confirmed, false);
    assert.equal(receipt.validation.canProveCompliance, false);
  } finally {
    fs.rmSync(out, { force: true });
  }
});

test('code-warden receipt: validation rejects missing gate evidence', () => {
  const receipt = {
    schemaVersion: 1,
    kind: 'code-warden/governance-receipt',
    status: 'complete',
    scopeGate: { confirmed: true, goal: 'Ship a feature.' },
    planGate: { confirmed: true },
    validation: { canProveCompliance: true },
  };
  const input = writeTmp('receipt-invalid.json', JSON.stringify(receipt, null, 2));
  try {
    const { code, stderr } = runCLI(path.join(ROOT, 'bin', 'code-warden.js'), [
      'receipt',
      `--validate=${input}`,
    ]);
    assert.equal(code, 1, 'expected invalid receipt to fail validation');
    assert.match(stderr, /scopeGate\.filesIn/);
    assert.match(stderr, /planGate\.patchOrder/);
  } finally {
    fs.rmSync(input, { force: true });
  }
});

test('code-warden receipt: validation accepts UTF-8 BOM JSON files', () => {
  const input = writeTmp('receipt-bom.json', '\uFEFF' + JSON.stringify(makeCompleteReceipt(), null, 2));
  try {
    const { code, stdout } = runCLI(path.join(ROOT, 'bin', 'code-warden.js'), [
      'receipt',
      `--validate=${input}`,
    ]);
    assert.equal(code, 0, 'expected valid BOM receipt to pass validation');
    assert.match(stdout, /Receipt validation passed/);
  } finally {
    fs.rmSync(input, { force: true });
  }
});

test('external smoke helper: exposes CLI help', () => {
  const { code, stdout } = runCLI(path.join(TOOLS, 'smoke-npx.js'), ['--help']);
  assert.equal(code, 0, 'expected smoke helper help to exit 0');
  assert.match(stdout, /Usage: code-warden smoke-npx/, 'expected usage text');
});

// ---------------------------------------------------------------------------
// Claude hook: warden-lint-hook (Write with oversized content)
// ---------------------------------------------------------------------------

test('Claude lint hook: Write oversized content exits 2', () => {
  const payload = {
    tool_name:  'Write',
    tool_input: { file_path: '/tmp/test-oversized.js', content: makeOversizedContent() },
  };
  const { code, stdout } = runHook(path.join(TOOLS, 'hooks', 'claude', 'warden-lint-hook.js'), payload);
  assert.equal(code, 2, 'expected exit 2 (deny) for oversized Write');
  const response = JSON.parse(stdout);
  assert.equal(response.hookSpecificOutput.permissionDecision, 'deny', 'expected deny decision');
});

// ---------------------------------------------------------------------------
// Claude hook: warden-secrets-hook (Write with secret content)
// ---------------------------------------------------------------------------

test('Claude secrets hook: Write secret content exits 2', () => {
  const payload = {
    tool_name:  'Write',
    tool_input: { file_path: '/tmp/test-secret.js', content: makeSecretContent() },
  };
  const { code, stdout } = runHook(path.join(TOOLS, 'hooks', 'claude', 'warden-secrets-hook.js'), payload);
  assert.equal(code, 2, 'expected exit 2 (deny) for Write containing secret');
  const response = JSON.parse(stdout);
  assert.equal(response.hookSpecificOutput.permissionDecision, 'deny', 'expected deny decision');
});

// ---------------------------------------------------------------------------
// Codex hook: warden-apply-patch-hook (patch adding a secret)
// ---------------------------------------------------------------------------

test('Codex apply_patch hook: patch with secret exits 2', () => {
  const patch = [
    '*** /dev/null',
    '+++ tmp/secret-patch.js',
    '@@ -0,0 +1,2 @@',
    `+const KEY = '${makeFakeSecret()}';`,
    '+module.exports = { KEY };',
  ].join('\n');

  const { code, stdout } = runHook(
    path.join(TOOLS, 'hooks', 'codex', 'warden-apply-patch-hook.js'),
    { tool: 'apply_patch', toolInput: { patch } }
  );
  assert.equal(code, 2, 'expected exit 2 (deny) for apply_patch with hardcoded secret');
  assert.ok(JSON.parse(stdout).deny === true, 'expected deny:true');
});

// ---------------------------------------------------------------------------
// Codex hook: warden-bash-hook (command containing a secret)
// ---------------------------------------------------------------------------

test('Codex Bash hook: command with secret exits 2', () => {
  const { code, stdout } = runHook(
    path.join(TOOLS, 'hooks', 'codex', 'warden-bash-hook.js'),
    { tool: 'Bash', toolInput: { command: `echo ${makeFakeSecret()}` } }
  );
  assert.equal(code, 2, 'expected exit 2 (deny) for Bash command with hardcoded secret');
  assert.ok(JSON.parse(stdout).deny === true, 'expected deny:true');
});
