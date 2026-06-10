#!/usr/bin/env node
/**
 * warden-audit-hook.js
 * PostToolUse Claude Code hook: appends one chained entry to the audit
 * ledger (<projectRoot>/.code-warden/audit.jsonl) for
 * Write/Edit/NotebookEdit/Bash/PowerShell calls.
 *
 * PostToolUse is purely advisory - the tool already ran and nothing can be
 * blocked - so this hook ALWAYS exits 0 and never writes to stdout. All
 * logic (root discovery, enablement, redaction, hash chain) lives in
 * lib/audit-ledger.js.
 *
 * Payload (stdin JSON): { session_id, cwd, tool_name, tool_input, tool_response, ... }
 */

'use strict';

const { recordPostToolUse } = require('../../lib/audit-ledger');

async function main() {
  let payload;
  try {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    process.exit(0); // unreadable payload - nothing to audit
  }

  try {
    recordPostToolUse(payload);
  } catch {
    // Ledger trouble must never disturb the session - audit is best-effort.
  }
  process.exit(0);
}

main().catch(() => process.exit(0));
