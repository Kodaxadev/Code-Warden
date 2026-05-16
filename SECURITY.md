# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 3.x     | Yes       |
| < 3.0   | No        |

## Reporting a Vulnerability

If you discover a security vulnerability in Code-Warden, please report it responsibly.

**Email:** synaptikal@gmail.com

**Please include:**
- Description of the vulnerability
- Steps to reproduce
- Affected version(s)
- Impact assessment (if known)

**What to expect:**
- Acknowledgment within 48 hours
- Assessment and timeline within 7 days
- Fix published as a patch release once confirmed

**Please do not** open a public GitHub issue for security vulnerabilities. Use email so the fix can be prepared before disclosure.

## Scope

Code-Warden is a governance and verification tool, not a security boundary. It is designed to catch accidental mistakes (oversized files, hardcoded credentials, scope drift), not to defend against malicious actors.

**In scope:**
- Secret pattern bypasses (credential patterns that should match but don't)
- File traversal issues in scanners or hooks
- Hook bypass conditions in PreToolUse enforcement
- Installer writing files outside intended directories
- npm package containing unintended files

**Out of scope:**
- Governance rules being ignored by an AI agent (prompt-level, not enforceable)
- Issues in third-party runtimes (Claude Code, Codex, Cursor, etc.)
- Social engineering or phishing

## Supply Chain

Code-Warden has zero runtime dependencies. The npm package contains only first-party code. Every release tarball is inspected with `npm pack --dry-run` before publishing.
