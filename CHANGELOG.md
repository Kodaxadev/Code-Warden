# Changelog

All notable changes to code-warden are documented here.
Versions follow [Semantic Versioning](https://semver.org/).

---

## v4.0.0 - 2026-06-10

**Enforcement layers: scope lock, command risk gate, audit ledger, corroborated receipts, baseline ratchet, git backstop, and lifecycle hooks.**

Major version: the report's `session.scopeGate` field becomes an object when a
scope lock exists (was always a string), everything under `.code-warden/` is
agent-write-protected unconditionally, and hook registration expands to new
events. **Upgrade note: re-run `code-warden hooks claude` (and `hooks codex`)
after updating — old registrations keep working but miss NotebookEdit/command
coverage and all new events and gates.**

### Scanner and hook hardening

- Added six secret patterns: Anthropic (`sk-ant-`), Google (`AIza`), GitLab (`glpat-`), npm (`npm_`), Hugging Face (`hf_`), and JWT.
- All secret matches are now reported per file (`scanForAllSecrets`), not first-match-only.
- Hooks discover the governed project's own `codewarden.json` (walking up from the working directory, stopping at the `.git` boundary), so `lint.exclude_paths`, `secrets.allowlist`, and thresholds behave identically in hooks and CI.
- Claude write hooks now cover `Write|Edit|NotebookEdit`; new `warden-command-hook.js` scans `Bash|PowerShell` command strings for credentials.
- `pre_flight_trigger_lines` is wired as an "ask" gate on single changes over 150 lines; `human_checkpoint_files` and `exempt_from_blast_radius` are honestly documented as prompt-layer-only.

### Git backstop and baseline ratchet

- Added `code-warden hooks git`: a marker-managed per-repo pre-commit hook that runs staged-content lint and secrets scans (`git show :path`) with exclude/allowlist parity. `git commit --no-verify` bypasses it — documented, not hidden. `code-warden verify git` checks the installation.
- Added `report --write-baseline[=path]` and `report --baseline[=path]` ratchet mode: only NEW or WORSENED violations fail; legacy findings are counted separately ("N new / M legacy"). Secrets are fingerprinted by sha256 of the trimmed matched line — no raw secrets in baselines. SARIF carries fresh findings only. A missing baseline file is a hard error.
- Added a `baseline` input to the GitHub Action and brownfield adoption guidance to the CI template.

### Scope Lock and Command Risk Gate

- Added `code-warden scope set|add|remove|clear|status` managing `<repoRoot>/.code-warden/scope.json` (`goal`, `enforce`, `filesIn`, `expansions[]` audit trail); `scope set --no-enforce` records scope without blocking.
- Write hooks (Claude `Write`/`Edit`/`NotebookEdit`, Codex `apply_patch`) deny out-of-scope edits while a scope is locked; the deny message tells the agent to ask the user to run `code-warden scope add <path>`. Strictly opt-in — no scope file means no enforcement.
- Added a Command Risk Gate to both command hooks. Default blocked (deny): `rm_rf_root`, `rd_root`, `remove_item_root`, `git_reset_hard`, `git_push_force` (`--force-with-lease` exempt), `git_clean_force`, `git_history_rewrite`, `curl_pipe_shell`, `ps_web_pipe_iex`, `chmod_777_root`. Default high (ask on Claude; allow on Codex, which has no ask equivalent): `package_install` (bare `npm install`/`ci` allowed), `npm_publish`, `git_push`, `recursive_delete`, `remove_item_recurse`, `git_discard_changes`. Configurable via `risk_policy.command_rules` (id-based override/disable; user rules merge with defaults).
- Governance report: `session.scopeGate` reports a `{status: 'locked', goal, filesIn, enforce}` object when a scope exists (previously always the string `'session_only'`) — JSON consumers should handle both shapes.

### Audit ledger, lifecycle hooks, and corroborated receipts

- Added a PostToolUse audit ledger: `.code-warden/audit.jsonl` with a sha256 hash chain (GENESIS-anchored). Command targets are secret-redacted and truncated to 300 chars. Auto-on while a scope lock exists, else `audit.enabled` config (explicit `false` wins). Claude sessions only.
- `.code-warden/` governance artifacts are unconditionally write-protected from agents (both runtimes), even with no scope lock.
- Added a SessionStart hook that injects architecture context (shared `lib/context-discovery.js`, also used by `get-context.js`) and scope status.
- Added an opt-in Stop hook (`session.verify_on_stop`, default `false`) that blocks completion on FRESH lint/secret violations; loop-guarded via `stop_hook_active` and baseline-aware.
- Added `receipt --from-audit[=path] --out=<file>`: prefills draft receipts from `scope.json`, architecture context, git branch/commit (`lib/git-info.js`), and ledger evidence with chain verification. A `complete` receipt with `audit.chainValid: false` fails validation. Receipt schema is additive — v1 receipts still validate.
- Generalized hook management across PreToolUse/PostToolUse/SessionStart/Stop (`lib/hook-events.js`); behavioral-test timeout raised to 60s.

### Previously unreleased changes (since v3.4.0)

- `--hooks=codex` now enables `[features].hooks = true` in `~/.codex/config.toml` and removes deprecated `[features].codex_hooks` entries; health checks verify both hook script paths and feature-flag enablement without making optional hooks mandatory.
- Added `code-warden verify <target>` and `code-warden smoke-npx` as public CLI wrappers; improved first-run onboarding (`init -> doctor -> report -> optional hooks`) and Codex hook repair guidance.
- Hardened release preflight so tags fail before publish when the npm version already exists; documented trusted-publisher setup.

### New config keys

- `lint.exclude_paths` and `secrets.allowlist` (now hook-honored), `risk_policy.command_rules`, `audit.enabled`, `session.verify_on_stop`.

---

## v3.4.0 - 2026-05-19

**Governance receipts, evidence providers, reference selection, risk policy, MCP governance, Code Scanning, CI template parity, and report output paths.**

- Added `code-warden receipt --template --out=<file>` for draft governance receipt artifacts.
- Added `code-warden receipt --validate=<file>` to reject incomplete Scope Gate, Plan Gate, and final evidence records.
- Kept receipts honest: templates start as drafts and validation only passes when declared gate evidence is complete.
- Added configurable `risk_policy` actions for `low`, `medium`, `high`, and `blocked` governance tiers.
- Added risk policy evidence to JSON and Markdown governance reports.
- Added `references/mcp-governance.md` for MCP server approval, toolset scope, credential handling, session/consent risk, SSRF risk, and audit evidence.
- Added `references/evidence-providers.md` for SARIF, secret scanning, dependency scanning, agent security, provenance, attestations, CI evidence, and trust limits.
- Added descriptive `external_evidence.providers` config vocabulary for approved evidence sources.
- Added `code-warden references <paths...>` for path-based reference recommendations.
- Added configurable `reference_selection.rules` so teams can tune which governance references apply to changed paths.
- Added SARIF output via `report --format=sarif` for source-located file length and hardcoded credential findings.
- Added `--out=<file>` so JSON, Markdown, and SARIF reports can be written directly to CI artifact paths.
- Added optional SARIF upload support to the reusable GitHub Action.
- Updated GitHub Actions pins to current Node 24-compatible majors: `checkout@v6`, `setup-node@v6`, `upload-artifact@v7`, and `upload-sarif@v4`.
- Expanded behavioral tests to cover reference selection, risk policy validation, receipt artifacts, UTF-8 BOM receipt input, report output paths, SARIF formatting, source locations, and CLI help examples.
- Kept JSON/Markdown as the canonical governance evidence for behavioral tests, install health, runtime hooks, and session gates.
- Updated release-download templates to `v3.4.0` now that SARIF and `--out` are part of the package.

---

## v3.3.2 - 2026-05-19

**Scanner/package cleanup.**

- Skipped generated directories, lockfiles, and log files during scanner traversal.
- Preserved final install paths in install manifests during atomic swaps.
- Moved release archives out of the tracked source tree.
- Published `code-warden@3.3.2` to npm and kept GitHub releases focused on current release assets.

---

## v3.3.1 — 2026-05-16

**Hardening + quickstart polish.**

- Fixed `EPERM` crash when scanning directories with restricted permissions (Windows `WinSAT`, etc.) — `collectFiles` now skips unreadable directories and files instead of throwing
- Added npm badge to root README
- Added Quickstart section at top of root README: `npx code-warden init`, `report`, `hooks`
- Added contributor note about `npx` local-package conflict in source checkouts

---

## v3.3.0 — 2026-05-16

**npm package + CLI quickstart.**

- Published to npm as `code-warden` — install with `npx code-warden init`
- Added `bin/code-warden.js` — CLI wrapper dispatching to existing tools: `init`, `report`, `doctor`, `list`, `hooks`, `uninstall-hooks`
- Added `"bin"` field to `package.json` for global/npx invocation
- Added `"files"` field to control tarball contents (41 files, 39 kB, zero runtime deps)
- Added `"engines": { "node": ">=18" }`
- Added `"keywords"`, `"repository"`, `"homepage"`, `"bugs"` metadata
- Updated README with `npx code-warden init` as primary install path and CLI command table

---

## v3.2.0 — 2026-05-16

**Governance Evidence Artifact.**

- Added `tools/governance-report.js` — single-pass governance report generator that runs file length, secrets, behavioral tests, source integrity, and runtime hook checks, producing a structured JSON artifact (`.code-warden-report.json`) and optional Markdown output
- Three output modes: default (writes JSON artifact + prints summary), `--format=json` (JSON to stdout), `--format=md` (Markdown table to stdout for `$GITHUB_STEP_SUMMARY`)
- Report includes git metadata (branch, commit), check results with violation details, and runtime hook registration status (Claude Code, Codex)
- Exit code reflects overall result: `0` = all checks pass, `1` = one or more failures
- Updated `templates/ci/github-actions.yml` — replaces individual lint/secrets steps with governance report, adds `$GITHUB_STEP_SUMMARY` Markdown publishing, adds artifact upload with 90-day retention
- Added npm scripts: `report`, `report:json`, `report:md`
- Updated README with "Governance Evidence" section and new positioning
- New positioning: "Verifiable governance for AI-assisted development — checks, hooks, and evidence that agents stayed within policy"

---

## v3.1.1 — 2026-05-15

**Stabilization — behavioral tests, shared policy modules, line-count fix.**

- Added `tools/tests/run-tests.js` — 8 behavioral tests (Node built-in `node:test`, zero deps) proving scanners and hooks exit with the correct codes against clean, oversized, and secret fixtures
- Added `tools/tests/fixtures/clean.js` — committed clean fixture
- Added `tools/lib/line-count.js` — trailing-newline-safe line counter shared across all callers; fixes off-by-one where a file at exactly the limit was incorrectly flagged
- Added `tools/lib/secret-patterns.js` — canonical unified secret-pattern set with `scanForSecrets()`; fixes pattern drift where GitHub token regex differed between Claude hooks (`gh[pousr]_`) and Codex hooks (`gh[posx]_`)
- Added `tools/lib/file-collection.js` — shared `collectFiles`/`expandPaths`; removes duplicated traversal code from CLI tools
- Added `tools/lib/config.js` — shared `loadConfig()`; removes three independent `codewarden.json` parsers
- `tools/warden-lint.js` reduced 78 → 27 lines; `tools/verify-secrets.js` reduced 66 → 26 lines
- All hook consumers patched to import from shared lib modules
- `npm run test` added; `npm run ci` now includes test step
- README wording: governance rule = "zero-trust secrets policy"; implementation = "hardcoded credential scanner"

---

## v3.1.0 — 2026-05-15

**Codex partial hook enforcement.**

- Added `tools/hooks/codex/warden-apply-patch-hook.js` — `PreToolUse` hook that scans added lines in `apply_patch` patches for hardcoded credentials and estimates resulting file size where a target path is extractable
- Added `tools/hooks/codex/warden-bash-hook.js` — `PreToolUse` hook that scans Bash command strings for hardcoded credential patterns
- Added `tools/hooks/codex/install-hooks.js` — writes code-warden entries into `~/.codex/hooks.json`; idempotent via description marker; guards against missing skill install
- Added `tools/hooks/codex/uninstall-hooks.js` — removes code-warden entries; cleans empty arrays/objects; removes file if empty
- Moved Claude hook files from `tools/hooks/*.js` → `tools/hooks/claude/*.js`
- `install.js`: `--hooks=` and `--uninstall-hooks=` now support both `claude` and `codex` via dynamic dispatch
- `install.js`: `--doctor` and `--verify-target=codex` validate hook script paths via `~/.codex/hooks.json`
- README: compatibility matrix updated (Codex Hard Hooks = Partial); hooks section covers both runtimes with per-surface table
- ADR recorded in `DECISIONS.md`: partial vs full enforcement rationale; `apply_patch`/`Bash` as the available Codex PreToolUse surfaces

---

## v3.0.0 — 2026-05-15

**Optional Claude Code hooks package.**

- Added `tools/hooks/warden-lint-hook.js` — `PreToolUse` hook that blocks `Write`/`Edit` if the resulting file would exceed the configured line limit
- Added `tools/hooks/warden-secrets-hook.js` — `PreToolUse` hook that blocks `Write`/`Edit` if content contains a hardcoded credential pattern
- Added `tools/hooks/install-hooks.js` — merges code-warden hook entries into `~/.claude/settings.json`; idempotent via description marker; guards against missing skill install
- Added `tools/hooks/uninstall-hooks.js` — removes code-warden hook entries and cleans empty arrays/objects
- `install.js`: added `--hooks=claude` and `--uninstall-hooks=claude` flags
- `install.js`: `--doctor` and `--verify-target=claude` now validate hook script paths when hooks are registered
- Hooks use exec form (`node /path/to/hook.js`) — no shell differences across Windows, macOS, Linux
- Config reads `thresholds.max_file_length` from installed `codewarden.json` with flat key fallback
- ADR recorded in `DECISIONS.md`: hooks live inside the installed skill path, not a neutral copy directory

---

## v2.8.0 — 2026-05-15

**Strict per-target health check.**

- Added `--verify-target=<id>` — unknown target ID exits nonzero immediately with known ID list printed; known but not-installed target exits nonzero (no silent skip)
- Refactored `runDoctor` into shared `checkSourceIntegrity()` and `checkTarget()` helpers used by both `--doctor` and `--verify-target`
- Added npm scripts: `install-list`, `install-doctor`

---

## v2.7.1 — 2026-05-15

**Scope Gate and Plan Gate.**

- Added `references/planning-gates.md` — two mandatory pre-implementation declaration blocks
- **Scope Gate**: goal (one sentence), non-goals, files in (contract), files out, verify commands, rollback (concrete command)
- **Plan Gate**: numbered patch order, blast radius class (CONTAINED / MODERATE / HIGH), human checkpoint, post-patch checks
- Both gates hard-fail: no partial gates, no implementation until confirmed
- SKILL.md: session start now enumerates all five steps; Scope Gate and Plan Gate added to Quick Rules, Reference Files, and Drift Signals table
- Windsurf adapter: `planning-gates` added first in concatenation order

---

## v2.7.0 — 2026-05-15

**GitHub Actions CI integration.**

- Added `.github/workflows/code-warden.yml` — the code-warden repo now runs its own quality gate on every push and PR: lint, secrets scan, doctor
- Added `templates/ci/github-actions.yml` — copy-paste template for any GitHub Actions project; downloads release zip at CI time (Option A) or commits skill files (Option B); version pinnable via `CODE_WARDEN_VERSION`
- Added `npm run ci` — lint + secrets + doctor in one command; suitable as pre-commit hook or CI step
- Added CI badge to README
- `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true` and `node-version: '24'` to suppress Node.js 20 deprecation warnings

---

## v2.6.0 — 2026-05-15

**Cross-platform auto-installer.**

- Added `install.js` — root entry point with `--dry-run`, `--all`, `--list`, `--doctor`, `--target=` flags
- Added `tools/auto-targets.js` — target registry for Claude Code, Cursor, Warp, OpenAI Codex, Generic Agents, Windsurf
- Added `tools/auto-detect.js` — three-signal detection: binary in PATH, config dir in HOME, app install path
- Added `tools/auto-windsurf-adapter.js` — concatenates `SKILL.md` + all references into a single flat `.md` for Windsurf's rules format
- Atomic install: copy to `.tmp` → write manifest → remove old → rename into place
- `.code-warden-install.json` manifest records version, target, format, timestamp per install
- `--doctor` checks source integrity and per-target manifest version, SKILL.md presence
- `warden-lint.js` and `verify-secrets.js` updated to support directory expansion — `npm run lint .` and `npm run check-secrets .` now scan full project trees
- Added npm scripts: `install-auto`, `install-dry-run`, `lint`, `check-secrets`, `get-context`

---

## v2.5.0 — 2026-05-14

**Research and fit governance.**

- Added `references/research-and-fit.md` — forces live research for current/version-specific facts; requires explicit fit check before defaulting to familiar stacks (Node, React, SaaS dashboards, CRUD admins, auth-first scaffolds)
- Wired into SKILL.md Quick Rules, Drift Signals, and Reference Files
- Updated `references/cognition.md` and `references/anti-drift.md` to reference fit checks

---

## v2.4.0 — 2026-05-14

**Operational governance layer.**

- Added `references/operations.md` — covers verification-before-completion, source-control hygiene, dependency and supply-chain control, evidence standards for technical claims
- Wired into SKILL.md Quick Rules, Drift Signals, and Reference Files

---

## v2.3.1 — 2026-05-14

**Codex and shared-agent install support.**

- Added `~/.agents/skills/code-warden` as default install target for shared agent runtimes
- Added `AGENTS.md` to `get-context.js` candidate list for Codex-style repositories
- Normalized tool output to ASCII status tags for Windows PowerShell compatibility
- Added `codex` target alongside `claude` and generic agents

---

## v2.3.0 — 2026-03-26

**Secret scanner, Windows installer, README, version sync.**

- Strengthened `verify-secrets.js` with 13 named patterns: OpenAI `sk-`, GitHub `ghp_`/`gho_`/`ghs_`/`ghx_`, AWS `AKIA`, Stripe `sk_live_`/`sk_test_`, bearer tokens, generic key/password assignments
- Added `install.ps1` for Windows
- Added `README.md`
- Added `CLAUDE.md` and `.claude/CLAUDE.md` to `get-context.js` candidate list
- Version synced across all metadata files

---

## v2.2.3 — 2026-03-25

- Replaced soft checklist with mandatory Hard Gate output block at session start
- Agent must produce Architecture State, Session Scope, and Reference Files before proceeding

---

## v2.2.2 — 2026-03-25

- Added verifiable Pre-Flight manifest
- Added `CONFIGURE.md` with tunable thresholds and team-size profiles
- Added `examples/governed-session.md` annotated example

---

## v2.2.1 — 2026-03-25

- Fixed reference paths, trigger phrases, `DECISIONS.md` stub
- Aligned Human Checkpoint threshold: changed from >3 files to >2 files across `cognition.md` and Drift Signals

---

## v2.2.0

- Added `references/anti-drift.md` — Pre-Flight Anchor Check, Session Scoping, Drift Trigger Response Protocol

---

## v2.1.0

- Split monolithic `SKILL.md` into modular reference files under `references/`
- `architecture.md`, `safety.md`, `cognition.md`, `cleanup.md`, `anti-drift.md`
- Lazy-load model: agent reads only the files relevant to the current task

---

## v2.0.0

Initial production release. Skill-level governance for Claude Code covering modular architecture, adversarial feedback, patch-first editing, blast-radius safety, and zero-trust secrets.
