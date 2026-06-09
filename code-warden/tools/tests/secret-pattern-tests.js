#!/usr/bin/env node
'use strict';

/**
 * secret-pattern-tests.js
 * Behavioral tests for the expanded secret pattern set and the all-matches
 * scanner (scanForAllSecrets).
 *
 * Fixture strategy: every fake credential is built via string concatenation
 * (prefix + repeat) so this source file never contains a contiguous string
 * that the repo's own scanners would flag.
 */

const { test } = require('node:test');
const assert   = require('node:assert/strict');

const { SECRET_PATTERNS, scanForSecrets, scanForAllSecrets } =
  require('../lib/secret-patterns');

// ---------------------------------------------------------------------------
// Fake credential builders — concatenation only, never contiguous literals
// ---------------------------------------------------------------------------

const fakeAnthropic = () => 'sk-ant-' + 'a'.repeat(40);
const fakeOpenAI    = () => 'sk-'     + 'a'.repeat(48);
const fakeGoogle    = () => 'AIza'    + '0'.repeat(35);
const fakeGitLab    = () => 'glpat-'  + 'x'.repeat(20);
const fakeNpm       = () => 'npm_'    + 'a'.repeat(36);
const fakeHf        = () => 'hf_'     + 'B'.repeat(30);
const fakeAws       = () => 'AKIA'    + 'B'.repeat(16);
const fakeJwt       = () =>
  ['eyJ' + 'a'.repeat(12), 'eyJ' + 'b'.repeat(12), 'c'.repeat(12)].join('.');

const wrap = (value) => `const token = '${value}';\n`;

// ---------------------------------------------------------------------------
// New pattern positives
// ---------------------------------------------------------------------------

test('secret patterns: Anthropic API key detected with correct label', () => {
  const hit = scanForSecrets(wrap(fakeAnthropic()));
  assert.ok(hit, 'expected a hit for an Anthropic-style key');
  assert.equal(hit.label, 'Anthropic API key');
});

test('secret patterns: Google API key detected', () => {
  const hit = scanForSecrets(wrap(fakeGoogle()));
  assert.ok(hit, 'expected a hit for a Google API key');
  assert.equal(hit.label, 'Google API key');
});

test('secret patterns: GitLab PAT detected', () => {
  const hit = scanForSecrets(wrap(fakeGitLab()));
  assert.ok(hit, 'expected a hit for a GitLab PAT');
  assert.equal(hit.label, 'GitLab PAT');
});

test('secret patterns: npm token detected', () => {
  const hit = scanForSecrets(wrap(fakeNpm()));
  assert.ok(hit, 'expected a hit for an npm token');
  assert.equal(hit.label, 'npm token');
});

test('secret patterns: Hugging Face token detected', () => {
  const hit = scanForSecrets(wrap(fakeHf()));
  assert.ok(hit, 'expected a hit for a Hugging Face token');
  assert.equal(hit.label, 'Hugging Face token');
});

test('secret patterns: three-segment JWT detected', () => {
  const hit = scanForSecrets(wrap(fakeJwt()));
  assert.ok(hit, 'expected a hit for a three-segment JWT');
  assert.equal(hit.label, 'JWT');
});

// ---------------------------------------------------------------------------
// Negatives — shapes that must NOT match
// ---------------------------------------------------------------------------

test('secret patterns: short or partial token shapes do not match', () => {
  const negatives = [
    'AIza'   + '0'.repeat(34),                       // Google: one char short
    'glpat-' + 'x'.repeat(19),                       // GitLab: one char short
    'npm_'   + 'a'.repeat(35),                       // npm: one char short
    'hf_'    + 'B'.repeat(29),                       // HF: one char short
    'eyJ' + 'a'.repeat(12) + '.eyJ' + 'b'.repeat(12), // JWT: two segments only
    'sk-ant-' + 'a'.repeat(10),                      // Anthropic: too short
  ];
  for (const value of negatives) {
    assert.equal(scanForSecrets(wrap(value)), null, `expected no hit for: ${value.slice(0, 12)}...`);
  }
});

// ---------------------------------------------------------------------------
// Regression: sk-ant- keys were invisible to the OpenAI pattern shape
// ---------------------------------------------------------------------------

test('regression: old OpenAI pattern shape never matched sk-ant- keys', () => {
  // The pre-fix scanner only had this shape; the hyphen in sk-ant- breaks
  // the [A-Za-z0-9] run, so Anthropic keys passed the scan undetected.
  const oldOpenAiShape = new RegExp('\\bsk-[A-Za-z0-9]{32,}\\b');
  assert.equal(oldOpenAiShape.test(fakeAnthropic()), false,
    'old pattern matching sk-ant- would invalidate this regression test');
  const hit = scanForSecrets(wrap(fakeAnthropic()));
  assert.equal(hit.label, 'Anthropic API key', 'new pattern must catch sk-ant- keys');
});

test('regression: plain OpenAI keys still labeled OpenAI', () => {
  const hit = scanForSecrets(wrap(fakeOpenAI()));
  assert.equal(hit.label, 'OpenAI key');
});

// ---------------------------------------------------------------------------
// scanForAllSecrets — ordering, dedupe, parity, non-mutation
// ---------------------------------------------------------------------------

test('scanForAllSecrets: returns all matches ordered by position', () => {
  // Google key on line 2, AWS key on line 4. AWS precedes Google in the
  // pattern list, so position ordering (not pattern ordering) is proven.
  const content = [
    '// fixture',
    `const g = '${fakeGoogle()}';`,
    '// middle',
    `const a = '${fakeAws()}';`,
  ].join('\n');

  const hits = scanForAllSecrets(content);
  assert.equal(hits.length, 2, 'expected both secrets reported');
  assert.deepEqual(hits.map(h => h.label), ['Google API key', 'AWS access key']);
  assert.deepEqual(hits.map(h => h.line), [2, 4]);
});

test('scanForAllSecrets: single hit reported exactly once', () => {
  const hits = scanForAllSecrets(wrap(fakeNpm()));
  assert.equal(hits.length, 1);
  assert.deepEqual(hits[0], { label: 'npm token', line: 1, column: 16 });
});

test('scanForAllSecrets: agrees with scanForSecrets for single-hit content', () => {
  const content = `// header\nconst k = '${fakeGitLab()}';\n`;
  const first = scanForSecrets(content);
  const all   = scanForAllSecrets(content);
  assert.equal(all.length, 1);
  assert.deepEqual(all[0], first);
});

test('scanForAllSecrets: never mutates the shared pattern objects', () => {
  const before = SECRET_PATTERNS.map(p => `${p.re.source}|${p.re.flags}|${p.re.lastIndex}`);
  scanForAllSecrets(wrap(fakeAws()) + wrap(fakeJwt()));
  const after = SECRET_PATTERNS.map(p => `${p.re.source}|${p.re.flags}|${p.re.lastIndex}`);
  assert.deepEqual(after, before, 'shared regexes must stay untouched');
});

test('scanForAllSecrets: empty and non-string input returns empty array', () => {
  assert.deepEqual(scanForAllSecrets(''), []);
  assert.deepEqual(scanForAllSecrets(null), []);
  assert.deepEqual(scanForAllSecrets(undefined), []);
});
