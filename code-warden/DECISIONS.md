# DECISIONS.md

Decision log for this project. Maintained per the code-warden cleanup protocol.

## Format

Each entry:
- **Date**: YYYY-MM-DD
- **Decision**: What was decided
- **Alternatives**: What else was considered
- **Reasoning**: Why this choice was made, with links where applicable
- **Files Affected**: List of files changed

---

<!-- Append new decisions below this line -->

---

## 2026-06-10 - Scope lock is opt-in and CLI-owned

- **Decision**: The scope lock lives in `<repoRoot>/.code-warden/scope.json`, is created and expanded only through the user-run `code-warden scope` CLI, and is strictly opt-in (no file means no enforcement). Agent writes to anything under `.code-warden/` are denied unconditionally by the write hooks, scope lock or not.
- **Alternatives considered**: Auto-locking scope from the chat-declared Scope Gate — rejected because the CLI cannot verify what was confirmed in chat, and silent auto-locks would surprise users. Letting agents edit the scope file with logging — rejected because a lock the locked party can rewrite is not a lock.
- **Reasoning**: Enforcement must be anchored in an artifact the agent cannot modify. Keeping it opt-in preserves the existing zero-friction default; keeping it CLI-owned means every expansion is a visible user action recorded in `expansions[]`. Honest limit: an agent can run `scope add` via the shell, but the command is visible in session and the expansion is audited — the lock makes scope creep auditable, not impossible.
- **Files affected**: `tools/scope.js`, `tools/lib/scope-store.js`, `tools/hooks/claude/warden-scope-hook.js`, `tools/hooks/codex/warden-apply-patch-hook.js`, `bin/code-warden.js`, `tools/tests/scope-tests.js`

---

## 2026-06-10 - Command risk gate defaults conservative with id-based overrides

- **Decision**: Ship a Command Risk Gate in both command hooks with two enforced tiers: `blocked` denies outright (root-targeting recursive deletes, `git reset --hard`, force push, `git clean -f`, history rewrites, pipe-to-shell, `chmod -R 777 /`); `high` asks for confirmation on Claude and allows silently on Codex, which exposes no "ask" decision (dependency changes, publish, push, recursive deletes, working-tree discards). Rules merge by `id`: reusing a default id replaces it, `"tier": "off"`/`"allow"` disables it, and invalid user patterns are skipped with warnings.
- **Alternatives considered**: Block the `high` tier too — rejected because a false deny on a routine `git push` erodes trust faster than a missed exotic command. Pattern-list config without ids — rejected because users could not surgically disable or replace one default rule.
- **Reasoning**: The defaults target irreversible or remote-code-execution commands only; everything else is a question, not a wall. The Codex asymmetry is documented rather than papered over: where the runtime cannot ask, Code-Warden does not pretend it asked.
- **Files affected**: `tools/lib/command-risk.js`, `tools/hooks/claude/warden-command-hook.js`, `tools/hooks/codex/warden-bash-hook.js`, `codewarden.json`, `tools/tests/command-risk-tests.js`

---

## 2026-06-10 - Baselines ratchet: growth is a fresh violation, fingerprints carry no secrets

- **Decision**: `report --baseline` fails only NEW or WORSENED violations; legacy findings are reported separately ("N new / M legacy"). A baselined oversized file fails again the moment it grows past its recorded count. Baselined secrets are fingerprinted by sha256 of the trimmed matched line — raw secret text never enters the baseline. A missing baseline file is a hard error, and SARIF carries fresh findings only.
- **Alternatives considered**: Grandfather files at any size until refactored — rejected because that lets legacy files absorb unlimited new code. Store line numbers for secrets — rejected because line drift would silently break the baseline; content hashes survive moves. Treat a missing baseline as "no baseline" — rejected because a typo'd path must not silently disable the gate.
- **Reasoning**: Brownfield repos cannot adopt a hard gate that fails on day one for pre-existing debt. Ratcheting freezes the debt floor while keeping full enforcement for everything new.
- **Files affected**: `tools/lib/baseline.js`, `tools/governance-report.js`, `action.yml`, `templates/ci/github-actions.yml`, `tools/tests/baseline-tests.js`

---

## 2026-06-10 - Audit ledger is hash-chained and auto-enabled by scope locks

