#!/usr/bin/env node
/**
 * install-hooks.js
 * Installs a marker-managed code-warden block into the pre-commit hook of
 * the git repository at the working directory.
 *
 * Unlike the claude/codex hook installers (per-user, written under the home
 * directory), git hooks are PER-REPO: the block is written into
 * <git-dir>/hooks/pre-commit, or the core.hooksPath directory when set.
 *
 * Merge semantics:
 *   - No pre-commit file:        create one (sh shebang + marker block)
 *   - Existing without markers:  append the block, preserving content
 *   - Existing with markers:     replace the block in place (idempotent
 *                                re-install keeps the embedded path current)
 *
 * The embedded command points at warden-pre-commit.js of the CURRENTLY
 * RUNNING install (resolved via __dirname), converted to forward slashes so
 * the sh interpreter git uses on Windows can execute it.
 */

'use strict';

const fs            = require('fs');
const path          = require('path');
const { spawnSync } = require('child_process');

const MARKER_START      = '# >>> code-warden >>>';
const MARKER_END        = '# <<< code-warden <<<';
const PRE_COMMIT_SCRIPT = path.join(__dirname, 'warden-pre-commit.js');

// ---------------------------------------------------------------------------
// Git plumbing
// ---------------------------------------------------------------------------

function gitOutput(args, cwd) {
  const r = spawnSync('git', args, { encoding: 'utf8', cwd, timeout: 10000 });
  return r.status === 0 ? r.stdout.trim() : null;
}

/**
 * Resolve the hooks directory for the repository containing cwd.
 * Respects `git config core.hooksPath` (resolved against the working-tree
 * top level, matching git's own behavior); falls back to <git-dir>/hooks.
 *
 * @param {string} [cwd] - Directory inside the target repo (default process.cwd())
 * @returns {string|null} Absolute hooks directory, or null when not a git repo
 */
function resolveHooksDir(cwd) {
  const base   = cwd || process.cwd();
  const gitDir = gitOutput(['rev-parse', '--git-dir'], base);
  if (gitDir === null) return null;
  const hooksPath = gitOutput(['config', 'core.hooksPath'], base);
  if (hooksPath) {
    const top = gitOutput(['rev-parse', '--show-toplevel'], base) || base;
    return path.resolve(top, hooksPath);
  }
  return path.join(path.resolve(base, gitDir), 'hooks');
}

// ---------------------------------------------------------------------------
// Marker block construction and merge
// ---------------------------------------------------------------------------

/**
 * Build the marker-delimited block invoking the staged-content scanner.
 *
 * @param {string} [scriptPath] - Override for tests (default: this install)
 * @returns {string} Block text without trailing newline
 */
function buildBlock(scriptPath) {
  const forwardSlash = (scriptPath || PRE_COMMIT_SCRIPT).replace(/\\/g, '/');
  return [
    MARKER_START,
    `node "${forwardSlash}" || exit $?`,
    MARKER_END,
  ].join('\n');
}

/**
 * Merge the marker block into existing pre-commit content.
 *
 * @param {string|null} existing - Current file content, or null when absent
 * @param {string} block - Marker-delimited block from buildBlock()
 * @returns {string} New file content
 */
function mergePreCommitContent(existing, block) {
  if (existing === null || existing.trim() === '') {
    return `#!/bin/sh\n${block}\n`;
  }
  const startIdx = existing.indexOf(MARKER_START);
  const endIdx   = existing.indexOf(MARKER_END);
  if (startIdx !== -1 && endIdx !== -1 && endIdx >= startIdx) {
    // Replace in place; everything around the block is preserved untouched.
    const before = existing.slice(0, startIdx);
    const after  = existing.slice(endIdx + MARKER_END.length);
    return before + block + after;
  }
  // No markers: append at the end, ensuring a trailing newline first.
  const terminated = existing.endsWith('\n') ? existing : existing + '\n';
  return `${terminated}${block}\n`;
}

/**
 * Strip the marker block from pre-commit content (uninstall support).
 *
 * @param {string} existing
 * @returns {{ content: string, removed: boolean, emptyApartFromShebang: boolean }}
 */
