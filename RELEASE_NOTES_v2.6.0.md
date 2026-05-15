# code-warden v2.6.0

Auto-installer release.

## What's new

### Cross-platform auto-installer (`install.js`)

New root-level entry point replaces manual target selection. Scans for installed
AI apps and deploys the skill to all detected targets in one command.

Supported targets: Claude Code, Cursor, Warp, OpenAI Codex, Windsurf, Generic Agents.

```bash
node install.js           # scan, prompt, install
node install.js --all     # install without prompt
node install.js --dry-run # preview, write nothing
node install.js --list    # show detected apps and detection method
node install.js --doctor  # verify source integrity and installed health
node install.js --target=claude,cursor  # force specific targets
```

### App detection (`tools/auto-detect.js`)

Three-signal detection per target: binary in PATH, config directory in HOME,
app install path (platform-specific). Works on Windows, macOS, and Linux.

### Target registry (`tools/auto-targets.js`)

Declarative registry of supported apps with per-platform detection signals and
install paths. New targets can be added without touching installer logic.

### Windsurf flat-file adapter (`tools/auto-windsurf-adapter.js`)

Windsurf uses a different rules format. The adapter concatenates `SKILL.md` and
all seven reference files into a single flat markdown file written to
`~/.windsurf/rules/code-warden.md`. Missing references are skipped with a warning;
missing `SKILL.md` is a hard failure.

### Atomic install with manifest

Each install stages files into a temp directory first, then swaps atomically.
Writes `.code-warden-install.json` to every installed target recording version,
target ID, format, install path, and timestamp. Used by `--doctor` and reserved
for future uninstall and repair commands.

### Installation health checks (`--doctor`)

Verifies:
- Source: `SKILL.md`, `references/`, core tools, `package.json` scripts
- Per detected target: manifest present, manifest version current, `SKILL.md` in install dir
- Windsurf: flat file present

Exits 1 if any check fails, making it safe for CI or pre-session scripts.

## Verification

```bash
node install.js --dry-run
node install.js --doctor
node tools/warden-lint.js install.js tools/auto-detect.js tools/auto-targets.js tools/auto-windsurf-adapter.js
node tools/verify-secrets.js install.js tools/auto-detect.js tools/auto-targets.js tools/auto-windsurf-adapter.js
```
