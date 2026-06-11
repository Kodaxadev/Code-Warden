#!/usr/bin/env node
/**
 * warden-bash-hook.js — Codex PreToolUse hook
 *
 * Fires on Bash tool calls. Two gates run in order:
 *   1. Secrets gate - scans the command string for patterns that would embed
 *      hardcoded credentials (echo/printf with secret values, curl with
 *      Authorization headers, env assignments, etc.).
 *   2. Command risk gate - classifies the command against
 *      risk_policy.command_rules. ASYMMETRY vs the Claude runtime: Codex
 *      hooks have no "ask" equivalent (only deny + exit 2, or silent allow),
 *      so the "high" tier ALLOWS silently here and nothing is printed to
 *      stdout. Only "blocked" denies. Claude surfaces "high" as an
 *      interactive permission prompt instead.
 *
 * This is a best-effort surface: Bash is intentionally wide. The hook catches
 * the most common dangerous patterns; it does not attempt to sandbox
 * arbitrary shell execution.
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
const { classifyCommand, loadCommandRules } = require('../../lib/command-risk');

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

  // Command risk gate. "high" allows silently (no Codex "ask" - see header);
  // only "blocked" denies.
  const { rules } = loadCommandRules(null, process.cwd());
  const risk = classifyCommand(command, rules);
  if (risk && risk.tier === 'blocked') {
    deny(`Blocked Bash command - ${risk.rule.message} [rule: ${risk.rule.id}] Override: adjust risk_policy.command_rules in codewarden.json or run the command yourself.`);
  }

  process.exit(0);
});
