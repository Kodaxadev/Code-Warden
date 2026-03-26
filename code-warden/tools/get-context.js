#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const candidates = [
  'ARCHITECTURE.md',
  'docs/ARCHITECTURE.md',
  '.claude/CLAUDE.md',
  'CLAUDE.md',
  'README.md',
  'docs/README.md',
  'PRD.md'
];

function findContextFile(startDir) {
  let currDir = path.resolve(startDir);
  
  while (true) {
    for (const candidate of candidates) {
      const fullPath = path.join(currDir, candidate);
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
    }

    const parentDir = path.dirname(currDir);
    if (parentDir === currDir) {
      return null;
    }
    currDir = parentDir;
  }
}

const contextFile = findContextFile(process.cwd());

if (contextFile) {
  console.log(`Found architectural context at: ${contextFile}\n`);
  const content = fs.readFileSync(contextFile, 'utf8');
  // Just print a preview or the whole content depending on the size
  if (content.length > 5000) {
    console.log(content.substring(0, 5000) + '\n...[Content truncated]');
  } else {
    console.log(content);
  }
} else {
  console.log('⚠️ No architecture doc or README found in the repository hierarchy.');
  process.exit(1); // Non-zero exit to signal failure to the LLM
}
