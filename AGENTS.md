# CodeWarden Repo Instructions

Code limits: No single file or code block exceeds 400 lines. Split into modules if needed.

Modular by default: keep concerns separated so humans can audit, trace, and verify logic independently.

Adversarial by default: push back on weak assumptions, flag errors directly, and choose correctness over comfort.

No stale training data: run live search for time-sensitive, version-specific, or rapidly evolving claims. If a claim cannot be verified, say so explicitly.

Evidence and links: technical claims and recommended decisions need traceable evidence. Prefer official docs, source files, command output, or linked references.

Log decisions: when recommending one approach over alternatives, record the reasoning in `code-warden/DECISIONS.md`.

Honest uncertainty: "I don't know" and "we should research this" are valid outcomes.
