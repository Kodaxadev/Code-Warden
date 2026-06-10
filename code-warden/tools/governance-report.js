#!/usr/bin/env node
'use strict';

const fs            = require('fs');
const path          = require('path');
const os            = require('os');
const { spawnSync } = require('child_process');
const { countLines }        = require('./lib/line-count');
const { collectFiles }      = require('./lib/file-collection');
const { scanForAllSecrets } = require('./lib/secret-patterns');
const { loadConfig }        = require('./lib/config');
const { matchesAnyPrefix }  = require('./lib/path-match');
const { formatSarif }       = require('./lib/sarif');
const { loadRiskPolicy }    = require('./lib/risk-policy');
const { formatMarkdown, formatSummary } = require('./lib/report-format');
const { createBaseline, loadBaseline, applyBaselineToChecks,
        hashLine, DEFAULT_BASELINE }    = require('./lib/baseline');

const ROOT    = path.join(__dirname, '..');
const PKG     = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const VERSION = PKG.version;

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = argv.slice(2);
  const formatArg = args.find(a => a.startsWith('--format='));
  const outArg = args.find(a => a.startsWith('--out='));
  const configArg = args.find(a => a.startsWith('--config='));
  const format = formatArg ? formatArg.split('=')[1] : null;
  const out = outArg ? outArg.slice('--out='.length) : null;
  const configPath = configArg ? configArg.slice('--config='.length) : null;
  const scanPath = args.find(a => !a.startsWith('--')) || '.';
  // --write-baseline[=path] / --baseline[=path]; bare flags use the default
  // baseline filename in the current working directory.
  const pathFlag = (name) => {
    const withValue = args.find(a => a.startsWith(`--${name}=`));
    if (withValue) return withValue.slice(name.length + 3);
    return args.includes(`--${name}`) ? DEFAULT_BASELINE : null;
  };
  return {
    format, out, scanPath, configPath,
    writeBaselinePath: pathFlag('write-baseline'),
    baselinePath:      pathFlag('baseline'),
  };
}

// ---------------------------------------------------------------------------
// Git metadata
// ---------------------------------------------------------------------------

function gitInfo() {
  const run = (gitArgs) => {
    const r = spawnSync('git', gitArgs, { encoding: 'utf8', timeout: 5000 });
    return r.status === 0 ? r.stdout.trim() : null;
  };
  return {
    branch: run(['rev-parse', '--abbrev-ref', 'HEAD']),
    commit: run(['rev-parse', '--short', 'HEAD']),
  };
}

// ---------------------------------------------------------------------------
// File length + secrets (single pass over all files)
// ---------------------------------------------------------------------------

function runScans(scanPath, configPath) {
  const { maxFileLength, lintExcludePaths, secretsAllowlist } = loadConfig(configPath);
  const resolved = path.resolve(scanPath);

  if (!fs.existsSync(resolved)) {
    console.error(`[CodeWarden] Error: scan path not found: ${scanPath}`);
    process.exit(1);
  }

  const files = [];
  const scanRootIsDirectory = fs.statSync(resolved).isDirectory();
  if (scanRootIsDirectory) {
    collectFiles(resolved, files);
  } else {
    files.push(resolved);
  }

  const lengthViolations = [];
  const secretViolations = [];

  for (const f of files) {
    let content;
    try { content = fs.readFileSync(f, 'utf8'); } catch { continue; }

    const rel = scanRootIsDirectory ? path.relative(resolved, f) : path.basename(f);

    if (!matchesAnyPrefix(rel, lintExcludePaths)) {
      const lineCount = countLines(content);
      if (lineCount > maxFileLength) {
        lengthViolations.push({ file: rel, lines: lineCount, limit: maxFileLength });
      }
    }

    if (!matchesAnyPrefix(rel, secretsAllowlist)) {
      const hits = scanForAllSecrets(content);
      if (hits.length > 0) {
        // Split matches locationForIndex() in secret-patterns ('\n' only);
        // hashLine() trims, so stray '\r' never affects the fingerprint.
        const sourceLines = content.split('\n');
        for (const hit of hits) {
          secretViolations.push({
            file: rel, pattern: hit.label, line: hit.line, column: hit.column,
            // Content fingerprint of the matched line for baseline matching.
            // Never the raw text - line numbers drift, hashes survive moves.
            contextHash: hashLine(sourceLines[hit.line - 1] || ''),
          });
        }
      }
    }
  }

  return {
    fileLength: {
      status: lengthViolations.length === 0 ? 'pass' : 'fail',
      filesScanned: files.length,
      violations: lengthViolations.length,
      details: lengthViolations.length > 0 ? lengthViolations : undefined,
    },
    secrets: {
      status: secretViolations.length === 0 ? 'pass' : 'fail',
      filesScanned: files.length,
      violations: secretViolations.length,
      details: secretViolations.length > 0 ? secretViolations : undefined,
    },
  };
}

