'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_CONFIG_PATH = path.join(__dirname, '..', '..', 'codewarden.json');

const VALID_TIERS = ['low', 'medium', 'high', 'blocked'];

const DEFAULT_TIERS = {
  low: {
    requiresConfirmation: false,
    description: 'Read-only, local, reversible actions.',
  },
  medium: {
    requiresConfirmation: true,
    description: 'Local edits or generated artifacts with bounded blast radius.',
  },
  high: {
    requiresConfirmation: true,
    description: 'Dependency, network, release, or broad repository operations.',
  },
  blocked: {
    requiresConfirmation: true,
    description: 'Actions Code-Warden should refuse without an explicit scope expansion.',
  },
};

const DEFAULT_ACTIONS = {
  read_only: {
    tier: 'low',
    description: 'Inspect files, run local read-only commands, or gather context.',
  },
  file_edit: {
    tier: 'medium',
    description: 'Create or modify declared in-scope files.',
  },
  dependency_change: {
    tier: 'high',
    description: 'Add, remove, upgrade, or replace project dependencies.',
  },
  external_network: {
    tier: 'high',
    description: 'Transmit data to external services or fetch version-specific evidence.',
  },
  release_publish: {
    tier: 'high',
    description: 'Publish packages, tags, releases, or deployment artifacts.',
  },
  destructive_command: {
    tier: 'blocked',
    description: 'Delete, reset, overwrite, or force-push repository state.',
  },
  secret_exposure: {
    tier: 'blocked',
    description: 'Print, store, transmit, or commit credentials or private tokens.',
  },
};

function readConfig(configPath) {
  const target = configPath || DEFAULT_CONFIG_PATH;
  try {
    return JSON.parse(fs.readFileSync(target, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return {};
  }
}

function mergePolicy(config) {
  const configured = config?.risk_policy || config?.riskPolicy || {};
  return {
    tiers: { ...DEFAULT_TIERS, ...(configured.tiers || {}) },
    actions: { ...DEFAULT_ACTIONS, ...(configured.actions || {}) },
  };
}

function validatePolicy(policy) {
  const errors = [];
  for (const tier of VALID_TIERS) {
    if (!policy.tiers[tier]) errors.push(`risk_policy.tiers.${tier} is required`);
  }

  for (const [name, action] of Object.entries(policy.actions)) {
    if (!action || typeof action !== 'object') {
      errors.push(`risk_policy.actions.${name} must be an object`);
      continue;
    }
    if (!VALID_TIERS.includes(action.tier)) {
      errors.push(`risk_policy.actions.${name}.tier has invalid value: ${action.tier}`);
    }
  }

  return errors;
}

function loadRiskPolicy(configPath) {
  const policy = mergePolicy(readConfig(configPath));
  const errors = validatePolicy(policy);
  return {
    status: errors.length === 0 ? 'pass' : 'fail',
    tiers: policy.tiers,
    actions: policy.actions,
    errors,
  };
}

module.exports = {
  DEFAULT_ACTIONS,
  DEFAULT_TIERS,
  VALID_TIERS,
  loadRiskPolicy,
};