- **Decision**: A PostToolUse hook appends one entry per governed tool call to `.code-warden/audit.jsonl`, each entry hashed as `sha256(prev + canonical entry JSON)` anchored at `GENESIS`. Commands are secret-redacted and truncated to 300 chars; no file contents are stored. Enablement: on while a scope lock exists, else `audit.enabled` config, with explicit `false` winning over a scope lock. Claude sessions only.
- **Alternatives considered**: Plain append-only JSONL without chaining — rejected because tamper-evidence is the point of an audit artifact. Always-on ledger — rejected because ungoverned casual sessions should not accumulate per-call logs by default.
- **Reasoning**: A scope lock is an explicit signal that the session is governed, so evidence collection should follow automatically. The hash chain makes edits detectable rather than preventable — consistent with Code-Warden's honesty-over-theater posture. The ledger is per-session evidence and should be gitignored; receipts are the durable artifact.
- **Files affected**: `tools/lib/audit-ledger.js`, `tools/hooks/claude/warden-audit-hook.js`, `tools/lib/hook-events.js`, `tools/tests/audit-ledger-tests.js`

---

## 2026-06-10 - Receipts graduate from honest to corroborated

- **Decision**: `receipt --from-audit[=path] --out=<file>` prefills a draft receipt from the scope lock (confirmed/goal/filesIn), discovered architecture context, git branch/commit, and audit-ledger evidence including chain verification. A `complete` receipt whose `audit.chainValid` is `false` fails validation. The audit block is additive — schemaVersion 1 receipts without it still validate.
- **Alternatives considered**: Mark from-audit receipts complete automatically — rejected because the CLI still cannot verify the human confirmations; drafts stay drafts until a person finishes them. A new schema version — rejected because the change is purely additive and a version bump would orphan existing receipts.
- **Reasoning**: v3.4.0 receipts were honest but unsupported claims. Corroboration ties the claimed scope to a tamper-evident record of what actually happened, without overclaiming what the tooling can know.
- **Files affected**: `tools/receipt.js`, `tools/lib/receipt-audit.js`, `tools/lib/git-info.js`, `tools/lib/context-discovery.js`, `tools/tests/receipt-audit-tests.js`

---

## 2026-06-10 - Git pre-commit is the runtime-agnostic backstop

- **Decision**: `code-warden hooks git` installs a marker-managed pre-commit hook in the repository at cwd (per-repo, unlike the per-user claude/codex hooks) that scans staged content via `git show :path` with the same exclude/allowlist behavior as CI. `git commit --no-verify` bypasses it, and the docs say so plainly.
- **Alternatives considered**: Husky or a hook framework — rejected to preserve zero dependencies. Scanning the working tree instead of the index — rejected because the commit gate must judge what is being committed, not what happens to be on disk.
- **Reasoning**: Runtime hooks only cover agents whose runtimes expose hook surfaces. The pre-commit hook catches anything that reaches `git commit` — any agent, any editor, any human — making it the broadest local layer between the prompt and CI. Marker management keeps installs idempotent and uninstalls surgical alongside user-owned hook content.
- **Files affected**: `tools/lib/hook-dispatch.js`, `install.js`, `bin/code-warden.js`, `tools/tests/git-hook-tests.js`

---

## 2026-06-10 - Stop verification is opt-in to avoid hostile UX

- **Decision**: The Stop hook is registered for all hook installs but inert until `session.verify_on_stop` is `true`. When enabled, it re-runs fast in-process lint/secret scans and blocks completion only on FRESH violations (baseline-aware), with a loop guard honoring `stop_hook_active`.
- **Alternatives considered**: On by default — rejected because a session that cannot end while legacy debt exists is hostile, especially in brownfield repos. Running the full governance report on Stop — rejected because behavioral tests and git subprocesses are too slow for an end-of-turn gate.
- **Reasoning**: Blocking an agent's completion is the most intrusive enforcement point available; it must be deliberate, fast, loop-safe, and unable to trap users on pre-existing problems.
- **Files affected**: `tools/hooks/claude/warden-stop-hook.js`, `tools/lib/scan-core.js`, `codewarden.json`, `tools/tests/lifecycle-hook-tests.js`

---

## 2026-06-10 - Hooks read the governed project's config for CI/hook parity

- **Decision**: All hooks discover the governed project's own `codewarden.json` by walking up from the working directory (checking `codewarden.json` and `code-warden/codewarden.json` at each level, stopping at the first `.git` boundary), falling back to the installed skill's config.
- **Alternatives considered**: Skill-dir config only — rejected because hooks and CI then enforce different thresholds in the same repo, which users experience as nondeterminism. Per-project hook registration — rejected because Claude/Codex hooks are user-level and should not require re-registration per repo.
- **Reasoning**: A governance gate that gives different answers locally and in CI trains users to ignore it. The `.git` boundary stops a session from inheriting config from outside the repository.
- **Files affected**: `tools/lib/config.js`, all hooks under `tools/hooks/`, `tools/tests/config-discovery-tests.js`

---

## 2026-05-19 - Codex hook install owns feature-flag enablement

