#!/usr/bin/env node
'use strict';

/**
 * baseline.js
 * Baseline / ratchet support for the governance report.
 *
 * Brownfield repos adopt CI enforcement by recording current violations in a
 * committed baseline file, then failing only on NEW or WORSENED violations:
 *
 *   - fileLength (ratchet): a baselined file stays legacy-allowed only while
 *     its current line count is <= the count recorded at baseline time;
 *     growth makes it a fresh violation again.
 *   - secrets: a hit is legacy only when (file, label, contextHash) matches.
 *     contextHash is a sha256 of the TRIMMED matched line - line numbers
 *     drift, content fingerprints survive moves. Raw secret text is NEVER
 *     stored in the baseline (hash + pattern label + file only).
 */

const crypto = require('crypto');
const fs     = require('fs');

const BASELINE_KIND    = 'code-warden/baseline';
const SCHEMA_VERSION   = 1;
const DEFAULT_BASELINE = '.code-warden-baseline.json';

const slash = f => String(f).replace(/\\/g, '/');

/**
 * Fingerprint a matched source line. Trimmed so indentation changes and
 * CRLF/LF differences do not invalidate the baseline entry.
 *
 * @param {string} lineText
 * @returns {string} hex sha256 digest
 */
function hashLine(lineText) {
  return crypto.createHash('sha256').update(String(lineText).trim(), 'utf8').digest('hex');
}

/**
 * Build a baseline document from runScans() output.
 *
 * @param {{ fileLength: { details?: object[] }, secrets: { details?: object[] } }} scans
 * @returns {object} Baseline document (schemaVersion 1)
 */
function createBaseline(scans) {
  return {
    schemaVersion: SCHEMA_VERSION,
    kind:          BASELINE_KIND,
    generatedAt:   new Date().toISOString(),
    fileLength: (scans.fileLength.details || []).map(d => ({
      file:  slash(d.file),
      lines: d.lines,
    })),
    secrets: (scans.secrets.details || []).map(d => ({
      file:        slash(d.file),
      label:       d.pattern,
      contextHash: d.contextHash,
    })),
  };
}

/**
 * Load and validate a baseline file. Throws with a clear message when the
 * file is missing or not a code-warden baseline - silently ignoring a bad
 * baseline would fake a gate.
 *
 * @param {string} baselinePath
 * @returns {object} Parsed baseline document
 */
function loadBaseline(baselinePath) {
  if (!fs.existsSync(baselinePath)) {
    throw new Error(`baseline file not found: ${baselinePath} (generate one with --write-baseline)`);
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  } catch (err) {
    throw new Error(`baseline file could not be parsed: ${baselinePath} (${err.message})`);
  }
  if (!parsed || parsed.kind !== BASELINE_KIND || parsed.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`not a code-warden baseline (kind=${parsed && parsed.kind}, ` +
      `schemaVersion=${parsed && parsed.schemaVersion}): ${baselinePath}`);
  }
  return parsed;
}

/**
 * Partition scan violations into legacy (covered by the baseline) and fresh.
 *
 * @param {{ fileLength: { details?: object[] }, secrets: { details?: object[] } }} scans
 * @param {object} baseline - Document from loadBaseline()/createBaseline()
 * @returns {{ fileLength: { fresh: object[], legacy: object[] },
 *             secrets:    { fresh: object[], legacy: object[] } }}
 */
function applyBaseline(scans, baseline) {
  const allowedLines  = new Map((baseline.fileLength || []).map(e => [slash(e.file), e.lines]));
  const legacySecrets = new Set((baseline.secrets || []).map(e => secretKey(e.file, e.label, e.contextHash)));

  const fileLength = { fresh: [], legacy: [] };
  for (const d of scans.fileLength.details || []) {
    const allowed = allowedLines.get(slash(d.file));
    const isLegacy = typeof allowed === 'number' && d.lines <= allowed; // ratchet
    (isLegacy ? fileLength.legacy : fileLength.fresh).push(d);
  }

  const secrets = { fresh: [], legacy: [] };
  for (const d of scans.secrets.details || []) {
    const isLegacy = legacySecrets.has(secretKey(d.file, d.pattern, d.contextHash));
    (isLegacy ? secrets.legacy : secrets.fresh).push(d);
  }

  return { fileLength, secrets };
}

function secretKey(file, label, contextHash) {
  // NUL separators cannot occur in paths or pattern labels, so keys stay
  // collision-free even though labels contain spaces.
  return `${slash(file)}\u0000${label}\u0000${contextHash}`;
}

/**
 * Rebuild the fileLength/secrets check objects so only FRESH violations gate
 * the result. `details` keeps fresh-only entries - the SARIF formatter
 * consumes `details`, so legacy noise never reaches Code Scanning.
 * `legacyDetails` carries the baselined remainder for transparency.
 *
 * @param {object} scans - runScans() output
 * @param {object} baseline - Loaded baseline document
 * @returns {{ fileLength: object, secrets: object,
 *             legacy: { fileLength: number, secrets: number } }}
 */
function applyBaselineToChecks(scans, baseline) {
  const parts   = applyBaseline(scans, baseline);
  const rebuild = (check, { fresh, legacy }) => ({
    status:           fresh.length === 0 ? 'pass' : 'fail',
    filesScanned:     check.filesScanned,
    violations:       fresh.length,
    legacyViolations: legacy.length,
    details:          fresh.length  > 0 ? fresh  : undefined,
    legacyDetails:    legacy.length > 0 ? legacy : undefined,
  });
  return {
    fileLength: rebuild(scans.fileLength, parts.fileLength),
    secrets:    rebuild(scans.secrets, parts.secrets),
    legacy: {
      fileLength: parts.fileLength.legacy.length,
      secrets:    parts.secrets.legacy.length,
    },
  };
}

module.exports = {
  createBaseline, loadBaseline, applyBaseline, applyBaselineToChecks,
  hashLine, BASELINE_KIND, SCHEMA_VERSION, DEFAULT_BASELINE,
};
