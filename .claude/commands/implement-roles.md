---
description: Build the hospital roles (admin, unit staff with one unit, doctor) from docs/roles.md
---
Implement the hospital roles exactly as described in `docs/roles.md`, using the npm workspaces layout. This covers tasks 4.3, 4.4, 5.2, 7.1 and the role parts of 7.4 in `docs/specs/tasks.md`.

Plan first and wait for approval, listing files and AWS resources with idle and per-use cost (Cognito: no idle cost; Lambda: pay per request). Then:

1. Staff user pool in `backend/amplify/backend.ts`: invite only (no self sign-up), TOTP MFA required with no SMS, groups `admins`, `hospital_staff`, `doctors`, custom attributes `hospitalId` and `unit` that only admins can write; register it as a second AppSync sign-in provider next to the public pool. If CDK bootstrapping or the account permissions block this, stop and tell me (fallback in task 4.1 / 4.3).
2. `invite-staff` Lambda in `backend/amplify/functions/` called by admins through AppSync: refuses another hospital and unit values outside `ward`, `icu`, `nicu`, `er`, `radiology`, `cathlab`, `all`; least-privilege IAM on the staff pool only.
3. `validateStatusUpdate` Lambda: group, `custom:hospitalId` and `custom:unit` checks, conditional write on `ownerUnit` and `version`.
4. AppSync authorization rules for `CareRequest`, `Referral`, `Hospital`, `Specialist`, `ClinicSlot` and reads, as in the "How to implement it" section.
5. Hospital app routing by group, and the My unit screen listing only the caller's unit items; English and Thai strings.
6. Unit tests in `shared/tests/` for the role and unit checks (pure functions in `shared/logic/`), covering every item in "Tests that must pass".

Then run `/check`, run the `roles-security-reviewer` agent, fix its findings, tick the tasks and summarize.
