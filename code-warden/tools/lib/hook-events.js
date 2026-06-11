'use strict';

/**
 * hook-events.js
 * Shared helpers for managing code-warden entries across the Claude Code
 * settings.json hook event arrays (PreToolUse, PostToolUse, SessionStart,
 * Stop). Entries are identified by the description marker prefix
 * "code-warden:"; everything else is preserved untouched.
 *
 * Extracted so install-hooks.js, uninstall-hooks.js, install.js (doctor),
 * and governance-report.js share one definition of "a code-warden entry"
 * and one list of managed events.
 */

const MARKER_PREFIX = 'code-warden:';

/** Every settings.json hook event array that code-warden manages. */
const CLAUDE_HOOK_EVENTS = ['PreToolUse', 'PostToolUse', 'SessionStart', 'Stop'];

/** True when a hook entry carries the code-warden description marker. */
function isMarked(entry) {
  return String((entry && entry.description) || '').startsWith(MARKER_PREFIX);
}

/**
 * Remove code-warden entries from one event's matcher-group array.
 * Non-code-warden hooks inside mixed groups are preserved; groups left
 * empty are dropped.
 *
 * @param {Array<{matcher?: string, hooks?: object[]}>} groups
 * @returns {Array<object>}
 */
function stripEventGroups(groups) {
  return (groups || [])
    .map(group => ({
      ...group,
      hooks: (group.hooks || []).filter(h => !isMarked(h)),
    }))
    .filter(group => (group.hooks || []).length > 0);
}

/**
 * Flatten all code-warden entries across every managed event array.
 *
 * @param {object|undefined} hooks - settings.hooks object
 * @returns {object[]} Marked hook entries (possibly empty)
 */
function collectMarkedEntries(hooks) {
  if (!hooks || typeof hooks !== 'object') return [];
  return CLAUDE_HOOK_EVENTS
    .flatMap(event => (Array.isArray(hooks[event]) ? hooks[event] : []))
    .flatMap(group => group.hooks || [])
    .filter(isMarked);
}

/**
 * Merge fresh code-warden groups into a settings object: per event, stale
 * marked entries are stripped first, then the new groups are appended after
 * any user-defined groups. Mutates and returns settings.
 *
 * @param {object} settings - Parsed settings.json object
 * @param {Object<string, object[]>} eventGroups - event name -> matcher groups
 * @returns {object} The same settings object
 */
function applyEventGroups(settings, eventGroups) {
  settings.hooks = settings.hooks || {};
  for (const [event, groups] of Object.entries(eventGroups)) {
    const cleaned = stripEventGroups(settings.hooks[event]);
    settings.hooks[event] = [...cleaned, ...groups];
  }
  return settings;
}

/**
 * Remove every code-warden entry from all managed event arrays. Empty event
 * arrays and an empty hooks object are deleted afterwards. Mutates settings.
 *
 * @param {object} settings - Parsed settings.json object
 * @returns {number} Count of removed hook entries
 */
function removeMarkedEntries(settings) {
  if (!settings || !settings.hooks) return 0;
  let removed = 0;
  for (const event of CLAUDE_HOOK_EVENTS) {
    const groups = settings.hooks[event];
    if (!Array.isArray(groups)) continue;
    removed += groups.flatMap(g => g.hooks || []).filter(isMarked).length;
    const cleaned = stripEventGroups(groups);
    if (cleaned.length === 0) delete settings.hooks[event];
    else settings.hooks[event] = cleaned;
  }
  if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
  return removed;
}

module.exports = {
  MARKER_PREFIX, CLAUDE_HOOK_EVENTS,
  isMarked, stripEventGroups, collectMarkedEntries,
  applyEventGroups, removeMarkedEntries,
};
