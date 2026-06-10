# code-warden

> Portable AI Coding Governance Layer

Code-Warden provides verifiable governance for AI-assisted development.
It does not just ask agents to follow rules. It makes them declare scope,
patch order, blast radius, and verification before code is accepted — and
where the runtime allows it, denies the violation before it happens. Local
checks, runtime hooks, a git pre-commit backstop, CI enforcement, audit
ledgers, and receipt artifacts keep that contract auditable after the chat
scrolls away.

## Four Layers

<p align="center">
  <img src="../logo/layers-diagram.png" alt="Code-Warden Four Layers" width="100%" />
</p>

| Layer | What it does | Honest bypass |
|-------|--------------|---------------|
| **Prompt governance** | Scope Gate, Plan Gate, blast-radius checks, drift signals, verification evidence | Protocol text only — nothing blocks |
| **Runtime hooks** | Claude lifecycle hooks (PreToolUse gates, PostToolUse audit, SessionStart context, Stop verification); Codex PreToolUse (partial) | Only where the runtime exposes surfaces |
| **Git backstop** | Per-repo pre-commit scanning staged content for lint/secrets | `git commit --no-verify` |
| **CI** | `governance-report.js` / GitHub Action — deterministic gate + JSON/Markdown/SARIF evidence | Last line before merge |

## Governance Evidence

Generate a machine-readable governance report for CI, PRs, or audit:

```bash
node tools/governance-report.js .                    # write .code-warden-report.json + summary
node tools/governance-report.js . --format=md        # Markdown to stdout
node tools/governance-report.js . --format=sarif --out=code-warden.sarif
node tools/governance-report.js . --write-baseline   # record current debt as the ratchet floor
node tools/governance-report.js . --baseline         # fail only NEW or WORSENED violations
```

The report runs file length, secrets, behavioral tests, source integrity, and
risk policy in one pass:

```json
{
  "tool": "code-warden",
  "version": "4.0.0",
  "checks": {
    "fileLength":      { "status": "pass", "filesScanned": 60, "violations": 0 },
    "secrets":         { "status": "pass", "filesScanned": 60, "violations": 0 },
    "behavioralTests": { "status": "pass" },
    "installHealth":   { "status": "pass" },
    "riskPolicy":      { "status": "pass" }
  },
  "result": "pass"
}
```

The report's `session.scopeGate` is the string `"session_only"` normally, but
becomes `{ "status": "locked", "goal", "filesIn", "enforce" }` when a scope
lock exists — JSON consumers should handle both shapes (changed in v4.0.0).

SARIF output is intentionally limited to source-located findings
(`CW001/max-file-length`, `CW002/hardcoded-credential`); with a baseline it
carries fresh findings only. JSON remains the canonical governance artifact.

### Baseline ratchet (brownfield adoption)

```bash
npx code-warden report --write-baseline
git add .code-warden-baseline.json
npx code-warden report --baseline    # reports "N new / M legacy", fails on new only
```

Baselined oversized files fail again the moment they grow. Baselined secrets
are fingerprinted by sha256 of the trimmed matched line — the baseline never
contains raw secret text. A missing baseline file is a hard error.

### Governance Receipts

Reports prove repository checks ran. Receipts record the session contract —
and since v4.0.0 they can be corroborated by the audit ledger:

```bash
code-warden receipt --template --out=code-warden-receipt.json     # blank draft
code-warden receipt --from-audit --out=code-warden-receipt.json   # prefilled draft
code-warden receipt --validate=code-warden-receipt.json
```

`--from-audit` prefills the scope gate from `.code-warden/scope.json`, the
architecture context, git branch/commit, and ledger evidence including hash
chain verification. Receipts still start as drafts (`canProveCompliance:
false`) — a human completes them — and a `complete` receipt whose
`audit.chainValid` is `false` fails validation. Code-Warden will not claim
chat compliance that was not recorded.

### GitHub Action

```yaml
permissions:
  contents: read
  security-events: write   # only needed for sarif: 'true'

steps:
  - uses: actions/checkout@v6
  - name: Code-Warden Governance Gate
    uses: Kodaxadev/Code-Warden@v4
    with:
      path: .
      baseline: .code-warden-baseline.json   # optional ratchet mode
      sarif: 'true'                          # optional Code Scanning upload
```

The action writes `.code-warden-report.json`, appends a Markdown summary,
uploads the report artifact, and fails the job when the gate fails. See
[`templates/ci/github-actions.yml`](templates/ci/github-actions.yml) for the
release-download alternative.

## Install

```bash
npx code-warden init
npx code-warden doctor
npx code-warden verify codex  # or your target runtime
npx code-warden report
```

