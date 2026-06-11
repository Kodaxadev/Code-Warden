#!/usr/bin/env node
'use strict';

/**
 * git-hook-tests.js
 * Behavioral tests for the git backstop hooks:
 *   - install-hooks.js     (marker create/append/replace, core.hooksPath)
 *   - uninstall-hooks.js   (block removal, empty-file deletion, no-op)
 *   - warden-pre-commit.js (staged-content scan with exclude/allowlist parity)
 *
 * Every repo is a throwaway `git init` under os.tmpdir(); this project's own
 * .git/hooks is NEVER touched. Merge/strip semantics are covered by pure
 * functions (no git needed); repo-backed cases skip with a clear message
 * when git is unavailable on the test machine.
 */

const { test } = require('node:test');
const assert        = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path          = require('node:path');
const fs            = require('node:fs');
const os            = require('node:os');

const installer          = require('../hooks/git/install-hooks');
const { uninstallHooks } = require('../hooks/git/uninstall-hooks');
const { MARKER_START, MARKER_END } = installer;

const PRE_COMMIT_SCRIPT = path.join(__dirname, '..', 'hooks', 'git', 'warden-pre-commit.js');

const HAS_GIT = spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0;
const SKIP_GIT = HAS_GIT ? false : 'SKIP: git not available on this machine';

// ---------------------------------------------------------------------------
// Fixture helpers — fake secrets built from parts, never contiguous literals
// ---------------------------------------------------------------------------

const makeFakeSecret = (c = 'g') => ['sk', '-', c.repeat(48)].join('');
const makeLines = n => Array.from({ length: n }, (_, i) => `const l${i + 1} = ${i + 1};`).join('\n') + '\n';

function git(args, cwd) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout.trim();
}

function makeRepo() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), `cw-git-${process.pid}-`));
  git(['init', '-q'], repo);
  git(['config', 'user.email', 'warden-tests@example.com'], repo);
  git(['config', 'user.name', 'Warden Tests'], repo);
  git(['config', 'commit.gpgsign', 'false'], repo);
  return repo;
}

const cleanup = repo => fs.rmSync(repo, { recursive: true, force: true, maxRetries: 3 });

