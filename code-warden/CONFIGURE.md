# Configuration Guide

CodeWarden now uses a machine-readable configuration file: `codewarden.json`.
Every threshold is tunable through this file, making it easy to share settings across your team.

---

## The `codewarden.json` File

Located at the root of the skill folder. Default configuration:

```json
{
  "thresholds": {
    "max_file_length": 400,
    "pre_flight_trigger_lines": 150,
    "human_checkpoint_files": 2
  },
  "safety": {
    "exempt_from_blast_radius": ["tests/", "docs/", "scripts/"]
  },
  "lint": {
    "exclude_paths": []
  },
  "secrets": {
    "allowlist": []
  }
}
```

| Setting | Default | Enforced by | Rationale |
|---------|---------|-------------|-----------|
| `max_file_length` | 400 | hook + CI | Keeps files reviewable in a single pass. Enforced by `warden-lint.js`, the governance report, and the runtime hooks. |
| `pre_flight_trigger_lines` | 150 | hook | The Claude lint hook asks for confirmation (`permissionDecision: "ask"`) when a single Write/Edit change exceeds this many lines without breaching `max_file_length`. |
| `human_checkpoint_files` | 2 | prompt | Requires human `[AWAITING CONFIRMATION]` before modifying this many files simultaneously. Protocol rule only — no runtime hook or CI check enforces it. |
| `exempt_from_blast_radius` | (list) | prompt | Skips strict rewriting rollback plans on these file directories. Protocol rule only — no runtime hook or CI check enforces it. |
| `lint.exclude_paths` | `[]` | hook + CI | Path prefixes excluded from file-length checks. Use for docs, generated files, or vendored code (e.g. `["Documents/", "generated/"]`). |
| `secrets.allowlist` | `[]` | hook + CI | Path prefixes excluded from hardcoded-credential scanning. Use for files with known-safe localhost dev URLs or test fixtures (e.g. `["scripts/indexer.config.toml"]`). |
| `risk_policy.command_rules` | `[]` | hook | Per-rule overrides for the Command Risk Gate. Entries `{ "id", "pattern", "tier", "message" }` merge with the built-in defaults: reusing a default `id` replaces that rule, and `"tier": "off"` (or `"allow"`) disables it. `"blocked"` denies the shell command; `"high"` asks for confirmation (Claude) or allows silently (Codex has no ask equivalent). |
| `.code-warden/scope.json` (managed via `code-warden scope`) | not set | hook | Opt-in Scope Lock. When present with `"enforce": true`, write hooks (Claude Write/Edit/NotebookEdit, Codex apply_patch) deny edits outside the declared `filesIn` paths. No file means no enforcement. |

"Enforced by" legend: **hook** = runtime PreToolUse hooks, **CI** = `warden-lint.js` / `verify-secrets.js` / `governance-report.js`, **prompt** = governance protocol text only (the agent is instructed to comply, but nothing blocks it at runtime).

---

## How to Customize

1. **Open** `codewarden.json` in the installed skill directory for your runtime, such as `.claude/skills/code-warden/`, `.codex/skills/code-warden/`, or `.agents/skills/code-warden/`.
2. **Modify** the specific rule or threshold inside the JSON structural fields.
3. The executable tools (`tools/warden-lint.js`, etc.) read these limits dynamically so no Markdown files need to be edited to enforce limits.
4. **Log the change** in `DECISIONS.md` so your team knows why the default was overridden.

## Scope Lock

The Scope Lock mechanically enforces the Scope Gate's files-in contract.
Declare the goal and the paths the session may touch:

```
code-warden scope set --goal="Fix auth bug" src/ lib/utils.js
```

This writes `<repoRoot>/.code-warden/scope.json`. While it exists, any agent
write outside the declared paths is denied at the hook layer. The agent sees:

```
[CodeWarden] Scope lock: docs/notes.md is outside the declared scope
(goal: Fix auth bug). Ask the user to approve expansion via:
code-warden scope add docs/notes.md
```

Expansions are appended to `expansions[]` in the scope file as an audit trail.
The scope file itself is self-protected: hooks deny agent edits to anything
under `.code-warden/`, even when `enforce` is `false`.

Honest limits: if the agent runs `code-warden scope add` itself via the shell,
that command is visible in your session and the expansion is recorded in
`expansions[]` - the lock makes scope creep auditable, not impossible.
Analogously, `git commit --no-verify` bypasses the git pre-commit backstop.

## Project-Level Configuration

Runtime hooks discover a governed project's own `codewarden.json` by walking
up from the working directory, checking each level for `codewarden.json` or
`code-warden/codewarden.json` and stopping at the repository root (the first
directory containing `.git`). When found, that project config takes precedence
over the skill-dir default, so `lint.exclude_paths`, `secrets.allowlist`, and
thresholds behave the same in hooks as they do in CI (`--config=`).
