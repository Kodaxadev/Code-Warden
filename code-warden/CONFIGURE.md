# Configuration Guide

code-warden ships with opinionated defaults. Every threshold is tunable.
This file documents what you can change, where to change it, and why
the defaults are what they are.

---

## Thresholds

| Setting | Default | File(s) | Rationale |
|---------|---------|---------|-----------|
| Max file size | 400 lines | `SKILL.md` (Quick Rules), `references/anti-drift.md` (Pre-Flight) | Keeps files reviewable in a single pass. Raise to 500–600 for data-heavy modules (e.g., schema definitions, test fixtures). |
| Pre-flight trigger | 150 lines contiguous | `references/anti-drift.md` (Anchor Check), `SKILL.md` (Drift Signals) | Forces a pause before large outputs. Lower to 100 for stricter governance; raise to 200 if your codebase has legitimately dense modules. |
| Human Checkpoint file threshold | >2 files | `references/cognition.md`, `references/anti-drift.md`, `SKILL.md` | Matches the "Think Before Coding" complexity trigger. Monorepo teams doing routine 5-file PRs may raise to >4. |
| Human Checkpoint line threshold | >300 lines total | `references/cognition.md` | Total output volume before requiring explicit confirmation. Adjust based on your typical feature size. |
| Max function length | 50 lines | Referenced in architecture patterns | Encourages helper extraction. Some teams prefer 30 (strict) or 75 (flexible). |
| Blast Radius required | Any rewrite of working code | `references/safety.md` | Non-negotiable for core logic. You may exempt test files or generated code if you trust your CI pipeline. |

---

## How to Customize

1. **Fork the skill** into your project's `.claude/skills/` directory.
2. Find the threshold in the file(s) listed above.
3. Change the number. Update it in **every file listed** — the same threshold
   appears in multiple places for redundancy (SKILL.md summary + reference detail).
4. Log the change in `DECISIONS.md` so your team knows why the default was overridden.

---

## Profiles (Copy-Paste Starting Points)

### Solo developer (default)
No changes needed. The defaults are calibrated for a single developer
working with an AI assistant on small-to-medium projects.

### Small team (2–5 devs)
Consider raising:
- Human Checkpoint file threshold → >3 files (routine multi-file PRs are normal)
- Pre-flight trigger → 200 lines (less interruption during feature work)

### Monorepo / large team
Consider raising:
- Human Checkpoint file threshold → >4 files
- Max file size → 500 lines (for generated code, schemas, or migration files only)
- Add an exemption list for Blast Radius on auto-generated files

### High-security / compliance
Consider lowering:
- Pre-flight trigger → 100 lines
- Human Checkpoint line threshold → >200 lines total
- Make Blast Radius Check mandatory for ALL files, including tests
