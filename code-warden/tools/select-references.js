#!/usr/bin/env node
'use strict';

const { selectReferences } = require('./lib/reference-selector');

function usage() {
  console.log('Usage: code-warden references [paths...]');
  console.log('Prints recommended Code-Warden reference files for the supplied paths.');
}

function main(argv = process.argv.slice(2)) {
  if (argv.includes('--help') || argv.includes('-h')) {
    usage();
    return 0;
  }

  const result = selectReferences(argv);
  console.log('Recommended Code-Warden references:');
  for (const reference of result.references) {
    console.log(`- ${reference}`);
  }
  return 0;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = { main };
