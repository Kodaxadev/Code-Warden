#!/usr/bin/env node
'use strict';

/**
 * scope-store.js
 * Storage + evaluation for the Scope Lock (.code-warden/scope.json).
 *
 * The scope file mechanically enforces the Scope Gate's files-in contract:
 * once a scope is set, write hooks (Claude Write/Edit/NotebookEdit and Codex
 * apply_patch) deny edits outside the declared paths. Strictly opt-in - no
 * scope file means no enforcement. Shared by tools/scope.js (CLI), both
 * runtime hook surfaces, and governance-report.js so semantics never drift.
 *
 * Schema (rhymes with the receipt's scopeGate block):
 *   { schemaVersion: 1, kind: 'code-warden/scope', goal, enforce,
 *     createdAt, updatedAt, filesIn: [...], expansions: [{path, addedAt}] }
 *
 * filesIn entries are repo-root-relative, forward-slash normalized: exact
 * file paths, or directory prefixes ending '/' (lib/path-match semantics).
 */

const fs   = require('fs');
const path = require('path');
const { matchesAnyPrefix } = require('./path-match');
const { findUpward }       = require('./config');

const SCOPE_DIR  = '.code-warden';
const SCOPE_FILE = 'scope.json';

/** Absolute scope file path for a given repo root. */
function scopePathFor(rootDir) {
  return path.join(rootDir, SCOPE_DIR, SCOPE_FILE);
}

/**
 * Walk up from startDir looking for .code-warden/scope.json, stopping after
 * the first directory containing .git (same boundary rule as config
 * discovery - see findUpward in lib/config.js).
 *
 * @param {string} startDir
 * @returns {{ scopePath: string, scopeRoot: string } | null}
 */
function findScopeFile(startDir) {
  const found = findUpward(startDir, [path.join(SCOPE_DIR, SCOPE_FILE)]);
  return found ? { scopePath: found.foundPath, scopeRoot: found.rootDir } : null;
}

/**
 * Load and minimally validate a scope file.
 * Returns null when missing, unparseable, or structurally invalid - the
 * hooks treat null as "no scope lock" (opt-in enforcement, never a trap).
 *
 * @param {string} scopePath
 * @returns {object|null}
 */
function loadScope(scopePath) {
  try {
    const scope = JSON.parse(fs.readFileSync(scopePath, 'utf8').replace(/^\uFEFF/, ''));
    if (!scope || typeof scope !== 'object' || Array.isArray(scope)) return null;
    if (!Array.isArray(scope.filesIn)) return null;
    return scope;
  } catch {
    return null;
  }
}

/**
 * Write a scope object to <rootDir>/.code-warden/scope.json, refreshing
 * updatedAt. Creates the .code-warden directory if needed.
 *
 * @param {string} rootDir
 * @param {object} scope
 * @returns {string} The written file path
 */
function saveScope(rootDir, scope) {
  const dest = scopePathFor(rootDir);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  scope.updatedAt = new Date().toISOString();
  fs.writeFileSync(dest, JSON.stringify(scope, null, 2) + '\n', 'utf8');
  return dest;
}

/**
 * Create a fresh scope object.
 *
 * @param {{ goal?: string, filesIn?: string[], enforce?: boolean }} [opts]
 * @returns {object}
 */
function createScope({ goal = '', filesIn = [], enforce = true } = {}) {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    kind: 'code-warden/scope',
    goal,
    enforce,
    createdAt: now,
    updatedAt: now,
    filesIn: [...filesIn],
    expansions: [],
  };
}

/**
 * Normalize a CLI path argument into a repo-root-relative scope entry:
 * forward slashes, no leading './', absolute paths re-expressed relative to
 * rootDir, and a trailing '/' appended when the path is an existing
 * directory (directory-prefix semantics).
 *
 * @param {string} entry - Raw path argument
 * @param {string} rootDir - Repo root the entry is relative to
 * @returns {string|null} Normalized entry, or null if it escapes rootDir
 */
function normalizeScopeEntry(entry, rootDir) {
  let p = String(entry).trim().replace(/\\/g, '/');
  if (!p) return null;
  if (path.isAbsolute(p) || /^[A-Za-z]:/.test(p)) {
    const rel = path.relative(rootDir, p);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
    p = rel.replace(/\\/g, '/');
  }
  p = p.replace(/^(\.\/)+/, '');
  if (!p || p === '.' || p.startsWith('../')) return null;
  if (!p.endsWith('/')) {
    try {
      if (fs.statSync(path.join(rootDir, p)).isDirectory()) p += '/';
    } catch { /* not on disk yet - keep as given */ }
  }
  return p;
}

