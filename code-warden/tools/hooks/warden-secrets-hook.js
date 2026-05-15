#!/usr/bin/env node
/**
 * warden-secrets-hook.js
 * PreToolUse Claude Code hook: blocks Write/Edit if content contains
 * hardcoded credentials matching zero-trust secret patterns.
 *
 * Write: scans full content.
 * Edit:  scans new_string only (old content was already committed).
 *
 * On violation: exit 2 + JSON deny response to stdout.
 * On pass:      exit 0 (no output).
 */

'use strict';

const path = require('path');

// ---------------------------------------------------------------------------
// Secret patterns — same set as verify-secrets.js CLI tool
// ---------------------------------------------------------------------------

const PATTERNS = [
  { label: 'AWS access key',           re: /AKIA[0-9A-Z]{16}/i },
  { label: 'OpenAI key',               re: /sk-[A-Za-z0-9]{32,}/i },
  { label: 'GitHub token',             re: /gh[pousr]_[A-Za-z0-9]{36,}/i },
  { label: 'Stripe secret key',        re: /sk_(live|test)_[A-Za-z0-9]{24,}/i },
  { label: 'Slack token',              re: /xox[baprs]-[A-Za-z0-9\-]{10,}/i },
  { label: 'SendGrid key',             re: /SG\.[A-Za-z0-9_\-.]{20,}/i },
  { label: 'Twilio SID',               re: /AC[a-f0-9]{32}/i },
  { label: 'generic API key',          re: /api[_-]?key\s*[:=]\s*['"]?[A-Za-z0-9_\-]{20,}/i },
  { label: 'generic secret key',       re: /secret[_-]?key\s*[:=]\s*['"]?[A-Za-z0-9_\-]{20,}/i },
  { label: 'password assignment',      re: /password\s*[:=]\s*['"][^'"]{8,}['"]/i },
  { label: 'bearer token',             re: /bearer\s+[A-Za-z0-9\-._~+\/]{20,}/i },
  { label: 'private key header',       re: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { label: 'database URL with creds',  re: /[a-z][a-z0-9+\-.]*:\/\/[^:]+:[^@]+@[^/]+\//i },
];

function scanContent(content) {
  for (const { label, re } of PATTERNS) {
    if (re.test(content)) return label;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

function deny(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  }));
  process.exit(2);
}

const allow = () => process.exit(0);

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  let payload;
  try {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    allow();
  }

  const { tool_name, tool_input = {} } = payload;

  if (tool_name === 'Write') {
    const hit = scanContent(tool_input.content || '');
    if (hit) {
      const file = path.basename(tool_input.file_path || 'file');
      deny(`[CodeWarden] Zero-trust gate: ${hit} detected in ${file}. Use environment variables — no hardcoded credentials.`);
    }
    allow();
  }

  if (tool_name === 'Edit') {
    const hit = scanContent(tool_input.new_string || '');
    if (hit) {
      const file = path.basename(tool_input.file_path || 'file');
      deny(`[CodeWarden] Zero-trust gate: ${hit} detected in replacement for ${file}. Use environment variables — no hardcoded credentials.`);
    }
    allow();
  }

  allow();
}

main().catch(() => allow());
