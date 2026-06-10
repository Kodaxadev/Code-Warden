#!/usr/bin/env node
'use strict';

/**
 * scope.js
 * CLI for the Scope Lock: manages <repoRoot>/.code-warden/scope.json.
 *
 *   code-warden scope set --goal="..." <path...>   create/overwrite the scope
 *   code-warden scope add <path...>                expand scope (audited)
 *   code-warden scope remove <path...>             shrink scope
 *   code-warden scope clear                        delete the scope file
 *   code-warden scope status                       show goal/paths/expansions
 *
 * The scope file is user-controlled: write hooks deny agent edits to
 * .code-warden/, so expansions only happen through this CLI - and `scope add`
 * records every expansion in expansions[] as an audit trail.
 */

const fs            = require('node:fs');
const path          = require('node:path');
const { spawnSync } = require('node:child_process');
const store         = require('./lib/scope-store');

// ---------------------------------------------------------------------------
// Repo root resolution
// ---------------------------------------------------------------------------

/** git rev-parse --show-toplevel, falling back to cwd outside a repo. */
function findRepoRoot(cwd) {
  const r = spawnSync('git', ['rev-parse', '--show-toplevel'],
    { cwd, encoding: 'utf8', timeout: 5000 });
  if (r.status === 0 && r.stdout && r.stdout.trim()) {
    return path.resolve(r.stdout.trim());
  }
  return path.resolve(cwd);
}

// ---------------------------------------------------------------------------
// CLI parsing + helpers
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = { command, goal: '', enforce: true, paths: [] };
  for (const arg of rest) {
    if (arg.startsWith('--goal=')) options.goal = arg.slice('--goal='.length);
    else if (arg === '--no-enforce') options.enforce = false;
    else if (arg.startsWith('--')) throw new Error(`Unknown option: ${arg}`);
    else options.paths.push(arg);
  }
  return options;
}

function usage() {
  console.log('Usage: code-warden scope <set|add|remove|clear|status>');
  console.log('  scope set --goal="..." <path...>   Create/overwrite the scope lock');
  console.log('                                     (--no-enforce records scope without blocking)');
  console.log('  scope add <path...>                Expand the scope (recorded in expansions[])');
  console.log('  scope remove <path...>             Remove paths from the scope');
  console.log('  scope clear                        Delete the scope file');
  console.log('  scope status                       Show the current scope lock');
  console.log('Paths are repo-root-relative; directories use a trailing slash (src/).');
}

const log = msg => console.log(`[CodeWarden] ${msg}`);

/** Normalize CLI paths against rootDir; logs and skips entries that escape. */
function normalizeAll(paths, rootDir) {
  const out = [];
  for (const p of paths) {
    const norm = store.normalizeScopeEntry(p, rootDir);
    if (norm === null) log(`Skipped (outside the repository root): ${p}`);
    else out.push(norm);
  }
  return out;
}

/** Load the current scope by walking up from cwd; null when none is set. */
function currentScope(cwd) {
  const found = store.findScopeFile(cwd);
  if (!found) return null;
  const scope = store.loadScope(found.scopePath);
  return scope ? { ...found, scope } : null;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function cmdSet(options, cwd) {
  const rootDir = findRepoRoot(cwd);
  const filesIn = normalizeAll(options.paths, rootDir);
  if (filesIn.length === 0) {
    console.error('[CodeWarden] scope set requires at least one in-scope path.');
    console.error('[CodeWarden] Example: code-warden scope set --goal="Fix auth bug" src/ lib/utils.js');
    return 1;
  }
  const scope = store.createScope({ goal: options.goal, filesIn, enforce: options.enforce });
  const dest  = store.saveScope(rootDir, scope);
  log(`Scope lock written to ${dest}`);
  return printStatus({ scopePath: dest, scopeRoot: rootDir, scope });
}

function cmdAdd(options, cwd) {
  const current = currentScope(cwd);
  if (!current) {
    console.error('[CodeWarden] No scope is set. Run: code-warden scope set --goal="..." <path...>');
    return 1;
  }
  const additions = normalizeAll(options.paths, current.scopeRoot);
  if (additions.length === 0) {
    console.error('[CodeWarden] scope add requires at least one path.');
    return 1;
  }
  const { scope } = current;
  scope.expansions = Array.isArray(scope.expansions) ? scope.expansions : [];
  for (const p of additions) {
    if (!scope.filesIn.includes(p)) scope.filesIn.push(p);
    scope.expansions.push({ path: p, addedAt: new Date().toISOString() });
    log(`Added to scope: ${p}`);
  }
  store.saveScope(current.scopeRoot, scope);
  return 0;
}

function cmdRemove(options, cwd) {
  const current = currentScope(cwd);
  if (!current) {
    console.error('[CodeWarden] No scope is set - nothing to remove.');
    return 1;
  }
  const removals = normalizeAll(options.paths, current.scopeRoot);
  if (removals.length === 0) {
    console.error('[CodeWarden] scope remove requires at least one path.');
    return 1;
  }
  const { scope } = current;
  for (const p of removals) {
    const idx = scope.filesIn.indexOf(p);
    if (idx === -1) log(`Not in scope (no change): ${p}`);
    else { scope.filesIn.splice(idx, 1); log(`Removed from scope: ${p}`); }
  }
  store.saveScope(current.scopeRoot, scope);
  return 0;
}

function cmdClear(cwd) {
  const found = store.findScopeFile(cwd);
  if (!found) {
    log('No scope file found - nothing to clear.');
    return 0;
  }
  fs.rmSync(found.scopePath, { force: true });
  try { fs.rmdirSync(path.dirname(found.scopePath)); } catch { /* dir not empty - keep it */ }
  log(`Scope lock cleared (${found.scopePath}).`);
  return 0;
}

function printStatus({ scopePath, scopeRoot, scope }) {
  const enforce = scope.enforce !== false;
  log(`Scope lock: ${enforce ? 'ACTIVE' : 'recorded only (enforce: false)'}`);
  log(`  File: ${scopePath}`);
  log(`  Root: ${scopeRoot}`);
  log(`  Goal: ${scope.goal || '(not set)'}`);
  log(`  Files in scope (${scope.filesIn.length}):`);
  for (const p of scope.filesIn) log(`    - ${p}`);
  const expansions = Array.isArray(scope.expansions) ? scope.expansions : [];
  if (expansions.length > 0) {
    log(`  Expansions (${expansions.length}):`);
    for (const e of expansions) log(`    - ${e.path} (added ${e.addedAt})`);
  }
  if (enforce) {
    log('  Enforced on Write/Edit/NotebookEdit (Claude) and apply_patch (Codex) while hooks are installed.');
  }
  return 0;
}

function cmdStatus(cwd) {
  const current = currentScope(cwd);
  if (!current) {
    log('No scope lock is set for this repository.');
    log('Set one with: code-warden scope set --goal="..." <path...>');
    return 0;
  }
  return printStatus(current);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(argv = process.argv.slice(2), cwd = process.cwd()) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(`[CodeWarden] ${error.message}`);
    usage();
    return 1;
  }

  switch (options.command) {
    case 'set':    return cmdSet(options, cwd);
    case 'add':    return cmdAdd(options, cwd);
    case 'remove': return cmdRemove(options, cwd);
    case 'clear':  return cmdClear(cwd);
    case 'status': return cmdStatus(cwd);
    default:
      if (options.command) console.error(`[CodeWarden] Unknown scope command: ${options.command}`);
      usage();
      return 1;
  }
}

if (require.main === module) {
  process.exit(main());
}

module.exports = { main, findRepoRoot };