- **Decision**: `--hooks=codex` now enables `[features].hooks = true` in `~/.codex/config.toml` and removes deprecated `[features].codex_hooks` entries when found. Doctor and `--verify-target=codex` validate feature enablement when Code-Warden Codex hooks are registered.
- **Alternatives considered**:
  - Document the manual config edit only. Rejected because a hook installer that requires users to know a second hidden config step is not actually installing the feature.
  - Make Codex hooks mandatory for every Codex install. Rejected because hard enforcement is optional; base `doctor` should not fail a normal skill install that has not opted into runtime hooks.
  - Add a TOML dependency. Rejected because the needed migration is narrow and Code-Warden currently has zero runtime dependencies.
- **Reasoning**: Current Codex docs state that lifecycle hooks are controlled by the stable `[features].hooks` flag and loaded from `hooks.json` or inline hook config. Code-Warden should align the installer with that current flag instead of relying on deprecated `codex_hooks` behavior or a manual user fix. Source: https://developers.openai.com/codex/config-basic#feature-flags
- **Files affected**: `install.js`, `tools/lib/codex-config.js`, `tools/hooks/codex/install-hooks.js`, `tools/tests/codex-config-tests.js`, `tools/tests/run-all-tests.js`, `README.md`, `code-warden/README.md`, `CHANGELOG.md`, `DECISIONS.md`

---

## 2026-05-19 - Governance receipts start as honest artifacts

- **Decision**: Add `code-warden receipt --template --out=<file>` and `code-warden receipt --validate=<file>` as the first durable session-governance artifact surface.
- **Alternatives considered**:
  - Auto-generate a completed receipt from the CLI. Rejected because the CLI cannot know whether Scope Gate, Plan Gate, and human confirmation actually happened in chat.
  - Fold receipts into the existing governance report immediately. Rejected because reports prove repository checks, while receipts record the pre-edit human contract and should have a separately validated schema first.
  - Skip receipts and keep Scope Gate / Plan Gate as chat-only protocol. Rejected because chat-only gates are hard to audit after context scrolls away.
- **Reasoning**: Current AI coding ecosystems support persistent rules, hooks, plugins, and security policies, but Code-Warden's core promise is stronger when session gates become durable evidence. Claude plugins show bundling of skills/hooks/MCP into installable governance surfaces, Cline shows scoped persistent rules, and OpenHands shows configurable security policy patterns. The first receipt slice keeps claims honest by validating only declared evidence instead of inventing proof. Sources: https://code.claude.com/docs/en/plugins-reference, https://docs.cline.bot/customization/cline-rules, https://docs.openhands.dev/sdk/guides/security
- **Files affected**: `bin/code-warden.js`, `tools/receipt.js`, `tools/tests/run-tests.js`, `README.md`, `code-warden/README.md`, `code-warden/SKILL.md`, `CHANGELOG.md`, `DECISIONS.md`

---

## 2026-05-19 - Risk tiers separate action risk from patch size

- **Decision**: Add configurable `risk_policy` actions and include risk policy validation in governance reports.
- **Alternatives considered**:
  - Reuse only Scope Gate blast radius classes. Rejected because blast radius describes patch impact, while action risk also covers dependency changes, network calls, release publishing, destructive commands, and secret exposure.
  - Add runtime blocking immediately. Rejected because supported enforcement surfaces differ by agent runtime; reporting and policy validation should land before claiming hard enforcement.
  - Keep risk levels implicit in prose. Rejected because machine-readable reports need a stable action-to-tier map.
- **Reasoning**: OpenHands documents confirmation policies and a security analyzer that evaluate agent actions with risk levels before execution. Code-Warden should use the same general pattern while keeping its own governance vocabulary: `low`, `medium`, `high`, and `blocked` tiers tied to declared action classes. Source: https://docs.openhands.dev/sdk/guides/security
- **Files affected**: `codewarden.json`, `package.json`, `tools/lib/risk-policy.js`, `tools/tests/run-all-tests.js`, `tools/tests/risk-policy-tests.js`, `tools/governance-report.js`, `README.md`, `code-warden/README.md`, `code-warden/SKILL.md`, `CHANGELOG.md`, `DECISIONS.md`

---

## 2026-05-19 - MCP servers require governance before integration

- **Decision**: Add a dedicated MCP governance reference before adding any MCP server implementation or config enforcement.
- **Alternatives considered**:
  - Add MCP integrations first and document later. Rejected because MCP servers can introduce code execution, credential, network, and data-egress risks before Code-Warden has a stable approval vocabulary.
  - Treat MCP as only another evidence provider. Rejected because MCP servers can both provide evidence and perform actions, so they need source, toolset, credential, consent, and rollback review.
  - Put MCP guidance in `operations.md`. Rejected because MCP has a distinct trust boundary and enough security-specific rules to deserve a separate reference file.