Optional hard enforcement:

```bash
code-warden hooks claude   # per-user lifecycle hooks
code-warden hooks codex    # per-user, partial surfaces
code-warden hooks git      # per-repo pre-commit backstop (run from the repo)
code-warden doctor
```

`doctor` verifies installed manifests, hook script paths, and runtime hook
config, with repair guidance for partial setup. Target one runtime when
troubleshooting: `code-warden init --target=codex && code-warden verify codex`.

### CLI commands

| Command | Purpose |
|---------|---------|
| `code-warden init` | Install to all detected AI runtimes |
| `code-warden report` | Governance report (`--format=md\|sarif`, `--out=<file>`) |
| `code-warden report --write-baseline[=path]` | Record current violations as the ratchet floor |
| `code-warden report --baseline[=path]` | Ratchet mode: fail only new/worsened violations |
| `code-warden scope set --goal="..." <paths...>` | Lock session scope (`--no-enforce` records without blocking) |
| `code-warden scope add\|remove\|clear\|status` | Manage the scope lock (expansions are audited) |
| `code-warden receipt --template --out=<file>` | Blank draft receipt |
| `code-warden receipt --from-audit[=path] --out=<file>` | Draft receipt corroborated by the audit ledger |
| `code-warden receipt --validate=<file>` | Validate completed receipt evidence |
| `code-warden references <paths...>` | Recommend governance references for touched paths |
| `code-warden doctor` | Verify source integrity + install health |
| `code-warden verify <target>` | Strict health check (`claude`, `codex`, `git`, ...) |
| `code-warden list` | Show detected runtimes |
| `code-warden hooks claude\|codex\|git` | Install enforcement hooks |
| `code-warden uninstall-hooks claude\|codex\|git` | Remove enforcement hooks |
| `code-warden smoke-npx --package=code-warden@latest` | Smoke-test the npm package from a clean temp dir |

Direct installer equivalents: `node install.js [--all | --dry-run | --list |
--doctor | --target=<ids> | --verify-target=<id> | --hooks=<id> |
--uninstall-hooks=<id>]`. Supported targets: **Claude Code**, **Cursor**,
**Warp**, **OpenAI Codex**, **Windsurf**, **Generic Agents**. Each install
writes a `.code-warden-install.json` manifest.

### npm scripts

```bash
npm run lint            # warden-lint on full project tree
npm run check-secrets   # verify-secrets on full project tree
npm run report          # governance report (also report:json, report:md)
npm run test            # behavioral tests
npm run ci              # lint + secrets + test + doctor
npm run smoke:npx       # verify published package from a clean temp directory
```

## Usage

Load at the start of any coding session: `"load code-warden"`,
`"begin coding"`, `"new session"`, `"governance check"`.

The session sequence is enforced before any implementation:

1. Architecture State (Re-injection Rule)
2. Session Scope (Session Scoping Rule)
3. Reference Files (Blueprint Rule)
4. **Scope Gate** — goal, non-goals, files in/out, verify commands, rollback
5. **Plan Gate** — patch order, blast radius class, post-patch checks

After the Scope Gate is confirmed, lock it mechanically (optional):

```bash
code-warden scope set --goal="Fix auth bug" src/ lib/utils.js
```

See [`examples/governed-session.md`](examples/governed-session.md) for an
annotated example including the v4 scope lock and receipt flow.

## Runtime Hooks

<p align="center">
  <img src="../logo/hook-flow.png" alt="Code-Warden Hook Enforcement Flow" width="100%" />
</p>

### Claude Code — full lifecycle

| Event | Hook | Policy |
|-------|------|--------|
| PreToolUse `Write\|Edit\|NotebookEdit` | `warden-lint-hook.js` | Deny past line limit; ask past `pre_flight_trigger_lines` (NotebookEdit exempt from length — cells are not files) |
| PreToolUse `Write\|Edit\|NotebookEdit` | `warden-secrets-hook.js` | Deny hardcoded credentials in content |
| PreToolUse `Write\|Edit\|NotebookEdit` | `warden-scope-hook.js` | Deny out-of-scope writes while a scope lock exists; always deny writes to `.code-warden/` |
| PreToolUse `Bash\|PowerShell` | `warden-command-hook.js` | Deny credentials in commands; Command Risk Gate (blocked = deny, high = ask) |
| PostToolUse (all governed tools) | `warden-audit-hook.js` | Append to the hash-chained audit ledger — never blocks |
| SessionStart | `warden-session-hook.js` | Inject architecture context + scope status |
| Stop | `warden-stop-hook.js` | Opt-in (`session.verify_on_stop`): block completion on fresh violations |

