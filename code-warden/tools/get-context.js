#!/usr/bin/env node
const fs = require('fs');
const { findContextFile } = require('./lib/context-discovery');

const contextFile = findContextFile(process.cwd());

if (contextFile) {
  console.log(`Found architectural context at: ${contextFile}\n`);
  const content = fs.readFileSync(contextFile, 'utf8');
  if (content.length > 5000) {
    console.log(`${content.substring(0, 5000)}\n...[Content truncated]`);
  } else {
    console.log(content);
  }
} else {
  console.log('[WARN] No AGENTS.md, architecture doc, CLAUDE.md, PRD, or README found in the repository hierarchy.');
  process.exit(1);
}
