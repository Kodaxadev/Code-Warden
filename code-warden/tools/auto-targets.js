#!/usr/bin/env node
/**
 * auto-targets.js
 * Target registry for the code-warden auto-installer.
 * Each entry describes one AI app, how to detect it, and where to install.
 *
 * format values:
 *   'skill-md'      - copy the full skill folder (SKILL.md + references/ + tools/)
 *   'windsurf-flat' - concatenate into a single .md file via auto-windsurf-adapter.js
 */

const os   = require('os');
const path = require('path');

const HOME        = os.homedir();
const LOCALAPPDATA = process.env.LOCALAPPDATA || '';
const APPDATA      = process.env.APPDATA      || '';

const TARGETS = [
  {
    id:        'claude',
    name:      'Claude Code',
    format:    'skill-md',
    skillsDir: path.join(HOME, '.claude', 'skills'),
    detect: {
      binaries: ['claude'],
      dirs:     [path.join(HOME, '.claude')],
      apps: {
        darwin: ['/Applications/Claude.app'],
        win32:  [path.join(LOCALAPPDATA, 'Programs', 'claude', 'claude.exe')],
        linux:  [],
      },
    },
  },
  {
    id:        'cursor',
    name:      'Cursor',
    format:    'skill-md',
    skillsDir: path.join(HOME, '.cursor', 'skills'),
    detect: {
      binaries: ['cursor'],
      dirs:     [path.join(HOME, '.cursor')],
      apps: {
        darwin: ['/Applications/Cursor.app'],
        win32:  [path.join(LOCALAPPDATA, 'Programs', 'cursor', 'Cursor.exe')],
        linux:  [path.join(HOME, '.local', 'share', 'cursor')],
      },
    },
  },
  {
    id:        'warp',
    name:      'Warp',
    format:    'skill-md',
    skillsDir: path.join(HOME, '.warp', 'skills'),
    detect: {
      binaries: ['warp', 'warp-terminal'],
      dirs:     [path.join(HOME, '.warp')],
      apps: {
        darwin: ['/Applications/Warp.app'],
        win32:  [path.join(LOCALAPPDATA, 'Programs', 'Warp', 'Warp.exe')],
        linux:  [],
      },
    },
  },
  {
    id:        'codex',
    name:      'OpenAI Codex',
    format:    'skill-md',
    skillsDir: path.join(HOME, '.codex', 'skills'),
    detect: {
      binaries: ['codex'],
      dirs:     [path.join(HOME, '.codex')],
      apps:     { darwin: [], win32: [], linux: [] },
    },
  },
  {
    id:        'agents',
    name:      'Generic Agents',
    format:    'skill-md',
    skillsDir: path.join(HOME, '.agents', 'skills'),
    detect: {
      binaries: [],
      dirs:     [path.join(HOME, '.agents')],
      apps:     { darwin: [], win32: [], linux: [] },
    },
  },
  {
    id:        'windsurf',
    name:      'Windsurf',
    format:    'windsurf-flat',
    skillsDir: path.join(HOME, '.windsurf', 'rules'),
    detect: {
      binaries: ['windsurf'],
      dirs:     [path.join(HOME, '.windsurf')],
      apps: {
        darwin: ['/Applications/Windsurf.app'],
        win32:  [path.join(LOCALAPPDATA, 'Programs', 'Windsurf', 'Windsurf.exe')],
        linux:  [],
      },
    },
  },
];

module.exports = { TARGETS };
