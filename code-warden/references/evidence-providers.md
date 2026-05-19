# Evidence Providers

External tools can strengthen Code-Warden reports, but they do not replace
Scope Gate, Plan Gate, receipts, local scans, or human confirmation.

Treat provider output as evidence with a source, timestamp, scope, and trust
limit.

## Provider Categories

| Category | Examples | Evidence type |
|----------|----------|---------------|
| Code scanning | GitHub Code Scanning, CodeQL, Semgrep | SARIF alerts, source-located findings |
| Secret scanning | GitHub secret scanning, provider scanners | Credential findings, push protection status |
| Dependency security | Snyk, npm audit, OSV, Dependabot | Vulnerability and license findings |
| Agent security | Snyk Studio, MCP security tools | Agent/MCP-aware security context |
| Build provenance | GitHub artifact attestations | Build artifact identity and provenance |
| Package provenance | npm trusted publishing | Package publish provenance and source link |
| CI evidence | GitHub Actions, other CI systems | Workflow run URL, logs, artifacts |

## Evidence Record

When referencing external evidence, record:
- Provider name and category.
- Tool version or hosted service version when available.
- Command, workflow run URL, or API endpoint used.
- Repository, commit, branch, and path scope.
- Output artifact path or URL.
- Result status and timestamp.
- Known trust limits or skipped scopes.

If the evidence cannot be tied to a commit, path scope, or timestamp, mark it
as advisory.

## Trust Limits

- SARIF is strongest for source-located findings, not whole-session governance.
- CI passing only proves the workflow checks that actually ran.
- Provenance proves where an artifact or package came from; it does not prove
  the source is secure or the agent followed Scope Gate.
- Secret scanning can miss custom credential formats and cannot prove secrets
  were never exposed in chat, logs, or external tools.
- Dependency scanners report known issues; they do not validate architecture,
  runtime behavior, or project fit.
- MCP and agent-security providers require the MCP governance approval rules
  before their results are trusted.

## Accepted Evidence

Prefer evidence that is:
- Machine-readable: JSON, SARIF, attestations, SBOMs, or signed provenance.
- Reproducible from a documented command or workflow.
- Linked to an immutable commit or release tag.
- Stored as a CI artifact, release asset, package provenance record, or receipt.
- Produced by a scoped token or trusted publishing flow instead of a broad
  personal credential.

## Rejected Evidence

Do not treat these as sufficient proof:
- Screenshots without command output or run links.
- Chat claims that a tool was run without command evidence.
- Unversioned local tool output copied into a message.
- Provider output generated against a different commit, branch, or package.
- Results from an unapproved MCP server or tool with unknown credentials.

## Provider Config Vocabulary

Use `external_evidence.providers` in `codewarden.json` to describe approved
evidence sources. Each provider should declare:
- `category`: one provider category from this reference.
- `required`: whether the provider is required for the team's gate.
- `artifact`: the expected output path, URL pattern, or provenance surface.
- `trust_limit`: the provider's known boundary.

This vocabulary is descriptive in the current release line. Runtime collection
or provider API calls must be added in a separate, tested slice.

## Sources

- GitHub SARIF upload:
  https://docs.github.com/en/code-security/code-scanning/integrating-with-code-scanning/uploading-a-sarif-file-to-github?learn=code_security_integration%2F1000
- GitHub artifact attestations:
  https://docs.github.com/en/actions/security-for-github-actions/using-artifact-attestations/using-artifact-attestations-to-establish-provenance-for-builds
- npm trusted publishing:
  https://docs.npmjs.com/trusted-publishers
- Snyk Studio agentic integrations:
  https://docs.snyk.io/integrations/snyk-studio-agentic-integrations
