#!/usr/bin/env node
/**
 * uninstall-hooks.js
 * Removes all code-warden hook entries from ~/.claude/settings.json across
 * every managed event array (PreToolUse, PostToolUse, SessionStart, Stop).
 * Identified by description prefix "code-warden:". Non-code-warden entries
 * are preserved; empty event arrays and an empty hooks object are cleaned up.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const { removeMarkedEntries } = require('../../lib/hook-events');

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
    console.log('[CodeWarden]   No settings.json found - nothing to remove.');
    return false;
  }

  if (!settings.hooks) {
    console.log('[CodeWarden]   No hooks in settings.json - nothing to remove.');
    return false;
  }

  const removedHooks = removeMarkedEntries(settings);

  if (removedHooks === 0) {
    console.log('[CodeWarden]   No code-warden hook entries found - nothing to remove.');
    return false;
  }

  writeSettings(settings);
  console.log(`[CodeWarden]   Removed ${removedHooks} hook entry(ies) from settings.json.`);
  return true;
}

module.exports = { uninstallHooks };
