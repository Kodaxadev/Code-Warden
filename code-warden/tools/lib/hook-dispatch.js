#!/usr/bin/env node
'use strict';

/**
 * hook-dispatch.js
 * Shared dispatch for install.js --hooks= / --uninstall-hooks= targets and
 * the `verify git` per-repo check.
 *
 * claude/codex hooks are per-user (written under the home directory);
 * git hooks are PER-REPO (written into the repository at process.cwd()).
 * Extracted from install.js so adding hook targets does not push the
 * installer past the file length limit.
 */

const path = require('path');

const HOOK_TARGET_LABELS = {
  claude: 'Claude Code',
  codex:  'OpenAI Codex',
  git:    'Git pre-commit',
};

/**
 * Run install or uninstall for each requested hook target.
 *
 * @param {object} opts
 * @param {string[]} opts.ids - Requested target ids (claude|codex|git)
 * @param {boolean} opts.uninstall - true for --uninstall-hooks
 * @param {Array<{id: string, skillsDir: string}>} opts.targets - TARGETS table
 * @param {string} opts.skillName - Installed skill folder name
 * @param {(msg: string) => void} opts.log - Prefixed logger
 * @param {(msg: string) => void} opts.ok - PASS-line logger
 */
function dispatchHooks({ ids, uninstall, targets, skillName, log, ok }) {
  const bad = ids.filter(id => !HOOK_TARGET_LABELS[id]);
  if (bad.length > 0) {
    console.error(`[CodeWarden] hooks support: ${Object.keys(HOOK_TARGET_LABELS).join(', ')}. Unknown: ${bad.join(', ')}`);
    process.exit(1);
  }

  for (const id of ids) {
    const target   = targets.find(t => t.id === id);
    const skillDir = target ? path.join(target.skillsDir, skillName) : null;
    const mod      = require(path.join(__dirname, '..', 'hooks', id,
      `${uninstall ? 'uninstall' : 'install'}-hooks`));
    const label    = HOOK_TARGET_LABELS[id];

    if (uninstall) {
      log(`Removing hooks for ${label}...`);
      mod.uninstallHooks();
      log(id === 'git'
        ? 'Git hooks are per-repo: this affected only the repository at the current directory.'
        : `Restart ${label} for changes to take effect.`);
    } else {
      log(`Installing hooks for ${label}...`);
      mod.installHooks(skillDir);
      ok('Hook entries written');
      log(id === 'git'
        ? 'Git hooks are per-repo: installed into the repository at the current directory (not per-user).'
        : `Restart ${label} for hooks to take effect.`);
    }
  }
}

/**
 * Verify the git pre-commit backstop for the repository at cwd:
 * marker block present and the embedded script path exists.
 *
 * @param {{ ok: (msg: string) => void, fail: (msg: string) => void }} loggers
 * @param {string} [cwd]
 * @returns {string[]} Issue labels (empty when healthy)
 */
function verifyGitHooks({ ok, fail }, cwd) {
  const { inspectPreCommit } = require(path.join(__dirname, '..', 'hooks', 'git', 'install-hooks'));
  const s      = inspectPreCommit(cwd || process.cwd());
  const issues = [];
  const check  = (label, pass) => {
    if (pass) ok(label); else { fail(label); issues.push(label); }
  };

  console.log('  Git pre-commit (repository at current directory)');
  check('    Inside a git repository', s.insideRepo);
  if (s.insideRepo) {
    check(`    Marker block present (${s.preCommitPath})`, s.hasBlock);
    if (s.hasBlock) {
      check(`    Embedded hook script exists (${s.scriptPath || '?'})`, s.scriptExists);
    }
  }
  console.log('');
  return issues;
}

module.exports = { dispatchHooks, verifyGitHooks, HOOK_TARGET_LABELS };
