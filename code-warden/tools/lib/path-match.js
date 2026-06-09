#!/usr/bin/env node
'use strict';

/**
 * path-match.js
 * Shared path-prefix matching for lint.exclude_paths and secrets.allowlist.
 *
 * Extracted from governance-report.js so runtime hooks and CI apply the
 * exact same semantics: forward-slash normalisation plus prefix match, with
 * an exact-match fallback for entries listed without a trailing slash.
 */

const path = require('path');

/**
 * Test whether a (project-relative) file path matches any configured prefix.
 *
 * @param {string} filePath - Relative path; backslashes are normalised
 * @param {string[]} prefixes - Configured prefixes (e.g. ["vendor/", "docs/"])
 * @returns {boolean}
 */
function matchesAnyPrefix(filePath, prefixes) {
  if (!Array.isArray(prefixes) || prefixes.length === 0) return false;
  const normalized = String(filePath).replace(/\\/g, '/');
  return prefixes.some(p => normalized.startsWith(p) || normalized === p.replace(/\/$/, ''));
}

/**
 * Test whether a file path (absolute or relative to baseDir) falls under a
 * configured prefix when expressed relative to the project root.
 *
 * Returns false when there is no project root, the path resolves outside the
 * project, or no prefixes are configured — i.e. "do not skip the check".
 *
 * @param {string} filePath - Target file path from a tool payload
 * @param {string|null} projectRoot - Discovered project root (or null)
 * @param {string[]} prefixes - Configured prefixes
 * @param {string} [baseDir] - Base for resolving relative paths (defaults to projectRoot)
 * @returns {boolean}
 */
function matchesProjectPath(filePath, projectRoot, prefixes, baseDir) {
  if (!projectRoot || !filePath) return false;
  if (!Array.isArray(prefixes) || prefixes.length === 0) return false;
  const abs = path.resolve(baseDir || projectRoot, filePath);
  const rel = path.relative(projectRoot, abs);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return false;
  return matchesAnyPrefix(rel, prefixes);
}

module.exports = { matchesAnyPrefix, matchesProjectPath };
