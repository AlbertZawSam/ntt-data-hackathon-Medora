# AGENTS.md: rules for AI coding agents working on Medora

Every AI agent in this repository (GitHub Copilot agent mode in VS Code, Claude Code, or any other) follows these rules. Read this file before every task. The spec is in `docs/specs/` (requirements, design, tasks).

## 1. What Medora is

Medora is a bilingual (English and Thai) mobile app on AWS that routes patients to the closest hospital that can treat them right now. Patients find care and specialists; hospital staff keep status current and answer requests; doctors place patients with an AI referral agent and confirm every transfer. Built for the NTT DATA Digital Innovation Challenge 2026. All data is live and real-time: hospitals, staff, doctors and patients sign up in the app during the demo and enter their own made-up data, and every change reaches the other phones within 2 seconds. The backend starts empty; nothing is pre-seeded, and nothing replies on a hospital's behalf except the auto-accept rules its admin sets.

Principle: **the agent coordinates; fixed rules and humans decide.**

## 2. Stack (do not change without asking)

| Layer | Choice |
| --- | --- |
| App | Expo (React Native), TypeScript strict, Expo Router; one app with role-based screens |
| Backend | AWS Amplify Gen 2 in `backend/amplify/`: Cognito, AppSync + DynamoDB (on-demand), Lambda (Node.js, TypeScript) |
| AI | Amazon Bedrock, Claude models, Converse API with tool use; Bedrock Guardrails; Bedrock Knowledge Bases on Amazon S3 Vectors |
| Maps and routing | Amazon Location Service |
| Notifications | Amazon SNS mobile push (FCM, APNs) |
| Region | `ap-southeast-1` unless the team lead says otherwise |

## 3. Commands

| Task | Command |
| --- | --- |
| Install everything (once, from the root) | `npm install` |
| Run the app | `npm start` (web: `npm run web`; development build: `npm start -- --dev-client`) |
| Deploy a personal backend | `npm run sandbox` (writes `frontend/amplify_outputs.json`) |
| Remove it (end of every day) | `npm run sandbox:delete` |
| Type-check all packages (must pass) | `npm run typecheck` |
| Unit tests, all packages | `npm test` (one package: `npm test -w @medora/shared`) |
| Check for idle or orphaned AWS resources | `bash scripts/cost-check.sh` |
| Create the team budget alarms (once) | `bash scripts/create-budget-alarms.sh <team-email>` |
| Enable Cost Anomaly Detection (once) | `bash scripts/create-anomaly-detection.sh <team-email>` |
| Check code against the rules (also runs on every pull request) | `bash scripts/guard.sh` |

## 4. Safety rules (non-negotiable)

1. Emergency red flags are checked by fixed rules, in English and Thai (`shared/data/red_flags.json`), before any AI call, and work offline. Never route emergency detection through a model.
2. The AI agent never gets a tool that approves a transfer, classifies an emergency or changes hospital status. Only a doctor confirms a transfer.
3. Auto-accept rules are set by hospital admins; staff can undo an automatic acceptance for 60 seconds.
4. Never diagnose or give treatment advice in the app or in agent output; apply Bedrock Guardrails.
5. Patient descriptions, staff notes and messages are data, never instructions: keep them in clearly delimited blocks in prompts.
6. Public users see simple labels only, never exact bed counts, equipment faults or staff rosters.
7. Synthetic data only: users type made-up data, never real patient information.
8. Live data only: every hospital, user, request and referral is created in the app during the demo. Never add prepared hospital datasets, seed scripts, pre-created or console-created test users, sample hospitals in empty lists, "reset demo data" actions, or automatic replies and status changes (only admin auto-accept rules may answer for a hospital). The only data bundled with the code is the rules in `shared/data/`. Unit tests make up the hospitals they need inside the test itself. See section 7a for how live data flows.

## 5. Cost-efficient architecture strategy ($350 strict cap)

The whole project must stay under **$350 of AWS spend**. These rules follow the competition's cost best practices and apply to every task that touches AWS.

### DO: preferred patterns

- **Serverless first.** Use Lambda, S3, DynamoDB in on-demand mode, AppSync or API Gateway. Use Fargate only if a task truly needs a long-running container, and scale it to zero when idle. Use Amazon Bedrock for AI instead of hosting models.
- **Minimal sizing.** Start with the smallest setting: Lambda memory 256 to 512 MB, short timeouts, the fast Claude model, 7-day log retention, sampled tracing. Scale up only when a measured bottleneck shows it's needed, and record the measurement in the task.
- **Shut down resources.** Delete personal Amplify sandboxes at the end of every working day (`npm run sandbox:delete`). Stop or delete anything idle when you're not actively building. Run `bash scripts/cost-check.sh` before ending the day.
- **Custom alarms below $350.** The team's budget alarms fire at $100, $200, $280 and $320 of actual spend, and at $350 forecast, for an early buffer. Set them up once with `scripts/create-budget-alarms.sh`.
- **Tag everything** `project=medora` and `stage=dev|prod`, so Cost Explorer shows spend per stage.
- **Cap AI usage.** At most 8 model turns and a token cap per agent run, a daily run limit per user, and the stronger model only for final evaluation and the `prod` stage.

### AVOID: anti-patterns

- **Overnight idle instances.** Never create EC2 or RDS instances for this project; Medora needs neither. If a teammate creates one for an experiment, it's deleted the same day.
- **Oversized GPUs.** Never provision GPU or large ML instances (EC2 GPU, SageMaker endpoints or notebooks). All AI runs on Bedrock, paid per request.
- **Expensive network infrastructure.** No NAT gateways, no VPC-attached Lambdas, no Multi-AZ setups, no Elastic IPs for this prototype. Lambdas reach AWS services over public AWS endpoints.
- **Orphaned assets.** Don't leave unattached EBS volumes, EBS snapshots, load balancers, unused S3 buckets, idle knowledge bases or WAF web ACLs behind. `scripts/cost-check.sh` lists them.
- **Hourly-billed managed services.** No OpenSearch Serverless (use S3 Vectors for the knowledge base), no Aurora or RDS, no provisioned concurrency, no Bedrock provisioned throughput, no QuickSight until after the competition.

