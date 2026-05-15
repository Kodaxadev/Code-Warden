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
