'use strict';

const SARIF_VERSION = '2.1.0';

const RULES = [
  {
    id: 'CW001/max-file-length',
    name: 'Maximum file length',
    shortDescription: { text: 'File exceeds the configured line limit.' },
    fullDescription: {
      text: 'Code-Warden requires files to stay under the configured line limit so modules remain auditable.',
    },
    defaultConfiguration: { level: 'warning' },
    properties: {
      tags: ['maintainability', 'code-quality'],
      precision: 'very-high',
    },
  },
  {
    id: 'CW002/hardcoded-credential',
    name: 'Hardcoded credential',
    shortDescription: { text: 'Source contains a hardcoded credential pattern.' },
    fullDescription: {
      text: 'Code-Warden blocks credential-like values in source. Findings describe the pattern type, not the secret value.',
    },
    defaultConfiguration: { level: 'error' },
    properties: {
      tags: ['security'],
      precision: 'high',
    },
  },
];

function formatSarif(report) {
  return JSON.stringify(toSarif(report), null, 2);
}

function toSarif(report) {
  return {
    version: SARIF_VERSION,
    '$schema': 'https://json.schemastore.org/sarif-2.1.0.json',
    runs: [
      {
        tool: {
          driver: {
            name: 'Code-Warden',
            informationUri: 'https://github.com/Kodaxadev/Code-Warden',
            semanticVersion: report.version,
            rules: RULES,
          },
        },
        results: [
          ...fileLengthResults(report.checks.fileLength.details || []),
          ...secretResults(report.checks.secrets.details || []),
        ],
      },
    ],
  };
}

function fileLengthResults(details) {
  return details.map(detail => ({
    ruleId: 'CW001/max-file-length',
    level: 'warning',
    message: {
      text: `${detail.file} has ${detail.lines} lines; configured limit is ${detail.limit}.`,
    },
    locations: [location(detail.file, detail.limit + 1, 1)],
  }));
}

function secretResults(details) {
  return details.map(detail => ({
    ruleId: 'CW002/hardcoded-credential',
    level: 'error',
    message: {
      text: `${detail.file} matches hardcoded credential pattern: ${detail.pattern}.`,
    },
    locations: [location(detail.file, detail.line || 1, detail.column || 1)],
  }));
}

function location(file, line, column) {
  return {
    physicalLocation: {
      artifactLocation: { uri: slashPath(file) },
      region: {
        startLine: line,
        startColumn: column,
      },
    },
  };
}

function slashPath(file) {
  return String(file).replace(/\\/g, '/');
}

module.exports = { formatSarif, toSarif };
