#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const TESTS = [
  'run-tests.js',
  'risk-policy-tests.js',
  'reference-selector-tests.js',
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
