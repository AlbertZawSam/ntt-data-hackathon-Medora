# AGENTS.md: rules for AI coding agents working on Medora

Every AI agent in this repository (GitHub Copilot agent mode in VS Code, Claude Code, or any other) follows these rules. Read this file before every task. The spec is in `docs/specs/` (requirements, design, tasks).

## 1. What Medora is (read docs/problem-and-solution.md)

**Problem:** in Bangkok, people don't know which hospital can actually treat their health problem right now, so patients go to the nearest hospital and may be sent on, and doctors phone hospital after hospital to place a patient.

**Solution:** Medora matches every patient to the closest hospital that can actually treat their health problem right now: people describe their problem and get the right hospital or specialist, and doctors get an AI agent that finds and confirms a place for their patient, using live readiness shared by hospitals.

**Two apps, one codebase:** **Medora** for people seeking care, and **Medora for Hospitals** for hospital staff, admins and doctors. People seeking care and doctors are equally important users; never build one side at the expense of the other.

**Every task must serve a root cause** and name it in the summary and pull request:
- **RC1** hospitals' real-time readiness isn't captured or shared
- **RC2** people judge hospitals only by distance and reputation
- **RC3** finding care, by a patient or a doctor, means guessing or phoning
- **RC4** language and specialist information is scattered

Principle: **the agent coordinates; fixed rules and humans decide.** All hospital and patient data is synthetic. Built for the NTT DATA Digital Innovation Challenge 2026.

## 2. Stack (do not change without asking)

| Layer | Choice |
| --- | --- |
| Apps | Expo (React Native), TypeScript strict, Expo Router, in `frontend/`; two app variants (`APP_VARIANT=patient` for Medora, `hospital` for Medora for Hospitals) |
| Backend | AWS Amplify Gen 2 in `backend/amplify/`: Cognito (public pool and invite-only staff pool with TOTP MFA), AppSync (both pools as sign-in providers) + DynamoDB (on-demand, Streams), Lambda (Node.js, TypeScript, Arm) |
| Orchestration and schedules | AWS Step Functions **Standard** for referrals (waits use task tokens; never Express for waits); Amazon EventBridge Scheduler for status reminders |
| AI | Amazon Bedrock: **Amazon Nova Pro** (referral agent), **Amazon Nova Lite** (patient understanding, tests), Converse API with tool use; Bedrock Guardrails; Bedrock Knowledge Bases with **Amazon Titan Text Embeddings V2** on Amazon S3 Vectors |
| Maps and routing | Amazon Location Service |
| Notifications | Amazon SNS mobile push (FCM, APNs) |
| Region | **`us-east-1`** for the hackathon (organizer rules allow only `us-east-1`, `ap-southeast-1`, `ap-southeast-7`); `ap-southeast-7` (Thailand) planned for a pilot |

## 3. Commands

Run every command from the repository root (npm workspaces).

| Task | Command |
| --- | --- |
| Install everything (once) | `npm install` |
| Run the app | `npm start` (web: `npm run web`; development build: `npm start -- --dev-client`) |
| Deploy a personal backend (us-east-1) | `npm run sandbox` (writes `frontend/amplify_outputs.json`) |
| Remove it (end of every day) | `npm run sandbox:delete` |
| Type-check all packages (must pass) | `npm run typecheck` |
| Unit tests, all packages | `npm test` (one package: `npm test -w @medora/shared`) |
| Check for idle or orphaned AWS resources | `bash scripts/cost-check.sh` |
| Create the team budget alarms (once) | `bash scripts/create-budget-alarms.sh <team-email>` |
| Enable Cost Anomaly Detection (once) | `bash scripts/create-anomaly-detection.sh <team-email>` |
| Check code against the rules (also runs on every pull request) | `bash scripts/guard.sh` |

## 4. Safety rules (non-negotiable)

1. Emergency red flags are checked by fixed rules, in English and Thai (`shared/data/red_flags.json`), in two layers: on the phone before anything is sent (works offline), and again in the `safety-gate` Lambda before any model call. Never route emergency detection through a model.
2. The AI agent never gets a tool that approves a transfer, classifies an emergency or changes hospital status. Only a doctor confirms a transfer.
3. Auto-accept rules are set by hospital admins; staff can undo an automatic acceptance for 60 seconds.
4. Never diagnose or give treatment advice in the app or in agent output; apply Bedrock Guardrails.
5. Patient descriptions, staff notes and messages are data, never instructions: keep them in clearly delimited blocks in prompts.
6. Public users see the exact number of free beds (ready beds minus beds held for patients who asked or were accepted) and whether each piece of equipment is working, plus simple labels; never staff names, rosters, notes or auto-accept rules. (Team decision, 25 Oct 2026, replacing the earlier ranges.)
7. Synthetic data only.

