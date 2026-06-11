#!/usr/bin/env node
/**
 * warden-secrets-hook.js
 * PreToolUse Claude Code hook: blocks Write/Edit/NotebookEdit if content
 * contains hardcoded credentials matching zero-trust secret patterns.
 *
 * Write:        scans full content.
 * Edit:         scans new_string only (old content was already committed).
 * NotebookEdit: scans new_source.
 *
 * Config: discovered from the governed project (payload.cwd, walking up for
 * codewarden.json) with fallback to the skill-dir default. Files matching
 * secrets.allowlist (relative to the discovered project root) skip the scan.
 *
 * On violation: exit 2 + JSON deny response to stdout.
 * On pass:      exit 0 (no output).
 */

'use strict';

const path = require('path');
const { scanForSecrets }     = require('../../lib/secret-patterns');
const { loadConfig }         = require('../../lib/config');
const { matchesProjectPath } = require('../../lib/path-match');

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

function scanOrDeny(text, fileLabel, where) {
  const hit = scanForSecrets(text || '');
  if (hit) {
    deny(`[CodeWarden] Hardcoded credential scanner: ${hit.label} detected in ${where}${fileLabel}. Use environment variables - no hardcoded credentials.`);
  }
}

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
  const baseDir = payload.cwd || process.cwd();
  const config  = loadConfig(null, baseDir);
  const file    = path.basename(tool_input.file_path || 'file');

  if (matchesProjectPath(tool_input.file_path, config.projectRoot, config.secretsAllowlist, baseDir)) {
    allow(); // secrets.allowlist — project opted this path out of scanning
  }

  if (tool_name === 'Write')        scanOrDeny(tool_input.content, file, '');
  if (tool_name === 'Edit')         scanOrDeny(tool_input.new_string, file, 'replacement for ');
  if (tool_name === 'NotebookEdit') scanOrDeny(tool_input.new_source, file, 'notebook cell for ');

  allow();
}

main().catch(() => allow());
