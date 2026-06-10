'use strict';

/**
 * receipt-audit.js
 * Builds a governance receipt prefilled from session evidence:
 * the audit ledger (hash-chain verified), the scope lock, architecture
 * context discovery, and git metadata. Split out of receipt.js so the CLI
 * stays under the file length limit.
 *
 * The result is still a DRAFT: nonGoals/verifyAfter/rollback and the whole
 * Plan Gate are judgement calls only the human can attest to. Prefill
 * corroborates; it never auto-completes.
 */

const fs   = require('fs');
const path = require('path');

const { findScopeFile, loadScope }       = require('./scope-store');
const { findProjectConfig }              = require('./config');
const { findContextFile }                = require('./context-discovery');
const { verifyLedger, readLedgerEntries, LEDGER_REL } = require('./audit-ledger');
const { gitInfo, gitTopLevel }           = require('./git-info');

const slash = p => String(p).replace(/\\/g, '/');

/**
 * Project root for receipt evidence: scope root wins (a governed session),
 * then discovered codewarden.json root, then git top-level, then cwd.
 */
function discoverRoot(cwd) {
  const scope = findScopeFile(cwd);
  if (scope) return scope.scopeRoot;
  const cfg = findProjectConfig(cwd);
  if (cfg) return cfg.projectRoot;
  return gitTopLevel(cwd) || path.resolve(cwd);
}

/**
 * Prefill a receipt template from the audit ledger and project evidence.
 *
 * @param {object} opts
 * @param {object} opts.template - Fresh receipt template (createTemplate())
 * @param {string} opts.cwd - Directory to discover the project root from
 * @param {string|null} [opts.ledgerPath] - Explicit ledger path override
 * @returns {{ receipt: object, summary: string }}
 * @throws {Error} When the ledger file does not exist
 */
function buildAuditReceipt({ template, cwd, ledgerPath }) {
  const root   = discoverRoot(cwd);
  const ledger = ledgerPath
    ? path.resolve(cwd, ledgerPath)
    : path.join(root, LEDGER_REL);

  if (!fs.existsSync(ledger)) {
    throw new Error(`audit ledger not found: ${ledger} ` +
      '(run a governed Claude session first, or pass --from-audit=<path>)');
  }

  const chain   = verifyLedger(ledger);
  const entries = readLedgerEntries(ledger);
  const receipt = template; // status stays 'draft' - the human completes it

  // Architecture context (repo-bounded, same discovery as the session hook)
  const contextFile = findContextFile(root, { stopAtGitBoundary: true });
  if (contextFile) {
    let summaryLine = '';
    try {
      summaryLine = (fs.readFileSync(contextFile, 'utf8')
        .split(/\r?\n/).find(l => l.trim()) || '').trim().slice(0, 200);
    } catch { /* unreadable - source path is still evidence */ }
    receipt.architectureState = { source: slash(contextFile), summary: summaryLine };
  }

  // Scope Gate: the scope file only exists if the user ran the CLI, so the
  // files-in contract IS confirmed. nonGoals/verifyAfter/rollback stay empty
  // for the human.
  const found = findScopeFile(root);
  const scope = found ? loadScope(found.scopePath) : null;
  if (scope) {
    receipt.scopeGate.confirmed = true;
    receipt.scopeGate.goal      = typeof scope.goal === 'string' ? scope.goal : '';
    receipt.scopeGate.filesIn   = [...scope.filesIn];
  }

  receipt.repository = gitInfo(root);

  receipt.audit = {
    path:       slash(ledger),
    entries:    chain.entries,
    chainValid: chain.valid,
    ...(chain.valid ? {} : { brokenAt: chain.brokenAt }),
  };

  receipt.finalEvidence.commands = entries
    .filter(e => e.tool === 'Bash' || e.tool === 'PowerShell')
    .map(e => e.target)
    .filter(t => typeof t === 'string' && t.length > 0);
  receipt.finalEvidence.notes = [
    `prefilled from audit ledger ${chain.entries} entries; ` +
    `chain ${chain.valid ? 'valid' : 'BROKEN'}`,
  ];

  const summary = `${chain.entries} ledger entr${chain.entries === 1 ? 'y' : 'ies'}, ` +
    `chain ${chain.valid ? 'valid' : `BROKEN at line ${chain.brokenAt}`}`;
  return { receipt, summary };
}

module.exports = { buildAuditReceipt, discoverRoot };