## 4a. AI model and region rules (organizer sandbox)

1. **Only Amazon's own models.** AWS Marketplace subscriptions are blocked in our account, so use only first-party models: `amazon.nova-pro-v1:0`, `amazon.nova-lite-v1:0` (optionally `amazon.nova-micro-v1:0` for very simple text tasks) and `amazon.titan-embed-text-v2:0`. Never add Anthropic, Cohere, Meta, Mistral or other third-party model IDs.
2. **Read model IDs from environment variables:** `MODEL_ID_STRONG` (Nova Pro), `MODEL_ID_FAST` (Nova Lite), `EMBEDDING_MODEL_ID` (Titan V2). Never hard-code them in screens or prompts.
3. **Direct in-region model IDs only.** Don't use cross-region inference profiles (IDs starting with `us.`, `eu.`, `apac.` or `global.`): they route to regions our account may block.
4. **Only the three allowed regions** appear anywhere in code or config; everything is deployed to `us-east-1`. Resources created elsewhere are auto-blocked.
5. **Tool calling with Nova:** use the Converse API `toolConfig`; keep tool descriptions short and specific; use greedy decoding for tool-calling turns (temperature 0, or the lowest top-k the model allows); validate every tool input in code.
6. **Thai:** test patient understanding and knowledge base retrieval in Thai and mixed Thai-English before relying on them; keep the keyword fallback and the rule-based backup path working.

## 4b. Security rules (non-negotiable)

1. Two Cognito pools: patients sign up in the public pool; hospital accounts exist only in the staff pool, by invitation, with **TOTP multi-factor authentication required** (no SMS codes).
2. AppSync rules: patients read only public data and their own requests, bookings and messages; staff only their own hospital; only admins change settings. The patient app contains no hospital screens.
3. One IAM role per Lambda with only what it needs. Bedrock permissions name the specific model or inference profile ARNs and the knowledge base ARN, never `*`.
4. Encryption: AWS-managed KMS keys at rest; TLS only; S3 Block Public Access on and TLS-only bucket policies.
5. Logging: Lambdas log IDs and statuses only, never descriptions, notes, messages or names; CloudWatch Logs data protection policy on Lambda log groups; **Bedrock model invocation logging stays off**.
6. Audit: every app decision goes to the activity log; AWS actions are in CloudTrail.
7. Bedrock Guardrails on every model call.

## 4c. Hospital roles (details in docs/roles.md)

