# code-warden

<p align="center">
  <a href="https://github.com/Kodaxadev/Code-Warden/actions/workflows/code-warden.yml">
    <img src="https://github.com/Kodaxadev/Code-Warden/actions/workflows/code-warden.yml/badge.svg" alt="Code-Warden Quality Gate" />
  </a>
  <img src="https://img.shields.io/badge/version-4.0.0-blue" alt="Version 4.0.0" />
  <img src="https://img.shields.io/badge/license-MIT-yellow" alt="MIT License" />
  <img src="https://img.shields.io/badge/Claude%20Hooks-lifecycle-purple" alt="Claude Code Lifecycle Hooks" />
  <img src="https://img.shields.io/badge/AI%20Governance-enforced-red" alt="AI Governance Enforced" />
  <a href="https://www.npmjs.com/package/code-warden">
    <img src="https://img.shields.io/npm/v/code-warden" alt="npm" />
  </a>
  <a href="https://socket.dev/npm/package/code-warden">
    <img src="https://socket.dev/api/badge/npm/package/code-warden" alt="Socket Security" />
  </a>
</p>

<p align="center">
  <img src="logo/hero-banner.png" alt="Code-Warden — Portable AI Coding Governance Layer" width="100%" />
</p>

## Quickstart

```bash
npx code-warden init
npx code-warden doctor
npx code-warden verify codex  # or your target runtime
npx code-warden report
```

Optional hard enforcement:

```bash
npx code-warden hooks claude   # per-user lifecycle hooks
npx code-warden hooks codex    # per-user, partial surfaces
npx code-warden hooks git      # per-repo pre-commit backstop (run from the repo)
```

Use `doctor` after install or hook setup. It verifies installed skill manifests,
hook script paths, and runtime-specific hook config, and prints the repair
command when it finds partial setup.

## Who This Is For

**Code-Warden is for when AI coding stops being autocomplete and starts being delegated work.**

If you run short, supervised one-file AI edits, Code-Warden may be overkill.

If you run long Claude Code, Codex, or Cursor sessions — multi-file refactors, parallel projects, CI-gated work, or client and product code — Code-Warden gives your agent declared scope, verifiable checks, and enforceable safety rails.

At its core, Code-Warden is a governance contract:
- The agent states architecture context before acting.
- The agent declares scope and patch order before edits — and the scope lock can mechanically enforce it.
- The repo verifies file size, secrets, tests, install health, risk policy, runtime hooks, and receipt artifacts.
- The workflow keeps receipts, audit ledgers, JSON, Markdown, SARIF, and release evidence outside chat memory.

## Prevents / Allows

**Prevents**
- Code before scope is declared
- Writes outside a locked scope (denied at the hook layer)
- Destructive shell commands — force push, hard reset, recursive root deletes, pipe-to-shell (denied)
- Oversized monolithic files
- Hardcoded API keys and credentials — in files, commands, and staged commits
- Completion claims without verification evidence
- Agent tampering with governance artifacts (`.code-warden/` is always write-protected)
- Stale or broken agent installs

**Allows**
- Normal development work and fast solo-founder iteration
- Existing agent workflows — every enforcement layer is opt-in
- Brownfield adoption — baseline ratchet gates only new violations
- CI enforcement without chat memory

## Four Layers

<p align="center">
  <img src="logo/layers-diagram.png" alt="Code-Warden Four Layers" width="900" />
</p>

| Layer | What it does | Bypass honesty |
|-------|--------------|----------------|
| **1. Prompt governance** | SKILL.md gates: Scope Gate, Plan Gate, blast radius, drift signals | Instructions only — the agent is told, nothing blocks |
| **2. Runtime hooks** | Claude lifecycle hooks (full) and Codex PreToolUse hooks (partial) deny bad writes, out-of-scope edits, and risky commands before execution | Only where the runtime exposes hook surfaces |
| **3. Git backstop** | Per-repo pre-commit scans staged content for lint/secrets — any agent, any editor, any human | `git commit --no-verify` skips it |
| **4. CI** | `governance-report.js` / GitHub Action: deterministic gate plus JSON/Markdown/SARIF evidence | Catches everything that reaches a PR |

