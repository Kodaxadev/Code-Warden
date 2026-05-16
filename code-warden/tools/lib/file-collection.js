#!/usr/bin/env node
'use strict';

/**
 * file-collection.js
 * Shared file traversal helpers for warden-lint and verify-secrets CLI tools.
 *
 * Previously each CLI tool duplicated identical SKIP_DIRS, SKIP_EXTS,
 * collectFiles, and expandPaths logic — any change had to be made twice.
 */

const fs   = require('fs');
const path = require('path');

const SKIP_DIRS = new Set(['node_modules', '.git', 'target', 'dist', '.next']);

const SKIP_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.svg', '.webp',
  '.zip', '.tar', '.gz', '.7z', '.rar',
  '.dll', '.exe', '.bin', '.so', '.dylib',
  '.pdf', '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.mp4', '.mp3', '.wav', '.ogg', '.avi', '.mov',
  '.map', '.lock',
]);

/**
 * Recursively collect all scannable files under a directory.
 *
 * @param {string} dir
 * @param {string[]} results - accumulator (mutated)
 */
function collectFiles(dir, results) {
  let entries;
  try { entries = fs.readdirSync(dir); } catch { return; }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    let stat;
    try { stat = fs.statSync(full); } catch { continue; }
    if (stat.isDirectory()) {
      collectFiles(full, results);
    } else if (!SKIP_EXTS.has(path.extname(entry).toLowerCase())) {
      results.push(full);
    }
  }
}

/**
 * Expand a list of CLI path arguments into a flat array of file paths.
 * Directories are walked recursively; individual files are included as-is.
 * Exits with usage error if no args provided or a path is not found.
 *
 * @param {string[]} args - process.argv slice
 * @param {string} toolName - used in the usage message
 * @returns {string[]}
 */
function expandPaths(args, toolName) {
  if (args.length === 0) {
    console.log(`Usage: ${toolName} <file|dir> [file|dir] ...`);
    console.log(`       node tools/${toolName} .           # scan entire project`);
    process.exit(1);
  }
  const files = [];
  for (const arg of args) {
    if (!fs.existsSync(arg)) {
      console.error(`Error: path not found: ${arg}`);
      continue;
    }
    if (fs.statSync(arg).isDirectory()) collectFiles(arg, files);
    else files.push(arg);
  }
  return files;
}

module.exports = { collectFiles, expandPaths, SKIP_DIRS, SKIP_EXTS };
