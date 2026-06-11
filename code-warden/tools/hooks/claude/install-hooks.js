#!/usr/bin/env node
/**
 * install-hooks.js
 * Merges code-warden hook entries into ~/.claude/settings.json across every
 * managed event array: PreToolUse (gates), PostToolUse (audit ledger),
 * SessionStart (context injection), and Stop (opt-in verification).
 *
 * Idempotent: removes any existing code-warden entries by description marker,
 * then inserts current entries. Replace, not skip - ensures paths stay current
 * after reinstalls or version moves. Non-code-warden entries are preserved
 * in every event array.
 *
 * Requires the skill to already be installed at skillDir before writing
 * settings - avoids dangling settings pointing at a missing skill directory.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const { stripEventGroups, applyEventGroups } = require('../../lib/hook-events');

const SETTINGS_PATH = path.join(os.homedir(), '.claude', 'settings.json');

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

// Back-compat alias: PreToolUse-era name, now shared multi-event logic.
const stripCodeWardenHooks = stripEventGroups;

function buildHookEntry(skillDir, file, description) {
  return {
    type:        'command',
    command:     'node',
    args:        [path.join(skillDir, 'tools', 'hooks', 'claude', file)],
    description,
    timeout:     30,
  };
}

/** PreToolUse matcher groups (kept as its own export for older callers). */
function buildMatcherGroups(skillDir) {
  return [
    {
      matcher: 'Write|Edit|NotebookEdit',
      hooks: [
        buildHookEntry(skillDir, 'warden-lint-hook.js',    'code-warden: file length gate'),
        buildHookEntry(skillDir, 'warden-secrets-hook.js', 'code-warden: zero-trust secrets gate'),
        // Always registered; silently no-ops until a scope file exists.
        buildHookEntry(skillDir, 'warden-scope-hook.js',   'code-warden: scope lock gate'),
      ],
    },
    {
      matcher: 'Bash|PowerShell',
      hooks: [
        buildHookEntry(skillDir, 'warden-command-hook.js', 'code-warden: command secrets gate'),
      ],
    },
  ];
}

/** All managed events with their code-warden matcher groups. */
function buildEventGroups(skillDir) {
  return {
    PreToolUse: buildMatcherGroups(skillDir),
    PostToolUse: [
      {
        matcher: 'Write|Edit|NotebookEdit|Bash|PowerShell',
        hooks: [
          // Advisory: appends to the tamper-evident ledger, never blocks.
          buildHookEntry(skillDir, 'warden-audit-hook.js', 'code-warden: audit ledger'),
        ],
      },
    ],
    SessionStart: [
      {
        matcher: 'startup|resume|clear',
        hooks: [
          buildHookEntry(skillDir, 'warden-session-hook.js', 'code-warden: session context'),
        ],
      },
    ],
    Stop: [
      {
        // No matcher: Stop fires once per stop event. Inert until
        // codewarden.json sets session.verify_on_stop true.
        hooks: [
          buildHookEntry(skillDir, 'warden-stop-hook.js', 'code-warden: stop verification'),
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Install
// ---------------------------------------------------------------------------

function installHooks(skillDir) {
  // Guard: skill must be installed before settings are written
  const hookScripts = [
    'warden-lint-hook.js', 'warden-secrets-hook.js', 'warden-command-hook.js',
    'warden-scope-hook.js', 'warden-audit-hook.js', 'warden-session-hook.js',
    'warden-stop-hook.js',
  ];
  const required = [
    path.join(skillDir, 'SKILL.md'),
    ...hookScripts.map(f => path.join(skillDir, 'tools', 'hooks', 'claude', f)),
  ];
  for (const p of required) {
    if (!fs.existsSync(p)) {
      console.error('[CodeWarden] Hooks require an installed Claude target.');
      console.error(`[CodeWarden] Missing: ${p}`);
      console.error('[CodeWarden] Run: node install.js --target=claude --all');
      process.exit(1);
    }
  }

  const settings = readSettings();
  applyEventGroups(settings, buildEventGroups(skillDir));
  writeSettings(settings);
  return SETTINGS_PATH;
}

module.exports = {
  installHooks, stripCodeWardenHooks, buildMatcherGroups, buildEventGroups,
};
