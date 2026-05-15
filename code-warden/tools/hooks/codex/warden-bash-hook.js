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

// ---------------------------------------------------------------------------
// Secret patterns — focused on write-to-file and network credential exposure
// ---------------------------------------------------------------------------

const SECRET_PATTERNS = [
  // Literal token values in echo/printf/heredoc
  { name: 'OpenAI key in shell',    re: /sk-[A-Za-z0-9]{32,}/ },
  { name: 'GitHub token in shell',  re: /gh[posx]_[A-Za-z0-9]{36}/ },
  { name: 'AWS access key',         re: /AKIA[0-9A-Z]{16}/ },
  { name: 'Stripe live key',        re: /sk_live_[A-Za-z0-9]{24,}/ },
  { name: 'Stripe test key',        re: /sk_test_[A-Za-z0-9]{24,}/ },
  { name: 'Slack token',            re: /xox[baprs]-[A-Za-z0-9\-]+/ },
  { name: 'Bearer token literal',   re: /Authorization:\s*Bearer\s+[A-Za-z0-9\-_\.]{20,}/i },
  { name: 'Private key block',      re: /-----BEGIN (RSA |EC )?PRIVATE KEY-----/ },
  { name: 'DB URL with credentials',re: /(postgres|mysql|mongodb):\/\/[^:]+:[^@\s'"]{4,}@/ },
  // Assignment of secrets to env vars or config in shell (e.g. API_KEY=abc123)
  { name: 'Hardcoded API key assignment',
    re: /(?:API[_-]?KEY|APIKEY|SECRET[_-]?KEY|ACCESS[_-]?TOKEN)\s*=\s*['"]?[A-Za-z0-9\-_]{16,}/i },
];

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

  for (const { name, re } of SECRET_PATTERNS) {
    if (re.test(command)) {
      deny(`Blocked Bash command — hardcoded credential detected (${name}). Use environment variables or a secrets manager instead.`);
    }
  }

  process.exit(0);
});
