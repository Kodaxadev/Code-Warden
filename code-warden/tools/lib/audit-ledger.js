'use strict';

/**
 * audit-ledger.js
 * Tamper-evident PostToolUse audit ledger: <projectRoot>/.code-warden/audit.jsonl
 *
 * Each line is one JSON entry chained to the previous one:
 *   hash = sha256(prev + canonical JSON of the entry core)
 * where prev is the previous entry's hash ('GENESIS' for the first line).
 * Editing, reordering, or deleting any line breaks every later hash, so
 * verifyLedger() pinpoints the first tampered line.
 *
 * Enablement (resolveLedger):
 *   - project root = scope-store walk (scope root wins), else discovered
 *     codewarden.json root; no root -> disabled.
 *   - explicit audit.enabled === false -> always disabled.
 *   - else enabled when an active (parseable) scope.json exists, or when
 *     audit.enabled === true. Governed sessions get a ledger by default;
 *     everyone else opts in.
 *
 * Command targets are secret-redacted and truncated BEFORE logging - the
 * ledger must never become a credential store.
 */

const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');

const { findScopeFile, loadScope } = require('./scope-store');
const { loadConfig }               = require('./config');
const { SECRET_PATTERNS }          = require('./secret-patterns');

const GENESIS            = 'GENESIS';
const LEDGER_REL         = path.join('.code-warden', 'audit.jsonl');
const COMMAND_TARGET_MAX = 300;
const CORE_FIELDS        = ['ts', 'session_id', 'event', 'tool', 'target', 'ok'];
const FILE_TOOLS         = new Set(['Write', 'Edit', 'NotebookEdit']);
const COMMAND_TOOLS      = new Set(['Bash', 'PowerShell']);

/** Canonical JSON for a flat entry core: fixed field order, no hash fields. */
function canonicalCore(core) {
  const ordered = {};
  for (const k of CORE_FIELDS) ordered[k] = core[k];
  return JSON.stringify(ordered);
}

/** Chain hash for one entry: sha256(prev + canonical core). */
function entryHash(prev, core) {
  return crypto.createHash('sha256')
    .update(String(prev) + canonicalCore(core), 'utf8')
    .digest('hex');
}

/** Replace every secret-pattern match region with '[REDACTED:<label>]'. */
function redactSecrets(text) {
  let out = String(text);
  for (const { label, re } of SECRET_PATTERNS) {
    const flags = re.flags.includes('g') ? re.flags : re.flags + 'g';
    out = out.replace(new RegExp(re.source, flags), `[REDACTED:${label}]`);
  }
  return out;
}

/**
 * Decide whether the ledger is active for startDir and where it lives.
 *
 * @param {string} startDir - Hook working directory (payload.cwd)
 * @returns {{ root: string, ledgerPath: string } | null} null when disabled
 */
function resolveLedger(startDir) {
  const dir   = startDir || process.cwd();
  const scope = findScopeFile(dir);
  const cfg   = loadConfig(null, dir);
  const root  = (scope && scope.scopeRoot) || cfg.projectRoot;
  if (!root) return null;                       // no discoverable project root
  if (cfg.auditEnabled === false) return null;  // explicit off always wins
  const scopeActive = Boolean(scope && loadScope(scope.scopePath));
  if (cfg.auditEnabled !== true && !scopeActive) return null;
  return { root, ledgerPath: path.join(root, LEDGER_REL) };
}

/**
 * Best-effort success heuristic over tool_response. PostToolUse responses
 * are tool-shaped and undocumented, so: absence of an obvious error
 * field/flag means success. Explicit failure signals checked:
 *   success:false, ok:false, is_error:true, interrupted:true,
 *   a non-zero numeric exitCode/exit_code/code, or a truthy error field.
 * stderr is deliberately ignored - successful commands write there too.
 */
function okFromResponse(resp) {
  if (!resp || typeof resp !== 'object') return true;
  if (resp.success === false || resp.ok === false) return false;
  if (resp.is_error === true || resp.interrupted === true) return false;
  const exit = [resp.exitCode, resp.exit_code, resp.code]
    .find(v => typeof v === 'number');
  if (typeof exit === 'number' && exit !== 0) return false;
  if (resp.error) return false;
  return true;
}

