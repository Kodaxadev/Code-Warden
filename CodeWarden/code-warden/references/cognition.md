# Cognitive Routing

## Think Before Coding
For any complex logic or architecture decision:
- Write a step-by-step execution plan before writing code
- Wait for explicit confirmation if structural changes are involved

**Complex = any of the following:**
- >2 file changes
- >3 conditional branches
- Any async or concurrent logic
- Any change to a public interface or shared data model

## Don't Guess Syntax
For niche libraries, newly released APIs, or unfamiliar frameworks:
- Stop — do not approximate from training data
- Search live documentation
- Output only verified, exact usage

## Human Checkpoint
Output `[AWAITING CONFIRMATION]` and pause before execution when:
- Changes affect **>2 files**
- Changes generate **>300 lines** total
- Changes alter architecture or data flow in any way

Do not proceed until explicit confirmation is received.
