# code-warden v2.7.1

Scope Gate + Plan Gate — pre-implementation declaration blocks.

## What's new

### `references/planning-gates.md` (new file)

Two structured output blocks the AI produces and the user confirms before
any code is written:

**Scope Gate** — fires at session start or when scope becomes ambiguous:
- Goal (one sentence — if it can't be, split the session)
- Non-goals
- Files in (contract — touching an unlisted file requires approval)
- Files out (must-not-touch, with reason)
- Verify after (exact commands to confirm success)
- Rollback (one concrete command, no "manually undo")

**Plan Gate** — fires before any multi-file or >30-line change:
- Patch order (numbered, sequential by default)
- Blast radius class: CONTAINED / MODERATE / HIGH
- Human checkpoint (YES if MODERATE/HIGH or >2 files)
- Post-patch checks (concrete commands, not "verify it works")

Both gates hard-fail: no partial gates, no implementation until both are
confirmed. If any field is unknown, the AI must halt and request the
missing information.

### SKILL.md updates

- Version bumped to 2.7.1
- Session Start mandatory sequence now enumerates all 5 steps including
  Scope Gate and Plan Gate
- Quick Rules now includes Scope Gate and Plan Gate at the top
- Reference Files section lists `planning-gates.md` first
- Drift Signals table adds three new hard-stop signals:
  - Began implementing without confirmed Scope Gate
  - Began implementing without confirmed Plan Gate
  - Touched file not declared in Scope Gate

### Windsurf adapter

`planning-gates` added as the first reference in the concatenation order
so it appears immediately after SKILL.md in the flat Windsurf rules file.

## Verification

```bash
npm run ci
node tools/warden-lint.js references/planning-gates.md
node tools/verify-secrets.js references/planning-gates.md
```
