#!/usr/bin/env node
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');

function writeTmpConfig(value) {
  const file = path.join(os.tmpdir(), `cw-risk-${process.pid}-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
  return file;
}

function runReport(args = [], options = {}) {
  const env = { ...process.env };
  if (options.skipBehavioralTests !== false) env.CODE_WARDEN_SKIP_BEHAVIORAL_TESTS = '1';
  Object.assign(env, options.env || {});

  const result = spawnSync(
    process.execPath,
    [path.join(ROOT, 'tools', 'governance-report.js'), '.', ...args],
    {
      cwd: ROOT,
      encoding: 'utf8',
      env,
    }
  );
  return { code: result.status ?? result.signal, stdout: result.stdout || '', stderr: result.stderr || '' };
}

test('risk policy: loads default tiers and classifies governed actions', () => {
  const { loadRiskPolicy } = require('../lib/risk-policy');
  const policy = loadRiskPolicy();

  assert.equal(policy.status, 'pass');
  assert.equal(policy.actions.read_only.tier, 'low');
  assert.equal(policy.actions.file_edit.tier, 'medium');
  assert.equal(policy.actions.dependency_change.tier, 'high');
  assert.equal(policy.actions.secret_exposure.tier, 'blocked');
});

test('risk policy: invalid configured action tier fails validation', () => {
  const config = writeTmpConfig({
    risk_policy: {
      actions: {
        release_publish: { tier: 'urgent' },
      },
    },
  });
  try {
    const { loadRiskPolicy } = require('../lib/risk-policy');
    const policy = loadRiskPolicy(config);
    assert.equal(policy.status, 'fail');
    assert.match(policy.errors.join('\n'), /release_publish/);
    assert.match(policy.errors.join('\n'), /urgent/);
  } finally {
    fs.rmSync(config, { force: true });
  }
});

test('governance report: includes risk policy evidence in JSON output', () => {
  const { code, stdout } = runReport(['--format=json']);
  assert.equal(code, 0, stderrMessage(stdout));

  const report = JSON.parse(stdout);
  assert.equal(report.checks.riskPolicy.status, 'pass');
  assert.equal(report.governance.riskPolicy.actions.release_publish.tier, 'high');
  assert.equal(report.governance.riskPolicy.actions.destructive_command.tier, 'blocked');
});

test('governance report: aggregates split behavioral test suites', () => {
  const script = path.join(os.tmpdir(), `cw-test-script-${process.pid}.js`);
  fs.writeFileSync(script, [
    "console.log('ℹ pass 17');",
    "console.log('ℹ fail 0');",
    "console.log('ℹ pass 3');",
    "console.log('ℹ fail 0');",
  ].join('\n'));

  const { code, stdout } = runReport(['--format=json'], {
    skipBehavioralTests: false,
    env: { CODE_WARDEN_TEST_SCRIPT: script },
  });
  fs.rmSync(script, { force: true });
  assert.equal(code, 0, stderrMessage(stdout));

  const report = JSON.parse(stdout);
  assert.equal(report.checks.behavioralTests.tests, 20);
  assert.equal(report.checks.behavioralTests.failures, 0);
});

function stderrMessage(stdout) {
  return `expected report to pass, got stdout: ${stdout}`;
}
