#!/usr/bin/env node
/**
 * warden-command-hook.js
 * PreToolUse Claude Code hook for Bash/PowerShell commands. Two gates run in
 * order (secrets deny wins):
 *   1. Command secrets gate - blocks commands containing hardcoded
 *      credentials (e.g. echo/export with secret values, curl with tokens).
 *   2. Command risk gate - classifies the command against
 *      risk_policy.command_rules: "blocked" denies, "high" asks for
 *      confirmation (permissionDecision "ask").
 *
 * This is a best-effort surface: shell commands are intentionally wide. The
 * hook catches the most common dangerous patterns; it does not attempt to
 * sandbox arbitrary shell execution.
 *
 * Payload (stdin JSON):  { tool_name: "Bash"|"PowerShell", tool_input: { command }, cwd }
 * On violation: exit 2 + JSON deny response to stdout.
 * On high risk: exit 0 + JSON ask response to stdout.
 * On pass:      exit 0 (no output).
 */

'use strict';

const { scanForSecrets } = require('../../lib/secret-patterns');
const { classifyCommand, loadCommandRules } = require('../../lib/command-risk');

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

function respond(decision, reason, exitCode) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: decision,
      permissionDecisionReason: reason,
    },
  }));
  process.exit(exitCode);
}

const deny  = (reason) => respond('deny', reason, 2);
const ask   = (reason) => respond('ask', reason, 0);
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

  if (tool_name === 'Bash' || tool_name === 'PowerShell') {
    const command = String(tool_input.command || '');
    if (!command) allow();

    // Gate 1: secrets (deny wins over any risk classification)
    const hit = scanForSecrets(command);
    if (hit) {
      deny(`[CodeWarden] Command secrets gate: ${hit.label} detected in ${tool_name} command. Use environment variables or a secrets manager - no hardcoded credentials.`);
    }

    // Gate 2: risk policy tiers (rules discovered from the governed project)
    const { rules } = loadCommandRules(null, payload.cwd || process.cwd());
    const risk = classifyCommand(command, rules);
    if (risk && risk.tier === 'blocked') {
      deny(`[CodeWarden] Command risk gate: ${risk.rule.message} [rule: ${risk.rule.id}] Override: adjust risk_policy.command_rules in codewarden.json or run the command yourself.`);
    }
    if (risk && risk.tier === 'high') {
      ask(`[CodeWarden] Command risk gate: ${risk.rule.message} [rule: ${risk.rule.id}] Confirm to proceed.`);
    }
  }

  allow(); // unrecognised tool — pass through
}

main().catch(() => allow());