// ---------------------------------------------------------------------------
// Behavioral tests
// ---------------------------------------------------------------------------

function checkTests() {
  if (process.env.CODE_WARDEN_SKIP_BEHAVIORAL_TESTS === '1') {
    return { status: 'skip', tests: 0, failures: 0 };
  }

  const testScript = process.env.CODE_WARDEN_TEST_SCRIPT ||
    path.join(__dirname, 'tests', 'run-all-tests.js');
  if (!fs.existsSync(testScript)) {
    return { status: 'skip', tests: 0, failures: 0 };
  }

  const r = spawnSync(process.execPath, [testScript], {
    encoding: 'utf8',
    timeout: 30000,
    cwd: ROOT,
  });

  const out = (r.stdout || '') + (r.stderr || '');
  const passMatches = [...out.matchAll(/pass\s+(\d+)/g)];
  const failMatches = [...out.matchAll(/fail\s+(\d+)/g)];

  let passed, failed;
  if (passMatches.length > 0 || failMatches.length > 0) {
    passed = passMatches.reduce((sum, m) => sum + parseInt(m[1], 10), 0);
    failed = failMatches.reduce((sum, m) => sum + parseInt(m[1], 10), 0);
  } else {
    passed = (out.match(/^(?:ok \d+|✔)/gm) || []).length;
    failed = (out.match(/^(?:not ok \d+|✖)/gm) || []).length;
  }

  return {
    status: r.status === 0 ? 'pass' : 'fail',
    tests: passed + failed,
    failures: failed,
  };
}

// ---------------------------------------------------------------------------
// Source integrity
// ---------------------------------------------------------------------------

function checkInstallHealth() {
  const required = [
    'SKILL.md',
    'references',
    'tools/warden-lint.js',
    'tools/verify-secrets.js',
    'tools/get-context.js',
  ];
  const missing = required.filter(f => !fs.existsSync(path.join(ROOT, f)));
  return {
    status: missing.length === 0 ? 'pass' : 'fail',
    missing: missing.length > 0 ? missing : undefined,
  };
}

// ---------------------------------------------------------------------------
// Runtime hook detection
// ---------------------------------------------------------------------------

function checkRuntimeHooks() {
  const home = os.homedir();
  const result = {};

  const claudeSettings = path.join(home, '.claude', 'settings.json');
  if (fs.existsSync(claudeSettings)) {
    try {
      const s = JSON.parse(fs.readFileSync(claudeSettings, 'utf8'));
      const hooks = (s?.hooks?.PreToolUse || [])
        .flatMap(m => m.hooks || [])
        .filter(h => String(h.description || '').startsWith('code-warden:'));
      if (hooks.length > 0) {
        const valid = hooks.every(h => h.args?.[0] && fs.existsSync(h.args[0]));
        result.claude = valid ? 'registered' : 'registered_broken';
      } else {
        result.claude = 'not_registered';
      }
    } catch { result.claude = 'error'; }
  } else {
    result.claude = 'not_configured';
  }

  const codexHooksPath = path.join(home, '.codex', 'hooks.json');
  if (fs.existsSync(codexHooksPath)) {
    try {
      const h = JSON.parse(fs.readFileSync(codexHooksPath, 'utf8'));
      const cw = (h?.PreToolUse || [])
        .filter(e => String(e.description || '').startsWith('code-warden:'));
      if (cw.length > 0) {
        const valid = cw.every(e => e.args?.[0] && fs.existsSync(e.args[0]));
        result.codex = valid ? 'registered' : 'registered_broken';
      } else {
        result.codex = 'not_registered';
      }
    } catch { result.codex = 'error'; }
  } else {
    result.codex = 'not_configured';
  }

  return result;
}

