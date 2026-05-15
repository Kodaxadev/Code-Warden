#!/usr/bin/env node
const fs   = require('fs');
const path = require('path');

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
    console.log('Usage: verify-secrets.js <file|dir> [file|dir] ...');
    console.log('       node tools/verify-secrets.js .           # scan entire project');
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

// Named secret patterns. Add new patterns here as a { name, pattern } object.
const secretPatterns = [
  { name: 'generic-api-key', pattern: /(api_key|apikey|secret_key|secretkey)["']?\s*[:=]\s*["'][a-zA-Z0-9\-_]{16,}["']/i },
  { name: 'generic-password', pattern: /password["']?\s*[:=]\s*["'][^"']{6,}["']/i },
  { name: 'bearer-token', pattern: /bearer\s+[a-zA-Z0-9\-._~+/]{20,}=*/i },
  { name: 'aws-access-key', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'aws-secret-key', pattern: /(aws_secret_access_key)["']?\s*[:=]\s*["'][A-Za-z0-9/+=]{16,}["']/i },
  { name: 'openai-key', pattern: /\bsk-[a-zA-Z0-9]{32,}\b/ },
  { name: 'github-pat', pattern: /\bghp_[a-zA-Z0-9]{36}\b/ },
  { name: 'github-oauth', pattern: /\bgho_[a-zA-Z0-9]{36}\b/ },
  { name: 'github-app', pattern: /\bghs_[a-zA-Z0-9]{36}\b/ },
  { name: 'github-refresh', pattern: /\bghx_[a-zA-Z0-9]{36}\b/ },
  { name: 'stripe-live', pattern: /\bsk_live_[a-zA-Z0-9]{24,}\b/ },
  { name: 'stripe-test', pattern: /\bsk_test_[a-zA-Z0-9]{24,}\b/ },
];

let hasErrors = false;

for (const filePath of filePaths) {
  const content = fs.readFileSync(filePath, 'utf8');
  let fileHasSecrets = false;

  for (const { name, pattern } of secretPatterns) {
    if (pattern.test(content)) {
      console.error(`[FAIL] [CodeWarden] ZERO-TRUST VIOLATION in ${filePath} - pattern: ${name}`);
      console.error('    Rule: All secrets must be sourced from an environment variable (e.g., process.env)');
      hasErrors = true;
      fileHasSecrets = true;
      break;
    }
  }

  if (!fileHasSecrets) {
    console.log(`[PASS] [CodeWarden] ${filePath} passed zero-trust check (no hardcoded secrets detected).`);
  }
}

if (hasErrors) {
  process.exit(1);
}
