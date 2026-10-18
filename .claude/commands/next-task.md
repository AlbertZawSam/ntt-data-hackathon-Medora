---
description: Implement the next unticked task from docs/specs/tasks.md (P0 first)
argument-hint: "[task number]"
---
Task: $ARGUMENTS (if empty, take the first unticked task by priority: every P0 before any P1, every P1 before any P2).

1. Read the task in `docs/specs/tasks.md`, its linked requirements in `docs/specs/requirements.md`, and the parts of `docs/specs/design.md`, `docs/architecture.md` and `docs/roles.md` it touches.
2. Before editing, state: the root cause it serves (RC1 to RC4), which app it changes (Medora, Medora for Hospitals, backend), the files you'll change, and any AWS resource it adds with its idle and per-use cost. If anything is billed hourly while idle, stop and ask. If more than a few files change, show the plan and wait for approval.
3. Implement the smallest change that meets the acceptance criteria: npm workspaces layout (`frontend/`, `backend/amplify/`, `shared/`), English and Thai strings, unit tests for new logic in `shared/tests/`, us-east-1 only, Nova and Titan via `MODEL_ID_*` only, role rights enforced on the server.
4. Run `/check` and fix failures.
5. If the change touches sign-in, roles, AppSync rules, IAM or Lambda permissions, run the `roles-security-reviewer` agent and address its findings.
6. Tick the task in `docs/specs/tasks.md` and in `.kiro/specs/hospital-referral-app/tasks.md`. Summarize: what changed, the root cause, how to check it, and any AWS cost.