- **Reasoning**: Current MCP security guidance identifies confused deputy, token passthrough, SSRF, session hijacking, local server compromise, and scope minimization as core risks. GitHub and Snyk show that security tooling is moving into agent/MCP workflows, but Code-Warden should govern those integrations before relying on them. Sources: https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices, https://docs.github.com/en/code-security/how-tos/use-ghas-with-ai-coding-agents/scan-for-secrets-with-github-mcp-server?tool=cli, https://github.com/github/github-mcp-server, https://docs.snyk.io/integrations/snyk-studio-agentic-integrations
- **Files affected**: `references/mcp-governance.md`, `SKILL.md`, `README.md`, `code-warden/README.md`, `CHANGELOG.md`, `DECISIONS.md`

---

## 2026-05-19 - Reference selection is advisory path-based loading

- **Decision**: Add `code-warden references <paths...>` and configurable `reference_selection.rules` for focused governance reference recommendations.
- **Alternatives considered**:
  - Load every reference file every session. Rejected because the growing rule library increases context noise and makes the important rules harder to see.
  - Hide automatic loading inside the skill. Rejected because agents should be explicit about what references were selected and why.
  - Depend on runtime-specific rule systems. Rejected because Code-Warden needs a portable selector that works across Codex, Claude Code, Cursor, Windsurf, and generic agents.
- **Reasoning**: Cline's rule model shows that path-scoped rules reduce irrelevant context while keeping persistent project guidance available. Code-Warden adopts the pattern as advisory recommendations rather than silent enforcement so session receipts and Reference Files blocks remain honest. Source: https://docs.cline.bot/customization/cline-rules
- **Files affected**: `bin/code-warden.js`, `codewarden.json`, `tools/lib/reference-selector.js`, `tools/select-references.js`, `tools/tests/reference-selector-tests.js`, `tools/tests/run-all-tests.js`, `README.md`, `code-warden/README.md`, `code-warden/SKILL.md`, `CHANGELOG.md`, `DECISIONS.md`

---

## 2026-05-19 - External evidence providers have explicit trust limits

- **Decision**: Add `references/evidence-providers.md` and descriptive `external_evidence.providers` config vocabulary before adding provider API collection.
- **Alternatives considered**:
  - Add live provider calls first. Rejected because each provider has different auth, rate limits, artifacts, and trust boundaries; the vocabulary should land before integrations.
  - Treat SARIF and provenance as complete governance proof. Rejected because SARIF is source-finding evidence and provenance proves artifact origin, not session compliance.
  - Keep provider guidance only in release docs. Rejected because provider evidence affects normal development, CI, release, and MCP workflows.
- **Reasoning**: GitHub Code Scanning consumes third-party SARIF, GitHub artifact attestations establish build provenance, npm trusted publishing creates provenance for packages, and agent security providers such as Snyk are moving security checks into agent/MCP workflows. Code-Warden should aggregate those signals with scope and trust limits instead of treating them as interchangeable proof. Sources: https://docs.github.com/en/code-security/code-scanning/integrating-with-code-scanning/uploading-a-sarif-file-to-github?learn=code_security_integration%2F1000, https://docs.github.com/en/actions/security-for-github-actions/using-artifact-attestations/using-artifact-attestations-to-establish-provenance-for-builds, https://docs.npmjs.com/trusted-publishers, https://docs.snyk.io/integrations/snyk-studio-agentic-integrations
- **Files affected**: `references/evidence-providers.md`, `codewarden.json`, `SKILL.md`, `README.md`, `code-warden/README.md`, `CHANGELOG.md`, `DECISIONS.md`

---

## 2026-05-19 - Governance-first content positioning

- **Decision**: Refresh public and package docs so Scope Gates, Plan Gates, blast radius, and verification remain the central product story while SARIF, CI, and npm packaging are presented as evidence layers.
- **Alternatives considered**:
  - Keep adding CI/reporting details without repositioning. Rejected because it makes Code-Warden look like only a scanner instead of an AI development governance protocol.
  - Rewrite all docs from scratch. Rejected because the existing README already captures the target user and adoption path; targeted corrections preserve continuity.
  - Remove CI/SARIF detail from top-level docs. Rejected because verifiable artifacts are part of the original governance intent, not a separate product.
- **Reasoning**: The original purpose was to govern delegated AI coding work before and during edits, then prove compliance afterward. Documentation should keep that order: intent and session gates first, evidence artifacts second, hard enforcement where runtime surfaces allow it.
- **Files affected**: `README.md`, `CHANGELOG.md`, `code-warden/README.md`, `code-warden/SKILL.md`, `code-warden/CONFIGURE.md`, `DECISIONS.md`

---

## 2026-05-19 - Pinned release examples must not use unreleased flags