function stage(repo, rel, content) {
  const abs = path.join(repo, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf8');
  git(['add', rel], repo);
}

function runPreCommit(repo) {
  return spawnSync(process.execPath, [PRE_COMMIT_SCRIPT], { cwd: repo, encoding: 'utf8' });
}

// ---------------------------------------------------------------------------
// Merge / strip semantics (pure functions, no git required)
// ---------------------------------------------------------------------------

test('merge: no existing hook creates shebang + marker block', () => {
  const merged = installer.mergePreCommitContent(null, installer.buildBlock('/x/warden-pre-commit.js'));
  assert.ok(merged.startsWith('#!/bin/sh\n'));
  assert.ok(merged.includes(MARKER_START) && merged.includes(MARKER_END));
  assert.ok(merged.includes('node "/x/warden-pre-commit.js" || exit $?'));
  assert.ok(merged.endsWith('\n'));
});

test('merge: existing hook without markers is appended, content preserved', () => {
  const existing = '#!/bin/sh\necho custom-check'; // note: no trailing newline
  const merged = installer.mergePreCommitContent(existing, installer.buildBlock('/x/w.js'));
  assert.ok(merged.startsWith('#!/bin/sh\necho custom-check\n'), 'trailing newline ensured before append');
  assert.ok(merged.indexOf(MARKER_START) > merged.indexOf('echo custom-check'));
});

test('merge: existing markers are replaced in place, surroundings kept', () => {
  const before = `#!/bin/sh\necho before\n${installer.buildBlock('/old/path.js')}\necho after\n`;
  const merged = installer.mergePreCommitContent(before, installer.buildBlock('/new/path.js'));
  assert.ok(merged.includes('echo before') && merged.includes('echo after'));
  assert.ok(merged.includes('/new/path.js') && !merged.includes('/old/path.js'));
  assert.equal(merged.split(MARKER_START).length - 1, 1, 'exactly one block after re-install');
});

test('strip: removes block; detects empty-apart-from-shebang', () => {
  const fresh = installer.mergePreCommitContent(null, installer.buildBlock('/x/w.js'));
  const s1 = installer.stripPreCommitContent(fresh);
  assert.equal(s1.removed, true);
  assert.equal(s1.emptyApartFromShebang, true, 'only the shebang remains');

  const mixed = installer.mergePreCommitContent('#!/bin/sh\necho keep\n', installer.buildBlock('/x/w.js'));
  const s2 = installer.stripPreCommitContent(mixed);
  assert.equal(s2.removed, true);
  assert.equal(s2.emptyApartFromShebang, false);
  assert.ok(s2.content.includes('echo keep') && !s2.content.includes(MARKER_START));

  const s3 = installer.stripPreCommitContent('#!/bin/sh\necho none\n');
  assert.equal(s3.removed, false, 'no markers means nothing to strip');
});

// ---------------------------------------------------------------------------
// Installer round-trip in a throwaway repo
// ---------------------------------------------------------------------------

test('install/uninstall: fresh repo round-trip', { skip: SKIP_GIT }, () => {
  const repo = makeRepo();
  try {
    const pc = installer.installHooks(null, repo);
    assert.equal(pc, path.join(repo, '.git', 'hooks', 'pre-commit'));
    const content = fs.readFileSync(pc, 'utf8');
    assert.ok(content.startsWith('#!/bin/sh\n'));
    assert.ok(!/node "[^"]*\\/.test(content), 'embedded path must use forward slashes');

    const state = installer.inspectPreCommit(repo);
    assert.equal(state.hasBlock, true);
    assert.equal(state.scriptExists, true, `embedded script must exist: ${state.scriptPath}`);

    // Re-install is idempotent: still exactly one block
    installer.installHooks(null, repo);
    const again = fs.readFileSync(pc, 'utf8');
    assert.equal(again.split(MARKER_START).length - 1, 1);

    // Uninstall deletes the file when only the shebang would remain
    assert.equal(uninstallHooks(repo), true);
    assert.equal(fs.existsSync(pc), false);
    assert.equal(uninstallHooks(repo), false, 'second uninstall is a no-op');
  } finally {
    cleanup(repo);
  }
});

test('install/uninstall: preserves a pre-existing user hook', { skip: SKIP_GIT }, () => {
  const repo = makeRepo();
  try {
    const pc = path.join(repo, '.git', 'hooks', 'pre-commit');
    fs.mkdirSync(path.dirname(pc), { recursive: true });
    fs.writeFileSync(pc, '#!/bin/sh\necho user-hook\n', 'utf8');

    installer.installHooks(null, repo);
    const merged = fs.readFileSync(pc, 'utf8');
    assert.ok(merged.includes('echo user-hook') && merged.includes(MARKER_START));

    assert.equal(uninstallHooks(repo), true);
    assert.ok(fs.existsSync(pc), 'user hook file must survive uninstall');
    const rest = fs.readFileSync(pc, 'utf8');
    assert.ok(rest.includes('echo user-hook') && !rest.includes(MARKER_START));
  } finally {
    cleanup(repo);
  }
});

test('install: respects git config core.hooksPath', { skip: SKIP_GIT }, () => {
  const repo = makeRepo();
  try {
    git(['config', 'core.hooksPath', '.githooks'], repo);
    const pc = installer.installHooks(null, repo);
    assert.equal(pc, path.join(repo, '.githooks', 'pre-commit'));
    assert.ok(fs.existsSync(pc));
  } finally {
    cleanup(repo);
  }
});

// ---------------------------------------------------------------------------
// Staged-content scan (warden-pre-commit.js run directly)
// ---------------------------------------------------------------------------

