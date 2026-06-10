#!/usr/bin/env node
/**
 * warden-pre-commit.js
 * Git pre-commit backstop: scans STAGED content for file-length and
 * hardcoded-credential violations before a commit lands.
 *
 * Installed into the governed repo by install-hooks.js as a marker-managed
 * block in pre-commit; runs at commit time with the repo as cwd.
 *
 * Staged content is read with `git show :<path>` - NOT the working tree -
 * because the index is what actually gets committed. Honors the project's
 * codewarden.json: lint.exclude_paths skips the length check and
 * secrets.allowlist skips the secrets check. Git emits repo-root-relative
 * paths and config discovery stops at the .git boundary, so prefix matching
 * uses the project root (falling back to the repo root when no project
 * config is discovered - the two roots coincide either way).
 *
 * Exit 0 when staged files are clean; exit 1 with [FAIL] lines otherwise.
 * Deliberate bypass (visible in review): git commit --no-verify.
 */

'use strict';

const path          = require('path');
const { spawnSync } = require('child_process');

const { countLines }            = require('../../lib/line-count');
const { scanForAllSecrets }     = require('../../lib/secret-patterns');
const { loadConfig }            = require('../../lib/config');
const { matchesAnyPrefix }      = require('../../lib/path-match');
const { SKIP_NAMES, SKIP_EXTS } = require('../../lib/file-collection');

// ---------------------------------------------------------------------------
// Git plumbing
// ---------------------------------------------------------------------------

function git(args) {
  return spawnSync('git', args, {
    encoding:  'utf8',
    timeout:   15000,
    maxBuffer: 64 * 1024 * 1024,
  });
}

/** @returns {string[]|null} Staged (added/copied/modified) paths, NUL-parsed */
function stagedFiles() {
  const r = git(['diff', '--cached', '--name-only', '--diff-filter=ACM', '-z']);
  if (r.status !== 0) return null;
  return (r.stdout || '').split('\0').filter(Boolean);
}

/** @returns {string|null} Staged blob content, or null when unreadable */
function stagedContent(file) {
  const r = git(['show', `:${file}`]);
  return r.status === 0 ? r.stdout : null;
}

// ---------------------------------------------------------------------------
// Staged scan
// ---------------------------------------------------------------------------

function scanStaged() {
  const top = git(['rev-parse', '--show-toplevel']);
  if (top.status !== 0) {
    console.error('[CodeWarden] pre-commit: not inside a git repository - skipping.');
    return 0;
  }
  const repoRoot = top.stdout.trim();

  const files = stagedFiles();
  if (files === null) {
    console.error('[CodeWarden] pre-commit: could not list staged files - skipping.');
    return 0;
  }

  const { maxFileLength, lintExcludePaths, secretsAllowlist } = loadConfig(null, repoRoot);

  const failures = [];
  let scanned = 0;

  for (const file of files) {
    const name = path.basename(file);
    if (SKIP_NAMES.has(name) || SKIP_EXTS.has(path.extname(name).toLowerCase())) continue;

    const content = stagedContent(file);
    if (content === null) continue; // e.g. submodule entry or unreadable blob

    scanned++;

    if (!matchesAnyPrefix(file, lintExcludePaths)) {
      const lines = countLines(content);
      if (lines > maxFileLength) {
        failures.push(`${file}: ${lines} lines exceeds the ${maxFileLength}-line limit`);
      }
    }

    if (!matchesAnyPrefix(file, secretsAllowlist)) {
      for (const hit of scanForAllSecrets(content)) {
        failures.push(`${file}:${hit.line}: ${hit.label} detected in staged content`);
      }
    }
  }

  if (failures.length > 0) {
    for (const f of failures) console.error(`[FAIL] [CodeWarden] ${f}`);
    console.error(`[FAIL] [CodeWarden] Pre-commit gate: ${failures.length} violation(s) across ${scanned} staged file(s). Commit blocked.`);
    console.error('[CodeWarden] Fix the staged content, or adjust lint.exclude_paths / secrets.allowlist in codewarden.json.');
    return 1;
  }

  console.log(`[PASS] [CodeWarden] Pre-commit gate: ${scanned} staged file(s) clean.`);
  return 0;
}

process.exit(scanStaged());
