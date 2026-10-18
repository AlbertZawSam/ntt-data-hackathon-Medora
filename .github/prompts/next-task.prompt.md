---
mode: agent
description: Implement the next unticked task from the Medora spec
---
Read `AGENTS.md` and `docs/problem-and-solution.md`, then open `docs/specs/tasks.md` and find the first unticked task by priority: all P0 before P1, P1 before P2 (or the task I name: ${input:task:task number, or leave empty for the next one}).

1. Read the requirements it links to in `docs/specs/requirements.md`, the relevant section of `docs/specs/design.md` and `docs/architecture.md`, and `docs/roles.md` if it touches hospital accounts.
2. Before writing code, name the root cause it serves (RC1 to RC4) and the app it changes (Medora, Medora for Hospitals, or backend). List the files you'll create or change and any AWS resource the task adds, with its idle and per-use cost. If anything is billed hourly while idle, stop and ask.
3. Implement the smallest change that meets the acceptance criteria, with English and Thai strings and unit tests for new logic in `shared/tests/`. Keep everything in us-east-1 and use only Amazon Nova and Titan models through `MODEL_ID_*` environment variables. Enforce role rights on the server.
4. Run `npm run typecheck`, `npm test` and `bash scripts/guard.sh`; fix any failures.
5. Tick the task in `docs/specs/tasks.md` (and the matching task in `.kiro/specs/hospital-referral-app/tasks.md` if the team uses Kiro). Summarize what changed, the root cause it serves, how to check it in the app, and any AWS cost and security impact.