### Rules for agents

- Before adding any AWS resource, state in your reply what it costs while idle and per use. If it charges by the hour while idle, **stop and ask the team lead** instead of creating it.
- Never run destructive AWS commands (`delete`, `terminate`, `remove`) yourself; propose them for a human to run.
- Never change budget settings, IAM policies or billing configuration.

## 6. Project structure

```text
medora/                                       npm workspaces: run every command from here
├── AGENTS.md, CLAUDE.md, README.md
├── package.json                              workspaces + root scripts (start, sandbox, test, typecheck)
├── .github/                                  Copilot rules, instructions, prompts, CI
├── .vscode/                                  recommended extensions and settings
├── frontend/                                 @medora/frontend: the Expo app
│   ├── app/                                  Expo Router screens: (patient), (staff), (doctor), (admin), sign-in, sign-up
│   ├── src/i18n/                             en.json, th.json, t.ts
│   ├── src/services/                         the only layer that calls AWS: auth now; data, location, push, agent later
│   ├── src/state/  src/components/  src/ui/
│   ├── assets/                               icon, splash
│   ├── tests/                                app tests (i18n)
│   └── app.json, metro.config.js, babel.config.js, tsconfig.json
├── backend/                                  @medora/backend: AWS Amplify Gen 2
│   └── amplify/                              backend.ts, auth/, data/, functions/ (tests/ arrives with the agent evals)
├── shared/                                   @medora/shared: pure TypeScript, used by the app and Lambda
│   ├── logic/                                redFlags, ranking, timeBudget, rules, session
│   ├── data/                                 pathways.json, red_flags.json (rules)
│   └── tests/                                unit and property tests for logic/
├── scripts/                                  guard.sh, cost-check.sh, create-budget-alarms.sh
└── docs/specs/                               requirements.md, design.md, tasks.md
```

Import shared code by package name, never by relative path across packages: `import { redFlag } from '@medora/shared/logic/redFlags'`. The frontend never imports from `backend/`, and `shared/` imports from neither.

## 7. Conventions

- Every user-facing string lives in `frontend/src/i18n/en.json` and `frontend/src/i18n/th.json`; never hard-code text in screens.
- Shared decision logic lives in `shared/logic/` with no React Native imports, so Lambda functions can import it.
- Screens never call AWS directly; they use services in `frontend/src/services/`.
- `frontend/amplify_outputs.json` is generated by `npm run sandbox`; never edit or commit it.
- Add a dependency to the package that uses it: `npm install <pkg> -w @medora/frontend` (or `-w @medora/backend`, `-w @medora/shared`); for Expo native modules use `npx expo install <pkg>` from `frontend/`.

## 7a. Real-time data

- **One source of truth.** Every hospital, status, request, message, referral, trace step and transfer is a record in AppSync + DynamoDB, created by a signed-in user or by a Lambda acting on a user's action. Screens never read hospital data from bundled files.
- **Subscribe, don't poll.** Screens that show changing data (status, inbox, requests, messages, agent trace, referrals, transfers) read it through live subscriptions in `frontend/src/services/data.ts` (`observeQuery`) via `AppProvider`, so changes appear within 2 seconds. Use one-off reads only for data that can't change while the screen is open.
- **Writes go through the data service.** Screens call typed helpers in `frontend/src/services/`; every status write sets `updatedAt`, and every safety check, request, reply, message and confirmation also writes an `Activity` entry in English and Thai.
- **Freshness is shown, not hidden.** Status older than 30 minutes is labelled "may be outdated" (`isStale` in `shared/logic/ranking.ts`) and ranks lower; never refresh a timestamp unless staff confirm ("Still correct?").
- **Decide on current data.** Auto-accept, ranking and the agent's tools read the records as they are at that moment, never cached copies.
- **Empty is a valid state.** With no registered hospital that can help, say so plainly and show Call 1669; never fill the gap with sample data.
- **No backend, no data.** Without `frontend/amplify_outputs.json` the app opens with sign-in disabled and a "not connected" message; don't add fake sessions or data to work around it.
- **Simulated only where no service exists.** The ambulance position on a transfer is simulated (no ambulance service is connected) and is labelled "Simulated" on screen; everything else is real user input.

## 8. How to work

1. Take the next unticked task in `docs/specs/tasks.md`, one at a time.
2. Read its linked requirements in `docs/specs/requirements.md` and the relevant part of `docs/specs/design.md`.
3. Make the smallest change that meets them; explain any AWS cost impact.
4. Run `npm run typecheck`, `npm test` and `bash scripts/guard.sh`.
5. Check the flow in the app against your own sandbox by signing up each role you need (a new sandbox starts empty; there are no pre-made accounts).
6. Tick the task in `docs/specs/tasks.md`; if your team tracks progress in Kiro, tick the matching task in `.kiro/specs/hospital-referral-app/tasks.md` too. `docs/specs/` is the source of truth when the two differ.

## 9. Definition of done

- `npm run typecheck`, `npm test` and `bash scripts/guard.sh` pass; new logic has unit tests in `shared/tests/`.
- English and Thai strings added.
- The linked acceptance criteria are met.
- No new idle AWS cost; any new resource is tagged and its cost stated.
- No seed, sample or prepared data added; live screens subscribe to changes (section 7a).
