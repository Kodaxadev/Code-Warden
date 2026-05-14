#!/usr/bin/env node
const fs = require('fs');

const filePaths = process.argv.slice(2);
if (filePaths.length === 0) {
  console.log('Usage: verify-secrets.js <file1> <file2> ...');
  process.exit(1);
}

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
  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    hasErrors = true;
    continue;
  }

  const stat = fs.statSync(filePath);
  if (stat.isDirectory()) continue;

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
