#!/usr/bin/env node
/**
 * install-hooks.js — Codex PreToolUse hook installer
 *
 * Merges code-warden hook entries into ~/.codex/hooks.json.
 *
 * Codex hooks.json schema:
 *   { "PreToolUse": [ { "matcher": "...", "description": "...", "command": "...", "args": [...] } ] }
 *
 * Idempotent: strips existing code-warden entries by description marker,
 * then appends current entries. Ensures paths stay current after reinstalls.
 *
 * Requires the skill to already be installed at skillDir.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const MARKER_PREFIX = 'code-warden:';
const HOOKS_PATH    = path.join(os.homedir(), '.codex', 'hooks.json');

// ---------------------------------------------------------------------------
// Hooks file I/O
// ---------------------------------------------------------------------------

function readHooks() {
  if (!fs.existsSync(HOOKS_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(HOOKS_PATH, 'utf8'));
  } catch (err) {
    throw new Error(`hooks.json exists but could not be parsed (${HOOKS_PATH}): ${err.message}`);
  }
}

function writeHooks(hooks) {
  const tmp = `${HOOKS_PATH}.tmp`;
  fs.mkdirSync(path.dirname(HOOKS_PATH), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(hooks, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, HOOKS_PATH);
}

// ---------------------------------------------------------------------------
// Hook entry helpers
// ---------------------------------------------------------------------------

function stripCodeWardenHooks(entries) {
  return (entries || []).filter(
    e => !String(e.description || '').startsWith(MARKER_PREFIX)
  );
}

function buildEntries(skillDir) {
  return [
    {
      matcher:     'apply_patch',
      command:     'node',
      args:        [path.join(skillDir, 'tools', 'hooks', 'codex', 'warden-apply-patch-hook.js')],
      description: 'code-warden: apply_patch secrets + size gate',
    },
    {
      matcher:     'Bash',
      command:     'node',
      args:        [path.join(skillDir, 'tools', 'hooks', 'codex', 'warden-bash-hook.js')],
      description: 'code-warden: bash secrets gate',
    },
  ];
}

// ---------------------------------------------------------------------------
// Install
// ---------------------------------------------------------------------------

function installHooks(skillDir) {
  // Guard: skill must be installed before hooks are written
  const required = [
    path.join(skillDir, 'SKILL.md'),
    path.join(skillDir, 'tools', 'hooks', 'codex', 'warden-apply-patch-hook.js'),
    path.join(skillDir, 'tools', 'hooks', 'codex', 'warden-bash-hook.js'),
  ];
  for (const p of required) {
    if (!fs.existsSync(p)) {
      console.error('[CodeWarden] Hooks require an installed Codex target.');
      console.error(`[CodeWarden] Missing: ${p}`);
      console.error('[CodeWarden] Run: node install.js --target=codex --all');
      process.exit(1);
    }
  }

  const hooks = readHooks();
  const cleaned = stripCodeWardenHooks(hooks.PreToolUse);
  hooks.PreToolUse = [...cleaned, ...buildEntries(skillDir)];

  writeHooks(hooks);
  return HOOKS_PATH;
}

module.exports = { installHooks };
