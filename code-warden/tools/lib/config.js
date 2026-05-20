#!/usr/bin/env node
'use strict';

/**
 * config.js
 * Shared codewarden.json loader.
 *
 * Previously warden-lint.js, warden-lint-hook.js, and warden-apply-patch-hook.js
 * each parsed codewarden.json independently with slightly different fallback paths.
 * This module centralises config loading with a single documented precedence.
 *
 * Resolution order for config file:
 *   1. Explicit path passed to loadConfig(configPath)
 *   2. <__dirname>/../../codewarden.json  (relative to tools/lib/ → skill root)
 */

const fs   = require('fs');
const path = require('path');

const DEFAULT_CONFIG_PATH = path.join(__dirname, '..', '..', 'codewarden.json');

/**
 * Load and parse codewarden.json, returning a merged config object.
 * Falls back to defaults silently if the file is missing or unparseable.
 *
 * @param {string} [configPath] - Override the config file location
 * @returns {{ maxFileLength: number, lintExcludePaths: string[], secretsAllowlist: string[] }}
 */
function loadConfig(configPath) {
  const target = configPath || DEFAULT_CONFIG_PATH;
  let maxFileLength = 400;
  let lintExcludePaths = [];
  let secretsAllowlist = [];

  try {
    const raw = fs.readFileSync(target, 'utf8');
    const cfg = JSON.parse(raw);
    const configured =
      cfg?.thresholds?.max_file_length ??
      cfg?.max_file_length;
    if (typeof configured === 'number' && configured > 0) {
      maxFileLength = configured;
    }
    if (Array.isArray(cfg?.lint?.exclude_paths)) {
      lintExcludePaths = cfg.lint.exclude_paths.filter(p => typeof p === 'string');
    }
    if (Array.isArray(cfg?.secrets?.allowlist)) {
      secretsAllowlist = cfg.secrets.allowlist.filter(p => typeof p === 'string');
    }
  } catch {
    // Missing or invalid config — use defaults
  }

  return { maxFileLength, lintExcludePaths, secretsAllowlist };
}

module.exports = { loadConfig, DEFAULT_CONFIG_PATH };