- **Decision**: Keep the `v3.3.2` release-download CI template on JSON/Markdown/artifact behavior and direct SARIF users to the repository action until the next release includes `--format=sarif` and `--out=<file>`.
- **Alternatives considered**:
  - Leave SARIF active in the `v3.3.2` download template. Rejected because `v3.3.2` does not contain the unreleased SARIF and output-path work.
  - Point the template at a future version. Rejected because copy-paste templates should not reference releases that do not exist yet.
  - Remove SARIF documentation entirely. Rejected because the repository action on `main` has already verified SARIF upload successfully.
- **Reasoning**: Documentation must not ask users to run CLI flags that are not present in the pinned release being downloaded. The next release can make the downloaded-release template and SARIF path fully converge.
- **Files affected**: `README.md`, `CHANGELOG.md`, `code-warden/templates/ci/github-actions.yml`, `DECISIONS.md`

---

## 2026-05-19 - Report output paths support CI artifacts directly

- **Decision**: Add `--out=<file>` to `governance-report.js` and document it through the public `code-warden report` wrapper. Keep SARIF upload active in the repository action and defer downloaded-release template activation until the next package release includes the new flags.
- **Alternatives considered**:
  - Keep relying on shell redirection. Rejected because redirects are harder to make cross-shell friendly in examples and do not create parent directories.
  - Add SARIF only to the root composite action. Rejected because users copying the release-download template should get the same Code Scanning path.
  - Add a separate `sarif` subcommand. Rejected because `report --format=sarif --out=...` keeps report generation in one CLI surface.
- **Reasoning**: CI systems typically want report artifacts as files. A first-class output path makes SARIF generation explicit and easier to test while keeping stdout behavior stable when `--out` is absent.
- **Files affected**: `bin/code-warden.js`, `tools/governance-report.js`, `tools/tests/run-tests.js`, `templates/ci/github-actions.yml`, `README.md`, `code-warden/README.md`, `DECISIONS.md`

---

## 2026-05-19 - GitHub Actions pins track Node 24 action releases

- **Decision**: Move Code-Warden workflow and action references to current Node 24-compatible GitHub Action majors: `actions/checkout@v6`, `actions/setup-node@v6`, `actions/upload-artifact@v7`, and `github/codeql-action/upload-sarif@v4`.
- **Alternatives considered**:
  - Keep the existing pins because the workflow still passes. Rejected because GitHub has announced the CodeQL Action v3 deprecation path and the runner now emits runtime warnings.
  - Pin every action to a full SHA. Rejected for this slice because Code-Warden publishes reusable examples for broad adoption; major-version pins keep the examples readable while staying on maintained action lines.
  - Change only `upload-sarif`. Rejected because the same workflow warning showed other Node 20-era actions being forced to Node 24.
- **Reasoning**: GitHub's current SARIF upload docs show `github/codeql-action/upload-sarif@v4`, and the changelog says v3 will be deprecated with GHES 3.19 in December 2026. Current action docs also show Node 24-compatible checkout, setup-node, and upload-artifact majors. Moving now keeps Code-Warden's own gate and copyable templates ahead of the deprecation window.
- **Files affected**: `action.yml`, `.github/workflows/code-warden.yml`, `.github/workflows/release.yml`, `README.md`, `code-warden/README.md`, `code-warden/templates/ci/github-actions.yml`, `DECISIONS.md`

---

## 2026-05-19 - SARIF is source findings, JSON remains governance evidence

- **Decision**: Add `--format=sarif` and optional GitHub Action SARIF upload for source-located findings only: max file length and hardcoded credentials.
- **Alternatives considered**:
  - Encode behavioral tests, install health, runtime hooks, and session gates as SARIF results. Rejected because those checks do not identify a source file region and would create noisy Code Scanning alerts.
  - Replace the JSON governance report with SARIF. Rejected because SARIF is optimized for code scanning alerts, while Code-Warden also needs audit evidence for tests, installer health, runtime hooks, and session governance.
  - Upload SARIF only after a passing governance run. Rejected because failing findings are exactly when Code Scanning annotations are most useful.
- **Reasoning**: GitHub Code Scanning accepts valid SARIF 2.1.0 and uploads are performed with `github/codeql-action/upload-sarif`, which requires `security-events: write` in the workflow permissions. Code-Warden should map only location-backed source findings into SARIF and keep the broader governance artifact in JSON/Markdown. Sources: https://docs.github.com/en/code-security/reference/code-scanning/sarif-files/sarif-support-for-code-scanning and https://docs.github.com/en/code-security/how-tos/find-and-fix-code-vulnerabilities/integrate-with-existing-tools/uploading-a-sarif-file-to-github
- **Files affected**: `tools/governance-report.js`, `tools/lib/secret-patterns.js`, `tools/lib/sarif.js`, `tools/tests/run-tests.js`, `action.yml`, `.github/workflows/code-warden.yml`, `README.md`, `code-warden/README.md`, `DECISIONS.md`

