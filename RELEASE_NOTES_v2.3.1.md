# code-warden v2.3.1

Codex setup release.

## What's new

### Codex/shared-agent install support

Installers now default to `~/.agents/skills/code-warden`, the shared user skill
directory used by Codex agent sessions in this environment.

Claude Code remains supported:

```powershell
cd code-warden
.\install.ps1 -Target claude
```

```bash
cd code-warden
bash install.sh claude
```

### AGENTS.md context discovery

`tools/get-context.js` now checks `AGENTS.md`, `.codex/AGENTS.md`, and
`.agents/AGENTS.md` before falling back to architecture docs, Claude docs, PRDs,
and README files.

### Windows-safe tool output

Tool output now uses ASCII status tags (`[PASS]`, `[FAIL]`, `[WARN]`) so
PowerShell terminals do not render broken emoji bytes.

### Repo instruction file

Added root `AGENTS.md` with CodeWarden's local governance rules for this repo.

## Verification

Ran on 2026-05-14:

```powershell
node code-warden\tools\get-context.js
$files = rg --files | Where-Object { $_ -notmatch '\.(png|zip)$' }; node code-warden\tools\warden-lint.js @files
$files = rg --files | Where-Object { $_ -notmatch '\.(png|zip)$' }; node code-warden\tools\verify-secrets.js @files
.\install.ps1
```