Each layer narrows what the previous one can miss. None of them is a sandbox
or a security boundary against a malicious user — they govern the agent inside
the workflow you already use.

## Compatibility

| Runtime | Install | Skill Rules | Local Tools | CI | Hard Hooks |
|---|---:|---:|---:|---:|---:|
| Claude Code | ✅ | ✅ | ✅ | ✅ | ✅ Full lifecycle |
| OpenAI Codex | ✅ | ✅ | ✅ | ✅ | ⚡ Partial |
| Cursor | ✅ | ✅ | ✅ | ✅ | git backstop |
| Warp | ✅ | ✅ | ✅ | ✅ | git backstop |
| Windsurf | ✅ flat rules | ✅ adapted | ✅ | ✅ | git backstop |
| Generic Agents | ✅ | ✅ | ✅ | ✅ | git backstop |
| GitHub Actions | — | — | ✅ | ✅ | — |

Claude Code gets full enforcement: PreToolUse gates on `Write`/`Edit`/`NotebookEdit`
and `Bash`/`PowerShell`, a PostToolUse audit ledger, SessionStart context
injection, and opt-in Stop verification. Codex gets partial enforcement:
`apply_patch` and `Bash` are the only hookable surfaces — no ask-tier
confirmations, no PostToolUse ledger. The git backstop and CI close the
remaining gap for every runtime.

## Why Not Just Prompt Better?

You should prompt well. Code-Warden does not replace that.

**Prompts are policy. Code-Warden adds verification and enforcement.**

| Rule | Prompt-only | Code-Warden |
|---|---|---|
| Keep files modular | Agent remembers | `warden-lint` checks files; hooks block oversized writes |
| No hardcoded secrets | Agent remembers | Scanned in writes, commands, staged commits, and CI |
| Stay inside scope | Agent declares scope | Scope lock denies out-of-scope writes at the hook layer |
| Don't run destructive commands | Agent is careful | Command Risk Gate denies blocked-tier, asks on high-tier |
| Verify before done | Agent claims it checked | `npm run ci`, Stop verification, and receipts corroborated by a hash-chained audit ledger |

## Adoption Path

Each layer adds value independently. Start where the pain is.

1. **CI only** — add the GitHub Action or `governance-report.js`. Brownfield? `report --write-baseline` first, gate on `--baseline`.
2. **Skill governance** — install Code-Warden into your AI runtime. Scope Gates, Plan Gates, and drift signals activate immediately.
3. **Git backstop** — `code-warden hooks git` for a per-repo pre-commit scan. Works for every runtime and human commits too.
4. **Runtime hooks** — `hooks claude` / `hooks codex` for pre-execution blocking. Requires step 2 first.
5. **Scope lock + audit** — `code-warden scope set` per governed session; close with a corroborated receipt.

## Install

```bash
npx code-warden init        # or: npm install -g code-warden && code-warden init
```

The installer scans for AI runtimes and deploys to all of them in one step:
Claude Code, Cursor, Warp, OpenAI Codex, Windsurf, and generic agent runtimes.

### CLI commands

```bash
code-warden init                    # install to detected AI runtimes
code-warden report                  # governance report (--format=md|sarif, --out=<file>)
code-warden report --write-baseline # record current violations as the ratchet floor
code-warden report --baseline       # fail only NEW or WORSENED violations
code-warden scope set --goal="..." <paths...>  # lock session scope (--no-enforce to record only)
code-warden scope add|remove|clear|status      # manage the scope lock
code-warden receipt --template --out=<file>    # draft governance receipt
code-warden receipt --from-audit --out=<file>  # receipt prefilled from the audit ledger
code-warden receipt --validate=<file>
code-warden references <paths...>   # recommend governance references
code-warden doctor                  # verify source + install health
code-warden verify <target>         # strict health check (claude, codex, git, ...)
code-warden list                    # show detected runtimes
code-warden hooks claude|codex|git  # install enforcement hooks
code-warden uninstall-hooks claude|codex|git
code-warden smoke-npx --package=code-warden@latest
```

