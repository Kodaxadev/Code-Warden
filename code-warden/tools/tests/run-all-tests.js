#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const TESTS = [
  'run-tests.js',
  'cli-tests.js',
  'codex-config-tests.js',
  'risk-policy-tests.js',
  'reference-selector-tests.js',
  'secret-pattern-tests.js',
  'config-discovery-tests.js',
  'hook-coverage-tests.js',
  'git-hook-tests.js',
  'baseline-tests.js',
  'scope-tests.js',
  'command-risk-tests.js',
  'audit-ledger-tests.js',
  'lifecycle-hook-tests.js',
  'receipt-audit-tests.js',
];

let failed = false;

for (const file of TESTS) {
  const result = spawnSync(process.execPath, [path.join(__dirname, file)], {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..', '..'),
  });
  if (result.status !== 0) failed = true;
}

process.exit(failed ? 1 : 0);
