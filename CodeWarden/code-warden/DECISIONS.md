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