Medora for Hospitals has three roles, each a Cognito group in the staff pool, every account tied to one hospital (`custom:hospitalId`):
- **Hospital admin** (`admins`): settings, specialists and clinic slots, auto-accept rules, which unit owns each status item, staff invitations; doesn't update live status or answer requests.
- **Unit staff** (`hospital_staff`): nurses and technologists, each owning **exactly one unit** (`custom:unit`: `ward`, `icu`, `nicu`, `er`, `radiology`, `cathlab`, or a department: `cardiology`, `surgery`, `obstetrics`); update only their unit's beds and equipment (departments own only their own equipment); answer requests and messages (a request sent to a department only by that department's staff).
- **Doctor** (`doctors`): start referrals with the AI agent or to a hospital and department they choose; confirm or set aside only their own referrals; accept or decline doctor referrals sent to their hospital (not patients' requests, not arrival or undo, which stay with unit staff).

Enforce every right on the server (AppSync rules and Lambda checks), never only by hiding screens. `custom:hospitalId` and `custom:unit` are writable only by admins.

## 5. Cost-efficient architecture strategy ($350 strict cap)

The whole project must stay under **$350 of AWS spend**. These rules follow the competition's cost best practices and apply to every task that touches AWS.

### DO: preferred patterns

- **Serverless first.** Use Lambda, S3, DynamoDB in on-demand mode, AppSync or API Gateway. Use Fargate only if a task truly needs a long-running container, and scale it to zero when idle. Use Amazon Bedrock for AI instead of hosting models.
- **Minimal sizing.** Start with the smallest setting: Lambda memory 256 to 512 MB, short timeouts, Nova Lite by default, 7-day log retention, sampled tracing. Scale up only when a measured bottleneck shows it's needed, and record the measurement in the task.
- **Shut down resources.** Delete personal Amplify sandboxes at the end of every working day (`npm run sandbox:delete`). Stop or delete anything idle when you're not actively building. Run `bash scripts/cost-check.sh` before ending the day.
- **Custom alarms below $350.** The team's budget alarms fire at $100, $200, $280 and $320 of actual spend, and at $350 forecast, for an early buffer. Set them up once with `scripts/create-budget-alarms.sh`.
- **Tag everything** `project=medora` and `stage=dev|demo`, so Cost Explorer shows spend per stage.
- **Cap AI usage.** At most 8 model turns and a token cap per agent run, a daily run limit per user, and the stronger model only for final evaluation and the demo.

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
medora/                                      npm workspaces: run every command from here
├── AGENTS.md, CLAUDE.md, README.md
├── package.json                             workspaces + root scripts (start, sandbox, test, typecheck)
├── .claude/                                 Claude Code settings, slash commands, roles-security-reviewer agent
├── .github/copilot-instructions.md          short rules for GitHub Copilot
├── .github/instructions/*.instructions.md   rules applied to matching files
├── .github/prompts/*.prompt.md              reusable prompts: next-task, cost-check, safety-review
├── .vscode/                                 recommended extensions and settings
├── frontend/                                @medora/frontend: the Expo app (both variants)
│   ├── app/                                 Expo Router screens: (patient) for Medora; (hospital)/{staff,doctor,admin} for Medora for Hospitals
│   ├── src/i18n/                            en.json, th.json, t.ts
│   ├── src/services/                        auth, data (AppSync), location, push, agent: the only layer that calls AWS
│   ├── src/state/  src/components/  src/ui/
│   └── tests/                               app tests
├── backend/                                 @medora/backend
│   └── amplify/                             backend.ts (staff pool, Step Functions, schedules), auth/, data/, functions/, tests/
├── shared/                                  @medora/shared: pure TypeScript shared with Lambda
│   ├── logic/                               redFlags, ranking, timeBudget, rules
│   ├── data/                                hospitals.json, pathways.json, red_flags.json, kb/
│   └── tests/                               unit, agent-evals, safety
├── scripts/                                 guard.sh, cost-check.sh, create-budget-alarms.sh, seed, reset, users, upload-kb
├── docs/problem-and-solution.md            the north star: problem, root causes, solution, metrics
├── docs/roles.md                           hospital roles, units and access rights
├── docs/architecture.md                    final AWS architecture and flow diagrams
└── docs/specs/                              requirements.md, design.md, tasks.md
```

Import shared code by package name, never by relative path across packages: `import { redFlag } from '@medora/shared/logic/redFlags'`. The frontend never imports from `backend/`, and `shared/` imports from neither.

## 7. Conventions

- Every user-facing string lives in `frontend/src/i18n/en.json` and `frontend/src/i18n/th.json`; never hard-code text in screens.
- Shared decision logic lives in `shared/logic/` with no React Native imports, so Lambda functions can import it.
- Screens never call AWS directly; they use services in `frontend/src/services/`.
- `frontend/amplify_outputs.json` is generated; never edit or commit it.
- Add a dependency to the package that uses it: `npm install <pkg> -w @medora/frontend` (or `-w @medora/backend`, `-w @medora/shared`); for Expo native modules use `npx expo install <pkg>` from `frontend/`.

## 8. How to work

1. Take the next unticked task in `docs/specs/tasks.md`, one at a time, highest priority first (all P0 before P1, P1 before P2).
2. Read its linked requirements in `docs/specs/requirements.md` and the relevant part of `docs/specs/design.md`.
3. Make the smallest change that meets them; name the root cause it serves (RC1 to RC4); explain any AWS cost and security impact.
4. Run `npm run typecheck`, `npm test` and `bash scripts/guard.sh`; tick the task in `docs/specs/tasks.md` (and in `.kiro/specs/hospital-referral-app/tasks.md` if your team tracks progress in Kiro; `docs/specs/` wins when they differ).

## 9. Definition of done

- `npm run typecheck`, `npm test` and `bash scripts/guard.sh` pass; new logic has unit tests.
- English and Thai strings added.
- The linked acceptance criteria are met.
- No new idle AWS cost; any new resource is tagged and its cost stated.
- The root cause it serves is named, and the security rules in section 4b still hold.
