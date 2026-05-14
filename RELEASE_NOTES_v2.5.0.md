# code-warden v2.5.0

Research and fit governance release.

## What's new

### Live research gate

Added `references/research-and-fit.md`, which requires live research before using
current, version-specific, or rapidly changing facts.

### Default-pattern challenge

The skill now explicitly blocks unexamined defaults such as Node, Next.js, React,
SaaS dashboards, CRUD admins, and auth-first app shapes unless the project
context supports them.

### Fit-first recommendations

Stack, architecture, and product-shape choices must now consider the user's goal,
primary user, runtime, data shape, interaction shape, and operational constraints.

## Verification

Run before release:

```powershell
$files = rg --files | Where-Object { $_ -notmatch '\.(png|zip)$' }; node code-warden\tools\warden-lint.js @files
$files = rg --files | Where-Object { $_ -notmatch '\.(png|zip)$' }; node code-warden\tools\verify-secrets.js @files
node code-warden\tools\get-context.js
```