---

## 2026-05-19 - Composite GitHub Action as first reusable CI entrypoint

- **Decision**: Add a root `action.yml` composite action that runs the packaged Code-Warden governance report, writes a Markdown summary, and uploads the JSON report artifact. Dogfood it in the repository's own quality workflow.
- **Alternatives considered**:
  - Keep only the copy-paste workflow template. Rejected because `uses: Kodaxadev/Code-Warden@v3` is a lower-friction adoption path and easier to keep current.
  - Build a JavaScript action. Rejected for this slice because the existing Node scripts already provide the behavior, and a composite action avoids a bundled action build step.
  - Put the action under `.github/actions/`. Rejected because a root `action.yml` is the standard repository action entrypoint for `owner/repo@ref` usage.
- **Reasoning**: Code-Warden's CI value should be available as a small reusable action before adding richer outputs such as SARIF. A composite action keeps the action auditable and delegates policy behavior to the same local scripts used by npm and release verification.
- **Files affected**: `action.yml`, `.github/workflows/code-warden.yml`, `README.md`, `code-warden/README.md`, `DECISIONS.md`

---

## 2026-05-19 - External npm smoke test stays separate from local CI

- **Decision**: Add `tools/smoke-npx.js` and `npm run smoke:npx` to verify the published package through `npx code-warden@latest` from a clean temp directory. The repository quality workflow runs it as a separate step, while `npm run ci` remains local and deterministic.
- **Alternatives considered**:
  - Fold the networked smoke test into `npm run ci`. Rejected because local CI should not depend on npm registry availability or the already-published `latest` dist-tag.
  - Only test the local package with `npm pack`. Rejected because that misses the user-facing path where `npx` resolves and executes the public package.
  - Use a project fixture inside the repo. Rejected because the point is to avoid local checkout resolution and prove clean-directory behavior.
- **Reasoning**: Code-Warden is distributed primarily through npm and `npx`. A clean external smoke test catches packaging, dist-tag, bin, and report-output regressions that local behavioral tests cannot see.
- **Files affected**: `tools/smoke-npx.js`, `tools/tests/run-tests.js`, `package.json`, `.github/workflows/code-warden.yml`, `README.md`, `DECISIONS.md`

---

## 2026-05-19 - Tag-driven release automation and npm trusted publishing

- **Decision**: Add a tag-triggered GitHub Actions release workflow for Code-Warden. The workflow validates the `vX.Y.Z` tag against `package.json`, runs `npm run ci`, performs `npm publish --dry-run --access public`, verifies the GitHub release does not already exist, publishes to npm through trusted publishing, then creates the GitHub release asset.
- **Alternatives considered**:
  - Continue manual npm and GitHub release publishing. Rejected because manual publishing lacks the same repeatable evidence trail and is easy to run from the wrong tree or with stale docs.
  - Use a long-lived npm automation token. Rejected because npm trusted publishing supports GitHub Actions OIDC and avoids storing reusable publish credentials.
  - Build release automation as a local PowerShell script first. Rejected because the trust boundary for public packages is the repository workflow, tag, and CI run, not one developer machine.
- **Reasoning**: Code-Warden's product promise is verifiable governance. Release publication should therefore be traceable to a tag, workflow run, package version check, CI evidence, and npm provenance rather than relying on local manual commands.
- **Files affected**: `.github/workflows/release.yml`, `README.md`, `code-warden/README.md`, `code-warden/templates/ci/github-actions.yml`, `DECISIONS.md`

---

## 2026-05-19 - Patch release and generated release artifacts

- **Decision**: Release the scanner/install-path cleanup as `v3.3.2` and keep generated release archives out of the source tree. GitHub release assets and npm package tarballs remain the distribution surfaces.
- **Alternatives considered**:
  - Leave the changes under `v3.3.1`. Rejected because scanner exclusions and install manifest path behavior change observable package behavior.
  - Keep historical `code-warden-v*.zip` files committed at the repository root. Rejected because release assets already exist on GitHub releases, while committed archives create source clutter and invite stale package copies.
  - Delete old tags. Rejected because tags are useful release history and are cheaper to preserve than recreate.
- **Reasoning**: The verified working tree adds a behavioral test for generated-directory, lockfile, and log exclusion, and fixes atomic install manifests to report the final install path. These are patch-level fixes under the existing package API. Generated archives should be reproducible from tags or release automation rather than maintained as source files.
- **Files affected**: `package.json`, `SKILL.md`, `README.md`, `DECISIONS.md`, `.gitignore`, root `code-warden-v*.zip` artifacts

---

## 2026-05-15 - Codex partial hook enforcement — apply_patch and Bash (ADR)

