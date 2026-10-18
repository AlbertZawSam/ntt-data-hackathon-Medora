# Medora

**The right hospital, right now.**

**Problem:** in Bangkok, people don't know which hospital can actually treat their health problem right now, so patients go to the nearest hospital and may be sent on, and doctors phone hospital after hospital to place a patient.

**Solution:** Medora matches every patient to the closest hospital that can actually treat their health problem right now. People describe their problem and get the right hospital or specialist; doctors get an AI agent that finds and confirms a place for their patient; both use live readiness shared by hospitals.

Two apps from one codebase: **Medora** for people seeking care, and **Medora for Hospitals** for hospital staff, admins and doctors, on a serverless AWS backend in us-east-1 with Amazon Nova and Titan Text Embeddings V2 on Amazon Bedrock. Built for the NTT DATA Digital Innovation Challenge 2026. Synthetic data only; not for medical use. In an emergency in Thailand, call **1669**.

The full problem, root causes (RC1 to RC4), solution and success metrics: [docs/problem-and-solution.md](docs/problem-and-solution.md). The architecture: [docs/architecture.md](docs/architecture.md). Hospital roles: [docs/roles.md](docs/roles.md).

## Tech stack

| Layer | Technology |
| --- | --- |
| Apps | Expo (React Native), TypeScript strict, Expo Router; variants `APP_VARIANT=patient` and `hospital` |
| Backend | AWS Amplify Gen 2: Cognito (public pool + invite-only staff pool with TOTP MFA), AppSync, DynamoDB, Lambda (Node.js, Arm) |
| Orchestration | AWS Step Functions Standard (referrals), EventBridge Scheduler (status reminders) |
| AI | Amazon Bedrock: Nova Pro (referral agent), Nova Lite (patient understanding), Guardrails, Knowledge Bases with Titan Text Embeddings V2 on S3 Vectors |
| Maps | Amazon Location Service |
| Notifications | Amazon SNS (FCM, APNs) |
| Region | `us-east-1` |

## Project structure

An npm workspaces monorepo with three packages. Install once and run every command from the root.

```text
medora/
├── package.json                      workspaces + root scripts: start, web, sandbox, test, typecheck
├── AGENTS.md                         the full rules for every AI agent (goal, safety, security, cost, conventions)
├── CLAUDE.md                         Claude Code entry point (imports AGENTS.md and docs/roles.md)
├── .claude/                          settings (us-east-1, Nova model IDs), /check, /next-task, /implement-roles,
│                                     /apply-update, roles-security-reviewer agent
├── .github/                          Copilot instructions and prompts, CI guardrails, PR template, CODEOWNERS
├── frontend/                         @medora/frontend: the Expo app
│   ├── app/                          Expo Router screens
│   ├── src/i18n/                     en.json, th.json, t.ts
│   ├── src/services/                 the only AWS layer: Amplify, auth, live AppSync data
│   ├── src/state/  src/components/  src/ui/
│   └── tests/
├── backend/amplify/                  @medora/backend: backend.ts, auth/, data/, functions/
├── shared/                           @medora/shared: pure TypeScript used by the app and Lambda
│   ├── logic/                        redFlags, ranking, timeBudget, rules, referral, session, types
│   ├── data/                         pathways.json, red_flags.json (hospitals.json and kb/ arrive with tasks 3.1 and 23)
│   └── tests/                        unit and property tests for logic/
├── scripts/                          guard.sh, cost-check.sh, create-budget-alarms.sh, create-anomaly-detection.sh
└── docs/                             problem-and-solution.md, architecture.md, roles.md, specs/ (requirements, design, tasks)
```

Shared code is imported by package name, e.g. `import { redFlag } from '@medora/shared/logic/redFlags'`.

## Current state vs. target

The specs in `docs/specs/` describe the target. The code today is an earlier draft and differs in these ways, each covered by a task in [docs/specs/tasks.md](docs/specs/tasks.md):

- One app with role-based screens and one Cognito pool (target: two app variants, a public pool and an invite-only staff pool with TOTP MFA; tasks 1, 4).
- Hospitals register themselves in the app (target: 10 synthetic hospitals seeded from `shared/data/hospitals.json`, test users by script; tasks 3.1, 5.3).
- `agent-runner` runs the referral in one Lambda with the model ID from `MODEL_ID_FAST` / `MODEL_ID_STRONG` (target: Nova models, Step Functions Standard; tasks 18, 19, 22). Bedrock IAM permissions are not attached yet, so it takes the rule-based backup path.

## Getting started

```bash
git clone https://github.com/AlbertZawSam/ntt-data-hackathon-Medora.git
cd ntt-data-hackathon-Medora
npm install          # installs all three packages
npm run sandbox      # deploy a personal backend in us-east-1; writes frontend/amplify_outputs.json
npm start            # run the app (press w for web, a for Android, i for iOS)
```

Without AWS access, `npm start` still works: the app opens and says it isn't connected to a backend yet.

| Task | Command |
| --- | --- |
| Type-check all packages | `npm run typecheck` |
| Unit tests, all packages | `npm test` (one package: `npm test -w @medora/shared`) |
| Add a dependency | `npm install <pkg> -w @medora/frontend` (Expo native modules: `cd frontend && npx expo install <pkg>`) |
| Cost, safety and security checks | `bash scripts/guard.sh` |
| End of every day | `bash scripts/cost-check.sh && npm run sandbox:delete` |

Never commit `amplify_outputs.json`, `.env`, `google-services.json` or AWS keys.

## How to build

1. **Cost guardrails first:** sign in with `aws configure sso`, then the team lead runs `bash scripts/create-budget-alarms.sh <team emails>` and `bash scripts/create-anomaly-detection.sh <team email>`.
2. **Build task by task, all P0 tasks first** (a complete patient-and-doctor demo), then P1 and P2. In Copilot Chat (agent mode) or Claude Code, run `/next-task`. In Claude Code, run `/check` after each change and `/implement-roles` for the hospital roles. Review every change before accepting it, especially safety rules and anything that creates AWS resources.
3. **End of every day:** `bash scripts/cost-check.sh` and `npm run sandbox:delete`.

## Cost-efficient architecture strategy (summary)

| Do | Avoid |
| --- | --- |
| Serverless first: Lambda, S3, DynamoDB on-demand, AppSync, Step Functions, Bedrock | Overnight idle EC2 or RDS instances (Medora uses none) |
| Minimal sizing; scale up only on a measured bottleneck | GPU or large ML instances (all AI runs on Bedrock) |
| Shut down resources: delete sandboxes daily, run `cost-check.sh` | NAT gateways, VPC Lambdas, Multi-AZ, Elastic IPs |
| Team alarms below $350: $100, $200, $280, $320, forecast $350 | Orphaned EBS volumes, snapshots, load balancers, unused knowledge bases |

Details and the rules agents follow are in `AGENTS.md` section 5.

## Before the demo

- Thai text, emergency phrases and treatment windows reviewed by a Thai-speaking clinician.
- Agent evaluations recorded in `docs/evals.md`.
- Cost Explorer screenshot against the $350 budget.

## License

[MIT](LICENSE)
