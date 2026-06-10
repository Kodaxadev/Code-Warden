'use strict';

/**
 * git-info.js
 * Best-effort git metadata shared by governance-report.js and
 * receipt --from-audit. Every helper returns null instead of throwing when
 * git is unavailable or the directory is not a repository.
 */

const path          = require('path');
const { spawnSync } = require('child_process');

function runGit(args, cwd) {
  const r = spawnSync('git', args, {
    encoding: 'utf8', timeout: 5000, cwd: cwd || process.cwd(),
  });
  return r.status === 0 && r.stdout ? r.stdout.trim() : null;
}

/**
 * Current branch and short commit for the repository at cwd.
 *
 * @param {string} [cwd]
 * @returns {{ branch: string|null, commit: string|null }}
 */
function gitInfo(cwd) {
  return {
    branch: runGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd),
    commit: runGit(['rev-parse', '--short', 'HEAD'], cwd),
  };
}

/**
 * Repository top-level directory for cwd, or null outside a repo.
 *
 * @param {string} [cwd]
 * @returns {string|null}
 */
function gitTopLevel(cwd) {
  const out = runGit(['rev-parse', '--show-toplevel'], cwd);
  return out ? path.resolve(out) : null;
}

module.exports = { gitInfo, gitTopLevel };
