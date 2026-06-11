#!/usr/bin/env node
/**
 * warden-lint-hook.js
 * PreToolUse Claude Code hook: blocks Write/Edit if the resulting file would
 * exceed the configured line limit. Asks for confirmation (permissionDecision
 * "ask") when a single change exceeds pre_flight_trigger_lines without
 * breaching the hard limit. NotebookEdit is explicitly allowed — cells are
 * not files, so the length gate does not apply.
 *
 * Config: discovered from the governed project (payload.cwd, walking up for
 * codewarden.json) with fallback to the skill-dir default. Honors
 * lint.exclude_paths relative to the discovered project root.
 *
 * Payload (stdin JSON):  { tool_name, tool_input: { file_path, content|new_string, ... }, cwd }
 * On violation: exit 2 + JSON deny response to stdout.
 * On pre-flight trigger: exit 0 + JSON ask response to stdout.
 * On pass:      exit 0 (no output).
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { countLines }         = require('../../lib/line-count');
const { loadConfig }         = require('../../lib/config');
const { matchesProjectPath } = require('../../lib/path-match');

// ---------------------------------------------------------------------------
// Skip list — file types where line counting is meaningless
// ---------------------------------------------------------------------------

const SKIP_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.svg',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.zip', '.tar', '.gz', '.rar', '.7z',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
  '.mp3', '.mp4', '.avi', '.mov', '.wav',
  '.map', '.lock',
]);

const SKIP_NAMES = new Set(['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml']);

function shouldSkip(filePath) {
  if (!filePath) return true;
  if (SKIP_NAMES.has(path.basename(filePath))) return true;
  return SKIP_EXTS.has(path.extname(filePath).toLowerCase());
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

function respond(decision, reason, exitCode) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: decision,
      permissionDecisionReason: reason,
    },
  }));
  process.exit(exitCode);
}

const deny  = (reason) => respond('deny', reason, 2);
const ask   = (reason) => respond('ask', reason, 0);
const allow = () => process.exit(0);

function preFlightGate(changeLines, trigger) {
  if (changeLines > trigger) {
    ask(`[CodeWarden] Pre-flight gate: single change of ${changeLines} lines exceeds ${trigger}. Confirm this large block is intentional.`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  let payload;
  try {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    allow(); // parse failure is non-blocking
  }

  const { tool_name, tool_input = {} } = payload;
  const { file_path, content, old_string, new_string, replace_all } = tool_input;

  if (tool_name === 'NotebookEdit') allow(); // cells are not files — no length gate

  const baseDir = payload.cwd || process.cwd();
  const config  = loadConfig(null, baseDir);
  const MAX_LINES = config.maxFileLength;
  const TRIGGER   = config.preFlightTriggerLines;

  if (matchesProjectPath(file_path, config.projectRoot, config.lintExcludePaths, baseDir)) {
    allow(); // lint.exclude_paths — project opted this path out of length checks
  }

  if (tool_name === 'Write') {
    if (shouldSkip(file_path)) allow();
    const lines = countLines(content || '');
    if (lines > MAX_LINES) {
      deny(`[CodeWarden] File length gate: ${path.basename(file_path)} would be ${lines} lines (limit ${MAX_LINES}). Split into modules before writing.`);
    }
    preFlightGate(lines, TRIGGER);
    allow();
  }

  if (tool_name === 'Edit') {
    if (shouldSkip(file_path)) allow();
    if (!fs.existsSync(file_path)) allow(); // new file — Write hook will catch it
    const current = fs.readFileSync(file_path, 'utf8');
    const patched  = replace_all
      ? current.split(old_string || '').join(new_string || '')
      : current.replace(old_string || '', new_string || '');
    const lines = countLines(patched);
    if (lines > MAX_LINES) {
      deny(`[CodeWarden] File length gate: ${path.basename(file_path)} would be ${lines} lines after edit (limit ${MAX_LINES}). Split into modules before editing.`);
    }
    preFlightGate(countLines(new_string || ''), TRIGGER);
    allow();
  }

  allow(); // unrecognised tool — pass through
}

main().catch(() => allow());
