# Medora: instructions for Claude Code

Follow every rule in AGENTS.md. This file adds what Claude Code needs to work in this repository.

@AGENTS.md
@docs/roles.md

## Before every task

1. Read the task in `docs/specs/tasks.md` and its linked requirements in `docs/specs/requirements.md`; check `docs/specs/design.md` and `docs/architecture.md` for the part you touch.
2. Name the root cause it serves (RC1 to RC4, see `docs/problem-and-solution.md`) and which app it changes (Medora, Medora for Hospitals, or backend).
3. List the files you'll change and any AWS resource you'll add, with its idle and per-use cost. Stop and ask if anything is billed hourly while idle.

## Fixed facts for this project

- **Layout: npm workspaces.** `frontend/` (Expo app), `backend/amplify/` (Amplify Gen 2), `shared/` (logic, rules data, tests). Run every command from the repository root.
- **AWS region: `us-east-1` only.** The organizers allow only `us-east-1`, `ap-southeast-1` and `ap-southeast-7`; we deploy everything to `us-east-1`. Never write another region into code or config.
- **AI models: Amazon Nova and Titan only.** `amazon.nova-pro-v1:0` (referral agent, `MODEL_ID_STRONG`), `amazon.nova-lite-v1:0` (patient understanding and tests, `MODEL_ID_FAST`), `amazon.titan-embed-text-v2:0` (knowledge base, `EMBEDDING_MODEL_ID`). Direct model IDs, no `us.` or `global.` profiles. AWS Marketplace is blocked in our account, so third-party models won't work.
- **Hospital roles:** admin (`admins`), unit staff (`hospital_staff`, exactly one `custom:unit`), doctor (`doctors`), each tied to one hospital by `custom:hospitalId`. Full rules in `docs/roles.md`. Enforce them on the server, not only in the screens.
- **Permissions:** our AWS permission set (ChallengerAccess) can't manage CDK's `cdk-*` roles. If CDK bootstrapping fails, don't try workarounds; tell the user and offer the AWS SAM fallback in task 4.1, with roles named `medora-*`.

## How to work

- One task at a time, all P0 tasks before P1, P1 before P2.
- Keep changes small and reviewable; show the plan before editing many files.
- After changes, run `/check` (type-check, tests, guardrails) and fix failures before saying a task is done.
- For changes to sign-in, roles, AppSync rules, IAM or Lambda permissions, run the `roles-security-reviewer` agent before finishing.
- Tick the task in `docs/specs/tasks.md` and summarize: what changed, the root cause it serves, how to check it, and any AWS cost.

## Never

- Run commands that create, change or delete IAM, organization, budget or billing settings.
- Run AWS delete commands, `git push --force`, or `rm -rf` outside `node_modules`, `.expo` or `dist`; write them out for the user instead.
- Put real patient data, AWS keys or generated files such as `frontend/amplify_outputs.json` in Git.
- Use Claude Code's own model access through this AWS account; Claude Code is a development tool only, and Medora's AI uses Amazon Nova.
