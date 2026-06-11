#!/usr/bin/env node
/**
 * uninstall-hooks.js
 * Removes the code-warden marker block from the pre-commit hook of the git
 * repository at the working directory.
 *
 * If the file becomes empty apart from the shebang, the file is deleted
 * entirely. If the hook never had our markers, says so and leaves it alone.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const { resolveHooksDir, stripPreCommitContent } = require('./install-hooks');

/**
 * @param {string} [cwd] - Directory inside the target repo (default process.cwd())
 * @returns {boolean} true when a block was removed
 */
function uninstallHooks(cwd) {
  const hooksDir = resolveHooksDir(cwd);
  if (!hooksDir) {
    console.log('[CodeWarden]   Not inside a git repository - nothing to remove.');
    return false;
  }

  const preCommitPath = path.join(hooksDir, 'pre-commit');
  let existing;
  try {
    existing = fs.readFileSync(preCommitPath, 'utf8');
  } catch {
    console.log('[CodeWarden]   No pre-commit hook found - nothing to remove.');
    return false;
  }

  const { content, removed, emptyApartFromShebang } = stripPreCommitContent(existing);
  if (!removed) {
    console.log('[CodeWarden]   No code-warden block in pre-commit - nothing to remove.');
    return false;
  }

  if (emptyApartFromShebang) {
    fs.unlinkSync(preCommitPath);
    console.log(`[CodeWarden]   Removed code-warden block; deleted now-empty hook: ${preCommitPath}`);
  } else {
    fs.writeFileSync(preCommitPath, content, 'utf8');
    console.log(`[CodeWarden]   Removed code-warden block from ${preCommitPath}`);
  }
  return true;
}

module.exports = { uninstallHooks };
