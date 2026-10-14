---
mode: agent
description: Implement the next unticked task from the Medora spec
---
Read `AGENTS.md`, then open `docs/specs/tasks.md` and find the first unticked task (or the task I name: ${input:task:task number, or leave empty for the next one}).

1. Read the requirements it links to in `docs/specs/requirements.md` and the relevant section of `docs/specs/design.md`.
2. Before writing code, list the files you'll create or change and any AWS resource the task adds, with its idle and per-use cost. If anything is billed hourly while idle, stop and ask.
3. Implement the smallest change that meets the acceptance criteria, with English and Thai strings and unit tests for new logic.
4. Run `npx tsc --noEmit` and `npm test`; fix any failures.
5. Tick the task in `docs/specs/tasks.md` and summarize what changed and how to check it.
