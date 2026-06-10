#!/usr/bin/env node
/**
 * warden-scope-hook.js
 * PreToolUse Claude Code hook: enforces the opt-in Scope Lock for
 * Write/Edit/NotebookEdit. Walks up from payload.cwd looking for
 * .code-warden/scope.json (stopping at the .git boundary, same rule as
 * config discovery). No scope file, an unparseable file, or enforce:false
 * means allow - Scope Lock is strictly opt-in and silently no-ops.
 *
 * Self-protection comes first: edits to the scope file itself (or anything
 * under .code-warden/) are denied even when enforce is false, so the agent
 * cannot expand its own scope. Expansion goes through the user-run CLI:
 * code-warden scope add <path>.
 *
 * Payload (stdin JSON):  { tool_name, tool_input: { file_path, ... }, cwd }
 * On violation: exit 2 + JSON deny response to stdout.
 * On pass:      exit 0 (no output).
 */

'use strict';

const { checkScopeDenial } = require('../../lib/scope-store');

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

  if (tool_name === 'Write' || tool_name === 'Edit' || tool_name === 'NotebookEdit') {
    const filePath = tool_input.file_path;
    if (!filePath) allow();
    const baseDir = payload.cwd || process.cwd();
    const message = checkScopeDenial(filePath, baseDir);
    if (message) deny(`[CodeWarden] ${message}`);
  }

  allow(); // unrecognised tool or in-scope write - pass through
}

main().catch(() => allow());
