# code-warden

<p align="center">
  <img src="logo/codewarden.png" alt="code-warden logo" width="160" />
</p>

<p align="center">
  <a href="https://github.com/Kodaxadev/Code-Warden/actions/workflows/code-warden.yml">
    <img src="https://github.com/Kodaxadev/Code-Warden/actions/workflows/code-warden.yml/badge.svg" alt="Code-Warden Quality Gate" />
  </a>
  <img src="https://img.shields.io/badge/version-3.0.0-blue" alt="Version 3.0.0" />
  <img src="https://img.shields.io/badge/license-MIT-yellow" alt="MIT License" />
  <img src="https://img.shields.io/badge/Claude%20Hooks-PreToolUse-purple" alt="Claude Code PreToolUse Hooks" />
  <img src="https://img.shields.io/badge/AI%20Governance-enforced-red" alt="AI Governance Enforced" />
</p>

<p align="center"><strong>Code-Warden makes AI coding agents operate under declared scope, verifiable checks, and enforceable safety policy.</strong></p>

A portable governance and enforcement layer for AI coding agents. Combines skill-level behavioral rules, local verification tools, CI-ready checks, and optional Claude Code hooks — before code is written, while code is being changed, and before work is claimed complete.

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

## CI Integration

Add enforcement to any GitHub Actions pipeline:

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
