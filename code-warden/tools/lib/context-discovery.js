'use strict';

/**
 * context-discovery.js
 * Shared architecture-context file discovery, extracted from get-context.js
 * so the SessionStart hook and receipt --from-audit reuse the exact same
 * candidate list and walk order instead of copy-pasting it.
 *
 * get-context.js keeps its historical unbounded walk (all the way to the
 * filesystem root). Hooks pass stopAtGitBoundary:true so a session never
 * injects context found OUTSIDE the governed repository.
 */

const fs   = require('fs');
const path = require('path');

/** Candidate files, in priority order (first hit at each level wins). */
const CONTEXT_CANDIDATES = [
  'AGENTS.md',
  '.codex/AGENTS.md',
  'ARCHITECTURE.md',
  'docs/ARCHITECTURE.md',
  '.agents/AGENTS.md',
  '.claude/CLAUDE.md',
  'CLAUDE.md',
  'README.md',
  'docs/README.md',
  'PRD.md',
];

/**
 * Walk up from startDir looking for the first architecture context file.
 *
 * @param {string} startDir
 * @param {{ stopAtGitBoundary?: boolean }} [opts] - When true, the first
 *   directory containing .git is the LAST level checked (repo-bounded).
 * @returns {string|null} Absolute path of the found file, or null
 */
function findContextFile(startDir, { stopAtGitBoundary = false } = {}) {
  let dir = path.resolve(startDir);

  for (;;) {
    for (const candidate of CONTEXT_CANDIDATES) {
      const fullPath = path.join(dir, candidate);
      if (fs.existsSync(fullPath)) return fullPath;
    }
    if (stopAtGitBoundary && fs.existsSync(path.join(dir, '.git'))) return null;
    const parentDir = path.dirname(dir);
    if (parentDir === dir) return null;
    dir = parentDir;
  }
}

module.exports = { CONTEXT_CANDIDATES, findContextFile };