/** Ledger target string for a tool call (relative path or redacted command). */
function targetFor(tool, toolInput, root, baseDir) {
  if (COMMAND_TOOLS.has(tool)) {
    // Redact on the FULL command first, then truncate - truncating first
    // could split a token so the pattern no longer matches.
    return redactSecrets(toolInput.command || '').slice(0, COMMAND_TARGET_MAX);
  }
  const fp = toolInput.file_path || toolInput.notebook_path || '';
  if (!fp) return '';
  const abs = path.resolve(baseDir || root, fp);
  const rel = path.relative(root, abs);
  const escaped = !rel || rel.startsWith('..') || path.isAbsolute(rel);
  return (escaped ? abs : rel).replace(/\\/g, '/');
}

/** Hash of the last parseable line, or GENESIS. A broken tail still gets a
 *  fresh GENESIS link; verifyLedger flags the breakage either way. */
function lastHash(ledgerPath) {
  if (!fs.existsSync(ledgerPath)) return GENESIS;
  const lines = fs.readFileSync(ledgerPath, 'utf8')
    .split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return GENESIS;
  try {
    const last = JSON.parse(lines[lines.length - 1]);
    if (last && typeof last.hash === 'string') return last.hash;
  } catch { /* tampered tail */ }
  return GENESIS;
}

/** Append one chained entry (single atomic appendFileSync line). */
function appendEntry(ledgerPath, core) {
  const prev  = lastHash(ledgerPath);
  const entry = { ...core, prev, hash: entryHash(prev, core) };
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  fs.appendFileSync(ledgerPath, JSON.stringify(entry) + '\n', 'utf8');
  return entry;
}

/**
 * Record one PostToolUse payload. Returns the appended entry, or null when
 * the tool is not audited or the ledger is disabled for this directory.
 */
function recordPostToolUse(payload) {
  const tool = payload && payload.tool_name;
  if (!FILE_TOOLS.has(tool) && !COMMAND_TOOLS.has(tool)) return null;
  const cwd      = payload.cwd || process.cwd();
  const resolved = resolveLedger(cwd);
  if (!resolved) return null;
  const core = {
    ts:         new Date().toISOString(),
    session_id: payload.session_id || '',
    event:      'PostToolUse',
    tool,
    target:     targetFor(tool, payload.tool_input || {}, resolved.root, cwd),
    ok:         okFromResponse(payload.tool_response),
  };
  return appendEntry(resolved.ledgerPath, core);
}

/**
 * Verify the hash chain. brokenAt is the 1-based line number of the first
 * unparseable or mis-chained entry (null when valid).
 *
 * @param {string} ledgerPath
 * @returns {{ valid: boolean, entries: number, brokenAt: number|null }}
 */
function verifyLedger(ledgerPath) {
  if (!fs.existsSync(ledgerPath)) return { valid: false, entries: 0, brokenAt: null };
  const lines = fs.readFileSync(ledgerPath, 'utf8')
    .split(/\r?\n/).filter(l => l.trim().length > 0);
  let prev = GENESIS;
  for (let i = 0; i < lines.length; i++) {
    let e;
    try { e = JSON.parse(lines[i]); } catch {
      return { valid: false, entries: lines.length, brokenAt: i + 1 };
    }
    if (!e || e.prev !== prev || e.hash !== entryHash(e.prev, e)) {
      return { valid: false, entries: lines.length, brokenAt: i + 1 };
    }
    prev = e.hash;
  }
  return { valid: true, entries: lines.length, brokenAt: null };
}

/** Parsed entries for receipt prefill (unparseable lines are skipped). */
function readLedgerEntries(ledgerPath) {
  if (!fs.existsSync(ledgerPath)) return [];
  const entries = [];
  for (const line of fs.readFileSync(ledgerPath, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try { entries.push(JSON.parse(line)); } catch { /* skip */ }
  }
  return entries;
}

module.exports = {
  GENESIS, LEDGER_REL, COMMAND_TARGET_MAX,
  resolveLedger, recordPostToolUse, appendEntry, verifyLedger,
  readLedgerEntries, redactSecrets, okFromResponse, entryHash,
};
