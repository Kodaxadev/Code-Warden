#!/usr/bin/env node
'use strict';

/**
 * config.js
 * Shared codewarden.json loader.
 *
 * Previously warden-lint.js, warden-lint-hook.js, and warden-apply-patch-hook.js
 * each parsed codewarden.json independently with slightly different fallback paths.
 * This module centralises config loading with a single documented precedence.
 *
 * Resolution order for config file:
 *   1. Explicit path passed to loadConfig(configPath)
 *   2. Discovered project config when startDir is given — walks up from
 *      startDir looking for codewarden.json or code-warden/codewarden.json,
 *      stopping at the first .git boundary (repo root is the last level
 *      checked) or the filesystem root
 *   3. <__dirname>/../../codewarden.json  (relative to tools/lib/ → skill root)
 */

const fs   = require('fs');
const path = require('path');

const DEFAULT_CONFIG_PATH = path.join(__dirname, '..', '..', 'codewarden.json');
const CONFIG_FILENAME     = 'codewarden.json';

/**
 * Generic upward walk shared by config discovery and the scope store.
 * Starting at startDir, each level is checked for the given relative
 * candidate paths. The ascent stops after the first directory containing
 * .git (the repo root is the last level checked) or at the filesystem root.
 *
 * @param {string} startDir - Directory to start the upward walk from
 * @param {string[]} relCandidates - Candidate paths relative to each level
 * @returns {{ foundPath: string, rootDir: string } | null}
 */
function findUpward(startDir, relCandidates) {
  if (!startDir || typeof startDir !== 'string') return null;
  let dir = path.resolve(startDir);

  for (;;) {
    for (const rel of relCandidates) {
      const candidate = path.join(dir, rel);
      try {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          return { foundPath: candidate, rootDir: dir };
        }
      } catch { /* unreadable candidate — keep walking */ }
    }
    const atGitBoundary = fs.existsSync(path.join(dir, '.git'));
    const parent = path.dirname(dir);
    if (atGitBoundary || parent === dir) return null;
    dir = parent;
  }
}

/**
 * Walk up from startDir looking for a project-level codewarden.json.
 * At each level both <dir>/codewarden.json and <dir>/code-warden/codewarden.json
 * are checked (boundary rules: see findUpward).
 *
 * @param {string} startDir - Directory to start the upward walk from
 * @returns {{ configPath: string, projectRoot: string } | null}
 */
function findProjectConfig(startDir) {
  const found = findUpward(startDir, [
    CONFIG_FILENAME,
    path.join('code-warden', CONFIG_FILENAME),
  ]);
  return found ? { configPath: found.foundPath, projectRoot: found.rootDir } : null;
}

/**
 * Load and parse codewarden.json, returning a merged config object.
 * Falls back to defaults silently if the file is missing or unparseable.
 *
 * Precedence: explicit configPath > discovered project config (when startDir
 * is given) > skill-dir default.
 *
 * @param {string} [configPath] - Override the config file location
 * @param {string} [startDir] - Enables project config discovery from this dir
 * @returns {{ maxFileLength: number, preFlightTriggerLines: number,
 *             lintExcludePaths: string[], secretsAllowlist: string[],
 *             commandRules: object[], projectRoot: string|null }}
 * commandRules is the raw risk_policy.command_rules array (uncompiled);
 * projectRoot is non-null only when a project config was discovered via
 * startDir.
 */
function loadConfig(configPath, startDir) {
  let target      = configPath || null;
  let projectRoot = null;

  if (!target && startDir) {
    const found = findProjectConfig(startDir);
    if (found) {
      target      = found.configPath;
      projectRoot = found.projectRoot;
    }
  }
  if (!target) target = DEFAULT_CONFIG_PATH;

  let maxFileLength         = 400;
  let preFlightTriggerLines = 150;
  let lintExcludePaths      = [];
  let secretsAllowlist      = [];
  let commandRules          = [];

  try {
    const raw = fs.readFileSync(target, 'utf8');
    const cfg = JSON.parse(raw);
    const configured =
      cfg?.thresholds?.max_file_length ??
      cfg?.max_file_length;
    if (typeof configured === 'number' && configured > 0) {
      maxFileLength = configured;
    }
    const preFlight = cfg?.thresholds?.pre_flight_trigger_lines;
    if (typeof preFlight === 'number' && preFlight > 0) {
      preFlightTriggerLines = preFlight;
    }
    if (Array.isArray(cfg?.lint?.exclude_paths)) {
      lintExcludePaths = cfg.lint.exclude_paths.filter(p => typeof p === 'string');
    }
    if (Array.isArray(cfg?.secrets?.allowlist)) {
      secretsAllowlist = cfg.secrets.allowlist.filter(p => typeof p === 'string');
    }
    if (Array.isArray(cfg?.risk_policy?.command_rules)) {
      commandRules = cfg.risk_policy.command_rules.filter(
        r => r && typeof r === 'object' && !Array.isArray(r)
      );
    }
  } catch {
    // Missing or invalid config — use defaults
  }

  return { maxFileLength, preFlightTriggerLines, lintExcludePaths,
           secretsAllowlist, commandRules, projectRoot };
}

module.exports = { loadConfig, findProjectConfig, findUpward, DEFAULT_CONFIG_PATH };
