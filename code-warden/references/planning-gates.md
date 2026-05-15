# Planning Gates

Two mandatory declaration blocks that fire before implementation begins.
Neither is a checklist — they are structured outputs the AI produces and
the user confirms before any code is written.

---

## Scope Gate

Fires when: a new session begins, scope is ambiguous, or a request would
touch files outside the current declared scope.

**AI produces this block. User confirms before proceeding.**

```
SCOPE GATE

Goal:          [One sentence — what this session will accomplish]
Non-goals:     [What is explicitly out of scope for this session]
Files in:      [Complete list of files the AI expects to read or modify]
Files out:     [Files that must not be touched, with reason]
Verify after:  [The exact commands that will confirm success]
Rollback:      [One-step revert — e.g. git checkout HEAD -- <files>]
```

Rules:
- Goal must be one sentence. If it cannot be, split into multiple sessions.
- Files-in list is a contract. Any unlisted file requires a new Scope Gate
  or explicit user approval before it is touched.
- Rollback must be a concrete command, not "undo manually."
- If any field is unknown, write `[UNKNOWN — user must provide]` and halt.

---

## Plan Gate

Fires when: the session will touch more than one file, or any single change
exceeds 30 lines.

**AI produces this block after Scope Gate is confirmed. User confirms before any edits.**

```
PLAN GATE

Patch order:
  1. <file> — <one-line description of change>
  2. <file> — <one-line description of change>
  ...

Blast radius class:  [CONTAINED | MODERATE | HIGH]
  CONTAINED  — changes isolated to declared files, no interface changes
  MODERATE   — shared interfaces or types modified, downstream callers may need updates
  HIGH       — data-flow changes, schema changes, or deletions of public APIs

Human checkpoint:    [YES | NO]
  YES if: blast radius is MODERATE or HIGH, or more than 2 files are touched.

Post-patch checks:
  After step 1: [command or verification]
  After step 2: [command or verification]
  After all:    [final verification suite]
```

Rules:
- Patch order is sequential. Do not parallelise edits across files unless
  confirmed safe and explicitly approved.
- Blast radius class must be declared before the first edit, not assessed after.
- If Human Checkpoint is YES, pause after the last patch and output
  `[AWAITING CONFIRMATION]` before marking the task complete.
- Post-patch checks must be concrete commands, not "verify it works."

---

## Gate Failure Response

If either gate cannot be completed:

1. State which field is blocking and why.
2. Ask for the minimum information needed to fill it.
3. Do not produce partial gates. Do not proceed without both gates confirmed.

A partial plan is not a plan. Implement nothing until both gates are signed off.
