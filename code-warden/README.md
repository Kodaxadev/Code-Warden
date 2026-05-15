# CodeWarden

> Production-grade AI development governance skill for Codex, Claude Code, and Cowork.

CodeWarden enforces modular architecture, adversarial feedback, patch-first editing,
blast-radius safety, zero-trust secrets, and context-drift prevention in every
AI-assisted coding session.

## What It Does

When loaded, CodeWarden forces an AI coding agent to behave like a disciplined senior engineer:

- **Hard Gate session start**: Architecture state, session scope, and reference file status must be declared before implementation begins.
- **Blast Radius Check**: Every rewrite names what might break, how it will be tested, and a one-step rollback command.
- **Patch-first editing**: Diffs over rewrites; full rewrites require explicit confirmation.
- **Zero-trust secrets**: Enforced by `tools/verify-secrets.js`; no hardcoded keys.
- **File size limit**: Enforced by `tools/warden-lint.js` (default 400 lines).
- **Context drift prevention**: Architecture re-injection and pre-flight manifests keep the agent anchored to scope.
- **Operational discipline**: Verification evidence, source-control hygiene, dependency control, and cited technical claims.
- **Research and fit checks**: Live research for current facts, plus explicit resistance to default stacks and SaaS-dashboard assumptions.

## Installation

```bash
git clone https://github.com/Kodaxadev/Code-Warden.git
cd Code-Warden/code-warden
node install.js
```

The auto-installer detects installed AI apps and deploys to all of them.
Supported targets: **Claude Code**, **Cursor**, **Warp**, **OpenAI Codex**,
**Windsurf** (flat-file adapter), and **Generic Agents**.

### Installer commands

| Command | Purpose |
|---------|---------|
| `node install.js` | Scan, prompt, install |
| `node install.js --all` | Install without prompt |
| `node install.js --dry-run` | Preview installs, write nothing |
| `node install.js --list` | Show detected apps and detection method |
| `node install.js --doctor` | Verify source integrity + installed health per target |
| `node install.js --target=claude,cursor` | Force specific targets |

Each install writes a `.code-warden-install.json` manifest recording version,
target, format, and timestamp — used by `--doctor` and future uninstall/repair commands.

### Legacy / manual install

```powershell
.\install.ps1              # agents (default)
.\install.ps1 -Target claude
```

```bash
bash install.sh            # agents (default)
bash install.sh claude
```

## Usage

Load the skill at the start of any coding session. Trigger phrases include:

- `"load protocol"` / `"load code-warden"`
- `"begin coding"` / `"new session"`
- `"start a new module"` / `"review this before we write"`
- `"are we following the rules"` / `"governance check"`

The agent will output the **HARD GATE** block immediately and pause until you
confirm scope. See [`examples/governed-session.md`](examples/governed-session.md)
for an annotated example of the full flow.

## Configuration

All thresholds are in [`codewarden.json`](codewarden.json):

| Setting | Default | What it controls |
|---------|---------|-----------------|
| `max_file_length` | 400 | Lines before `warden-lint.js` flags a file |
| `pre_flight_trigger_lines` | 150 | Lines before a JSON pre-flight manifest is required |
| `human_checkpoint_files` | 2 | Files touched before `[AWAITING CONFIRMATION]` is required |
| `exempt_from_blast_radius` | `tests/`, `docs/`, `scripts/` | Paths skipped by rollback-plan rule |

See [`CONFIGURE.md`](CONFIGURE.md) for tuning details.

## Tools

### Session tools (used during coding sessions)

| Script | Run with | Purpose |
|--------|----------|---------|
| `tools/get-context.js` | `npm run get-context` | Finds and prints project architecture docs (`AGENTS.md`, `CLAUDE.md`, `PRD.md`, etc.) |
| `tools/verify-secrets.js <files>` | `npm run check-secrets -- <files>` | Scans for hardcoded API keys, tokens, and passwords |
| `tools/warden-lint.js <files>` | `npm run lint -- <files>` | Enforces the file length limit from `codewarden.json` |

### Installer tools (used by install.js)

| Script | Purpose |
|--------|---------|
| `tools/auto-targets.js` | Target registry — app IDs, skill directories, and per-platform detection signals |
| `tools/auto-detect.js` | Detection logic — checks binaries in PATH, config dirs, and app install paths |
| `tools/auto-windsurf-adapter.js` | Concatenates `SKILL.md` + all references into a single flat `.md` for Windsurf's rules format |

## Reference Files

Loaded on demand by the agent when relevant to the task:

| File | Domain |
|------|--------|
| `references/architecture.md` | Blueprint Rule, Re-injection, State Update |
| `references/safety.md` | Blast Radius, Patch-First, Zero-Trust, Dependency Freeze |
| `references/cognition.md` | Think Before Coding, Don't Guess Syntax, Human Checkpoint |
| `references/cleanup.md` | Tech Debt format, Test Contract, Decision Log |
| `references/anti-drift.md` | Anchor Check, Session Scoping, Drift Trigger Protocol |
| `references/operations.md` | Verification evidence, source-control hygiene, dependency control, evidence standards |
| `references/research-and-fit.md` | Live research gate, stack fit checks, product-shape guardrails |

## Author

Justin Davis - MIT License
