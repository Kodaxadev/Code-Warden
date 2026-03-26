# DECISIONS.md
Decision log for this project. Maintained per the code-warden cleanup protocol.

## Format
Each entry:
- **Date**: YYYY-MM-DD
- **Decision**: What was decided
- **Alternatives**: What else was considered
- **Reasoning**: Why this choice was made (include links where applicable)
- **Files Affected**: List of files changed

---

<!-- Append new decisions below this line -->

---

## 2026-03-26 — Polish pass: secret patterns, Windows installer, README, version sync

- **Decision**: Strengthened `verify-secrets.js` with 13 named patterns (OpenAI `sk-`, GitHub `ghp_`/`gho_`/`ghs_`/`ghx_`, AWS `AKIA`, Stripe `sk_live_`/`sk_test_`, bearer tokens, generic key/password assignments). Added `README.md`. Added `install.ps1` for Windows. Bumped metadata `version` to `2.3.0`. Added `CLAUDE.md` and `.claude/CLAUDE.md` to `get-context.js` candidate list.
- **Alternatives considered**:
  - Building additional enforcement tools (pre-flight counter, blast-radius reporter, human checkpoint enforcer) — rejected after ROI analysis: these rules are enforced more reliably by the existing prompt governance layer; tool output can only shape context if Claude runs the tool and reads the result, and none of these would produce actionable read output.
  - Keeping `install.sh` only — rejected, the project owner is on Windows and `install.sh` is a dead letter on the platform.
- **Reasoning**: All five changes are low-debt, high-value. Secret pattern expansion directly improves the only tool that scans third-party code. The Windows installer removes a real friction for the author. The README provides an onboarding path that was completely absent. The version sync eliminates a confusing discrepancy. CLAUDE.md support aligns with Claude Code project conventions.
- **Files affected**: `tools/verify-secrets.js`, `install.ps1` (new), `README.md` (new), `SKILL.md`, `tools/get-context.js`

---

## 2026-03-25 — Align Human Checkpoint threshold with Think Before Coding rule

- **Decision**: Changed `[AWAITING CONFIRMATION]` trigger from >3 files to >2 files across `cognition.md` and the Drift Signals table in `SKILL.md`.
- **Alternatives considered**:
  - Raise Think Before Coding to >3 files (rejected — too permissive, allows unconfirmed 3-file changes)
  - Keep both thresholds as-is and document the gap as intentional (rejected — the gap creates ambiguous behavior: plan is required at 2 files but no pause enforced until 3)
- **Reasoning**: The safer boundary is to require explicit confirmation at the same point planning is required. A user reading both rules would expect them to be consistent. Stricter wins.
- **Files affected**: `references/cognition.md`, `SKILL.md`

---

## 2026-03-25 — Modular references/ split introduced in v2.1.0

- **Decision**: Separated governance rules into five domain files under `references/` instead of a single monolithic SKILL.md.
- **Alternatives considered**:
  - Single flat SKILL.md with all rules inline (rejected — token-heavy, loads irrelevant rules every session)
  - Two files: core rules + extended rules (rejected — not granular enough for targeted loading)
- **Reasoning**: Lazy-loading reference files keeps session token cost low. The model only reads the files relevant to the current task type. Each file has a single stated domain (architecture, safety, cognition, cleanup, anti-drift), which mirrors the one-concern-per-file rule the skill itself enforces.
- **Files affected**: `references/architecture.md`, `references/safety.md`, `references/cognition.md`, `references/cleanup.md`, `references/anti-drift.md`, `SKILL.md`
