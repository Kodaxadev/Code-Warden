// Fixture: clean file — no secrets, well within line limit.
// Used by: warden-lint (expect PASS) and verify-secrets (expect PASS).
'use strict';

function greet(name) {
  return `Hello, ${name}`;
}

module.exports = { greet };
