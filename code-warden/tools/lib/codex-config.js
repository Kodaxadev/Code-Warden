#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function defaultConfigPath() {
  return path.join(os.homedir(), '.codex', 'config.toml');
}

function defaultHooksPath() {
  return path.join(os.homedir(), '.codex', 'hooks.json');
}

function splitLines(text) {
  return text.length > 0 ? text.replace(/\r\n/g, '\n').split('\n') : [];
}

function findFeaturesSection(lines) {
  const start = lines.findIndex(line => /^\s*\[features\]\s*(#.*)?$/.test(line));
  if (start < 0) return { start: -1, end: -1 };
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\s*\[[^\]]+\]\s*(#.*)?$/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return { start, end };
}

function enableHooksInConfigText(text) {
  const lines = splitLines(text);
  const section = findFeaturesSection(lines);

  if (section.start < 0) {
    const prefix = lines.length > 0 && lines[lines.length - 1] !== '' ? [''] : [];
    return [...lines, ...prefix, '[features]', 'hooks = true', ''].join('\n');
  }

  let foundHooks = false;
  const next = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (i > section.start && i < section.end && /^\s*codex_hooks\s*=/.test(line)) {
      continue;
    }
    if (i > section.start && i < section.end && /^\s*hooks\s*=/.test(line)) {
      next.push('hooks = true');
      foundHooks = true;
      continue;
    }
    next.push(line);
    if (i === section.start && !foundHooks) {
      const hasHookLine = lines
        .slice(section.start + 1, section.end)
        .some(candidate => /^\s*hooks\s*=/.test(candidate));
      if (!hasHookLine) {
        next.push('hooks = true');
        foundHooks = true;
      }
    }
  }

  return next.join('\n').replace(/\n?$/, '\n');
}

function inspectHooksFeature(configPath = defaultConfigPath()) {
  if (!fs.existsSync(configPath)) {
    return { configPath, exists: false, enabled: false, deprecated: false };
  }

  const text = fs.readFileSync(configPath, 'utf8');
  const lines = splitLines(text);
  const section = findFeaturesSection(lines);
  if (section.start < 0) {
    return { configPath, exists: true, enabled: false, deprecated: false };
  }

  const body = lines.slice(section.start + 1, section.end).join('\n');
  const hooksMatch = body.match(/^\s*hooks\s*=\s*(true|false)\s*$/m);
  const deprecated = /^\s*codex_hooks\s*=/.test(body);

  return {
    configPath,
    exists: true,
    enabled: hooksMatch ? hooksMatch[1] === 'true' : false,
    deprecated,
  };
}

function enableHooksFeature(configPath = defaultConfigPath()) {
  const current = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';
  const next = enableHooksInConfigText(current);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, next, 'utf8');
  return inspectHooksFeature(configPath);
}

function inspectHookEntries(hooksPath = defaultHooksPath()) {
  if (!fs.existsSync(hooksPath)) return { hooksPath, exists: false, entries: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
    const entries = (parsed.PreToolUse || [])
      .filter(entry => String(entry.description || '').startsWith('code-warden:'));
    return { hooksPath, exists: true, entries };
  } catch (err) {
    return { hooksPath, exists: true, entries: [], parseError: err.message };
  }
}

function getCodexHookRepairHint({ entries = [], missingScripts = [], config = {} } = {}) {
  const needsRepair = missingScripts.length > 0 || config.enabled === false || config.deprecated;
  if (entries.length === 0 || !needsRepair) return '';

  const reasons = [];
  if (missingScripts.length > 0) reasons.push('missing hook script');
  if (config.enabled === false) reasons.push('[features].hooks is not enabled');
  if (config.deprecated) reasons.push('deprecated codex_hooks is present');

  return `Repair Codex hooks: run \`code-warden hooks codex\` (${reasons.join('; ')}).`;
}

module.exports = {
  defaultConfigPath,
  defaultHooksPath,
  enableHooksFeature,
  enableHooksInConfigText,
  getCodexHookRepairHint,
  inspectHookEntries,
  inspectHooksFeature,
};