- **Decision**: Ship Codex hook support as "partial hard enforcement" covering `apply_patch` and `Bash` tool calls. Claude hooks are moved to `tools/hooks/claude/`. Codex hooks live at `tools/hooks/codex/`. Each runtime gets its own installer/uninstaller. `install.js` dispatches dynamically via `require('./tools/hooks/${id}/install-hooks')`.
- **Alternatives considered**:
  - Full Codex parity with Claude (Write/Edit blocking). Rejected: Codex does not expose Write/Edit as hookable tool calls. `apply_patch` and `Bash` are the only available hook surfaces.
  - Single hooks/ directory without runtime subdirs. Rejected: creates naming collisions and makes the difference in behavior invisible.
  - TOML config for Codex. Rejected: `~/.codex/hooks.json` (JSON) avoids a TOML parser dependency and matches the installer pattern already proven with `settings.json`.
- **Reasoning**: Codex exposes two tool surfaces at PreToolUse — `apply_patch` (for file writes) and `Bash` (for shell execution). Both are realistic vectors for hardcoded secrets. The `apply_patch` hook also estimates resulting file size where a target path is extractable. This covers the most dangerous Codex operations without claiming full parity with the Claude hook surface.
- **Consequence**: Codex cannot block oversized line counts for net-new files created via `cat >>` or `tee` in Bash. This gap is documented in the README compatibility matrix. CI enforcement (`npm run lint`) closes it at the pipeline level.
- **Files affected**: `tools/hooks/claude/` (renamed from `tools/hooks/`), `tools/hooks/codex/warden-apply-patch-hook.js`, `tools/hooks/codex/warden-bash-hook.js`, `tools/hooks/codex/install-hooks.js`, `tools/hooks/codex/uninstall-hooks.js`, `install.js`, `package.json`, `SKILL.md`, `DECISIONS.md`

---

## 2026-05-15 - Claude hooks live inside the installed skill path (ADR)

- **Decision**: Code-warden Claude hooks (`warden-lint-hook.js`, `warden-secrets-hook.js`) are installed from and referenced at `~/.claude/skills/code-warden/tools/hooks/`. Hook scripts are not copied to a neutral directory (e.g. `~/.claude/hooks/code-warden/`). The absolute path to the skill directory is written into `~/.claude/settings.json` at hook install time.
- **Alternatives considered**:
  - Neutral directory (`~/.claude/hooks/code-warden/`). Rejected: requires copying hook scripts to a second location on install, syncing them on update, and maintaining a separate removal path. Creates a split-brain problem with two artifact trees.
  - Relative path via `${CLAUDE_PROJECT_DIR}`. Rejected: hooks are user-level (global), not project-level. No stable relative root exists at user scope.
- **Reasoning**: Hooks are part of the code-warden skill distribution. They version with the skill and are updated by the same installer (`node install.js --hooks=claude`). One source of truth, one update path, one health-check target.
- **Consequence**: If the skill directory is deleted manually, `~/.claude/settings.json` may contain dangling hook entries pointing at missing scripts. `--doctor`, `--verify-target=claude`, and `--uninstall-hooks=claude` all detect and repair this condition. The risk is visible and recoverable.
- **Files affected**: `tools/hooks/warden-lint-hook.js`, `tools/hooks/warden-secrets-hook.js`, `tools/hooks/install-hooks.js`, `tools/hooks/uninstall-hooks.js`, `install.js`, `DECISIONS.md`

---

## 2026-05-14 - Research and fit governance

- **Decision**: Added `references/research-and-fit.md` and wired it into the core skill, cognitive routing, drift signals, README files, and governed-session example. The layer forces live research for current/version-specific facts and requires a fit check before defaulting to familiar stacks or product shapes.
- **Alternatives considered**:
  - Expand only the existing "Don't Guess Syntax" rule. Rejected because syntax accuracy is narrower than the failure mode; the agent can know syntax and still choose the wrong stack or app shape.
  - Put all research rules in `operations.md`. Rejected because operational evidence governs completion and source control, while research/fit governs choice formation before implementation.
- **Reasoning**: AI coding agents often over-index on familiar defaults like Node, React, SaaS dashboards, CRUD admins, or auth-first scaffolds. The skill now makes project fit and current-source research explicit gates instead of relying on generic uncertainty language.
- **Files affected**: `SKILL.md`, `references/research-and-fit.md`, `references/cognition.md`, `references/anti-drift.md`, `README.md`, root `README.md`, `examples/governed-session.md`, `package.json`

---

## 2026-05-14 - Operational governance layer

- **Decision**: Added `references/operations.md` and wired it into the core skill, drift signals, README files, and governed-session example. The layer covers verification-before-completion, source-control hygiene, dependency and supply-chain control, and evidence standards for technical claims.
- **Alternatives considered**:
  - Fold these rules into `references/safety.md`. Rejected because safety already covers execution risk, secrets, patch-first editing, and dependency freeze; adding verification, git hygiene, and citations there would blur the file's responsibility.
  - Add separate files for verification, source control, dependencies, and evidence. Rejected for now because each layer is short and operationally coupled; one focused operational reference avoids unnecessary reference sprawl.
