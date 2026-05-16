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
    allow();
  }

  const { tool_name, tool_input = {} } = payload;

  if (tool_name === 'Write') {
    const hit = scanForSecrets(tool_input.content || '');
    if (hit) {
      const file = path.basename(tool_input.file_path || 'file');
      deny(`[CodeWarden] Hardcoded credential scanner: ${hit.label} detected in ${file}. Use environment variables — no hardcoded credentials.`);
    }
    allow();
  }

  if (tool_name === 'Edit') {
    const hit = scanForSecrets(tool_input.new_string || '');
    if (hit) {
      const file = path.basename(tool_input.file_path || 'file');
      deny(`[CodeWarden] Hardcoded credential scanner: ${hit.label} detected in replacement for ${file}. Use environment variables — no hardcoded credentials.`);
    }
    allow();
  }

  allow();
}

main().catch(() => allow());
