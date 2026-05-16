# code-warden

> Portable AI Coding Governance Layer

Code-Warden is a portable governance layer for AI coding agents. It enforces scoped planning, patch discipline, file-size limits, the zero-trust secrets policy, verification evidence, install health, and optional Claude Code pre-tool-use blocking.

## Four Layers

<p align="center">
  <img src="../logo/layers-diagram.png" alt="Code-Warden Four Layers" width="100%" />
</p>

| Layer | What it does |
|-------|-------------|
| **Skill governance** | Scope Gate, Plan Gate, blast-radius checks, patch-first editing, research gates, drift signals, verification evidence |
| **Local verification** | `warden-lint`, `verify-secrets`, `get-context` — directory-aware, no external deps |
| **Installer and health** | Cross-app auto-installer, manifest-backed installs, `--doctor`, `--verify-target`, Windsurf adapter |
| **Hard enforcement** | Claude Code `PreToolUse` hooks — block oversized writes and hardcoded secrets before the file system is touched |

## Install

```bash
git clone https://github.com/Kodaxadev/Code-Warden.git
cd Code-Warden/code-warden
node install.js
```

### Installer commands

| Command | Purpose |
|---------|---------|
| `node install.js` | Scan, prompt, install to detected apps |
| `node install.js --all` | Install without prompt |
| `node install.js --dry-run` | Preview installs, write nothing |
| `node install.js --list` | Show detected apps and detection method |
| `node install.js --doctor` | Verify source integrity + per-target install health |
| `node install.js --target=claude,cursor` | Force specific targets (warns if not detected) |
| `node install.js --verify-target=claude` | Strict health check — exits nonzero if not installed |
| `node install.js --hooks=claude` | Install PreToolUse hooks into `~/.claude/settings.json` |
| `node install.js --uninstall-hooks=claude` | Remove code-warden hook entries from settings |

Supported targets: **Claude Code**, **Cursor**, **Warp**, **OpenAI Codex**, **Windsurf**, **Generic Agents**.

Each install writes a `.code-warden-install.json` manifest (version, target, format, timestamp).

### npm scripts

```bash
npm run lint            # warden-lint on full project tree
npm run check-secrets   # verify-secrets on full project tree
npm run install-auto    # node install.js
npm run install-dry-run # node install.js --dry-run
npm run install-list    # node install.js --list
npm run install-doctor  # node install.js --doctor
npm run test            # behavioral tests (8 scanner/hook pass/fail cases)
npm run ci              # lint + secrets + test + doctor
```

## Usage

Load at the start of any coding session. Trigger phrases:

- `"load code-warden"` / `"load protocol"`
- `"begin coding"` / `"new session"` / `"governance check"`
- `"start a new module"` / `"review this before we write"`

The session sequence is enforced before any implementation:

<p align="center">
  <img src="../logo/session-flow.png" alt="Code-Warden Session Start Sequence" width="100%" />
</p>

1. Architecture State (Re-injection Rule)
2. Session Scope (Session Scoping Rule)
3. Reference Files (Blueprint Rule)
4. **Scope Gate** — goal, non-goals, files in/out, verify commands, rollback
5. **Plan Gate** — patch order, blast radius class, post-patch checks

See [`examples/governed-session.md`](examples/governed-session.md) for an annotated example.

## Optional Claude Code Hooks

<p align="center">
  <img src="../logo/hook-flow.png" alt="Code-Warden Hook Enforcement Flow" width="100%" />
</p>

Install hard enforcement that runs at the `PreToolUse` level — before writes happen:

```bash
# Requires Claude Code target to be installed first
node install.js --hooks=claude
```

| Hook | Trigger | Policy |
|------|---------|--------|
| `warden-lint-hook.js` | `Write` or `Edit` | Blocks if resulting file exceeds line limit |
| `warden-secrets-hook.js` | `Write` or `Edit` | Hardcoded credential scanner — blocks if content matches any secret pattern |

Both hooks use exec form (`node /path/to/hook.js`) — no shell differences across platforms.

Thresholds are read from `codewarden.json` in the installed skill directory.

```bash
node install.js --uninstall-hooks=claude  # remove hook entries from settings.json
```

Doctor and `--verify-target=claude` validate hook script paths when hooks are registered.

## Configuration

All thresholds in [`codewarden.json`](codewarden.json):

| Setting | Default | What it controls |
|---------|---------|-----------------|
| `thresholds.max_file_length` | 400 | Lines before `warden-lint.js` flags a file |
| `thresholds.pre_flight_trigger_lines` | 150 | Lines before a pre-flight manifest is required |
| `thresholds.human_checkpoint_files` | 2 | Files touched before `[AWAITING CONFIRMATION]` is required |
| `safety.exempt_from_blast_radius` | `tests/`, `docs/`, `scripts/` | Paths excluded from rollback-plan rule |

See [`CONFIGURE.md`](CONFIGURE.md) for team-size profiles and tuning rationale.

## Reference Files

| File | Domain |
|------|--------|
| `references/planning-gates.md` | Scope Gate and Plan Gate contracts |
| `references/architecture.md` | Blueprint Rule, Re-injection, State Update |
| `references/safety.md` | Blast Radius, Patch-First, Zero-Trust, Dependency Freeze |
| `references/cognition.md` | Think Before Coding, Don't Guess Syntax, Human Checkpoint |
| `references/cleanup.md` | Tech Debt format, Test Contract, Decision Log |
| `references/anti-drift.md` | Anchor Check, Session Scoping, Drift Trigger Protocol |
| `references/operations.md` | Verification, source-control hygiene, dependency control |
| `references/research-and-fit.md` | Live research gate, stack fit, product-shape guardrails |

## Author

Justin Davis — MIT License
