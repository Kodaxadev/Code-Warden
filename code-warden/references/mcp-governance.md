# MCP Governance

Model Context Protocol servers expand an agent's reach beyond the local
workspace. Treat every MCP server as a tool-bearing integration with its own
trust boundary, credentials, and audit burden.

## Approval Gate

Before enabling an MCP server, record:
- Server name, source, version, install command, and owner.
- Transport type: local stdio, local HTTP, remote HTTP, or vendor-hosted.
- Requested toolsets and why each toolset is needed.
- Credential source, token scopes, rotation path, and storage location.
- Data that may leave the workspace.
- Rollback: how to disable the server and revoke credentials.

If any field is unknown, do not enable the server.

## Toolset Scope

Default to read-only toolsets.

Escalate risk when a server can:
- Write files, issues, pull requests, comments, deployments, or package data.
- Start local processes or run shell commands.
- Send repository content, secrets, logs, or private docs to remote services.
- Reach internal networks, localhost services, or cloud metadata endpoints.
- Manage tokens, OAuth flows, user sessions, or authorization state.

Write-capable MCP tools are at least `high` risk under `risk_policy`.
Destructive or secret-bearing MCP operations are `blocked` until explicitly
scoped by the user.

## Credential Rules

- Do not paste tokens into chat, docs, receipts, or committed config.
- Prefer short-lived, least-privilege tokens bound to the specific service.
- Avoid broad personal tokens when a scoped app token or fine-grained token is available.
- Never accept token passthrough where a server forwards tokens that were not
  issued for that server.
- Record revocation steps before first use.

## Local Server Rules

Local MCP servers execute with the user's machine privileges. Before adding one:
- Inspect the exact command, package, version, and arguments.
- Prefer pinned packages or checked-in scripts over floating install commands.
- Treat one-click local server install links as code execution.
- Require explicit approval before starting servers that can run commands,
  read private paths, or open network listeners.

## Remote Server Rules

Remote MCP servers can become data egress paths. Before adding one:
- Confirm the vendor, endpoint, auth method, and data retention posture.
- Restrict outbound data to what the task needs.
- Prefer server-side audit logs where available.
- Avoid sending repository-wide context when a narrower file or diff is enough.

## OAuth And Session Rules

MCP servers and clients must preserve user consent and session boundaries:
- Require per-client consent for proxy-style authorization flows.
- Show requested scopes and redirect destinations before authorization.
- Reject redirect URI changes that were not re-registered.
- Do not use session IDs as authentication.
- Bind sessions to user-specific identity where a server keeps session state.

## SSRF And Network Rules

MCP clients and servers must not become hidden network proxies:
- Do not fetch arbitrary OAuth or metadata URLs without validation.
- Block private, reserved, link-local, and cloud metadata address ranges unless
  explicitly approved for a local development scenario.
- Validate redirect targets, not only the first URL.
- Treat localhost and internal network access as high risk.

## Audit Evidence

For every enabled MCP server, keep evidence in the work item, receipt, or repo:
- Approval record with server, version, toolsets, scopes, and risk tier.
- Link to official docs or source repository.
- Verification command or smoke result.
- Any security scan result, such as GitHub MCP secret scanning, Snyk, Semgrep,
  or another approved provider.
- Disable and credential revocation instructions.

## Sources

- MCP Security Best Practices:
  https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices
- GitHub MCP secret scanning:
  https://docs.github.com/en/code-security/how-tos/use-ghas-with-ai-coding-agents/scan-for-secrets-with-github-mcp-server?tool=cli
- GitHub MCP Server:
  https://github.com/github/github-mcp-server
- Snyk Studio agentic security:
  https://docs.snyk.io/integrations/snyk-studio-agentic-integrations
