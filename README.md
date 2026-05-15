# code-warden

<p align="center">
  <img src="logo/codewarden.png" alt="code-warden logo" width="160" />
</p>

[![Code-Warden Quality Gate](https://github.com/Kodaxadev/Code-Warden/actions/workflows/code-warden.yml/badge.svg)](https://github.com/Kodaxadev/Code-Warden/actions/workflows/code-warden.yml)

**Code-Warden makes AI coding agents operate under declared scope, verifiable checks, and enforceable safety policy.**

A portable governance and enforcement layer for AI coding agents. It combines skill-level behavioral rules, local verification tools, CI-ready checks, and optional Claude Code hooks to keep AI-assisted development scoped, auditable, modular, and safe — before code is written, while code is being changed, and before work is claimed complete.

## Four Layers

### 1. Skill governance
Scope Gate and Plan Gate require declaration before any implementation begins. Blast-radius checks, patch-first editing, research gates, adversarial feedback, drift signals, and verification evidence are enforced through every session.

### 2. Local verification tooling
`warden-lint` and `verify-secrets` scan files and directories, not just individual paths. `get-context` auto-discovers project architecture docs. All tools run locally, offline, with no external dependencies.

### 3. Installer and health system
Cross-app auto-installer with binary, config-dir, and app-path detection. Manifest-backed atomic installs with `--doctor`, `--verify-target`, and Windsurf flat-file adapter. Supports Claude Code, Cursor, Warp, OpenAI Codex, Windsurf, and generic agent runtimes.

### 4. Optional hard enforcement
Claude Code `PreToolUse` hooks that block `Write` and `Edit` tool calls before they execute if the resulting file would exceed the line limit or contain a hardcoded credential. Policy blocks happen before the file system is touched.

## Install

```bash
git clone https://github.com/Kodaxadev/Code-Warden.git
cd Code-Warden/code-warden
node install.js
```

The auto-installer scans for installed AI apps and deploys to all of them in one step.

```bash
node install.js --all             # install without prompt
node install.js --dry-run         # preview, write nothing
node install.js --list            # show detected apps
node install.js --doctor          # verify source + installed health
node install.js --verify-target=claude   # strict per-target check
node install.js --hooks=claude           # install Claude Code PreToolUse hooks
node install.js --uninstall-hooks=claude # remove Claude Code hooks
```

## Invoke

```
/code-warden
```

Or start a session with: `"load code-warden"`, `"new session"`, `"begin coding"`, `"governance check"`.

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

Or run all checks locally:

```bash
npm run ci   # lint + secrets + doctor
```

## File Structure

| File | Purpose |
|------|---------|
| `SKILL.md` | Session gates, quick rules, drift signals, reference index |
| `CONFIGURE.md` | Tunable thresholds and team-size profiles |
| `DECISIONS.md` | Decision log |
| `references/planning-gates.md` | Scope Gate and Plan Gate contracts |
| `references/architecture.md` | Blueprint Rule, Re-injection, State Update |
| `references/safety.md` | Blast Radius, Patch-First, Zero-Trust, Dependency Freeze |
| `references/cognition.md` | Think Before Coding, Don't Guess Syntax, Human Checkpoint |
| `references/cleanup.md` | Tech Debt format, Test Contract, Decision Log |
| `references/anti-drift.md` | Anchor Check, Session Scoping, Drift Trigger |
| `references/operations.md` | Verification evidence, git hygiene, dependency control |
| `references/research-and-fit.md` | Live research gate, stack fit, product-shape guardrails |

## Version

v3.0.0 — See `code-warden/SKILL.md` for full changelog.

## Author

Justin Davis — MIT License
