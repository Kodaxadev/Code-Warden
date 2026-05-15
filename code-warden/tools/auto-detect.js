#!/usr/bin/env node
/**
 * auto-detect.js
 * Detection logic for the code-warden auto-installer.
 * Exports scanTargets(targets) -> targets annotated with detected/method fields.
 *
 * Detection order per target:
 *   1. Binary found in PATH (where / which)
 *   2. Config directory exists in HOME
 *   3. App install path exists (platform-specific)
 */

const fs           = require('fs');
const { execSync } = require('child_process');

/**
 * Returns true if a CLI binary is resolvable via PATH.
 * Uses 'where' on Windows, 'which' on Unix.
 */
function commandExists(bin) {
  try {
    const cmd = process.platform === 'win32' ? `where ${bin}` : `which ${bin}`;
    execSync(cmd, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns true if a path exists and is a directory.
 */
function dirExists(p) {
  try {
    return fs.existsSync(p) && fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Returns true if a path exists (file or directory).
 */
function pathExists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

/**
 * Checks all detection signals for a single target.
 * Returns { detected: boolean, method: string|null }
 */
function isInstalled(target) {
  for (const bin of (target.detect.binaries || [])) {
    if (commandExists(bin)) {
      return { detected: true, method: `binary:${bin}` };
    }
  }

  for (const dir of (target.detect.dirs || [])) {
    if (dirExists(dir)) {
      return { detected: true, method: `dir:${dir}` };
    }
  }

  const platformApps = (target.detect.apps || {})[process.platform] || [];
  for (const appPath of platformApps) {
    if (pathExists(appPath)) {
      return { detected: true, method: `app:${appPath}` };
    }
  }

  return { detected: false, method: null };
}

/**
 * Scans all targets and annotates each with detection results.
 * @param {Array} targets - TARGETS array from auto-targets.js
 * @returns {Array} - same array with detected and method fields added
 */
function scanTargets(targets) {
  return targets.map(target => {
    const result = isInstalled(target);
    return { ...target, ...result };
  });
}

module.exports = { scanTargets, isInstalled, commandExists };
