#!/usr/bin/env node
'use strict';

const fs            = require('fs');
const path          = require('path');
const os            = require('os');
const { spawnSync } = require('child_process');
const { countLines }     = require('./lib/line-count');
const { collectFiles }   = require('./lib/file-collection');
const { scanForSecrets } = require('./lib/secret-patterns');
const { loadConfig }     = require('./lib/config');
const { formatSarif }    = require('./lib/sarif');

const ROOT    = path.join(__dirname, '..');
const PKG     = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const VERSION = PKG.version;

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = argv.slice(2);
  const formatArg = args.find(a => a.startsWith('--format='));
  const format = formatArg ? formatArg.split('=')[1] : null;
  const scanPath = args.find(a => !a.startsWith('--')) || '.';
  return { format, scanPath };
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

function runScans(scanPath) {
  const { maxFileLength } = loadConfig();
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

    const lineCount = countLines(content);
    if (lineCount > maxFileLength) {
      lengthViolations.push({ file: rel, lines: lineCount, limit: maxFileLength });
    }

    const hit = scanForSecrets(content);
    if (hit) {
      secretViolations.push({ file: rel, pattern: hit.label, line: hit.line, column: hit.column });
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
  const testScript = path.join(__dirname, 'tests', 'run-tests.js');
  if (!fs.existsSync(testScript)) {
    return { status: 'skip', tests: 0, failures: 0 };
  }

  const r = spawnSync(process.execPath, [testScript], {
    encoding: 'utf8',
    timeout: 30000,
    cwd: ROOT,
  });

  const out = (r.stdout || '') + (r.stderr || '');
  const passMatch = out.match(/pass\s+(\d+)/);
  const failMatch = out.match(/fail\s+(\d+)/);

  let passed, failed;
  if (passMatch || failMatch) {
    passed = parseInt(passMatch?.[1] || '0', 10);
    failed = parseInt(failMatch?.[1] || '0', 10);
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

function generateReport(scanPath) {
  const repo = gitInfo();
  const { fileLength, secrets } = runScans(scanPath);
  const behavioralTests = checkTests();
  const installHealth = checkInstallHealth();
  const runtimeHooks = checkRuntimeHooks();

  const checks = { fileLength, secrets, behavioralTests, installHealth };
  const result = Object.values(checks).every(c => c.status === 'pass' || c.status === 'skip')
    ? 'pass' : 'fail';

  return {
    tool: 'code-warden',
    version: VERSION,
    timestamp: new Date().toISOString(),
    repository: { branch: repo.branch, commit: repo.commit },
    checks,
    governance: {
      scopeGate: 'session_only',
      planGate: 'session_only',
      runtimeHooks,
    },
    result,
  };
}

// ---------------------------------------------------------------------------
// Markdown formatter
// ---------------------------------------------------------------------------

function formatMarkdown(report) {
  const badge = s => s === 'pass' ? 'PASS' : s === 'skip' ? 'SKIP' : 'FAIL';
  const hookLabel = (id) => {
    const s = report.governance.runtimeHooks[id];
    if (s === 'registered') return 'verified';
    if (s === 'registered_broken') return 'broken';
    if (s === 'not_registered') return 'none';
    return 'n/a';
  };

  const healthDetail = report.checks.installHealth.missing
    ? 'Missing: ' + report.checks.installHealth.missing.join(', ')
    : 'All source files present';

  const lines = [
    '## Code-Warden Governance Report',
    '',
    '| Check | Result | Details |',
    '|-------|--------|---------|',
    `| File length | ${badge(report.checks.fileLength.status)} | ${report.checks.fileLength.filesScanned} files scanned, ${report.checks.fileLength.violations} violations |`,
    `| Hardcoded credentials | ${badge(report.checks.secrets.status)} | ${report.checks.secrets.filesScanned} files scanned, ${report.checks.secrets.violations} violations |`,
    `| Behavioral tests | ${badge(report.checks.behavioralTests.status)} | ${report.checks.behavioralTests.tests} tests, ${report.checks.behavioralTests.failures} failures |`,
    `| Install health | ${badge(report.checks.installHealth.status)} | ${healthDetail} |`,
    `| Runtime hooks | — | Claude: ${hookLabel('claude')} / Codex: ${hookLabel('codex')} |`,
    '',
    `**Result:** ${report.result === 'pass' ? 'All governed checks passed.' : 'One or more checks failed.'}`,
    '',
    `> Generated by Code-Warden v${report.version} at ${report.timestamp}`,
  ];

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// One-line summary (default mode stdout)
// ---------------------------------------------------------------------------

function formatSummary(report) {
  const c = report.checks;
  const parts = [
    `lint:${c.fileLength.status}`,
    `secrets:${c.secrets.status}`,
    `tests:${c.behavioralTests.status}`,
    `health:${c.installHealth.status}`,
  ];
  return `[CodeWarden] Governance report: ${report.result.toUpperCase()} (${parts.join(', ')})`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const { format, scanPath } = parseArgs(process.argv);
const report = generateReport(scanPath);

if (format === 'md') {
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