// ---------------------------------------------------------------------------
// Report assembly
// ---------------------------------------------------------------------------

function generateReport(scanPath, configPath, baseline, baselinePath) {
  const repo = gitInfo();
  const scans = runScans(scanPath, configPath);
  let { fileLength, secrets } = scans;
  let baselineInfo = null;

  if (baseline) {
    const applied = applyBaselineToChecks(scans, baseline);
    fileLength   = applied.fileLength;
    secrets      = applied.secrets;
    baselineInfo = { path: baselinePath, applied: true, legacy: applied.legacy };
  }

  const behavioralTests = checkTests();
  const installHealth = checkInstallHealth();
  const runtimeHooks = checkRuntimeHooks();
  const riskPolicy = loadRiskPolicy();

  const checks = { fileLength, secrets, behavioralTests, installHealth, riskPolicy };
  const result = Object.values(checks).every(c => c.status === 'pass' || c.status === 'skip')
    ? 'pass' : 'fail';

  return {
    tool: 'code-warden',
    version: VERSION,
    timestamp: new Date().toISOString(),
    repository: { branch: repo.branch, commit: repo.commit },
    checks,
    ...(baselineInfo ? { baseline: baselineInfo } : {}),
    governance: {
      scopeGate: 'session_only',
      planGate: 'session_only',
      runtimeHooks,
      riskPolicy: {
        tiers: riskPolicy.tiers,
        actions: riskPolicy.actions,
      },
    },
    result,
  };
}

// ---------------------------------------------------------------------------
// Output (formatters live in lib/report-format.js)
// ---------------------------------------------------------------------------

function formatReport(report, format) {
  if (format === 'md') return formatMarkdown(report);
  if (format === 'json') return JSON.stringify(report, null, 2);
  if (format === 'sarif') return formatSarif(report);
  return JSON.stringify(report, null, 2);
}

function writeReport(outPath, content) {
  const resolved = path.resolve(outPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, content, 'utf8');
  console.log(`[CodeWarden] Report written to ${resolved}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const { format, out, scanPath, configPath,
        writeBaselinePath, baselinePath } = parseArgs(process.argv);

// --write-baseline: record current violations as the ratchet floor and exit.
if (writeBaselinePath) {
  const scans = runScans(scanPath, configPath);
  const baseline = createBaseline(scans);
  const dest = path.resolve(writeBaselinePath);
  fs.writeFileSync(dest, JSON.stringify(baseline, null, 2) + '\n', 'utf8');
  console.log(`[CodeWarden] Baseline written to ${dest}`);
  console.log(`[CodeWarden] Recorded ${baseline.fileLength.length} file-length and ${baseline.secrets.length} secret finding(s).`);
  console.log('[CodeWarden] Commit this file; future runs with --baseline fail only on new or worsened violations.');
  process.exit(0);
}

// --baseline: a missing file is a hard error - silently ignoring it would
// fake a gate.
let baselineData = null;
if (baselinePath) {
  try {
    baselineData = loadBaseline(path.resolve(baselinePath));
  } catch (err) {
    console.error(`[CodeWarden] Error: ${err.message}`);
    process.exit(1);
  }
}

const report = generateReport(scanPath, configPath, baselineData, baselinePath);

if (out) {
  writeReport(out, formatReport(report, format));
} else if (format === 'md') {
  console.log(formatMarkdown(report));
} else if (format === 'json') {
  console.log(JSON.stringify(report, null, 2));
} else if (format === 'sarif') {
  console.log(formatSarif(report));
} else {
  const json = JSON.stringify(report, null, 2);
  const outPath = path.resolve('.code-warden-report.json');
  fs.writeFileSync(outPath, json, 'utf8');
  console.log(formatSummary(report));
  console.log(`[CodeWarden] Report written to ${outPath}`);
}

process.exit(report.result === 'pass' ? 0 : 1);
