# code-warden v4.0.0

Enforcement layers — scope lock, command risk gate, audit ledger,
corroborated receipts, baseline ratchet, and a git pre-commit backstop.

## Upgrade note (read first)

**Existing hook users MUST re-run `code-warden hooks claude` (and
`code-warden hooks codex`).** Old registrations keep working, but they lack
NotebookEdit and Bash/PowerShell command coverage and none of the new
events or gates (scope lock, command risk gate, audit ledger, SessionStart
context, Stop verification).

Why this is a major version:

- The governance report's `session.scopeGate` field becomes an object
  (`{status, goal, filesIn, enforce}`) when a scope lock exists; it was
  always a string before. JSON consumers should handle both shapes.
- Everything under `.code-warden/` is write-protected from agents
  unconditionally — even with no scope lock.
- Hook registration expands from PreToolUse-only to
  PreToolUse/PostToolUse/SessionStart/Stop.

## What's new

### Scope Lock (`code-warden scope`)

`code-warden scope set --goal="..." <paths...>` writes
`<repoRoot>/.code-warden/scope.json`. While it exists with `enforce: true`,
write hooks (Claude `Write`/`Edit`/`NotebookEdit`, Codex `apply_patch`) deny
edits outside the declared paths and tell the agent to ask the user to run
`code-warden scope add <path>`. Expansions are appended to `expansions[]`
as an audit trail. Strictly opt-in: no scope file, no enforcement.
`--no-enforce` records scope without blocking.

### Command Risk Gate

Both command hooks classify shell commands against conservative defaults:

- **blocked (denied)**: `rm_rf_root`, `rd_root`, `remove_item_root`,
  `git_reset_hard`, `git_push_force` (`--force-with-lease` exempt),
  `git_clean_force`, `git_history_rewrite`, `curl_pipe_shell`,
  `ps_web_pipe_iex`, `chmod_777_root`
- **high (ask on Claude; allow on Codex — no ask equivalent there)**:
  `package_install` (bare `npm install`/`ci` allowed), `npm_publish`,
  `git_push`, `recursive_delete`, `remove_item_recurse`,
  `git_discard_changes`

Tune via `risk_policy.command_rules`: reuse a default `id` to replace it,
set `"tier": "off"` to disable it, or add new rules with your own patterns.

### Audit ledger + corroborated receipts

A PostToolUse hook appends one line per governed tool call to
`.code-warden/audit.jsonl`, sha256 hash-chained from GENESIS — editing,
reordering, or deleting any line breaks every later hash. Commands are
logged secret-redacted and truncated to 300 chars. Auto-on while a scope
lock exists; otherwise controlled by `audit.enabled` (explicit `false`
wins). Claude sessions only — Codex has no PostToolUse surface.

`code-warden receipt --from-audit --out=<file>` prefills a draft receipt
from the scope lock, architecture context, git branch/commit, and ledger
evidence with chain verification. A `complete` receipt with a broken chain
(`audit.chainValid: false`) fails validation. Schema is additive — v1
receipts still validate.

### Baseline ratchet for brownfield repos

```bash
npx code-warden report --write-baseline   # record current debt as the floor
git add .code-warden-baseline.json
npx code-warden report --baseline         # fail only NEW or WORSENED violations
```

Legacy findings are counted separately ("N new / M legacy"). Secrets are
fingerprinted by sha256 of the trimmed matched line — baselines never store
raw secrets. SARIF carries fresh findings only. A missing baseline file is
a hard error. The GitHub Action gained a `baseline` input.

### Git pre-commit backstop

`code-warden hooks git` installs a marker-managed pre-commit hook (per-repo,
run from the repo — unlike the per-user claude/codex hooks) that scans
staged content (`git show :path`) for lint and secrets with full
exclude/allowlist parity. `git commit --no-verify` bypasses it — that is
documented honestly, not hidden. Verify with `code-warden verify git`.

### Lifecycle hooks

- **SessionStart** injects architecture context and scope status, so
  sessions start governed instead of discovering rules mid-task.
- **Stop** (opt-in via `session.verify_on_stop`, default `false`) blocks
  session completion while FRESH lint/secret violations exist. Loop-guarded
  and baseline-aware — legacy debt never traps a session.

### Scanner and hook hardening

- Six new secret patterns: Anthropic (`sk-ant-`), Google (`AIza`), GitLab
  (`glpat-`), npm (`npm_`), Hugging Face (`hf_`), JWT. All matches per file
  are reported, not just the first.
- Hooks read the governed project's own `codewarden.json` (walking up from
  cwd, stopping at the `.git` boundary), so `lint.exclude_paths`,
  `secrets.allowlist`, and thresholds match CI behavior exactly.
- `pre_flight_trigger_lines` now asks for confirmation on single changes
  over 150 lines.

### New config keys

`lint.exclude_paths`, `secrets.allowlist` (both now hook-honored),
`risk_policy.command_rules`, `audit.enabled`, `session.verify_on_stop`.

## Honest limits

- The agent can run `code-warden scope add` itself via the shell — but the
  command is visible in the session and recorded in `expansions[]`. The
  lock makes scope creep auditable, not impossible.
- Codex has no "ask" permission decision and no PostToolUse hook: high-tier
  commands allow silently there, and the audit ledger is Claude-only. CI
  and the git backstop close part of that gap.
- `git commit --no-verify` skips the pre-commit backstop by design.

## Verification

```bash
node tools/tests/run-all-tests.js
node tools/warden-lint.js tools
node tools/governance-report.js .
npx code-warden --version   # 4.0.0
```