- **Reasoning**: The existing skill prevented many bad coding moves, but it did not make final verification evidence, dirty-worktree ownership, dependency changes, or sourced technical claims explicit stop conditions. These are common failure modes in AI coding sessions and deserve first-class governance.
- **Files affected**: `SKILL.md`, `references/operations.md`, `references/anti-drift.md`, `README.md`, root `README.md`, `examples/governed-session.md`, `package.json`

---

## 2026-05-14 - Codex setup and shared-agent install path

- **Decision**: Treat `~/.agents/skills/code-warden` as the default install target while preserving `codex` and `claude` installer options. Added `AGENTS.md` context discovery, refreshed README setup paths, normalized tool output to ASCII status tags, and bumped package metadata to `2.3.1`.
- **Alternatives considered**:
  - Keep `~/.claude/skills/code-warden` as the only install path. Rejected because the active local environment loads user skills from `~/.agents/skills`.
  - Add a separate Codex-only fork. Rejected because one portable skill with target-specific installers is easier to maintain and audit.
- **Reasoning**: The skill should be usable by Codex now without breaking Claude Code users. `AGENTS.md` is the local instruction surface for Codex-style repositories, and ASCII tool output avoids terminal encoding failures in Windows PowerShell.
- **Files affected**: `AGENTS.md`, `README.md`, `SKILL.md`, `package.json`, `install.ps1`, `install.sh`, `tools/get-context.js`, `tools/warden-lint.js`, `tools/verify-secrets.js`

---

## 2026-03-26 - Polish pass: secret patterns, Windows installer, README, version sync

- **Decision**: Strengthened `verify-secrets.js` with 13 named patterns: OpenAI `sk-`, GitHub `ghp_`/`gho_`/`ghs_`/`ghx_`, AWS `AKIA`, Stripe `sk_live_`/`sk_test_`, bearer tokens, and generic key/password assignments. Added `README.md`. Added `install.ps1` for Windows. Bumped metadata `version` to `2.3.0`. Added `CLAUDE.md` and `.claude/CLAUDE.md` to `get-context.js` candidate list.
- **Alternatives considered**:
  - Build additional enforcement tools such as a pre-flight counter, blast-radius reporter, and human checkpoint enforcer. Rejected after ROI analysis: these rules are enforced more reliably by the existing prompt governance layer; tool output can only shape context if the agent runs the tool and reads the result.
  - Keep `install.sh` only. Rejected because the project owner is on Windows and `install.sh` is not enough for the platform.
- **Reasoning**: The changes were low-debt and high-value. Secret pattern expansion directly improved the only tool that scans third-party code. The Windows installer removed a real friction point for the author. The README provided an onboarding path that was absent. The version sync eliminated a confusing discrepancy. `CLAUDE.md` support aligned with Claude Code project conventions.
- **Files affected**: `tools/verify-secrets.js`, `install.ps1`, `README.md`, `SKILL.md`, `tools/get-context.js`

---

## 2026-03-25 - Align Human Checkpoint threshold with Think Before Coding rule

- **Decision**: Changed `[AWAITING CONFIRMATION]` trigger from >3 files to >2 files across `cognition.md` and the Drift Signals table in `SKILL.md`.
- **Alternatives considered**:
  - Raise Think Before Coding to >3 files. Rejected because it was too permissive and allowed unconfirmed 3-file changes.
  - Keep both thresholds as-is and document the gap as intentional. Rejected because the gap created ambiguous behavior: a plan was required at 2 files but no pause was enforced until 3.
- **Reasoning**: The safer boundary is to require explicit confirmation at the same point planning is required. A user reading both rules would expect them to be consistent. Stricter wins.
- **Files affected**: `references/cognition.md`, `SKILL.md`

---

## 2026-03-25 - Modular references split introduced in v2.1.0

- **Decision**: Separated governance rules into five domain files under `references/` instead of a single monolithic `SKILL.md`.
- **Alternatives considered**:
  - Single flat `SKILL.md` with all rules inline. Rejected because it is token-heavy and loads irrelevant rules every session.
  - Two files: core rules and extended rules. Rejected because it was not granular enough for targeted loading.
- **Reasoning**: Lazy-loading reference files keeps session token cost low. The model only reads the files relevant to the current task type. Each file has a single stated domain, which mirrors the one-concern-per-file rule the skill itself enforces.
- **Files affected**: `references/architecture.md`, `references/safety.md`, `references/cognition.md`, `references/cleanup.md`, `references/anti-drift.md`, `SKILL.md`
