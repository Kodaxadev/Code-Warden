#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const path          = require('path');

const ROOT = path.join(__dirname, '..');

const COMMANDS = {
  init:    { desc: 'Install Code-Warden to detected AI runtimes', run: ['install.js', '--all'] },
  doctor:  { desc: 'Verify source integrity and install health',  run: ['install.js', '--doctor'] },
  report:  { desc: 'Generate governance report (.code-warden-report.json)', run: ['tools/governance-report.js', '.'] },
  receipt: { desc: 'Create or validate governance receipt artifacts', run: ['tools/receipt.js'] },
  scope:   { desc: 'Manage the scope lock (.code-warden/scope.json)',  run: ['tools/scope.js'] },
  references: { desc: 'Recommend governance references for paths', run: ['tools/select-references.js'] },
  'smoke-npx': { desc: 'Smoke-test npm package from a clean temp directory', run: ['tools/smoke-npx.js'] },
  list:    { desc: 'Show detected AI runtimes',                   run: ['install.js', '--list'] },
};

const HOOK_TARGETS = ['claude', 'codex', 'git'];

function usage() {
  console.log('Usage: code-warden <command> [options]\n');
  console.log('Commands:');
  for (const [name, { desc }] of Object.entries(COMMANDS)) {
    console.log(`  ${name.padEnd(22)} ${desc}`);
  }
  console.log(`  ${'hooks <target>'.padEnd(22)} Install enforcement hooks (${HOOK_TARGETS.join(', ')})`);
  console.log(`  ${''.padEnd(22)} claude/codex are per-user; git is per-repo (run from the repo)`);
  console.log(`  ${'uninstall-hooks <target>'.padEnd(22)} Remove enforcement hooks`);
  console.log(`  ${'verify <target>'.padEnd(22)} Strict health check for one runtime`);
  console.log(`\nExamples:`);
  console.log(`  npx code-warden init`);
  console.log(`  npx code-warden doctor`);
  console.log(`  npx code-warden verify codex`);
  console.log(`  npx code-warden report`);
  console.log(`  npx code-warden report --format=md`);
  console.log(`  npx code-warden report --format=sarif --out=code-warden.sarif`);
  console.log(`  npx code-warden receipt --template --out=code-warden-receipt.json`);
  console.log(`  npx code-warden receipt --from-audit --out=code-warden-receipt.json`);
  console.log(`  npx code-warden receipt --validate=code-warden-receipt.json`);
  console.log(`  npx code-warden scope set --goal="Fix auth bug" src/ lib/utils.js`);
  console.log(`  npx code-warden scope add src/middleware.js`);
  console.log(`  npx code-warden scope status`);
  console.log(`  npx code-warden references README.md code-warden/tools/`);
  console.log(`  npx code-warden smoke-npx --package=code-warden@latest`);
  console.log(`  npx code-warden hooks claude`);
  console.log(`  npx code-warden hooks codex`);
  console.log(`  npx code-warden hooks git        # pre-commit backstop for the repo at cwd`);
  console.log(`  npx code-warden report --write-baseline`);
  console.log(`  npx code-warden report --baseline`);
}

function run(scriptPath, args) {
  const result = spawnSync(process.execPath, [path.join(ROOT, scriptPath), ...args], {
    stdio: 'inherit',
    cwd: process.cwd(),
  });
  process.exit(result.status ?? 1);
}

const args = process.argv.slice(2);
const command = args[0];
const rest = args.slice(1);

if (!command || command === '--help' || command === '-h') {
  usage();
  process.exit(0);
}

if (command === '--version' || command === '-v') {
  const pkg = require(path.join(ROOT, 'package.json'));
  console.log(pkg.version);
  process.exit(0);
}

if (COMMANDS[command]) {
  const entry = COMMANDS[command];
  const scriptArgs = [...entry.run.slice(1), ...rest];
  run(entry.run[0], scriptArgs);
}

if (command === 'hooks') {
  const target = rest[0];
  if (!target || !HOOK_TARGETS.includes(target)) {
    console.error(`Usage: code-warden hooks <${HOOK_TARGETS.join('|')}>`);
    process.exit(1);
  }
  run('install.js', [`--hooks=${target}`]);
}

if (command === 'uninstall-hooks') {
  const target = rest[0];
  if (!target || !HOOK_TARGETS.includes(target)) {
    console.error(`Usage: code-warden uninstall-hooks <${HOOK_TARGETS.join('|')}>`);
    process.exit(1);
  }
  run('install.js', [`--uninstall-hooks=${target}`]);
}

if (command === 'verify') {
  const target = rest[0];
  if (!target) {
    console.error('Usage: code-warden verify <target>');
    process.exit(1);
  }
  run('install.js', [`--verify-target=${target}`]);
}

console.error(`Unknown command: ${command}\n`);
usage();
process.exit(1);
