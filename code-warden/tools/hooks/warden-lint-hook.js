#!/usr/bin/env node
/**
 * warden-lint-hook.js
 * PreToolUse Claude Code hook: blocks Write/Edit if the resulting file would
 * exceed the configured line limit.
 *
 * Payload (stdin JSON):  { tool_name, tool_input: { file_path, content|new_string, ... } }
 * On violation: exit 2 + JSON deny response to stdout.
 * On pass:      exit 0 (no output).
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');

// ---------------------------------------------------------------------------
// Config — read from installed skill's codewarden.json, fall back to default
// ---------------------------------------------------------------------------

const CONFIG_PATH = path.join(os.homedir(), '.claude', 'skills', 'code-warden', 'codewarden.json');
let MAX_LINES = 400;
try {
  const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const configured = cfg?.thresholds?.max_file_length ?? cfg?.max_file_length;
  if (typeof configured === 'number') MAX_LINES = configured;
} catch {}

// ---------------------------------------------------------------------------
// Skip list — file types where line counting is meaningless
// ---------------------------------------------------------------------------

const SKIP_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.svg',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.zip', '.tar', '.gz', '.rar', '.7z',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
  '.mp3', '.mp4', '.avi', '.mov', '.wav',
  '.map', '.lock',
]);

const SKIP_NAMES = new Set(['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml']);

function shouldSkip(filePath) {
  if (!filePath) return true;
  if (SKIP_NAMES.has(path.basename(filePath))) return true;
  return SKIP_EXTS.has(path.extname(filePath).toLowerCase());
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
    allow(); // parse failure is non-blocking
  }

  const { tool_name, tool_input = {} } = payload;
  const { file_path, content, old_string, new_string, replace_all } = tool_input;

  if (tool_name === 'Write') {
    if (shouldSkip(file_path)) allow();
    const lines = (content || '').split('\n').length;
    if (lines > MAX_LINES) {
      deny(`[CodeWarden] File length gate: ${path.basename(file_path)} would be ${lines} lines (limit ${MAX_LINES}). Split into modules before writing.`);
    }
    allow();
  }

  if (tool_name === 'Edit') {
    if (shouldSkip(file_path)) allow();
    if (!fs.existsSync(file_path)) allow(); // new file — Write hook will catch it
    const current = fs.readFileSync(file_path, 'utf8');
    const patched  = replace_all
      ? current.split(old_string || '').join(new_string || '')
      : current.replace(old_string || '', new_string || '');
    const lines = patched.split('\n').length;
    if (lines > MAX_LINES) {
      deny(`[CodeWarden] File length gate: ${path.basename(file_path)} would be ${lines} lines after edit (limit ${MAX_LINES}). Split into modules before editing.`);
    }
    allow();
  }

  allow(); // unrecognised tool — pass through
}

main().catch(() => allow());
