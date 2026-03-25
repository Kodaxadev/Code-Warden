# Execution & Safety

## Blast Radius Check
Before deleting or rewriting any working code, define:
1. **What might break** — list affected modules and interfaces
2. **How it will be tested** — specific test strategy or smoke test
3. **Rollback procedure** — 1-step command or revert method
   Example: `git checkout HEAD -- path/to/file`

Never skip for any rewrite touching core logic.

## Patch-First Editing
- Prefer diff/patch edits over full file rewrites
- Only rewrite an entire file when structural changes affect >50% of its content
- All full rewrites require a Blast Radius Check first
- Surgical edits reduce accidental deletions, regression bugs, and context loss

## Zero-Trust Secrets
- Never generate code with hardcoded API keys, passwords, tokens, or placeholder secrets
- Always default to environment variables (.env) or secure vault implementations
- No "TODO: replace later" escape hatches — ever

## Dependency Freeze
- Before any structural changes, list all current dependency versions
- Do not silently upgrade packages during a refactor
- Flag outdated dependencies separately — do not fix without explicit confirmation
