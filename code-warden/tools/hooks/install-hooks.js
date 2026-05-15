#!/usr/bin/env node
/**
 * install-hooks.js
 * Merges code-warden PreToolUse hook entries into ~/.claude/settings.json.
 *
 * Idempotent: removes any existing code-warden entries by description marker,
 * then inserts current entries. Replace, not skip — ensures paths stay current
 * after reinstalls or version moves.
 *
 * Requires the skill to already be installed at skillDir before writing
 * settings — avoids dangling settings pointing at a missing skill directory.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const MARKER_PREFIX  = 'code-warden:';
const SETTINGS_PATH  = path.join(os.homedir(), '.claude', 'settings.json');

// ---------------------------------------------------------------------------
// Settings I/O
// ---------------------------------------------------------------------------

function readSettings() {
  if (!fs.existsSync(SETTINGS_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
  } catch (err) {
    throw new Error(`settings.json exists but could not be parsed (${SETTINGS_PATH}): ${err.message}`);
  }
}

function writeSettings(settings) {
  const tmp = `${SETTINGS_PATH}.tmp`;
  fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(settings, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, SETTINGS_PATH);
}

// ---------------------------------------------------------------------------
// Hook entry helpers
// ---------------------------------------------------------------------------

function stripCodeWardenHooks(preToolUse) {
  return preToolUse
    .map(matcher => ({
      ...matcher,
      hooks: (matcher.hooks || []).filter(
        h => !String(h.description || '').startsWith(MARKER_PREFIX)
      ),
    }))
    .filter(matcher => (matcher.hooks || []).length > 0);
}

function buildEntries(skillDir) {
  return [
    {
      type:        'command',
      command:     'node',
      args:        [path.join(skillDir, 'tools', 'hooks', 'warden-lint-hook.js')],
      description: 'code-warden: file length gate',
      timeout:     30,
    },
    {
      type:        'command',
      command:     'node',
      args:        [path.join(skillDir, 'tools', 'hooks', 'warden-secrets-hook.js')],
      description: 'code-warden: zero-trust secrets gate',
      timeout:     30,
    },
  ];
}

// ---------------------------------------------------------------------------
// Install
// ---------------------------------------------------------------------------

function installHooks(skillDir) {
  // Guard: skill must be installed before settings are written
  const required = [
    path.join(skillDir, 'SKILL.md'),
    path.join(skillDir, 'tools', 'hooks', 'warden-lint-hook.js'),
    path.join(skillDir, 'tools', 'hooks', 'warden-secrets-hook.js'),
  ];
  for (const p of required) {
    if (!fs.existsSync(p)) {
      console.error('[CodeWarden] Hooks require an installed Claude target.');
      console.error(`[CodeWarden] Missing: ${p}`);
      console.error('[CodeWarden] Run: node install.js --target=claude --all');
      process.exit(1);
    }
  }

  const settings  = readSettings();
  settings.hooks  = settings.hooks || {};
  const existing  = settings.hooks.PreToolUse || [];

  // Remove stale code-warden entries, then append fresh block
  const cleaned   = stripCodeWardenHooks(existing);
  settings.hooks.PreToolUse = [
    ...cleaned,
    { matcher: 'Write|Edit', hooks: buildEntries(skillDir) },
  ];

  writeSettings(settings);
  return SETTINGS_PATH;
}

module.exports = { installHooks };
