#!/usr/bin/env node
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  enableHooksFeature,
  enableHooksInConfigText,
  getCodexHookRepairHint,
  inspectHookEntries,
  inspectHooksFeature,
} = require('../lib/codex-config');

test('codex config: appends features table when config is empty', () => {
  assert.equal(enableHooksInConfigText(''), '[features]\nhooks = true\n');
});

test('codex config: enables hooks in existing features table', () => {
  const input = [
    'model = "gpt-5.5"',
    '',
    '[features]',
    'memories = true',
    '',
    '[windows]',
    'sandbox = "elevated"',
    '',
  ].join('\n');

  assert.match(enableHooksInConfigText(input), /\[features\]\nhooks = true\nmemories = true/);
});

test('codex config: replaces disabled hooks and removes deprecated key', () => {
  const output = enableHooksInConfigText([
    '[features]',
    'codex_hooks = true',
    'hooks = false',
    'memories = true',
    '',
  ].join('\n'));

  assert.match(output, /hooks = true/);
  assert.doesNotMatch(output, /codex_hooks/);
});

test('codex config: writes and inspects enabled hooks feature', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-codex-config-'));
  const configPath = path.join(dir, 'config.toml');

  try {
    fs.writeFileSync(configPath, '[features]\ncodex_hooks = true\n', 'utf8');
    const result = enableHooksFeature(configPath);
    const inspected = inspectHooksFeature(configPath);

    assert.equal(result.enabled, true);
    assert.equal(inspected.enabled, true);
    assert.equal(inspected.deprecated, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('codex config: inspects registered code-warden hook entries', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-codex-hooks-'));
  const hooksPath = path.join(dir, 'hooks.json');

  try {
    fs.writeFileSync(hooksPath, JSON.stringify({
      PreToolUse: [
        { description: 'other hook', args: ['ignored.js'] },
        { description: 'code-warden: bash secrets gate', args: ['hook.js'] },
      ],
    }), 'utf8');

    const result = inspectHookEntries(hooksPath);
    assert.equal(result.exists, true);
    assert.equal(result.entries.length, 1);
    assert.equal(result.entries[0].args[0], 'hook.js');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('codex config: suggests repair command for partial hook setup', () => {
  const hint = getCodexHookRepairHint({
    entries: [{ args: ['missing-hook.js'] }],
    missingScripts: ['missing-hook.js'],
    config: { enabled: false, deprecated: true },
  });

  assert.match(hint, /code-warden hooks codex/);
  assert.match(hint, /deprecated codex_hooks/);
  assert.match(hint, /missing hook script/);
});
