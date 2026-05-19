#!/usr/bin/env node
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');

test('reference selector: recommends focused references from paths', () => {
  const { selectReferences } = require('../lib/reference-selector');

  const result = selectReferences([
    'README.md',
    'code-warden/tools/verify-secrets.js',
    'mcp/github-server.json',
  ]);

  assert.deepEqual(result.references, [
    'references/operations.md',
    'references/safety.md',
    'references/mcp-governance.md',
  ]);
});

test('reference selector: falls back to planning and operations with no paths', () => {
  const { selectReferences } = require('../lib/reference-selector');
  const result = selectReferences([]);

  assert.deepEqual(result.references, [
    'references/planning-gates.md',
    'references/operations.md',
  ]);
});

test('code-warden references: prints recommended reference files', () => {
  const result = spawnSync(process.execPath, [
    path.join(ROOT, 'bin', 'code-warden.js'),
    'references',
    'code-warden/templates/ci/github-actions.yml',
    'code-warden/references/mcp-governance.md',
  ], { encoding: 'utf8', cwd: ROOT });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /references\/operations\.md/);
  assert.match(result.stdout, /references\/mcp-governance\.md/);
  assert.match(result.stdout, /references\/research-and-fit\.md/);
});
