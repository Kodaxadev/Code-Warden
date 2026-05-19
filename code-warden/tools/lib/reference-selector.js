'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_CONFIG_PATH = path.join(__dirname, '..', '..', 'codewarden.json');

const DEFAULT_REFERENCES = [
  'references/planning-gates.md',
  'references/operations.md',
];

const DEFAULT_RULES = [
  { patterns: ['README.md', 'CHANGELOG.md', 'docs/', 'references/'], references: ['references/operations.md'] },
  { patterns: ['tools/', 'bin/', 'install.js', 'package.json'], references: ['references/safety.md'] },
  { patterns: ['templates/', '.github/', 'release'], references: ['references/operations.md', 'references/research-and-fit.md'] },
  { patterns: ['mcp', 'MCP'], references: ['references/mcp-governance.md'] },
  { patterns: ['package.json', 'package-lock.json', 'pnpm-lock.yaml'], references: ['references/operations.md'] },
  { patterns: ['SKILL.md', 'codewarden.json'], references: ['references/planning-gates.md', 'references/operations.md'] },
];

function readConfig(configPath) {
  const target = configPath || DEFAULT_CONFIG_PATH;
  try {
    return JSON.parse(fs.readFileSync(target, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return {};
  }
}

function normalizePath(value) {
  return String(value || '').replace(/\\/g, '/');
}

function matchesPattern(file, pattern) {
  const normalizedFile = normalizePath(file);
  const normalizedPattern = normalizePath(pattern);
  if (!normalizedPattern) return false;
  if (normalizedPattern.endsWith('/')) return normalizedFile.includes(normalizedPattern);
  return normalizedFile === normalizedPattern || normalizedFile.includes(normalizedPattern);
}

function loadRules(configPath) {
  const cfg = readConfig(configPath);
  return cfg?.reference_selection?.rules || cfg?.referenceSelection?.rules || DEFAULT_RULES;
}

function selectReferences(paths = [], options = {}) {
  if (!Array.isArray(paths) || paths.length === 0) {
    return { references: [...DEFAULT_REFERENCES], matched: [] };
  }

  const selected = new Set();
  const matched = [];
  for (const file of paths) {
    for (const rule of loadRules(options.configPath)) {
      const patterns = Array.isArray(rule.patterns) ? rule.patterns : [];
      if (!patterns.some(pattern => matchesPattern(file, pattern))) continue;
      const references = Array.isArray(rule.references) ? rule.references : [];
      for (const reference of references) selected.add(reference);
      matched.push({ path: normalizePath(file), references });
    }
  }

  if (selected.size === 0) {
    for (const reference of DEFAULT_REFERENCES) selected.add(reference);
  }

  return { references: [...selected], matched };
}

module.exports = {
  DEFAULT_REFERENCES,
  DEFAULT_RULES,
  matchesPattern,
  selectReferences,
};
