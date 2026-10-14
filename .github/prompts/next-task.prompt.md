---
mode: agent
description: Implement the next unticked task from the Medora spec
---
Read `AGENTS.md`, then open `docs/specs/tasks.md` and find the first unticked task (or the task I name: ${input:task:task number, or leave empty for the next one}).

1. Read the requirements it links to in `docs/specs/requirements.md` and the relevant section of `docs/specs/design.md`.
2. Before writing code, list the files you'll create or change and any AWS resource the task adds, with its idle and per-use cost. If anything is billed hourly while idle, stop and ask.
3. Implement the smallest change that meets the acceptance criteria, with English and Thai strings and unit tests for new logic. Use live data only: no seed data, sample hospitals or pre-made accounts; changing data comes from live subscriptions (AGENTS.md section 7a).
4. Run `npm run typecheck`, `npm test` and `bash scripts/guard.sh`; fix any failures.
5. Tick the task in `docs/specs/tasks.md` (and the matching task in `.kiro/specs/hospital-referral-app/tasks.md` if the team uses Kiro). Summarize what changed and how to check it in the app: which roles to sign up on a fresh sandbox and the steps to follow.