/**
 * Evaluate a write target against a loaded scope.
 * Order matters: self-protection of .code-warden/ applies even when
 * enforce is false; the enforce switch is checked next; then root
 * containment; then filesIn prefix matching.
 *
 * @param {string} filePath - Target path from a tool payload
 * @param {object} scope - Parsed scope (loadScope output)
 * @param {string} scopeRoot - Directory containing .code-warden/
 * @param {string} [baseDir] - Base for resolving relative paths
 * @returns {{ code: 'self_protect'|'enforce_off'|'outside_root'|
 *             'in_scope'|'out_of_scope', relPath: string }}
 */
function evaluateScope(filePath, scope, scopeRoot, baseDir) {
  const abs     = path.resolve(baseDir || scopeRoot, filePath);
  const rel     = path.relative(scopeRoot, abs);
  const outside = !rel || rel.startsWith('..') || path.isAbsolute(rel);
  const relNorm = rel.replace(/\\/g, '/');

  if (!outside && (relNorm === SCOPE_DIR || relNorm.startsWith(SCOPE_DIR + '/'))) {
    return { code: 'self_protect', relPath: relNorm };
  }
  if (scope.enforce === false) return { code: 'enforce_off', relPath: relNorm };
  if (outside) return { code: 'outside_root', relPath: abs.replace(/\\/g, '/') };
  if (matchesAnyPrefix(relNorm, scope.filesIn)) {
    return { code: 'in_scope', relPath: relNorm };
  }
  return { code: 'out_of_scope', relPath: relNorm };
}

/**
 * Deny message for an evaluateScope verdict, or null when the write is
 * allowed. Messages omit the '[CodeWarden] ' prefix - each hook surface
 * adds its own.
 *
 * @param {{ code: string, relPath: string }} verdict
 * @param {object} scope
 * @returns {string|null}
 */
function scopeDenialMessage(verdict, scope) {
  if (verdict.code === 'self_protect') {
    return 'Scope lock: the scope file is user-controlled. ' +
      'Ask the user to run: code-warden scope add <path>';
  }
  if (verdict.code === 'outside_root') {
    return `Scope lock: ${verdict.relPath} is outside the governed repository ` +
      'while a scope is locked. Ask the user to make this change manually.';
  }
  if (verdict.code === 'out_of_scope') {
    return `Scope lock: ${verdict.relPath} is outside the declared scope ` +
      `(goal: ${scope.goal || 'not set'}). Ask the user to approve expansion ` +
      `via: code-warden scope add ${verdict.relPath}`;
  }
  return null; // in_scope / enforce_off
}

/**
 * One-call check used by the write hooks: discovers the scope from startDir,
 * evaluates filePath, and returns a deny message or null. Missing or
 * unparseable scope files always allow (Scope Lock is strictly opt-in).
 *
 * @param {string} filePath - Target path from a tool payload
 * @param {string} startDir - Hook working directory (payload.cwd or cwd)
 * @returns {string|null}
 */
function checkScopeDenial(filePath, startDir) {
  if (!filePath) return null;
  const found = findScopeFile(startDir);
  if (!found) return null;
  const scope = loadScope(found.scopePath);
  if (!scope) return null;
  const verdict = evaluateScope(filePath, scope, found.scopeRoot, startDir);
  return scopeDenialMessage(verdict, scope);
}

/**
 * Read-only summary for status displays and the governance report.
 *
 * @param {string} startDir
 * @returns {{ scopePath, scopeRoot, goal, enforce, filesIn, expansions } | null}
 */
function getScopeSummary(startDir) {
  const found = findScopeFile(startDir);
  if (!found) return null;
  const scope = loadScope(found.scopePath);
  if (!scope) return null;
  return {
    scopePath:  found.scopePath,
    scopeRoot:  found.scopeRoot,
    goal:       typeof scope.goal === 'string' ? scope.goal : '',
    enforce:    scope.enforce !== false,
    filesIn:    scope.filesIn,
    expansions: Array.isArray(scope.expansions) ? scope.expansions : [],
  };
}

module.exports = {
  SCOPE_DIR, SCOPE_FILE,
  scopePathFor, findScopeFile, loadScope, saveScope, createScope,
  normalizeScopeEntry, evaluateScope, scopeDenialMessage,
  checkScopeDenial, getScopeSummary,
};
