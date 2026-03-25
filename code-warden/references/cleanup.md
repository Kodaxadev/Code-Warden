# Refactoring & Cleanup

## Leave It Better
When touching a file to add a feature or fix a bug:
- Flag any obvious technical debt, deprecated methods, or unhandled edge cases
- Use this exact format:
  `TECH DEBT FLAGGED: [file:line] [issue] [suggested fix]`
- Do NOT fix flagged debt without asking first — fixes expand scope unexpectedly

## Test Contract
- Structural modules ship with unit tests
- Any rewritten logic includes regression tests before merge
- **Exempt:** Standalone utility scripts under 200 lines with no external dependencies

## Decision Log
Append to DECISIONS.md when:
- A change affects >2 files
- A change alters data flow or module boundaries

Each entry must include:
- Decision made
- Alternatives considered
- Reasoning or citation link
- Date

DECISIONS.md is created on first use if it does not exist.
Do not log minor fixes or cosmetic changes.
