#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { scanForAllSecrets } = require('./lib/secret-patterns');
const { expandPaths }       = require('./lib/file-collection');

const filePaths = expandPaths(process.argv.slice(2), 'verify-secrets.js');
let hasErrors = false;

for (const filePath of filePaths) {
  const content = fs.readFileSync(filePath, 'utf8');
  const hits = scanForAllSecrets(content);

  if (hits.length > 0) {
    for (const hit of hits) {
      console.error(`[FAIL] [CodeWarden] Hardcoded credential detected in ${filePath} - pattern: ${hit.label} (line ${hit.line}, column ${hit.column})`);
    }
    console.error('    Rule: All secrets must be sourced from an environment variable (e.g., process.env)');
    hasErrors = true;
  } else {
    console.log(`[PASS] [CodeWarden] ${filePath} passed hardcoded credential scan.`);
  }
}

if (hasErrors) {
  process.exit(1);
}
