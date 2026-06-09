#!/usr/bin/env node
/**
 * warden-apply-patch-hook.js — Codex PreToolUse hook
 *
 * Fires on apply_patch tool calls. Scans added lines for hardcoded credentials
 * and estimates resulting file size where the target path can be extracted.
 *
 * Codex hook payload (stdin, JSON):
 *   { tool: "apply_patch", toolInput: { patch: "<patch text>" } }
 *
 * Exit codes:
 *   0  — proceed
 *   2  — block (writes JSON deny to stdout)
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { scanForSecrets }     = require('../../lib/secret-patterns');
const { countLines }         = require('../../lib/line-count');
const { loadConfig }         = require('../../lib/config');
const { matchesProjectPath } = require('../../lib/path-match');

// Discover the governed project's codewarden.json from the working directory
// (Codex payloads do not carry cwd); falls back to the skill-dir default.
const BASE_DIR = process.cwd();
const { maxFileLength: maxLines, lintExcludePaths, secretsAllowlist, projectRoot } =
  loadConfig(null, BASE_DIR);


function deny(reason) {
  process.stdout.write(JSON.stringify({ deny: true, message: `[CodeWarden] ${reason}` }) + '\n');
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Patch parsing helpers
// ---------------------------------------------------------------------------

/**
 * Extract lines added by the patch (lines starting with '+', not '+++').
 */
function extractAddedLines(patch) {
  return patch.split('\n')
    .filter(l => l.startsWith('+') && !l.startsWith('+++'))
    .map(l => l.slice(1));
}

/**
 * Extract target file path from patch header (*** path or +++ path or --- path).
 * Returns null if not detectable.
 */
function extractTargetPath(patch) {
  for (const line of patch.split('\n')) {
    const m = line.match(/^\+{3}\s+(.+?)(\s+\d{4}-\d{2}-\d{2}.*)?$/) ||
              line.match(/^\*{3}\s+(.+?)(\s+\d{4}-\d{2}-\d{2}.*)?$/);
    if (m) {
      const p = m[1].trim();
      if (p !== '/dev/null') return p;
    }
  }
  return null;
}

/**
 * Estimate resulting line count: base file lines + added lines - removed lines.
 * Returns null if file not readable.
 */
function estimateResultLines(patch, targetPath) {
  let baseLines = 0;
  if (targetPath && fs.existsSync(targetPath)) {
    try {
      baseLines = countLines(fs.readFileSync(targetPath, 'utf8'));
    } catch { return null; }
  } else if (!targetPath) {
    return null;
  }
  // Count added and removed lines
  let added = 0;
  let removed = 0;
  for (const line of patch.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) added++;
    else if (line.startsWith('-') && !line.startsWith('---')) removed++;
  }
  return baseLines + added - removed;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { raw += chunk; });
process.stdin.on('end', () => {
  let payload;
  try { payload = JSON.parse(raw); } catch { process.exit(0); }

  const input = payload.toolInput || payload.tool_input || {};
  const patch  = String(input.patch || '');
  if (!patch) process.exit(0);

  const targetPath = extractTargetPath(patch);

  // --- Secrets check on added lines (skipped for secrets.allowlist paths) ---
  if (!matchesProjectPath(targetPath, projectRoot, secretsAllowlist, BASE_DIR)) {
    const added = extractAddedLines(patch);
    const addedText = added.join('\n');
    const hit = scanForSecrets(addedText);
    if (hit) deny(`Blocked apply_patch — hardcoded credential detected (${hit.label}). Remove before patching.`);
  }

  // --- File length check (skipped for lint.exclude_paths paths) ---
  if (!matchesProjectPath(targetPath, projectRoot, lintExcludePaths, BASE_DIR)) {
    const estimated = estimateResultLines(patch, targetPath);
    if (estimated !== null && estimated > maxLines) {
      deny(`Blocked apply_patch — resulting file would be ~${estimated} lines (limit ${maxLines}). Break it up first.`);
    }
  }

  process.exit(0);
});
