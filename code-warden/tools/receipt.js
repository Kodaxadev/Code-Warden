#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

function createTemplate() {
  return {
    schemaVersion: 1,
    kind: 'code-warden/governance-receipt',
    status: 'draft',
    tool: {
      name: 'code-warden',
      generatedAt: new Date().toISOString(),
    },
    architectureState: {
      source: '',
      summary: '',
    },
    scopeGate: {
      confirmed: false,
      goal: '',
      nonGoals: [],
      filesIn: [],
      filesOut: [],
      verifyAfter: [],
      rollback: '',
    },
    planGate: {
      confirmed: false,
      patchOrder: [],
      blastRadius: '',
      humanCheckpoint: '',
      postPatchChecks: [],
    },
    finalEvidence: {
      commands: [],
      reports: [],
      notes: [],
    },
    validation: {
      canProveCompliance: false,
      reason: 'Draft template only. Fill all required gate and evidence fields before validating.',
    },
  };
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasItems(value) {
  return Array.isArray(value) && value.length > 0;
}

function validateReceipt(receipt) {
  const errors = [];

  if (!isObject(receipt)) errors.push('receipt must be an object');
  if (!isObject(receipt)) return errors;

  if (receipt.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (receipt.kind !== 'code-warden/governance-receipt') {
    errors.push('kind must be code-warden/governance-receipt');
  }
  if (receipt.status !== 'complete') errors.push('status must be complete');

  const scopeGate = receipt.scopeGate;
  if (!isObject(scopeGate)) {
    errors.push('scopeGate must be an object');
  } else {
    if (scopeGate.confirmed !== true) errors.push('scopeGate.confirmed must be true');
    if (!hasText(scopeGate.goal)) errors.push('scopeGate.goal is required');
    if (!hasItems(scopeGate.nonGoals)) errors.push('scopeGate.nonGoals must list at least one item');
    if (!hasItems(scopeGate.filesIn)) errors.push('scopeGate.filesIn must list at least one file');
    if (!hasItems(scopeGate.filesOut)) errors.push('scopeGate.filesOut must list at least one item');
    if (!hasItems(scopeGate.verifyAfter)) errors.push('scopeGate.verifyAfter must list at least one command');
    if (!hasText(scopeGate.rollback)) errors.push('scopeGate.rollback is required');
  }

  const planGate = receipt.planGate;
  if (!isObject(planGate)) {
    errors.push('planGate must be an object');
  } else {
    if (planGate.confirmed !== true) errors.push('planGate.confirmed must be true');
    if (!hasItems(planGate.patchOrder)) errors.push('planGate.patchOrder must list at least one step');
    if (!['CONTAINED', 'MODERATE', 'HIGH'].includes(planGate.blastRadius)) {
      errors.push('planGate.blastRadius must be CONTAINED, MODERATE, or HIGH');
    }
    if (!['YES', 'NO'].includes(planGate.humanCheckpoint)) {
      errors.push('planGate.humanCheckpoint must be YES or NO');
    }
    if (!hasItems(planGate.postPatchChecks)) {
      errors.push('planGate.postPatchChecks must list at least one command');
    }
  }

  const finalEvidence = receipt.finalEvidence;
  if (!isObject(finalEvidence)) {
    errors.push('finalEvidence must be an object');
  } else if (!hasItems(finalEvidence.commands)) {
    errors.push('finalEvidence.commands must list at least one completed command');
  }

  const validation = receipt.validation;
  if (!isObject(validation)) {
    errors.push('validation must be an object');
  } else if (validation.canProveCompliance !== true) {
    errors.push('validation.canProveCompliance must be true for complete receipts');
  }

  // Optional corroboration block (receipt --from-audit). Additive: absent on
  // older receipts and never required. But a receipt claiming completion on
  // top of a broken evidence chain is a contradiction - fail it loudly.
  const audit = receipt.audit;
  if (audit !== undefined) {
    if (!isObject(audit)) {
      errors.push('audit must be an object when present');
    } else if (audit.chainValid === false) {
      errors.push('audit.chainValid is false - a complete receipt cannot rest on a broken audit ledger chain' +
        (audit.brokenAt ? ` (broken at line ${audit.brokenAt})` : ''));
    }
  }

  return errors;
}

function parseArgs(argv) {
  // fromAudit: false = off, true = default ledger path, string = explicit path
  const options = { template: false, out: null, validate: null, fromAudit: false };
  for (const arg of argv) {
    if (arg === '--template') options.template = true;
    else if (arg === '--from-audit') options.fromAudit = true;
    else if (arg.startsWith('--from-audit=')) options.fromAudit = arg.slice('--from-audit='.length);
    else if (arg.startsWith('--out=')) options.out = arg.slice('--out='.length);
    else if (arg.startsWith('--validate=')) options.validate = arg.slice('--validate='.length);
    else throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function usage() {
  console.log('Usage: code-warden receipt --template --out=<file>');
  console.log('       code-warden receipt --from-audit[=<ledger path>] --out=<file>');
  console.log('       code-warden receipt --validate=<file>');
}

function writeJson(file, value) {
  const resolved = path.resolve(file);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, JSON.stringify(value, null, 2) + '\n');
  return resolved;
}

function readJson(file) {
  const raw = fs.readFileSync(path.resolve(file), 'utf8');
  return JSON.parse(raw.replace(/^\uFEFF/, ''));
}

function main(argv = process.argv.slice(2), cwd = process.cwd()) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(error.message);
    usage();
    return 1;
  }

  if (options.template) {
    if (!options.out) {
      console.error('Missing required --out=<file> for --template');
      return 1;
    }
    const resolved = writeJson(options.out, createTemplate());
    console.log(`[CodeWarden] Receipt template written to ${resolved}`);
    return 0;
  }

  if (options.fromAudit !== false) {
    if (!options.out) {
      console.error('Missing required --out=<file> for --from-audit');
      return 1;
    }
    const { buildAuditReceipt } = require('./lib/receipt-audit');
    try {
      const { receipt, summary } = buildAuditReceipt({
        template:   createTemplate(),
        cwd,
        ledgerPath: typeof options.fromAudit === 'string' ? options.fromAudit : null,
      });
      const resolved = writeJson(options.out, receipt);
      console.log(`[CodeWarden] Receipt prefilled from audit ledger: ${summary}`);
      console.log(`[CodeWarden] Draft written to ${resolved} - complete the remaining gate fields, then validate.`);
      return 0;
    } catch (error) {
      console.error(`[CodeWarden] ${error.message}`);
      return 1;
    }
  }

  if (options.validate) {
    let receipt;
    try {
      receipt = readJson(options.validate);
    } catch (error) {
      console.error(`[CodeWarden] Failed to read receipt: ${error.message}`);
      return 1;
    }
    const errors = validateReceipt(receipt);
    if (errors.length > 0) {
      console.error('[CodeWarden] Receipt validation failed:');
      for (const error of errors) console.error(`- ${error}`);
      return 1;
    }
    console.log('[CodeWarden] Receipt validation passed');
    return 0;
  }

  usage();
  return 1;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = { createTemplate, validateReceipt, main };
