# code-warden

> Portable AI Coding Governance Layer

Code-Warden provides verifiable governance for AI-assisted development.
It does not just ask agents to follow rules — it adds Scope Gates, Plan Gates,
local checks, CI enforcement, runtime hooks where supported, and governance
artifacts that show what was checked before code was accepted.

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

## Governance Evidence

Generate a machine-readable governance report that can be stored in CI, attached to PRs, or used as audit evidence:

```bash
node tools/governance-report.js .                   # write .code-warden-report.json + summary
node tools/governance-report.js . --format=json      # JSON to stdout
node tools/governance-report.js . --format=md        # Markdown to stdout
```

The report runs all checks in a single pass (file length, secrets, behavioral tests, source integrity) and produces a structured artifact:

```json
{
  "tool": "code-warden",
  "version": "3.3.2",
  "checks": {
    "fileLength":      { "status": "pass", "filesScanned": 34, "violations": 0 },
    "secrets":         { "status": "pass", "filesScanned": 34, "violations": 0 },
    "behavioralTests": { "status": "pass", "tests": 9, "failures": 0 },
    "installHealth":   { "status": "pass" }
  },
  "result": "pass"
}
```

In CI, the Markdown format pipes directly into `$GITHUB_STEP_SUMMARY` for PR-visible evidence:

| Check | Result | Details |
|-------|--------|---------|
| File length | PASS | 34 files scanned, 0 violations |
| Hardcoded credentials | PASS | 34 files scanned, 0 violations |
| Behavioral tests | PASS | 9 tests, 0 failures |
| Install health | PASS | All source files present |

See [`templates/ci/github-actions.yml`](templates/ci/github-actions.yml) for the full CI template with artifact upload.

### GitHub Action

Use the repository action when you want the shortest CI setup:

```yaml
- name: Code-Warden Governance Gate
  uses: Kodaxadev/Code-Warden@v3
  with:
    path: .
```

The action runs `tools/governance-report.js`, writes
`.code-warden-report.json`, appends a Markdown summary, and uploads the report
artifact by default.

## Install

```bash
npx code-warden init
```

Or install globally:

```bash
npm install -g code-warden
code-warden init
```

### CLI commands

| Command | Purpose |
|---------|---------|
| `code-warden init` | Install to all detected AI runtimes |
| `code-warden report` | Generate governance report |
| `code-warden report --format=md` | Markdown output for PR summaries |
| `code-warden doctor` | Verify source integrity + install health |
| `code-warden list` | Show detected runtimes |
| `code-warden hooks claude` | Install Claude Code PreToolUse hooks |
| `code-warden hooks codex` | Install Codex PreToolUse hooks (partial) |
| `code-warden uninstall-hooks claude` | Remove Claude Code hooks |
| `code-warden uninstall-hooks codex` | Remove Codex hooks |

### Direct installer commands

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
npm run report          # governance report, writes .code-warden-report.json
npm run report:json     # governance report as JSON to stdout
npm run report:md       # governance report as Markdown to stdout
npm run install-auto    # node install.js
npm run install-dry-run # node install.js --dry-run
npm run install-list    # node install.js --list
npm run install-doctor  # node install.js --doctor
npm run smoke:npx       # verify published package from a clean temp directory
npm run test            # behavioral tests (9 scanner/hook pass/fail cases)
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

## Note for contributors

> If testing `npx code-warden` from inside the Code-Warden source checkout,
> npm may prefer the local package context. Test from a separate directory for
> the same behavior users will see.

Run the external smoke test to exercise the published package from a clean temp
directory:

```bash
npm run smoke:npx
```

The smoke test runs `npx code-warden@latest --version`, then
`npx code-warden@latest report --format=json`, and verifies the report parses
as a passing Code-Warden result.

## Release Process

Code-Warden releases are tag-driven from GitHub Actions:

1. The workflow checks that `package.json` matches the pushed `vX.Y.Z` tag.
2. `npm run ci` verifies lint, secrets, behavioral tests, and install health.
3. `npm publish --dry-run --access public` verifies the package contents.
4. npm trusted publishing publishes the package without a long-lived npm token.
5. The workflow creates a GitHub release and uploads `code-warden-vX.Y.Z.zip`.

Configure npm trusted publishing for the repository before relying on the
release workflow. Manual publishing remains a fallback, but it should be the
exception because it does not provide the same CI-linked provenance story.

## Author

Justin Davis — MIT License
