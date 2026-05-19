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
