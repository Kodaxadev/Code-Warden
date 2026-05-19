#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function usage() {
  console.log([
    'Usage: code-warden smoke-npx [--package=<spec>]',
    '',
    'Runs an external smoke test from a clean temp directory:',
    '  1. npx <package> --version',
    '  2. npx <package> report --format=json',
    '',
    'Default package spec: code-warden@latest',
  ].join('\n'));
}

function parseArgs(argv) {
  const args = argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const packageArg = args.find(arg => arg.startsWith('--package='));
  return {
    help: false,
    packageSpec: packageArg ? packageArg.slice('--package='.length) : 'code-warden@latest',
  };
}

function runNpx(cwd, packageSpec, args) {
  if (!/^[A-Za-z0-9@/_.,:=+-]+$/.test(packageSpec)) {
    return { code: 1, stdout: '', stderr: `Unsafe package spec: ${packageSpec}` };
  }

  const tokens = ['npx', '--yes', packageSpec, ...args];
  if (!tokens.every(token => /^[A-Za-z0-9@/_.,:=+-]+$/.test(token))) {
    return { code: 1, stdout: '', stderr: 'Unsafe npx argument' };
  }

  const command = process.platform === 'win32' ? 'cmd.exe' : 'npx';
  const commandArgs = process.platform === 'win32'
    ? ['/d', '/s', '/c', tokens.join(' ')]
    : ['--yes', packageSpec, ...args];

  const result = spawnSync(command, commandArgs, {
    cwd,
    encoding: 'utf8',
    timeout: 120000,
  });
  return {
    code: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error,
  };
}

function assertStep(name, result) {
  if (result.code !== 0) {
    console.error(`[FAIL] ${name}`);
    if (result.error) console.error(result.error.message);
    if (result.stdout.trim()) console.error(result.stdout.trim());
    if (result.stderr.trim()) console.error(result.stderr.trim());
    process.exit(result.code);
  }
  console.log(`[PASS] ${name}`);
}

function main() {
  const { help, packageSpec } = parseArgs(process.argv);
  if (help) {
    usage();
    return;
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'code-warden-npx-smoke-'));
  try {
    const version = runNpx(tmp, packageSpec, ['--version']);
    assertStep(`${packageSpec} --version`, version);
    console.log(version.stdout.trim());

    const report = runNpx(tmp, packageSpec, ['report', '--format=json']);
    assertStep(`${packageSpec} report --format=json`, report);

    const parsed = JSON.parse(report.stdout);
    if (parsed.tool !== 'code-warden' || parsed.result !== 'pass') {
      console.error('[FAIL] governance report did not return a passing code-warden result');
      console.error(JSON.stringify(parsed, null, 2));
      process.exit(1);
    }
    console.log('[PASS] governance report JSON parsed and passed');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main();
