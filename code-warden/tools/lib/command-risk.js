#!/usr/bin/env node
'use strict';

/**
 * command-risk.js
 * Command Risk Gate: classifies shell commands against risk_policy tiers.
 *
 * Two tiers are enforced at runtime:
 *   blocked - deny outright (destructive/irreversible or remote-code-exec)
 *   high    - ask for confirmation (Claude); Codex hooks have no "ask"
 *             equivalent, so high allows silently there (see the bash hook)
 *
 * Defaults are deliberately conservative: a false deny on a routine command
 * erodes trust faster than a missed exotic one. Users tune behavior via
 * risk_policy.command_rules in codewarden.json - rules merge with defaults
 * by id (tier "off"/"allow" disables a default; a reused id replaces it).
 */

// ---------------------------------------------------------------------------
// Default rules
// ---------------------------------------------------------------------------

// Dangerous deletion roots: /, /*, ~, ., .., *, .git, or a bare drive (C:\).
const NIX_ROOTS = String.raw`(?:\/\*?|~\/?|\.git\/?|\.{1,2}\/?|\*|[A-Za-z]:[\\\/]?\*?)`;

const DEFAULT_COMMAND_RULES = [
  // --- blocked -------------------------------------------------------------
  {
    id: 'rm_rf_root',
    tier: 'blocked',
    pattern: new RegExp(String.raw`(?:^|[\s;&|(])rm\s+(?:-{1,2}[\w=-]+\s+)*(?:-[a-zA-Z]*r[a-zA-Z]*|--recursive)\s+(?:-{1,2}[\w=-]+\s+)*(?:--\s+)?["']?` + NIX_ROOTS + String.raw`["']?\s*(?:$|[;&|)])`, 'i'),
    message: 'Recursive delete targets a critical root path (/, ~, ., .git, *, or a drive root).',
  },
  {
    id: 'rd_root',
    tier: 'blocked',
    pattern: /(?:^|[\s;&|(])(?:rd|rmdir)\s+\/s\b[^\n;&|]*\s["']?(?:[A-Za-z]:[\\/]?|\\)["']?\s*(?:$|[;&|)])/i,
    message: 'Recursive directory removal targets a drive root.',
  },
  {
    id: 'remove_item_root',
    tier: 'blocked',
    pattern: /(?:^|[\s;&|(])remove-item\b(?=[^\n;|]*\s-recurse\b)(?=[^\n;|]*\s-force\b)(?=[^\n;|]*\s["']?(?:[A-Za-z]:[\\/]?\*?|\\|\/|~|\$env:USERPROFILE|\$HOME|\.{1,2})["']?\s*(?:$|[\s;|&]))/i,
    message: 'Remove-Item -Recurse -Force targets a critical root path.',
  },
  {
    id: 'git_reset_hard',
    tier: 'blocked',
    pattern: /(?:^|[\s;&|(])git\s+reset\b[^\n;&|]*--hard\b/i,
    message: 'git reset --hard discards uncommitted work irreversibly.',
  },
  {
    id: 'git_push_force',
    tier: 'blocked',
    pattern: /(?:^|[\s;&|(])git\s+push\b(?=[^\n;&|]*\s(?:--force(?!-with-lease|-if-includes)\b|-f\b))/i,
    message: 'git push --force can destroy remote history. Use --force-with-lease if a force push is truly needed.',
  },
  {
    id: 'git_clean_force',
    tier: 'blocked',
    pattern: /(?:^|[\s;&|(])git\s+clean\b(?=[^\n;&|]*\s(?:-[a-zA-Z]*f|--force\b))/i,
    message: 'git clean -f deletes untracked files irreversibly.',
  },
  {
    id: 'git_history_rewrite',
    tier: 'blocked',
    pattern: /(?:^|[\s;&|(])git(?:\s+|-)filter-(?:branch|repo)\b/i,
    message: 'History rewriting (filter-branch/filter-repo) is destructive and repo-wide.',
  },
  {
    id: 'curl_pipe_shell',
    tier: 'blocked',
    pattern: /\b(?:curl|wget)\b[^\n;&]*\|\s*(?:sudo\s+)?(?:ba|da|z)?sh\b/i,
    message: 'Piping a download straight into a shell executes unreviewed remote code.',
  },
  {
    id: 'ps_web_pipe_iex',
    tier: 'blocked',
    pattern: /\b(?:iwr|irm|invoke-webrequest|invoke-restmethod)\b[^\n;]*\|\s*(?:iex|invoke-expression)\b|\b(?:iex|invoke-expression)\b\s*\(?\s*&?\s*\(?\s*(?:iwr|irm|invoke-webrequest|invoke-restmethod)\b/i,
    message: 'Piping a download into Invoke-Expression executes unreviewed remote code.',
  },
  {
    id: 'chmod_777_root',
    tier: 'blocked',
    pattern: /(?:^|[\s;&|(])chmod\b(?=[^\n;&|]*\s-[a-zA-Z]*R)(?=[^\n;&|]*\s0?777\b)[^\n;&|]*\s\/\s*(?:$|[;&|])/i,
    message: 'chmod -R 777 / makes the entire filesystem world-writable.',
  },
  // --- high (ask) ----------------------------------------------------------
  {
    id: 'package_install',
    tier: 'high',
    pattern: /(?:^|[\s;&|(])(?:npm|pnpm|yarn|bun)\s+(?:-[^\s]+\s+)*(?:install|uninstall|add|remove|update|upgrade|i|rm|un|up)\b(?=(?:\s+-{1,2}[\w:=./@-]+)*\s+["']?[^-\s"'])/i,
    message: 'Dependency change (risk_policy: dependency_change is a high-tier action).',
  },
  {
    id: 'npm_publish',
    tier: 'high',
    pattern: /(?:^|[\s;&|(])(?:npm|pnpm|yarn|bun)\s+publish\b/i,
    message: 'Publishing a package (risk_policy: release_publish is a high-tier action).',
  },
  {
    id: 'git_push',
    tier: 'high',
    pattern: /(?:^|[\s;&|(])git\s+push\b/i,
    message: 'Pushing to a remote (risk_policy: release_publish is a high-tier action).',
  },
  {
    id: 'recursive_delete',
    tier: 'high',
    pattern: /(?:^|[\s;&|(])rm\s+(?:-{1,2}[\w=-]+\s+)*(?:-[a-zA-Z]*r[a-zA-Z]*|--recursive)\b|(?:^|[\s;&|(])(?:rd|rmdir)\s+\/s\b/i,
    message: 'Recursive delete - confirm the target path is intended.',
  },
  {
    id: 'remove_item_recurse',
    tier: 'high',
    pattern: /(?:^|[\s;&|(])remove-item\b(?=[^\n;|]*\s-recurse\b)(?=[^\n;|]*\s-force\b)/i,
    message: 'Remove-Item -Recurse -Force - confirm the target path is intended.',
  },
  {
    id: 'git_discard_changes',
    tier: 'high',
    pattern: /(?:^|[\s;&|(])git\s+checkout\b[^\n;&|]*\s--(?:\s|$)|(?:^|[\s;&|(])git\s+restore\s+(?!--staged\b(?![^\n;&|]*--worktree\b))/i,
    message: 'Discards uncommitted working-tree changes (git checkout -- / git restore).',
  },
];

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/**
 * Classify a command against a rule set. Returns the highest-severity match
 * (blocked > high) or null when no rule matches.
 *
 * @param {string} command
 * @param {Array<{id, pattern: RegExp, tier, message}>} [rules]
 * @returns {{ tier: 'blocked'|'high', rule: object } | null}
 */
function classifyCommand(command, rules) {
  if (!command || typeof command !== 'string') return null;
  const list = Array.isArray(rules) ? rules : DEFAULT_COMMAND_RULES;
  let high = null;
  for (const rule of list) {
    if (!rule || !(rule.pattern instanceof RegExp)) continue;
    if (!rule.pattern.test(command)) continue;
    if (rule.tier === 'blocked') return { tier: 'blocked', rule };
    if (rule.tier === 'high' && !high) high = { tier: 'high', rule };
  }
  return high;
}

// ---------------------------------------------------------------------------
// Config merge
// ---------------------------------------------------------------------------

/**
 * Merge user rules (risk_policy.command_rules, raw objects with string
 * patterns) over the defaults. A user rule reusing a default id REPLACES it;
 * tier "off" or "allow" disables that rule. Invalid patterns are skipped
 * defensively with a warning entry - a broken user regex must never turn
 * the gate into a trap or silently widen it.
 *
 * @param {object[]} [userRules]
 * @returns {{ rules: object[], warnings: string[] }}
 */
function mergeCommandRules(userRules) {
  const byId = new Map(DEFAULT_COMMAND_RULES.map(r => [r.id, r]));
  const warnings = [];

  for (const raw of Array.isArray(userRules) ? userRules : []) {
    if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !raw.id) {
      warnings.push('command_rules entry without an id was skipped');
      continue;
    }
    const tier = String(raw.tier || '').toLowerCase();
    if (tier === 'off' || tier === 'allow') { byId.delete(raw.id); continue; }
    if (tier !== 'blocked' && tier !== 'high') {
      warnings.push(`command_rules.${raw.id}: tier must be "blocked", "high", "off", or "allow" - skipped`);
      continue;
    }

    const base = byId.get(raw.id);
    let pattern = base ? base.pattern : null;
    if (typeof raw.pattern === 'string' && raw.pattern) {
      try {
        pattern = new RegExp(raw.pattern, 'i');
      } catch (err) {
        warnings.push(`command_rules.${raw.id}: invalid pattern (${err.message}) - rule skipped`);
        continue;
      }
    }
    if (!pattern) {
      warnings.push(`command_rules.${raw.id}: new rules require a pattern - skipped`);
      continue;
    }
    byId.set(raw.id, {
      id: raw.id,
      pattern,
      tier,
      message: typeof raw.message === 'string' && raw.message
        ? raw.message
        : (base ? base.message : `Command matched rule ${raw.id}.`),
    });
  }

  return { rules: [...byId.values()], warnings };
}

/**
 * Load merged command rules using the shared codewarden.json discovery
 * (lib/config.js loadConfig) - the single loading path for hooks and tools.
 *
 * @param {string} [configPath] - Explicit config override
 * @param {string} [startDir] - Enables project config discovery
 * @returns {{ rules: object[], warnings: string[] }}
 */
function loadCommandRules(configPath, startDir) {
  const { commandRules } = require('./config').loadConfig(configPath, startDir);
  return mergeCommandRules(commandRules);
}

module.exports = { DEFAULT_COMMAND_RULES, classifyCommand, mergeCommandRules, loadCommandRules };
