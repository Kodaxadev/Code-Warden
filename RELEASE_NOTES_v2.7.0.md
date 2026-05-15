# code-warden v2.7.0

CI integration release. Code-Warden now enforces outside the chat session.

## What's new

### GitHub Actions workflow (`.github/workflows/code-warden.yml`)

The CodeWarden repo now runs its own quality gate on every push and PR:

- `npm run lint` — file length check across the full source tree
- `npm run check-secrets` — zero-trust secret scan across the full source tree
- `node install.js --doctor` — source integrity check

### Project CI template (`templates/ci/github-actions.yml`)

Copy-paste template for any GitHub Actions project. Downloads code-warden
from the release zip at CI time — no skill files need to be committed to
the user's repo. Version is pinnable via `CODE_WARDEN_VERSION` env var.

Two setup options documented in the template:
- **Option A** (recommended): download from GitHub release in CI
- **Option B**: commit `.claude/skills/code-warden/` to the project repo

### `npm run ci` composite script

Runs lint + secrets + doctor in one command. Suitable as a pre-commit hook,
CI step, or local pre-push gate:

```bash
npm run ci
```

### CI badge

README now shows a live quality gate badge linked to the Actions run.

## Verification

```bash
npm run ci
node tools/warden-lint.js .
node tools/verify-secrets.js .
node install.js --doctor
```
