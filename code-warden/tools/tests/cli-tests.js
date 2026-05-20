#!/usr/bin/env node
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const CLI = path.join(ROOT, 'bin', 'code-warden.js');

function runCli(args) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
  });
}

test('code-warden CLI help: documents strict target verification', () => {
  const result = runCli(['--help']);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /verify <target>/);
  assert.match(result.stdout, /smoke-npx/);
  assert.match(result.stdout, /npx code-warden verify codex/);
  assert.match(result.stdout, /npx code-warden smoke-npx --package=code-warden@latest/);
});

test('code-warden CLI verify: requires a target argument', () => {
  const result = runCli(['verify']);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage: code-warden verify <target>/);
});
