# Operational Discipline

## Verification Before Completion

Before claiming work is complete, fixed, or safe:
- Run the narrowest meaningful verification command for the change.
- Report the exact command and result.
- If verification cannot run, state why and name the residual risk.
- Do not say tests pass unless the relevant command was run in this session.

Minimum verification by change type:
- Code behavior: unit, integration, or smoke test that exercises the changed path.
- Frontend UI: browser or screenshot check for the touched workflow.
- Build/config: build, typecheck, or config validation.
- Documentation-only: link, formatting, or spelling check when available.

## Source-Control Hygiene

Before editing files in a repository:
- Check whether the workspace is under git.
- Inspect dirty files when git metadata is available.
- Never revert user changes unless the user explicitly requests it.
- Keep unrelated local changes out of the patch, commit, or summary.

Before destructive operations:
- State the exact target path.
- Verify the target resolves inside the intended workspace or explicitly named directory.
- Prefer reversible operations or a one-step rollback.

## Dependency and Supply-Chain Control

Before adding, removing, upgrading, or replacing dependencies:
- Identify the current package manager and lockfile.
- Prefer existing dependencies and local patterns over new packages.
- Use official package docs or registry metadata for version-specific behavior.
- Explain why the dependency change is necessary and what alternative was rejected.
- Run the package manager's lockfile/update command intentionally; never hand-edit lockfiles.

## Evidence Standard

For technical claims and recommendations:
- Cite local evidence with file paths, command output, or linked official docs.
- Use live documentation for time-sensitive, version-specific, or rapidly changing APIs.
- Clearly label unverified assumptions.
- Record durable decisions in `DECISIONS.md` when the choice affects architecture, dependencies, safety, or workflow.
