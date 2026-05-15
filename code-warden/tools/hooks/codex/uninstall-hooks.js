#!/usr/bin/env node
/**
 * uninstall-hooks.js — Codex PreToolUse hook remover
 *
 * Removes all code-warden entries from ~/.codex/hooks.json.
 * Cleans up empty PreToolUse array and empty top-level object if nothing remains.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const MARKER_PREFIX = 'code-warden:';
const HOOKS_PATH    = path.join(os.homedir(), '.codex', 'hooks.json');

function uninstallHooks() {
  if (!fs.existsSync(HOOKS_PATH)) {
    console.log('[CodeWarden] ~/.codex/hooks.json not found — nothing to remove.');
    return;
  }

  let hooks;
  try {
    hooks = JSON.parse(fs.readFileSync(HOOKS_PATH, 'utf8'));
  } catch (err) {
    console.error(`[CodeWarden] hooks.json could not be parsed: ${err.message}`);
    process.exit(1);
  }

  const before = (hooks.PreToolUse || []).length;
  hooks.PreToolUse = (hooks.PreToolUse || []).filter(
    e => !String(e.description || '').startsWith(MARKER_PREFIX)
  );
  const removed = before - hooks.PreToolUse.length;

  // Clean empty array
  if (hooks.PreToolUse.length === 0) delete hooks.PreToolUse;

  // Write back (or remove file if completely empty)
  if (Object.keys(hooks).length === 0) {
    fs.unlinkSync(HOOKS_PATH);
    console.log(`[CodeWarden] Removed ${removed} hook(s) — hooks.json is now empty, file removed.`);
  } else {
    const tmp = `${HOOKS_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(hooks, null, 2) + '\n', 'utf8');
    fs.renameSync(tmp, HOOKS_PATH);
    console.log(`[CodeWarden] Removed ${removed} code-warden hook(s) from ~/.codex/hooks.json.`);
  }
}

module.exports = { uninstallHooks };
