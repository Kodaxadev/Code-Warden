# code-warden v2.3.0

Production-grade AI development governance skill for Claude Code and Cowork.

---

## What's new

### 🔒 Stronger secret scanner
`tools/verify-secrets.js` now detects 13 named secret types:
- OpenAI keys (`sk-...`)
- GitHub tokens (`ghp_`, `gho_`, `ghs_`, `ghx_`)
- AWS access keys (`AKIA...`) and secret keys
- Stripe live and test keys (`sk_live_`, `sk_test_`)
- Bearer tokens, generic API keys and passwords

Each violation now names the matched pattern for faster triage.

### 🪟 Windows installer
`install.ps1` — PowerShell equivalent of `install.sh`. Installs the skill to `~/.claude/skills/code-warden/` on Windows with no extra dependencies.

### 📄 README
First-time onboarding doc covering installation, usage trigger phrases, configuration, tools, and reference files.

### 🔧 Minor fixes
- Metadata `version` synced to `2.3.0` (was `2.2.3` — mismatch with heading)
- `tools/get-context.js` now searches `CLAUDE.md` and `.claude/CLAUDE.md` in addition to `ARCHITECTURE.md` and `README.md`

---

## Installation

**Linux / macOS**
```bash
bash install.sh
```

**Windows**
```powershell
.\install.ps1
```

Both copy the skill to `~/.claude/skills/code-warden/`.

---

## Full changelog

See [DECISIONS.md](DECISIONS.md) for full decision log with alternatives and reasoning.
