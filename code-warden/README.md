# CodeWarden

> Production-grade AI development governance skill for Claude Code and Cowork.

CodeWarden enforces modular architecture, adversarial feedback, patch-first editing,
blast-radius safety, zero-trust secrets, and context-drift prevention in every
AI-assisted coding session.

---

## What it does

When loaded, CodeWarden forces Claude to behave like a disciplined senior engineer:

- **Hard Gate session start** — Architecture state, session scope, and reference file
  status must be declared before any implementation begins
- **Blast Radius Check** — Every rewrite names what might break, how it will be tested,
  and a one-step rollback command
- **Patch-first editing** — Diffs over rewrites; full rewrites require explicit confirmation
- **Zero-trust secrets** — Enforced by `tools/verify-secrets.js`; no hardcoded keys, ever
- **File size limit** — Enforced by `tools/warden-lint.js` (default 400 lines)
- **Context drift prevention** — Architecture re-injection and pre-flight manifests keep
  Claude anchored to scope

---

## Installation

### Linux / macOS

```bash
git clone <repo-url>
cd code-warden
bash install.sh
```

### Windows (PowerShell)

```powershell
git clone <repo-url>
cd code-warden
.\install.ps1
```

Both installers copy the skill to `~/.claude/skills/code-warden/`.

---

## Usage

Load the skill at the start of any coding session. Trigger phrases include:

- `"load protocol"` / `"load code-warden"`
- `"begin coding"` / `"new session"`
- `"start a new module"` / `"review this before we write"`
- `"are we following the rules"` / `"governance check"`

Claude will output the **HARD GATE** block immediately and pause until you confirm
scope. See [`examples/governed-session.md`](examples/governed-session.md) for an
annotated example of the full flow.

---

## Configuration

All thresholds are in [`codewarden.json`](codewarden.json):

| Setting | Default | What it controls |
|---------|---------|-----------------|
| `max_file_length` | 400 | Lines before `warden-lint.js` flags a file |
| `pre_flight_trigger_lines` | 150 | Lines before a JSON pre-flight manifest is required |
| `human_checkpoint_files` | 2 | Files touched before `[AWAITING CONFIRMATION]` is required |
| `exempt_from_blast_radius` | `tests/`, `docs/`, `scripts/` | Paths skipped by rollback-plan rule |

See [`CONFIGURE.md`](CONFIGURE.md) for details on tuning these for your team.

---

## Tools

| Script | Run with | Purpose |
|--------|----------|---------|
| `tools/get-context.js` | `npm run get-context` | Finds and prints the project's architecture doc |
| `tools/verify-secrets.js <files>` | `npm run check-secrets` | Scans for hardcoded API keys, tokens, and passwords |
| `tools/warden-lint.js <files>` | `npm run lint` | Enforces the file length limit from `codewarden.json` |

---

## Reference files

Loaded on demand by Claude when relevant to the task:

| File | Domain |
|------|--------|
| `references/architecture.md` | Blueprint Rule, Re-injection, State Update |
| `references/safety.md` | Blast Radius, Patch-First, Zero-Trust, Dependency Freeze |
| `references/cognition.md` | Think Before Coding, Don't Guess Syntax, Human Checkpoint |
| `references/cleanup.md` | Tech Debt format, Test Contract, Decision Log |
| `references/anti-drift.md` | Anchor Check, Session Scoping, Drift Trigger Protocol |

---

## Author

Justin Davis — MIT License
