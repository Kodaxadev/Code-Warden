#!/usr/bin/env node
/**
 * warden-stop-hook.js
 * Opt-in Stop Claude Code hook: when codewarden.json sets
 * session.verify_on_stop true, runs FAST in-process scans (file length +
 * secrets via lib/scan-core - no behavioral tests, no git subprocesses)
 * before the session is allowed to finish. Registered by default but inert:
 * verify_on_stop defaults to false.
 *
 * Loop guard: payload.stop_hook_active is true when this hook already
 * blocked once this stop attempt - exit 0 immediately (Claude Code also
 * hard-caps consecutive blocks).
 *
 * Baseline-aware: when <projectRoot>/.code-warden-baseline.json exists,
 * only FRESH violations block - legacy debt never traps a session.
 *
 * On violations: {"decision":"block","reason":"..."} on stdout, exit 0
 * (the reason is fed back to Claude as its next instruction).
 * Clean (or off): exit 0, no output.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const { loadConfig }    = require('../../lib/config');
const { runScans }      = require('../../lib/scan-core');
const { loadBaseline, applyBaseline, DEFAULT_BASELINE } = require('../../lib/baseline');

const MAX_LISTED = 3;

function block(reason) {
  process.stdout.write(JSON.stringify({ decision: 'block', reason }));
  process.exit(0);
}

function verify(cwd) {
  const cfg = loadConfig(null, cwd);
  if (!cfg.verifyOnStop) return; // off by default - absent means inert

  const root = cfg.projectRoot || cwd;
  const scans = runScans(root, null, root);

  let lengthFresh = scans.fileLength.details || [];
  let secretFresh = scans.secrets.details || [];

  const baselinePath = path.join(root, DEFAULT_BASELINE);
  if (fs.existsSync(baselinePath)) {
    try {
      const parts = applyBaseline(scans, loadBaseline(baselinePath));
      lengthFresh = parts.fileLength.fresh;
      secretFresh = parts.secrets.fresh;
    } catch { /* unusable baseline - everything counts as fresh */ }
  }

  const total = lengthFresh.length + secretFresh.length;
  if (total === 0) return;

  const lines = [
    ...lengthFresh.map(d => `${d.file}: ${d.lines} lines (limit ${d.limit})`),
    ...secretFresh.map(d => `${d.file}:${d.line}: ${d.pattern}`),
  ].slice(0, MAX_LISTED);

  block(`[CodeWarden] Stop verification: ${total} fresh violations ` +
    `(${lengthFresh.length} length, ${secretFresh.length} secrets). ` +
    `Fix or report them before finishing:\n${lines.join('\n')}`);
}

async function main() {
  let payload;
  try {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    process.exit(0); // unreadable payload - never trap the session
  }

  if (payload.stop_hook_active) process.exit(0); // loop guard - MUST come first

  try {
    verify(payload.cwd || process.cwd());
  } catch { /* scan trouble must never trap the session */ }
  process.exit(0);
}

main().catch(() => process.exit(0));
