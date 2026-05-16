#!/usr/bin/env node
/**
 * warden-bash-hook.js — Codex PreToolUse hook
 *
 * Fires on Bash tool calls. Scans the command string for patterns that
 * would embed hardcoded credentials into files (e.g. echo/printf/cat with
 * secret values, curl with Authorization headers, env assignments, etc.).
 *
 * This is a best-effort surface: Bash is intentionally wide. The hook catches
 * the most common accidental secret exposure patterns; it does not attempt to
 * sandbox arbitrary shell execution.
 *
 * Codex hook payload (stdin, JSON):
 *   { tool: "Bash", toolInput: { command: "<shell command>" } }
 *
 * Exit codes:
 *   0  — proceed
 *   2  — block (writes JSON deny to stdout)
 */

'use strict';

const { scanForSecrets } = require('../../lib/secret-patterns');

function deny(reason) {
  process.stdout.write(JSON.stringify({ deny: true, message: `[CodeWarden] ${reason}` }) + '\n');
  process.exit(2);
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

  const input   = payload.toolInput || payload.tool_input || {};
  const command = String(input.command || '');
  if (!command) process.exit(0);

  const hit = scanForSecrets(command);
  if (hit) {
    deny(`Blocked Bash command — hardcoded credential detected (${hit.label}). Use environment variables or a secrets manager instead.`);
  }

  process.exit(0);
});