### OpenAI Codex — partial

| Hook | Trigger | Policy |
|------|---------|--------|
| `warden-apply-patch-hook.js` | `apply_patch` | Deny added credentials, estimated oversize, out-of-scope targets, and `.code-warden/` writes |
| `warden-bash-hook.js` | `Bash` | Deny credentials and blocked-tier commands; high-tier allows silently (Codex has no ask equivalent) |

Codex cannot hook `Write`/`Edit` and has no PostToolUse surface — no Codex
audit ledger. The git backstop and CI close the remaining gap. The Codex
installer also enables `[features].hooks = true` in `~/.codex/config.toml`
and removes the deprecated `codex_hooks` key.

### Git backstop

`code-warden hooks git` installs a marker-managed pre-commit hook in the
repository at cwd. It scans **staged content** (`git show :path`) for
file-length and secret violations, honoring `lint.exclude_paths` and
`secrets.allowlist` exactly like CI. `git commit --no-verify` bypasses it —
documented, not hidden. Verify with `code-warden verify git`.

All hooks use exec form (`node /path/to/hook.js`) — no shell differences
across platforms. Hooks read the governed project's own `codewarden.json`
(walking up from the working directory, stopping at the `.git` boundary),
falling back to the installed skill's config — hook and CI behavior match.

## Configuration

All settings in [`codewarden.json`](codewarden.json):

| Setting | Default | Enforced by | What it controls |
|---------|---------|-------------|-----------------|
| `thresholds.max_file_length` | 400 | hook + git + CI | Line limit for `warden-lint.js` and all hooks |
| `thresholds.pre_flight_trigger_lines` | 150 | hook | Single-change size before the Claude lint hook asks for confirmation |
| `thresholds.human_checkpoint_files` | 2 | prompt | Files touched before `[AWAITING CONFIRMATION]` (protocol rule only) |
| `safety.exempt_from_blast_radius` | `tests/`, `docs/`, `scripts/` | prompt | Rollback-plan exemptions (protocol rule only) |
| `lint.exclude_paths` | `[]` | hook + git + CI | Path prefixes excluded from file-length checks |
| `secrets.allowlist` | `[]` | hook + git + CI | Path prefixes excluded from credential scanning |
| `risk_policy.command_rules` | `[]` | hook | Command Risk Gate overrides — id-based replace/disable, merged with defaults |
| `risk_policy.actions` | 7 actions | CI report | Action-class to tier map (`low`/`medium`/`high`/`blocked`) |
| `audit.enabled` | unset | hook | Audit ledger: unset = on while a scope lock exists; `true` = always; `false` = never |
| `session.verify_on_stop` | `false` | hook | Opt-in Stop verification (Claude) |
| `reference_selection.rules` | 4 rules | CLI (advisory) | Path-to-reference recommendations |
| `external_evidence.providers` | 4 providers | prompt | Approved evidence sources and trust limits |

"Enforced by" legend: **hook** = runtime hooks, **git** = pre-commit backstop,
**CI** = CLI scanners and `governance-report.js`, **prompt** = protocol text
only — the agent is instructed to comply, but no runtime check blocks it.

See [`CONFIGURE.md`](CONFIGURE.md) for the scope lock, audit ledger, stop
verification, default command-rule list, and team tuning rationale.

## Upgrading to v4.0.0

**Re-run `code-warden hooks claude` (and `hooks codex`).** Existing
registrations keep working but lack NotebookEdit/command coverage and all new
events and gates. Report consumers: handle both `scopeGate` shapes. Agents can
no longer write anywhere under `.code-warden/`.

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
| `references/evidence-providers.md` | External scanners, provenance, attestations, trust limits |
| `references/research-and-fit.md` | Live research gate, stack fit, product-shape guardrails |
| `references/mcp-governance.md` | MCP server approval, toolset scope, credentials, audit evidence |

## Note for contributors

> If testing `npx code-warden` from inside the Code-Warden source checkout,
> npm may prefer the local package context. Test from a separate directory.
> `npm run smoke:npx` exercises the published package from a clean temp dir.

## Release Process

Tag-driven from GitHub Actions: the workflow checks `package.json` against the
pushed `vX.Y.Z` tag, runs `npm run ci`, dry-runs the publish, publishes via
npm trusted publishing (no long-lived token), then creates the GitHub release
with `code-warden-vX.Y.Z.zip`. The workflow fails before publish if the npm
version already exists — bump the package version before tagging. Configure
the npm trusted publisher (GitHub Actions / `Kodaxadev` / `Code-Warden` /
`release.yml`) before relying on it.

## Author

Justin Davis — MIT License
