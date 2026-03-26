#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Load codewarden.json for configuration
const configPath = path.join(__dirname, '../codewarden.json');
let maxFileLength = 400; // default

if (fs.existsSync(configPath)) {
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (config.thresholds && config.thresholds.max_file_length) {
      maxFileLength = config.thresholds.max_file_length;
    }
  } catch (err) {
    console.error(`Warning: Failed to parse codewarden.json: ${err.message}`);
  }
}

const filePaths = process.argv.slice(2);
if (filePaths.length === 0) {
  console.log('Usage: warden-lint.js <file1> <file2> ...');
  process.exit(1);
}

let hasErrors = false;

for (const filePath of filePaths) {
  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    hasErrors = true;
    continue;
  }

  const stat = fs.statSync(filePath);
  if (stat.isDirectory()) continue;

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n').length;

  if (lines > maxFileLength) {
    console.error(`❌ [CodeWarden] File ${filePath} exceeds the maximum length of ${maxFileLength} lines (${lines} lines). Please refactor into smaller modules.`);
    hasErrors = true;
  } else {
    console.log(`✅ [CodeWarden] ${filePath} (${lines} lines) complies with the length restriction.`);
  }
}

if (hasErrors) {
  process.exit(1);
}
