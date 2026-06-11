#!/usr/bin/env node
'use strict';

/**
 * config-discovery-tests.js
 * Behavioral tests for project-level codewarden.json discovery
 * (lib/config.js findProjectConfig + loadConfig precedence) and the shared
 * path-prefix matcher (lib/path-match.js).
 *
 * All fixtures live in temp dirs under os.tmpdir(); each project root gets a
 * .git directory so the upward walk never escapes into the host filesystem.
 */

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const path     = require('node:path');
const fs       = require('node:fs');
const os       = require('node:os');

const { loadConfig, findProjectConfig, DEFAULT_CONFIG_PATH } = require('../lib/config');
const { matchesAnyPrefix, matchesProjectPath }               = require('../lib/path-match');

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/** Create a temp project root with a .git boundary; returns the root path. */
function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `cw-cfg-${process.pid}-`));
  fs.mkdirSync(path.join(root, '.git'), { recursive: true });
  return root;
}

function writeConfig(dir, config) {
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, 'codewarden.json');
  fs.writeFileSync(p, JSON.stringify(config, null, 2) + '\n', 'utf8');
  return p;
}

const cleanup = (root) => fs.rmSync(root, { recursive: true, force: true });

// ---------------------------------------------------------------------------
// findProjectConfig
// ---------------------------------------------------------------------------

test('findProjectConfig: walks up to a root-level codewarden.json', () => {
  const root = makeRoot();
  try {
    const configPath = writeConfig(root, {});
    const deep = path.join(root, 'src', 'nested', 'deep');
    fs.mkdirSync(deep, { recursive: true });

    const found = findProjectConfig(deep);
    assert.ok(found, 'expected discovery to succeed');
    assert.equal(found.configPath, configPath);
    assert.equal(found.projectRoot, root);
  } finally {
    cleanup(root);
  }
});

test('findProjectConfig: finds code-warden/codewarden.json variant', () => {
  const root = makeRoot();
  try {
    const configPath = writeConfig(path.join(root, 'code-warden'), {});
    const deep = path.join(root, 'src');
    fs.mkdirSync(deep, { recursive: true });

    const found = findProjectConfig(deep);
    assert.ok(found, 'expected discovery to succeed');
    assert.equal(found.configPath, configPath);
    assert.equal(found.projectRoot, root, 'projectRoot is the walk level, not the code-warden subdir');
  } finally {
    cleanup(root);
  }
});

test('findProjectConfig: stops ascending past a .git boundary', () => {
  const outer = fs.mkdtempSync(path.join(os.tmpdir(), `cw-cfg-outer-${process.pid}-`));
  try {
    writeConfig(outer, {}); // config ABOVE the repo root must not be found
    const repo = path.join(outer, 'repo');
    fs.mkdirSync(path.join(repo, '.git'), { recursive: true });
    const src = path.join(repo, 'src');
    fs.mkdirSync(src, { recursive: true });

    assert.equal(findProjectConfig(src), null, 'walk must stop at the repo root');
  } finally {
    cleanup(outer);
  }
});

test('findProjectConfig: repo root itself is the last level checked', () => {
  const root = makeRoot();
  try {
    const configPath = writeConfig(root, {}); // config AT the .git level
    const found = findProjectConfig(path.join(root));
    assert.ok(found, 'config at the repo root must be found');
    assert.equal(found.configPath, configPath);
  } finally {
    cleanup(root);
  }
});

test('findProjectConfig: invalid input returns null', () => {
  assert.equal(findProjectConfig(null), null);
  assert.equal(findProjectConfig(''), null);
  assert.equal(findProjectConfig(undefined), null);
});

// ---------------------------------------------------------------------------
// loadConfig precedence + values
// ---------------------------------------------------------------------------

test('loadConfig: explicit configPath wins over discovery', () => {
  const root = makeRoot();
  try {
    writeConfig(root, { thresholds: { max_file_length: 111 } });
    const explicitDir = path.join(root, 'explicit');
    const explicitPath = writeConfig(explicitDir, { thresholds: { max_file_length: 222 } });

    const cfg = loadConfig(explicitPath, root);
    assert.equal(cfg.maxFileLength, 222, 'explicit path must take precedence');
    assert.equal(cfg.projectRoot, null, 'explicit configs do not set projectRoot');
  } finally {
    cleanup(root);
  }
});

test('loadConfig: discovers project config and returns projectRoot', () => {
  const root = makeRoot();
  try {
    writeConfig(root, {
      thresholds: { max_file_length: 123, pre_flight_trigger_lines: 45 },
      lint:       { exclude_paths: ['vendor/'] },
      secrets:    { allowlist: ['fixtures/'] },
    });
    const deep = path.join(root, 'src');
    fs.mkdirSync(deep, { recursive: true });

    const cfg = loadConfig(null, deep);
    assert.equal(cfg.maxFileLength, 123);
    assert.equal(cfg.preFlightTriggerLines, 45);
    assert.deepEqual(cfg.lintExcludePaths, ['vendor/']);
    assert.deepEqual(cfg.secretsAllowlist, ['fixtures/']);
    assert.equal(cfg.projectRoot, root);
  } finally {
    cleanup(root);
  }
});

test('loadConfig: no args falls back to skill default with null projectRoot', () => {
  const cfg = loadConfig();
  assert.equal(cfg.projectRoot, null);
  assert.equal(typeof cfg.maxFileLength, 'number');
  assert.equal(typeof cfg.preFlightTriggerLines, 'number');
  assert.ok(fs.existsSync(DEFAULT_CONFIG_PATH), 'skill default config must exist');
});

test('loadConfig: defaults survive a missing discovered config', () => {
  const root = makeRoot(); // .git but no codewarden.json anywhere
  try {
    const cfg = loadConfig(null, root);
    // Falls through to the skill default (this repo: 400 / 150)
    assert.equal(cfg.maxFileLength, 400);
    assert.equal(cfg.preFlightTriggerLines, 150);
  } finally {
    cleanup(root);
  }
});

// ---------------------------------------------------------------------------
// path-match helpers
// ---------------------------------------------------------------------------

test('matchesAnyPrefix: prefix, exact, and backslash normalisation', () => {
  assert.equal(matchesAnyPrefix('src/app.js', ['src/']), true);
  assert.equal(matchesAnyPrefix('src2/app.js', ['src/']), false);
  assert.equal(matchesAnyPrefix('vendor', ['vendor/']), true, 'exact match without trailing slash');
  assert.equal(matchesAnyPrefix('src\\app.js', ['src/']), true, 'backslashes normalised');
  assert.equal(matchesAnyPrefix('src/app.js', []), false);
});

test('matchesProjectPath: resolves against project root and rejects escapes', () => {
  const root = makeRoot();
  try {
    const inside  = path.join(root, 'vendor', 'lib.js');
    const outside = path.join(os.tmpdir(), 'elsewhere.js');
    assert.equal(matchesProjectPath(inside, root, ['vendor/']), true);
    assert.equal(matchesProjectPath(inside, root, ['src/']), false);
    assert.equal(matchesProjectPath(outside, root, ['vendor/']), false, 'paths outside the root never match');
    assert.equal(matchesProjectPath(inside, null, ['vendor/']), false, 'no project root means no exclusion');
    assert.equal(matchesProjectPath('vendor/lib.js', root, ['vendor/'], root), true, 'relative paths resolve against baseDir');
  } finally {
    cleanup(root);
  }
});
