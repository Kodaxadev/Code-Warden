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
  }
}
```

| Setting | Default | Rationale |
|---------|---------|-----------|
| `max_file_length` | 400 | Keeps files reviewable in a single pass. The `warden-lint.js` script enforces this. |
| `pre_flight_trigger_lines` | 150 | Forces a JSON manifest before large outputs. |
| `human_checkpoint_files` | 2 | Requires human `[AWAITING CONFIRMATION]` before modifying this many files simultaneously. |
| `exempt_from_blast_radius` | (list) | Skips strict rewriting rollback plans on these file directories. |

---

## How to Customize

1. **Open** `codewarden.json` in your `.claude/skills/code-warden/` directory.
2. **Modify** the specific rule or threshold inside the JSON structural fields.
3. The executable tools (`tools/warden-lint.js`, etc.) read these limits dynamically so no Markdown files need to be edited to enforce limits.
4. **Log the change** in `DECISIONS.md` so your team knows why the default was overridden.
