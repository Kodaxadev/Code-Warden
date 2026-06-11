#!/usr/bin/env node
/**
 * warden-session-hook.js
 * SessionStart Claude Code hook (matchers: startup|resume|clear): injects
 * architecture context and scope status at the start of a session so the
 * agent begins governed instead of discovering the rules mid-task.
 *
 * Discovery is repo-bounded (stopAtGitBoundary) - a session never inherits
 * context found above the repository root. Nothing found and no scope lock
 * means exit 0 with no output. SessionStart cannot block; output goes
 * through the hookSpecificOutput.additionalContext JSON form.
 *
 * Payload (stdin JSON): { session_id, cwd, hook_event_name, source, ... }
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const { findContextFile } = require('../../lib/context-discovery');
const { getScopeSummary } = require('../../lib/scope-store');

const MAX_CONTEXT_CHARS = 2000;
const MAX_CONTEXT_LINES = 30;

/** Console/context output stays ASCII: replace anything else with '?'. */
function toAscii(text) {
  return String(text).replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '?');
}

function buildContext(cwd) {
  const contextFile = findContextFile(cwd, { stopAtGitBoundary: true });
  const scope       = getScopeSummary(cwd);
  if (!contextFile && !scope) return null;

  const parts = [];
  if (contextFile) {
    let head = '';
    try {
      head = fs.readFileSync(contextFile, 'utf8')
        .split(/\r?\n/).slice(0, MAX_CONTEXT_LINES).join('\n').trim();
    } catch { /* unreadable file - skip the excerpt */ }
    const name = path.basename(contextFile);
    parts.push(`[CodeWarden] Architecture context from ${name} (${contextFile}):\n${head}`);
  }
  if (scope) {
    parts.push(`[CodeWarden] Scope locked: goal=${scope.goal || '(not set)'}, ` +
      `${scope.filesIn.length} files in scope.`);
  }
  parts.push('[CodeWarden] Scope Gate and Plan Gate apply before code changes.');

  return toAscii(parts.join('\n')).slice(0, MAX_CONTEXT_CHARS);
}

async function main() {
  let payload;
  try {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    process.exit(0); // unreadable payload - inject nothing
  }

  let context = null;
  try {
    context = buildContext(payload.cwd || process.cwd());
  } catch { /* discovery trouble must never break session start */ }
  if (!context) process.exit(0);

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: context,
    },
  }));
  process.exit(0);
}

main().catch(() => process.exit(0));
