#!/usr/bin/env node
/**
 * warden-apply-patch-hook.js — Codex PreToolUse hook
 *
 * Fires on apply_patch tool calls. Scans added lines for hardcoded credentials
 * and estimates resulting file size where the target path can be extracted.
 *
 * Codex hook payload (stdin, JSON):
 *   { tool: "apply_patch", toolInput: { patch: "<patch text>" } }
 *
 * Exit codes:
 *   0  — proceed
 *   2  — block (writes JSON deny to stdout)
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const CONFIG_PATH = path.join(__dirname, '..', '..', '..', 'codewarden.json');
let maxLines = 400;
try {
  const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  maxLines = cfg?.thresholds?.max_file_length ?? cfg?.max_file_length ?? maxLines;
} catch { /* use default */ }

// ---------------------------------------------------------------------------
// Secret patterns (same set as warden-secrets-hook.js)
// ---------------------------------------------------------------------------

const SECRET_PATTERNS = [
  { name: 'OpenAI key',       re: /sk-[A-Za-z0-9]{32,}/ },
  { name: 'GitHub token',     re: /gh[posx]_[A-Za-z0-9]{36}/ },
  { name: 'AWS access key',   re: /AKIA[0-9A-Z]{16}/ },
  { name: 'Stripe live key',  re: /sk_live_[A-Za-z0-9]{24,}/ },
  { name: 'Stripe test key',  re: /sk_test_[A-Za-z0-9]{24,}/ },
  { name: 'Slack token',      re: /xox[baprs]-[A-Za-z0-9\-]+/ },
  { name: 'SendGrid key',     re: /SG\.[A-Za-z0-9\-_]{22}\.[A-Za-z0-9\-_]{43}/ },
  { name: 'Twilio SID',       re: /AC[a-f0-9]{32}/ },
  { name: 'Bearer token',     re: /bearer\s+[A-Za-z0-9\-_]{20,}/i },
  { name: 'Private key',      re: /-----BEGIN (RSA |EC )?PRIVATE KEY-----/ },
  { name: 'DB URL',           re: /(postgres|mysql|mongodb):\/\/[^:]+:[^@]+@/ },
  { name: 'Generic API key',  re: /(?:api[_-]?key|apikey)\s*[:=]\s*['"]?[A-Za-z0-9\-_]{16,}/i },
  { name: 'Generic password', re: /(?:password|passwd|secret)\s*[:=]\s*['"]?[^\s'"]{8,}/i },
];

function deny(reason) {
  process.stdout.write(JSON.stringify({ deny: true, message: `[CodeWarden] ${reason}` }) + '\n');
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Patch parsing helpers
// ---------------------------------------------------------------------------

/**
 * Extract lines added by the patch (lines starting with '+', not '+++').
 */
function extractAddedLines(patch) {
  return patch.split('\n')
    .filter(l => l.startsWith('+') && !l.startsWith('+++'))
    .map(l => l.slice(1));
}

/**
 * Extract target file path from patch header (*** path or +++ path or --- path).
 * Returns null if not detectable.
 */
function extractTargetPath(patch) {
  for (const line of patch.split('\n')) {
    const m = line.match(/^\+{3}\s+(.+?)(\s+\d{4}-\d{2}-\d{2}.*)?$/) ||
              line.match(/^\*{3}\s+(.+?)(\s+\d{4}-\d{2}-\d{2}.*)?$/);
    if (m) {
      const p = m[1].trim();
      if (p !== '/dev/null') return p;
    }
  }
  return null;
}

/**
 * Estimate resulting line count: base file lines + added lines - removed lines.
 * Returns null if file not readable.
 */
function estimateResultLines(patch, targetPath) {
  let baseLines = 0;
  if (targetPath && fs.existsSync(targetPath)) {
    try {
      baseLines = fs.readFileSync(targetPath, 'utf8').split('\n').length;
    } catch { return null; }
  } else if (!targetPath) {
    return null;
  }
  // Count added and removed lines
  let added = 0;
  let removed = 0;
  for (const line of patch.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) added++;
    else if (line.startsWith('-') && !line.startsWith('---')) removed++;
  }
  return baseLines + added - removed;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { raw += chunk; });
process.stdin.on('end', () => {
  let payload;
  try { payload = JSON.parse(raw); } catch { process.exit(0); }

  const input = payload.toolInput || payload.tool_input || {};
  const patch  = String(input.patch || '');
  if (!patch) process.exit(0);

  // --- Secrets check on added lines ---
  const added = extractAddedLines(patch);
  const addedText = added.join('\n');
  for (const { name, re } of SECRET_PATTERNS) {
    if (re.test(addedText)) deny(`Blocked apply_patch — hardcoded credential detected (${name}). Remove before patching.`);
  }

  // --- File length check ---
  const targetPath = extractTargetPath(patch);
  const estimated  = estimateResultLines(patch, targetPath);
  if (estimated !== null && estimated > maxLines) {
    deny(`Blocked apply_patch — resulting file would be ~${estimated} lines (limit ${maxLines}). Break it up first.`);
  }

  process.exit(0);
});
