# code-warden v2.4.0

Operational governance release.

## What's new

### Operational discipline reference

Added `references/operations.md`, covering:
- Verification before completion
- Source-control hygiene
- Dependency and supply-chain control
- Evidence standards for technical claims

### New drift signals

The skill now treats these as stop-and-reanchor events:
- Claiming completion without verification evidence
- Changing dependencies without source/version evidence
- Editing in a dirty repo without checking ownership

### Documentation updates

The README files and governed-session example now include the operational layer
so users can see how verification evidence should appear in practice.

## Verification

Run before release:

```powershell
$files = rg --files | Where-Object { $_ -notmatch '\.(png|zip)$' }; node code-warden\tools\warden-lint.js @files
$files = rg --files | Where-Object { $_ -notmatch '\.(png|zip)$' }; node code-warden\tools\verify-secrets.js @files
node code-warden\tools\get-context.js
```
