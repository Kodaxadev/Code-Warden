'use strict';

/**
 * scan-core.js
 * Single-pass file length + secrets scan shared by governance-report.js (CI)
 * and warden-stop-hook.js (Stop verification). Extracted so the Stop hook can
 * run the exact same checks in-process - no child process, no behavioral
 * tests, no git - and stay fast enough for an end-of-turn gate.
 */

const fs   = require('fs');
const path = require('path');

const { countLines }        = require('./line-count');
const { collectFiles }      = require('./file-collection');
const { scanForAllSecrets } = require('./secret-patterns');
const { loadConfig }        = require('./config');
const { matchesAnyPrefix }  = require('./path-match');
const { hashLine }          = require('./baseline');

/**
 * Scan a file or directory for file-length and hardcoded-credential
 * violations, honouring lint.exclude_paths and secrets.allowlist.
 *
 * @param {string} scanPath - File or directory to scan
 * @param {string} [configPath] - Explicit codewarden.json override
 * @param {string} [startDir] - Enables project config discovery from this
 *   dir (hooks pass the governed root; the CI report passes nothing so its
 *   --config= / skill-default precedence is unchanged)
 * @returns {{ fileLength: object, secrets: object }} Check objects in the
 *   governance-report shape ({ status, filesScanned, violations, details? })
 * @throws {Error} When scanPath does not exist
 */
function runScans(scanPath, configPath, startDir) {
  const { maxFileLength, lintExcludePaths, secretsAllowlist } =
    loadConfig(configPath, startDir);
  const resolved = path.resolve(scanPath);

  if (!fs.existsSync(resolved)) {
    throw new Error(`scan path not found: ${scanPath}`);
  }

  const files = [];
  const scanRootIsDirectory = fs.statSync(resolved).isDirectory();
  if (scanRootIsDirectory) {
    collectFiles(resolved, files);
  } else {
    files.push(resolved);
  }

  const lengthViolations = [];
  const secretViolations = [];

  for (const f of files) {
    let content;
    try { content = fs.readFileSync(f, 'utf8'); } catch { continue; }

    const rel = scanRootIsDirectory ? path.relative(resolved, f) : path.basename(f);

    if (!matchesAnyPrefix(rel, lintExcludePaths)) {
      const lineCount = countLines(content);
      if (lineCount > maxFileLength) {
        lengthViolations.push({ file: rel, lines: lineCount, limit: maxFileLength });
      }
    }

    if (!matchesAnyPrefix(rel, secretsAllowlist)) {
      const hits = scanForAllSecrets(content);
      if (hits.length > 0) {
        // Split matches locationForIndex() in secret-patterns ('\n' only);
        // hashLine() trims, so stray '\r' never affects the fingerprint.
        const sourceLines = content.split('\n');
        for (const hit of hits) {
          secretViolations.push({
            file: rel, pattern: hit.label, line: hit.line, column: hit.column,
            // Content fingerprint of the matched line for baseline matching.
            // Never the raw text - line numbers drift, hashes survive moves.
            contextHash: hashLine(sourceLines[hit.line - 1] || ''),
          });
        }
      }
    }
  }

  return {
    fileLength: {
      status: lengthViolations.length === 0 ? 'pass' : 'fail',
      filesScanned: files.length,
      violations: lengthViolations.length,
      details: lengthViolations.length > 0 ? lengthViolations : undefined,
    },
    secrets: {
      status: secretViolations.length === 0 ? 'pass' : 'fail',
      filesScanned: files.length,
      violations: secretViolations.length,
      details: secretViolations.length > 0 ? secretViolations : undefined,
    },
  };
}

module.exports = { runScans };
