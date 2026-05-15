# code-warden

<p align="center">
  <a href="https://github.com/Kodaxadev/Code-Warden/actions/workflows/code-warden.yml">
    <img src="https://github.com/Kodaxadev/Code-Warden/actions/workflows/code-warden.yml/badge.svg" alt="Code-Warden Quality Gate" />
  </a>
  <img src="https://img.shields.io/badge/version-3.0.0-blue" alt="Version 3.0.0" />
  <img src="https://img.shields.io/badge/license-MIT-yellow" alt="MIT License" />
  <img src="https://img.shields.io/badge/Claude%20Hooks-PreToolUse-purple" alt="Claude Code PreToolUse Hooks" />
  <img src="https://img.shields.io/badge/AI%20Governance-enforced-red" alt="AI Governance Enforced" />
</p>

<p align="center">
  <img src="logo/hero-banner.png" alt="Code-Warden — Portable AI Coding Governance Layer" width="100%" />
</p>

## Who This Is For

**Code-Warden is for when AI coding stops being autocomplete and starts being delegated work.**

If you run short, supervised one-file AI edits, Code-Warden may be overkill.

If you run long Claude Code, Codex, or Cursor sessions — multi-file refactors, parallel projects, CI-gated work, or client and product code — Code-Warden gives your agent declared scope, verifiable checks, and enforceable safety rails.

**Built for developers who:**
- Run long, high-autonomy AI coding sessions
- Let agents touch multiple files or whole modules
- Work across several projects at once
- Need CI-friendly verification without relying on chat memory
- Need an audit trail for what the agent was allowed to change
- Want hard blocking where the runtime supports it

**Probably overkill if:**
- You only use AI for short snippets
- You manually review every one-file edit before it lands
- You do not need CI checks
- You are comfortable relying entirely on prompt instructions

## Prevents / Allows

**Prevents**
- Code before scope is declared
- Multi-file edits without a patch plan
- Files touched outside approved scope
- Oversized monolithic files
- Hardcoded API keys and credentials
- Completion claims without verification evidence
- Stale or broken agent installs
- Claude Code writes that violate hook policy

**Allows**
- Normal development work
- Fast solo-founder iteration
- Existing agent workflows
- CI enforcement without chat memory
- Optional hard blocking only where supported

## Four Layers

<p align="center">
  <img src="logo/layers-diagram.png" alt="Code-Warden Four Layers" width="900" />
</p>

## Compatibility

| Runtime | Install | Skill Rules | Local Tools | CI | Hard Hooks |
|---|---:|---:|---:|---:|---:|
| Claude Code | ✅ | ✅ | ✅ | ✅ | ✅ PreToolUse |
| OpenAI Codex | ✅ | ✅ | ✅ | ✅ | — |
| Cursor | ✅ | ✅ | ✅ | ✅ | — |
| Warp | ✅ | ✅ | ✅ | ✅ | — |
| Windsurf | ✅ flat rules | ✅ adapted | ✅ | ✅ | — |
| Generic Agents | ✅ | ✅ | ✅ | ✅ | — |
| GitHub Actions | — | — | ✅ | ✅ | — |

Hard hooks are currently Claude Code-specific. Other runtimes still get skill governance, local verification, install health checks, and CI enforcement.

## Why Not Just Prompt Better?

You should prompt well. Code-Warden does not replace that.

**Prompts are policy. Code-Warden adds verification and enforcement.**

| Rule | Prompt-only | Code-Warden |
|---|---|---|
| Keep files modular | Agent remembers | `warden-lint` checks files and directories |
| No hardcoded secrets | Agent remembers | `verify-secrets` scans locally and in CI |
| Stay inside scope | Agent declares scope | Scope Gate creates an explicit file contract |
| Verify before done | Agent claims it checked | `npm run ci` produces a deterministic result |
| Block unsafe writes | Not possible everywhere | Claude `PreToolUse` hooks deny `Write`/`Edit` before execution |

Code-Warden is portable at the governance, installer, local-tooling, and CI layers. Hard pre-write blocking is currently Claude Code-specific because Claude exposes `PreToolUse` hooks. Other runtimes get all other layers.

## What Code-Warden Is / Is Not