test('pre-commit scan: clean, secret, and staged-vs-working-tree', { skip: SKIP_GIT }, () => {
  const repo = makeRepo();
  try {
    stage(repo, 'src/app.js', "'use strict';\nconst ok = 1;\n");
    const clean = runPreCommit(repo);
    assert.equal(clean.status, 0, clean.stderr);
    assert.match(clean.stdout, /\[PASS\] \[CodeWarden\] Pre-commit gate: 1 staged file\(s\) clean\./);

    // Staged secret blocks
    stage(repo, 'src/creds.js', `const key = '${makeFakeSecret()}';\n`);
    const blocked = runPreCommit(repo);
    assert.equal(blocked.status, 1, 'staged secret must block');
    assert.match(blocked.stderr, /\[FAIL\] \[CodeWarden\] src\/creds\.js:1: OpenAI key detected in staged content/);
    assert.match(blocked.stderr, /Commit blocked/);

    // Fix the STAGED copy; dirty working tree must not matter
    stage(repo, 'src/creds.js', 'const key = process.env.API_KEY;\n');
    fs.writeFileSync(path.join(repo, 'src', 'creds.js'),
      `const key = '${makeFakeSecret()}';\n`, 'utf8'); // working tree only, NOT staged
    const stagedOnly = runPreCommit(repo);
    assert.equal(stagedOnly.status, 0, 'scan must read git show :path, not the working tree');
  } finally {
    cleanup(repo);
  }
});

test('pre-commit scan: config parity (length, exclude_paths, allowlist, skips)', { skip: SKIP_GIT }, () => {
  const repo = makeRepo();
  try {
    fs.writeFileSync(path.join(repo, 'codewarden.json'), JSON.stringify({
      thresholds: { max_file_length: 10 },
      lint:       { exclude_paths: ['vendor/'] },
      secrets:    { allowlist: ['fixtures/'] },
    }, null, 2) + '\n', 'utf8');

    stage(repo, 'vendor/bundle.js', makeLines(40));                       // excluded from length
    stage(repo, 'fixtures/sample.js', `const k = '${makeFakeSecret()}';\n`); // allowlisted secret
    stage(repo, 'package-lock.json', `{"x":"${makeFakeSecret()}"}\n`);    // SKIP_NAMES
    stage(repo, 'logo.png', makeFakeSecret());                            // SKIP_EXTS
    const pass = runPreCommit(repo);
    assert.equal(pass.status, 0, pass.stderr);

    stage(repo, 'src/big.js', makeLines(40)); // not excluded -> length violation
    const blocked = runPreCommit(repo);
    assert.equal(blocked.status, 1);
    assert.match(blocked.stderr, /src\/big\.js: 40 lines exceeds the 10-line limit/);
  } finally {
    cleanup(repo);
  }
});

// ---------------------------------------------------------------------------
// End-to-end: real `git commit` through the installed hook
// ---------------------------------------------------------------------------

test('end-to-end: installed hook blocks a real commit; --no-verify bypasses', { skip: SKIP_GIT }, () => {
  const repo = makeRepo();
  try {
    installer.installHooks(null, repo);

    stage(repo, 'clean.js', "'use strict';\n");
    const ok = spawnSync('git', ['commit', '-q', '-m', 'clean'], { cwd: repo, encoding: 'utf8' });
    assert.equal(ok.status, 0, `clean commit must pass the hook: ${ok.stderr}`);

    stage(repo, 'creds.js', `const key = '${makeFakeSecret()}';\n`);
    const blocked = spawnSync('git', ['commit', '-q', '-m', 'creds'], { cwd: repo, encoding: 'utf8' });
    assert.notEqual(blocked.status, 0, 'commit with staged secret must be blocked');
    assert.match(blocked.stderr + blocked.stdout, /\[FAIL\] \[CodeWarden\]/);

    // Documented escape hatch: --no-verify skips pre-commit entirely
    const bypass = spawnSync('git', ['commit', '-q', '--no-verify', '-m', 'bypass'], { cwd: repo, encoding: 'utf8' });
    assert.equal(bypass.status, 0, `--no-verify must bypass the backstop: ${bypass.stderr}`);
  } finally {
    cleanup(repo);
  }
});
