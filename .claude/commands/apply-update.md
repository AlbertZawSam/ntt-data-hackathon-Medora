---
description: Merge an update package (folder of rules, specs and scripts) into this repository
argument-hint: "<folder>"
---
Apply the update in `$ARGUMENTS` to this repository.

1. List every file in the folder and the file it maps to here. The update may use a flat layout (`app/`, `src/`, `amplify/`, `data/`); this repository uses npm workspaces, so map `app/` → `frontend/app/`, `src/logic/` → `shared/logic/`, other `src/` → `frontend/src/`, `amplify/` → `backend/amplify/`, `data/` → `shared/data/`, `tests/` → `shared/tests/` (or `backend/amplify/tests/`), and commands to the root npm scripts (`npm start`, `npm run sandbox`, `npm run sandbox:delete`, `npm run typecheck`, `npm test`).
2. Show the plan: new files, replaced files, and any conflict with code already in the repository. Wait for approval.
3. Copy the files, rewriting paths and commands as above. Don't touch app or backend code unless the update says to; note code that no longer matches the new rules instead, and map it to tasks in `docs/specs/tasks.md`.
4. Copy `docs/specs/*` to `.kiro/specs/hospital-referral-app/` so they don't contradict.
5. Run `/check`. Summarize what changed and what code still needs to follow.
