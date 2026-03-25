---
name: code-warden
description: >
  AI development governance protocol enforcing modular architecture, adversarial
  feedback, patch-first editing, blast radius safety, zero-trust secrets, and
  context drift prevention. Use at the start of any coding session, when
  generating or modifying modules, when refactoring existing code, when making
  architectural changes, or when any of the following are said: "load protocol",
  "apply dev rules", "check the rules", "start a new module", "review this before
  we write", "are we following the rules", "new session", "begin coding",
  "load code-warden", "governance check", or any request to begin writing code.
metadata:
  author: Justin Davis
  version: 2.2.3
  category: development-governance
  changelog: |
    v2.2.3 (2026-03-25): Replaced soft checkbox Session Start Checklist with mandatory
      Hard Gate output block — model must produce architecture state, session scope, and
      reference file status before any other response. Strengthened Re-injection Rule in
      anti-drift.md from passive "open with" to explicit "output as FIRST response" directive.
    v2.2.2 (2026-03-25): Replaced self-certifying Anchor Check with verifiable Pre-Flight
      manifest, added CONFIGURE.md with threshold table and team profiles, added examples/
      folder, updated README
    v2.2.1 (2026-03-25): Fixed reference paths, expanded triggers, added DECISIONS.md stub,
      fixed cognition/confirmation threshold contradiction (>2 files aligns both rules)
    v2.2.0: Added anti-drift.md, Anchor Check, Drift Trigger Response Protocol
    v2.1.0: Added references/ modular split — safety, cognition, cleanup, architecture
    v2.0.0: Initial production release with Session Start Checklist and Quick Rules
---

# code-warden v2.2.3

Production-grade AI development governance skill.
Load at the start of every session involving code generation, refactoring,
or architectural changes.

## Session Start — HARD GATE

Do not ask implementation questions. Do not gather requirements. Do not
proceed past this block until all three outputs are produced and confirmed
by the user.

**Output this block verbatim as your FIRST response before anything else:**

---

**ARCHITECTURE STATE** (Re-injection Rule)

[Paste the user's architecture doc or PRD here. If none provided, write:]

> ⚠️ No architecture doc found — applying Re-injection Fallback:
> - Last known files: [list any files mentioned in this session]
> - Current data flow: [unknown — user must provide before proceeding]
>
> **REQUEST:** Paste your architecture doc, PRD, or a 3-sentence scope
> summary before we continue.

**SESSION SCOPE** (Session Scoping Rule)

> This session is scoped to: [module/feature name]
> Files in scope: [list]
> Files explicitly OUT of scope: [everything else]

[If scope is unknown, write:]

> ⚠️ Scope undefined — user must confirm before proceeding.

**REFERENCE FILES LOADED** (Blueprint Rule)

> For this task, loading: [list relevant references/ files]
> Status: [✅ found | ⚠️ missing from install — rules enforced from SKILL.md]

---

**Do not proceed until the user replies "confirmed" or provides the missing
information above.**

## Quick Rules

- **Max file size**: 400 lines — split into modules at the limit
- **Editing mode**: patch/diff first — no full rewrites without blast radius check
- **Feedback mode**: adversarial — correctness over comfort, push back on weak logic
- **Secrets**: zero-trust — .env only, no hardcoded keys or placeholder tokens
- **Uncertainty**: say so — never guess niche syntax or stale API behavior
- **Concerns**: one responsibility per file — support human auditing

## Reference Files

Load these when relevant to the current task:

- Architecture decisions, Blueprint Rule, Re-injection → [references/architecture.md](references/architecture.md)
- Blast Radius, Patch-First, Zero-Trust, Dependency Freeze → [references/safety.md](references/safety.md)
- Think Before Coding, Don't Guess Syntax, Human Checkpoint → [references/cognition.md](references/cognition.md)
- Tech Debt flag format, Test Contract, Decision Log → [references/cleanup.md](references/cleanup.md)
- Anchor Check, Session Scoping, Drift Trigger → [references/anti-drift.md](references/anti-drift.md)

## Drift Signals — Hard Stop

Stop and re-anchor immediately if any of these appear:

| Signal | Action |
|--------|--------|
| Guessed library syntax without searching docs | Search live docs, correct output |
| Unexplained contiguous block >150 lines | Split or justify before continuing |
| Skipped Blast Radius Check before a rewrite | Run check before proceeding |
| No `[AWAITING CONFIRMATION]` before >2-file change | Pause and request confirmation |
| Monolithic file output without module split | Refactor into separated concerns |
