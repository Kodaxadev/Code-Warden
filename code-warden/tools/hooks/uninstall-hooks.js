#!/usr/bin/env node
/**
 * uninstall-hooks.js
 * Removes all code-warden hook entries from ~/.claude/settings.json.
 * Identified by description prefix "code-warden:".
 * Cleans up empty PreToolUse arrays and empty hooks objects after removal.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const MARKER_PREFIX = 'code-warden:';
const SETTINGS_PATH = path.join(os.homedir(), '.claude', 'settings.json');

function readSettings() {
  if (!fs.existsSync(SETTINGS_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
  } catch (err) {
    throw new Error(`settings.json could not be parsed (${SETTINGS_PATH}): ${err.message}`);
  }
}

function writeSettings(settings) {
  const tmp = `${SETTINGS_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(settings, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, SETTINGS_PATH);
}

function uninstallHooks() {
  const settings = readSettings();

  if (!settings) {
    console.log('[CodeWarden]   No settings.json found — nothing to remove.');
    return false;
  }

  if (!settings.hooks || !settings.hooks.PreToolUse) {
    console.log('[CodeWarden]   No PreToolUse hooks in settings.json — nothing to remove.');
    return false;
  }

  const before  = settings.hooks.PreToolUse;
  const cleaned = before
    .map(matcher => ({
      ...matcher,
      hooks: (matcher.hooks || []).filter(
        h => !String(h.description || '').startsWith(MARKER_PREFIX)
      ),
    }))
    .filter(matcher => (matcher.hooks || []).length > 0);

  const removedMatchers = before.length - cleaned.length;
  const removedHooks    = before.flatMap(m => m.hooks || []).filter(
    h => String(h.description || '').startsWith(MARKER_PREFIX)
  ).length;

  if (removedHooks === 0) {
    console.log('[CodeWarden]   No code-warden hook entries found — nothing to remove.');
    return false;
  }

  settings.hooks.PreToolUse = cleaned;
  if (cleaned.length === 0)                      delete settings.hooks.PreToolUse;
  if (Object.keys(settings.hooks).length === 0)  delete settings.hooks;

  writeSettings(settings);
  console.log(`[CodeWarden]   Removed ${removedHooks} hook entry(ies) from settings.json.`);
  return true;
}

module.exports = { uninstallHooks };
