#!/usr/bin/env node
/**
 * warden-command-hook.js
 * PreToolUse Claude Code hook: blocks Bash/PowerShell commands that contain
 * hardcoded credentials (e.g. echo/export with secret values, curl with
 * embedded tokens). Mirrors the Codex warden-bash-hook for the Claude runtime.
 *
 * This is a best-effort surface: shell commands are intentionally wide. The
 * hook catches the most common accidental secret exposure patterns; it does
 * not attempt to sandbox arbitrary shell execution.
 *
 * Payload (stdin JSON):  { tool_name: "Bash"|"PowerShell", tool_input: { command } }
 * On violation: exit 2 + JSON deny response to stdout.
 * On pass:      exit 0 (no output).
 */

'use strict';

const { scanForSecrets } = require('../../lib/secret-patterns');

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

  if (tool_name === 'Bash' || tool_name === 'PowerShell') {
    const command = String(tool_input.command || '');
    if (!command) allow();
    const hit = scanForSecrets(command);
    if (hit) {
      deny(`[CodeWarden] Command secrets gate: ${hit.label} detected in ${tool_name} command. Use environment variables or a secrets manager - no hardcoded credentials.`);
    }
  }

  allow(); // unrecognised tool — pass through
}

main().catch(() => allow());