## Invoke

```
/code-warden
```

Or: `"load code-warden"`, `"new session"`, `"begin coding"`, `"governance check"`.

<p align="center">
  <img src="logo/session-flow.png" alt="Code-Warden Session Start Sequence" width="100%" />
</p>

## Hard Enforcement (Hooks)

<p align="center">
  <img src="logo/hook-flow.png" alt="Code-Warden Hook Enforcement Flow" width="900" />
</p>

### Claude Code — full lifecycle

`code-warden hooks claude` registers (per-user, `~/.claude/settings.json`):

| Event | Hook | Policy |
|-------|------|--------|
| PreToolUse `Write\|Edit\|NotebookEdit` | lint, secrets, scope | Deny oversized files, hardcoded credentials, out-of-scope writes; ask past `pre_flight_trigger_lines` |
| PreToolUse `Bash\|PowerShell` | command | Deny credentials in commands; Command Risk Gate (deny blocked-tier, ask high-tier) |
| PostToolUse | audit | Append to the hash-chained audit ledger (never blocks) |
| SessionStart | session | Inject architecture context + scope status |
| Stop | stop | Opt-in (`session.verify_on_stop`): block completion on fresh lint/secret violations |

### OpenAI Codex — partial

`code-warden hooks codex` registers `apply_patch` (secrets, estimated size,
scope lock) and `Bash` (secrets, Command Risk Gate — blocked-tier denies only;
Codex has no ask equivalent, so high-tier allows silently). The installer
enables `[features].hooks = true` in `~/.codex/config.toml` and removes the
deprecated `codex_hooks` key. No PostToolUse surface exists, so there is no
Codex audit ledger.

### Git backstop — any runtime

`code-warden hooks git` installs a marker-managed pre-commit hook in the repo
at cwd (per-repo, unlike the per-user hooks above). It scans **staged content**
(`git show :path`) for file-length and secret violations with the same
exclude/allowlist config as CI. `git commit --no-verify` bypasses it — that is
git's escape hatch and Code-Warden documents it rather than pretending
otherwise. Check it with `code-warden verify git`.

### Scope Lock

```bash
code-warden scope set --goal="Fix auth bug" src/ lib/utils.js
code-warden scope status
code-warden scope add src/middleware.js   # user-approved expansion (audited)
code-warden scope clear
```

Writes `<repoRoot>/.code-warden/scope.json`. While locked, agent writes outside
the declared paths are denied and the agent is told to ask you to run
`code-warden scope add <path>`. Expansions are recorded in `expansions[]`.
Strictly opt-in — no scope file, no enforcement. `.code-warden/` itself is
always write-protected from agents, lock or not. If the agent runs `scope add`
via the shell, the command is visible in your session and the expansion is
recorded — auditable, not impossible.

### Command Risk Gate

Conservative defaults, two enforced tiers:

- **blocked (deny)**: `rm_rf_root`, `rd_root`, `remove_item_root`, `git_reset_hard`, `git_push_force` (`--force-with-lease` exempt), `git_clean_force`, `git_history_rewrite`, `curl_pipe_shell`, `ps_web_pipe_iex`, `chmod_777_root`
- **high (ask on Claude, allow on Codex)**: `package_install` (bare `npm install`/`ci` allowed), `npm_publish`, `git_push`, `recursive_delete`, `remove_item_recurse`, `git_discard_changes`

Override per rule id via `risk_policy.command_rules` in `codewarden.json` —
replace a default, disable it with `"tier": "off"`, or add your own patterns.

## Governance Evidence

```bash
code-warden report                    # .code-warden-report.json + summary
code-warden report --format=md       # Markdown for $GITHUB_STEP_SUMMARY
code-warden report --format=sarif --out=code-warden.sarif
```

