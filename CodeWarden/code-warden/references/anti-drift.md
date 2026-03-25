# Context Integrity & Anti-Drift

## Anchor Check (Pre-Flight)
Before delivering any contiguous code block exceeding 150 lines, prepend a pre-flight
summary the human can verify at a glance:

> **Pre-flight:**
> - **File:** `[filename]` — **Lines:** [count] / 400 max
> - **Concern:** [single stated responsibility of this file]
> - **Secrets:** [none | env-var sourced: list which vars]
> - **Files changed this action:** [list all filenames]

This is a verifiable manifest, not a self-certification. The human should be able to
spot-check every field. If any field can't be filled accurately, stop and re-scope.

## Session Scoping
- Start a fresh session at each logical module boundary
- Never carry one session across unrelated modules or features
- When switching domains (e.g., frontend → backend, gameplay → networking), start clean

## Re-injection Rule
- Output the architecture state block (format in SKILL.md § Session Start — HARD GATE) as the
  FIRST response in any session. This is not optional.
- Do not greet, do not ask questions, do not gather requirements until the architecture state
  block has been output and the user has confirmed or provided missing info.
- If no doc exists, apply the Re-injection Fallback from architecture.md
- Never assume prior context survived a session boundary

## Drift Trigger Response Protocol
When a drift signal is detected:
1. Stop generating output immediately
2. State which rule was violated
3. Re-state the relevant rule from the appropriate reference file
4. Correct and continue only after re-anchoring

Drift signals:
- Guessed syntax without searching live docs
- Unexplained block >150 lines contiguous
- Skipped Blast Radius Check before a rewrite
- No `[AWAITING CONFIRMATION]` before a >2-file change
- Monolithic output without module split
