#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '../codewarden.json');
let maxFileLength = 400;

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

const SKIP_DIRS = new Set(['node_modules', '.git', 'target']);
const SKIP_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.webp',
  '.zip', '.tar', '.gz', '.7z', '.rar',
  '.dll', '.exe', '.bin', '.so', '.dylib',
  '.pdf', '.woff', '.woff2', '.ttf', '.eot',
  '.mp4', '.mp3', '.wav', '.ogg',
]);

function collectFiles(dir, results) {
  for (const entry of fs.readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      collectFiles(full, results);
    } else if (!SKIP_EXTS.has(path.extname(entry).toLowerCase())) {
      results.push(full);
    }
  }
}

function expandPaths(args) {
  if (args.length === 0) {
    console.log('Usage: warden-lint.js <file|dir> [file|dir] ...');
    console.log('       node tools/warden-lint.js .           # scan entire project');
    process.exit(1);
  }
  const files = [];
  for (const arg of args) {
    if (!fs.existsSync(arg)) {
      console.error(`Error: path not found: ${arg}`);
      continue;
    }
    if (fs.statSync(arg).isDirectory()) collectFiles(arg, files);
    else files.push(arg);
  }
  return files;
}

const filePaths = expandPaths(process.argv.slice(2));
let hasErrors = false;

for (const filePath of filePaths) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n').length;

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