**Code-Warden is:**
- A governance layer for AI coding agents
- A local verification toolkit
- A cross-runtime installer and health checker
- A CI-friendly policy gate
- An optional Claude Code hard-enforcement layer

**Code-Warden is not:**
- A replacement for your coding agent
- A full development methodology like Superpowers
- A sandbox or security boundary against malicious users
- A guarantee that unsupported runtimes can block tool calls before execution

> Code-Warden governs the agent inside the workflow you already use.

## Adoption Path

You do not need to install everything at once. Each layer adds value independently.

1. **CI only** — add `warden-lint` and `verify-secrets` to GitHub Actions. No skill install required.
2. **Skill governance** — install Code-Warden into your AI runtime. Scope Gates, Plan Gates, and drift signals activate immediately.
3. **Hard enforcement** — enable Claude Code hooks for pre-write blocking. Requires step 2 first.

Start where you have the most immediate pain.

## Install

```bash
git clone https://github.com/Kodaxadev/Code-Warden.git
cd Code-Warden/code-warden
node install.js
```

The auto-installer scans for installed AI apps and deploys to all of them in one step.
Supports Claude Code, Cursor, Warp, OpenAI Codex, Windsurf, and generic agent runtimes.

### Common commands

```bash
node install.js --all                    # install without prompt
node install.js --dry-run                # preview, write nothing
node install.js --list                   # show detected apps
node install.js --doctor                 # verify source + install health
node install.js --verify-target=claude   # strict per-target check, exits nonzero on failure
node install.js --hooks=claude           # install Claude Code PreToolUse hooks
node install.js --uninstall-hooks=claude # remove Claude Code hooks
```

### npm scripts

```bash
npm run lint            # scan full project tree for oversized files
npm run check-secrets   # scan full project tree for hardcoded credentials
npm run ci              # lint + secrets + doctor
npm run install-auto    # node install.js
npm run install-doctor  # node install.js --doctor
```

## Invoke

```
/code-warden
```

Or: `"load code-warden"`, `"new session"`, `"begin coding"`, `"governance check"`.

### Session Start Sequence

<p align="center">
  <img src="logo/session-flow.png" alt="Code-Warden Session Start Sequence" width="100%" />
</p>

## Optional Claude Code Hooks

<p align="center">
  <img src="logo/hook-flow.png" alt="Code-Warden Hook Enforcement Flow" width="900" />
</p>

```bash
node install.js --hooks=claude           # install (requires Claude target installed first)
node install.js --uninstall-hooks=claude # remove
```

Doctor and `--verify-target=claude` validate hook script paths when hooks are registered.

## CI Integration

```yaml
- name: Install Code-Warden
  run: |
    curl -fsSL -o cw.zip \
      https://github.com/Kodaxadev/Code-Warden/releases/download/v3.0.0/code-warden-v3.0.0.zip
    unzip -q cw.zip -d .code-warden-ci

- name: Lint — file length limits
  run: node .code-warden-ci/tools/warden-lint.js .

- name: Secrets — zero-trust scan
  run: node .code-warden-ci/tools/verify-secrets.js .
```

Full template: [`code-warden/templates/ci/github-actions.yml`](code-warden/templates/ci/github-actions.yml)

## File Structure

| File | Purpose |
|------|---------|
| `SKILL.md` | Session gates, quick rules, drift signals, reference index |
| `CONFIGURE.md` | Tunable thresholds and team-size profiles |
| `DECISIONS.md` | Architecture decision log |
| `references/planning-gates.md` | Scope Gate and Plan Gate contracts |
| `references/architecture.md` | Blueprint Rule, Re-injection, State Update |
| `references/safety.md` | Blast Radius, Patch-First, Zero-Trust, Dependency Freeze |
| `references/cognition.md` | Think Before Coding, Don't Guess Syntax, Human Checkpoint |
| `references/cleanup.md` | Tech Debt format, Test Contract, Decision Log |
| `references/anti-drift.md` | Anchor Check, Session Scoping, Drift Trigger |
| `references/operations.md` | Verification evidence, git hygiene, dependency control |
| `references/research-and-fit.md` | Live research gate, stack fit, product-shape guardrails |

## Version

v3.0.0 — See [`code-warden/SKILL.md`](code-warden/SKILL.md) for full changelog.

## Author

Justin Davis — MIT License
