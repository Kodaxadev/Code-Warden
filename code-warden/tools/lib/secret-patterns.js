#!/usr/bin/env node
'use strict';

/**
 * secret-patterns.js
 * Canonical hardcoded-credential patterns shared across all Code-Warden
 * scanners (CLI and hooks).
 *
 * Previously each consumer defined its own copy, causing drift:
 *   - verify-secrets.js:            gh[housr]_ (separate entries per prefix)
 *   - warden-secrets-hook.js:       gh[pousr]_
 *   - warden-apply-patch-hook.js:   gh[posx]_   ← missed 'u' (refresh tokens)
 *   - warden-bash-hook.js:          gh[posx]_   ← missed 'u' (refresh tokens)
 *
 * This module is the single source of truth. All consumers require() it.
 *
 * Terminology alignment (per v3.1.1 docs):
 *   - This module implements the "hardcoded credential scanner" logic.
 *   - The governance rule that mandates its use is the "zero-trust secrets policy".
 */

/**
 * @typedef {{ label: string, re: RegExp }} SecretPattern
 */

/** @type {SecretPattern[]} */
const SECRET_PATTERNS = [
  { label: 'AWS access key',          re: /\bAKIA[0-9A-Z]{16}\b/ },
  // Anthropic must precede OpenAI: keys share the sk- prefix but the OpenAI
  // pattern's [A-Za-z0-9] run cannot cross the hyphen in sk-ant-.
  { label: 'Anthropic API key',       re: /\bsk-ant-[A-Za-z0-9_\-]{32,}\b/ },
  { label: 'OpenAI key',              re: /\bsk-[A-Za-z0-9]{32,}\b/ },
  { label: 'Google API key',          re: /\bAIza[0-9A-Za-z_\-]{35}\b/ },
  { label: 'GitHub token',            re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/i },
  { label: 'GitLab PAT',              re: /\bglpat-[0-9A-Za-z_\-]{20,}\b/ },
  { label: 'npm token',               re: /\bnpm_[A-Za-z0-9]{36}\b/ },
  { label: 'Hugging Face token',      re: /\bhf_[A-Za-z0-9]{30,}\b/ },
  { label: 'Stripe secret key',       re: /\bsk_(live|test)_[A-Za-z0-9]{24,}\b/ },
  { label: 'Slack token',             re: /\bxox[baprs]-[A-Za-z0-9\-]{10,}\b/ },
  { label: 'SendGrid key',            re: /\bSG\.[A-Za-z0-9_\-.]{20,}\b/ },
  { label: 'Twilio SID',              re: /\bAC[a-f0-9]{32}\b/ },
  // Three-segment form only (header.payload.signature) to limit false positives.
  { label: 'JWT',                     re: /\beyJ[A-Za-z0-9_\-]{10,}\.eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\b/ },
  { label: 'generic API key',         re: /api[_-]?key\s*[:=]\s*['"]?[A-Za-z0-9_\-]{20,}/i },
  { label: 'generic secret key',      re: /secret[_-]?key\s*[:=]\s*['"]?[A-Za-z0-9_\-]{20,}/i },
  { label: 'password assignment',     re: /password\s*[:=]\s*['"][^'"]{8,}['"]/i },
  { label: 'bearer token',            re: /bearer\s+[A-Za-z0-9\-._~+\/]{20,}/i },
  { label: 'private key header',      re: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { label: 'database URL with creds', re: /[a-z][a-z0-9+\-.]*:\/\/[^:@\s]+:[^@\s]{4,}@[^/\s]+\// },
];

/**
 * Scan a content string against all secret patterns.
 *
 * @param {string} content
 * @returns {{ label: string, line: number, column: number } | null} First
 * matching pattern label and location, or null if clean.
 */
function scanForSecrets(content) {
  if (typeof content !== 'string' || content.length === 0) return null;
  for (const { label, re } of SECRET_PATTERNS) {
    re.lastIndex = 0;
    const match = re.exec(content);
    if (!match) continue;
    return { label, ...locationForIndex(content, match.index) };
  }
  return null;
}

/**
 * Scan a content string and return every match across every pattern.
 *
 * Patterns are cloned with the global flag internally so the shared
 * SECRET_PATTERNS regexes are never mutated. Exact duplicate findings
 * (same label, line, and column) are deduped.
 *
 * @param {string} content
 * @returns {{ label: string, line: number, column: number }[]} All matches,
 * ordered by position in the content (pattern-list order breaks ties).
 */
function scanForAllSecrets(content) {
  if (typeof content !== 'string' || content.length === 0) return [];
  const hits = [];
  const seen = new Set();
  for (const { label, re } of SECRET_PATTERNS) {
    const flags = re.flags.includes('g') ? re.flags : re.flags + 'g';
    const global = new RegExp(re.source, flags);
    let match;
    while ((match = global.exec(content)) !== null) {
      if (match[0].length === 0) { global.lastIndex++; continue; }
      const { line, column } = locationForIndex(content, match.index);
      const key = `${label}:${line}:${column}`;
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push({ label, line, column, index: match.index });
    }
  }
  hits.sort((a, b) => a.index - b.index); // stable: ties keep pattern order
  return hits.map(({ label, line, column }) => ({ label, line, column }));
}

function locationForIndex(content, index) {
  const before = content.slice(0, index);
  const line = before.split('\n').length;
  const lastNewline = before.lastIndexOf('\n');
  const column = index - lastNewline;
  return { line, column };
}

module.exports = { SECRET_PATTERNS, scanForSecrets, scanForAllSecrets };
