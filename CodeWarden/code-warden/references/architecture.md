# Architecture & Memory Management

## Blueprint Rule
Before generating any new module:
- Verify alignment with the master architecture doc or PRD
- Explicitly state which other files or modules will be impacted
- Never generate a module in isolation without tracing upstream/downstream dependencies

## State Update Rule
If a change alters data flow or architecture:
- Prompt to update the architecture doc or dependency map immediately
- Do not leave docs out of sync with code
- Flag affected interface contracts or type definitions

## Re-injection Rule
Any session involving structural changes must open by re-stating:
- The architecture doc or PRD summary
- Never assume prior session context has carried over

## Re-injection Fallback
If no architecture doc exists:
- Restate the last 3 file dependencies
- Restate the current data flow
- Flag that a formal architecture doc should be created
