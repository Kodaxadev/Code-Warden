#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { countLines }            = require('./lib/line-count');
const { expandPaths }           = require('./lib/file-collection');
const { loadConfig }            = require('./lib/config');

const { maxFileLength } = loadConfig();
const filePaths = expandPaths(process.argv.slice(2), 'warden-lint.js');
let hasErrors = false;

for (const filePath of filePaths) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = countLines(content);

  if (lines > maxFileLength) {
    console.error(`[FAIL] [CodeWarden] File ${filePath} exceeds the maximum length of ${maxFileLength} lines (${lines} lines). Please refactor into smaller modules.`);
    hasErrors = true;
  } else {
    console.log(`[PASS] [CodeWarden] ${filePath} (${lines} lines) complies with the length restriction.`);
  }
}

if (hasErrors) {
  process.exit(1);
}