One pass covers file length, credentials, behavioral tests, source integrity,
risk policy, runtime hook status, and session governance (the report's
`scopeGate` is a `{status, goal, filesIn, enforce}` object when a scope lock
exists; the string `"session_only"` otherwise — handle both shapes). SARIF is
intentionally narrower: only source-located findings (`CW001`/`CW002`).

### Audit ledger and corroborated receipts

While a scope lock exists (or `audit.enabled` is `true`), Claude sessions
append every governed tool call to `.code-warden/audit.jsonl` — sha256
hash-chained from GENESIS, so any edit breaks every later line. Commands are
logged secret-redacted and truncated. Gitignore the ledger; receipts are the
durable artifact:

```bash
code-warden receipt --from-audit --out=code-warden-receipt.json
code-warden receipt --validate=code-warden-receipt.json
```

`--from-audit` prefills the draft from the scope lock, architecture context,
git branch/commit, and ledger evidence with chain verification. Receipts still
start as drafts — a human completes them — and a `complete` receipt over a
broken chain fails validation.

### Baseline ratchet (brownfield adoption)

```bash
npx code-warden report --write-baseline      # freeze current debt as the floor
git add .code-warden-baseline.json && git commit -m "chore: code-warden baseline"
npx code-warden report --baseline            # N new / M legacy; fails on new only
```

Baselined files fail again the moment they grow. Secrets are fingerprinted by
content hash — no raw secrets in the baseline. A missing baseline file is a
hard error, never a silent skip.

## CI Integration

```yaml
- name: Code-Warden Governance Gate
  uses: Kodaxadev/Code-Warden@v4
  with:
    path: .
    baseline: .code-warden-baseline.json   # optional ratchet mode
    sarif: 'true'                          # optional Code Scanning upload
```

SARIF upload needs `security-events: write` permission and goes through
`github/codeql-action/upload-sarif@v4`. The action writes
`.code-warden-report.json`, appends a Markdown summary, uploads the report
artifact, and fails the job when the gate fails.

Prefer a pinned download? Fetch
`https://github.com/Kodaxadev/Code-Warden/releases/download/v4.0.0/code-warden-v4.0.0.zip`
and run `node <dir>/tools/governance-report.js .` — full template with both
options: [`code-warden/templates/ci/github-actions.yml`](code-warden/templates/ci/github-actions.yml)

## Upgrading to v4

**Re-run `code-warden hooks claude` (and `hooks codex`) after updating.** Old
registrations keep working but lack NotebookEdit/command coverage and all new
events and gates. Breaking changes for consumers:

- Report `session.scopeGate` is an object when a scope lock exists (was always a string).
- `.code-warden/` is agent-write-protected unconditionally.
- New config keys: `lint.exclude_paths`, `secrets.allowlist` (both hook-honored), `risk_policy.command_rules`, `audit.enabled`, `session.verify_on_stop`.

See [`RELEASE_NOTES_v4.0.0.md`](RELEASE_NOTES_v4.0.0.md).

## Release Trust

Releases are tag-driven: the workflow verifies the package version matches the
tag, runs the governance gate, dry-runs the publish, publishes to npm through
trusted publishing (GitHub Actions OIDC, npm provenance — no long-lived token),
creates the GitHub release, and uploads the versioned zip.

## File Structure

| File | Purpose |
|------|---------|
| `SKILL.md` | Session gates, quick rules, drift signals, reference index |
| `CONFIGURE.md` | Tunable thresholds, scope lock, audit ledger, command rules |
| `DECISIONS.md` | Architecture decision log |
| `references/` | Planning gates, architecture, safety, cognition, cleanup, anti-drift, operations, evidence providers, research-and-fit, MCP governance |
| `tools/` | Scanners, governance report, receipt/scope CLIs, hooks, shared libs |
| `tools/hooks/claude/`, `tools/hooks/codex/` | Runtime hook scripts |
| `tools/lib/` | Shared policy modules (config, baseline, command-risk, scope-store, audit-ledger, ...) |

## Version

v4.0.0 — See [`CHANGELOG.md`](CHANGELOG.md) for full changelog.

## Author

Justin Davis — MIT License