function stripPreCommitContent(existing) {
  const startIdx = existing.indexOf(MARKER_START);
  const endIdx   = existing.indexOf(MARKER_END);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    return { content: existing, removed: false, emptyApartFromShebang: false };
  }
  const before = existing.slice(0, startIdx);
  let after    = existing.slice(endIdx + MARKER_END.length);
  if (after.startsWith('\n')) after = after.slice(1);
  const content    = before + after;
  const meaningful = content
    .split('\n')
    .filter(l => l.trim() !== '' && !l.trim().startsWith('#!'));
  return { content, removed: true, emptyApartFromShebang: meaningful.length === 0 };
}

// ---------------------------------------------------------------------------
// Inspection (doctor / verify support)
// ---------------------------------------------------------------------------

/**
 * Report the pre-commit hook state for the repository at cwd.
 *
 * @param {string} [cwd]
 * @returns {{ insideRepo: boolean, hooksDir: string|null,
 *             preCommitPath: string|null, exists: boolean, hasBlock: boolean,
 *             scriptPath: string|null, scriptExists: boolean }}
 */
function inspectPreCommit(cwd) {
  const hooksDir = resolveHooksDir(cwd);
  if (!hooksDir) {
    return { insideRepo: false, hooksDir: null, preCommitPath: null,
             exists: false, hasBlock: false, scriptPath: null, scriptExists: false };
  }
  const preCommitPath = path.join(hooksDir, 'pre-commit');
  let content = null;
  try { content = fs.readFileSync(preCommitPath, 'utf8'); } catch { /* absent */ }
  const hasBlock = content !== null &&
    content.includes(MARKER_START) && content.includes(MARKER_END);
  let scriptPath = null;
  if (hasBlock) {
    const block = content.slice(content.indexOf(MARKER_START), content.indexOf(MARKER_END));
    const m = block.match(/node "([^"]+)"/);
    if (m) scriptPath = m[1];
  }
  return {
    insideRepo: true, hooksDir, preCommitPath,
    exists: content !== null, hasBlock, scriptPath,
    scriptExists: Boolean(scriptPath && fs.existsSync(scriptPath)),
  };
}

// ---------------------------------------------------------------------------
// Install
// ---------------------------------------------------------------------------

/**
 * Install (or refresh) the code-warden block in the repo's pre-commit hook.
 * Signature matches the claude/codex installers so install.js can dispatch
 * uniformly; skillDir is unused because the embedded path resolves to the
 * currently running package via __dirname.
 *
 * @param {string|null} _skillDir - Ignored (per-repo target, not per-user)
 * @param {string} [cwd] - Directory inside the target repo (tests pass temp repos)
 * @returns {string} Path of the written pre-commit file
 */
function installHooks(_skillDir, cwd) {
  const hooksDir = resolveHooksDir(cwd);
  if (!hooksDir) {
    console.error('[CodeWarden] Not inside a git repository - git hooks are per-repo.');
    console.error('[CodeWarden] Run this from the repository you want governed.');
    process.exit(1);
  }
  if (!fs.existsSync(PRE_COMMIT_SCRIPT)) {
    console.error(`[CodeWarden] Missing hook script: ${PRE_COMMIT_SCRIPT}`);
    process.exit(1);
  }

  fs.mkdirSync(hooksDir, { recursive: true });
  const preCommitPath = path.join(hooksDir, 'pre-commit');
  let existing = null;
  try { existing = fs.readFileSync(preCommitPath, 'utf8'); } catch { /* new file */ }

  fs.writeFileSync(preCommitPath, mergePreCommitContent(existing, buildBlock()), 'utf8');
  try { fs.chmodSync(preCommitPath, 0o755); } catch { /* harmless on Windows */ }

  console.log(`[CodeWarden]   Pre-commit hook installed -> ${preCommitPath}`);
  console.log('[CodeWarden]   Scans STAGED content for file length + secrets at commit time.');
  console.log('[CodeWarden]   Honest note: `git commit --no-verify` bypasses this backstop.');
  return preCommitPath;
}

module.exports = {
  installHooks, inspectPreCommit, resolveHooksDir,
  buildBlock, mergePreCommitContent, stripPreCommitContent,
  MARKER_START, MARKER_END, PRE_COMMIT_SCRIPT,
};
