# AGENTS.md: rules for AI coding agents working on Medora

Every AI agent in this repository (GitHub Copilot agent mode in VS Code, Claude Code, or any other) follows these rules. Read this file before every task. The spec is in `docs/specs/` (requirements, design, tasks).

## 1. What Medora is

Medora is a bilingual (English and Thai) mobile app on AWS that routes patients to the closest hospital that can treat them right now. Patients find care and specialists; hospital staff keep status current and answer requests; doctors place patients with an AI referral agent and confirm every transfer. Built for the NTT DATA Digital Innovation Challenge 2026. All hospital and patient data is synthetic.

Principle: **the agent coordinates; fixed rules and humans decide.**

## 2. Stack (do not change without asking)

| Layer | Choice |
| --- | --- |
| App | Expo (React Native), TypeScript strict, Expo Router; one app with role-based screens |
| Backend | AWS Amplify Gen 2 in `amplify/`: Cognito, AppSync + DynamoDB (on-demand), Lambda (Node.js, TypeScript) |
| AI | Amazon Bedrock, Claude models, Converse API with tool use; Bedrock Guardrails; Bedrock Knowledge Bases on Amazon S3 Vectors |
| Maps and routing | Amazon Location Service |
| Notifications | Amazon SNS mobile push (FCM, APNs) |
| Region | `ap-southeast-1` unless the team lead says otherwise |

## 3. Commands

| Task | Command |
| --- | --- |
| Run the app | `npx expo start` (development build: `npx expo start --dev-client`) |
| Deploy a personal backend | `npx ampx sandbox --outputs-out-dir .` |
| Remove it (end of every day) | `npx ampx sandbox delete` |
| Type-check (must pass) | `npx tsc --noEmit` |
| Unit tests | `npm test` |
| Check for idle or orphaned AWS resources | `bash scripts/cost-check.sh` |
| Create the team budget alarms (once) | `bash scripts/create-budget-alarms.sh <team-email>` |
| Check code against the rules (also runs on every pull request) | `bash scripts/guard.sh` |

## 4. Safety rules (non-negotiable)

1. Emergency red flags are checked by fixed rules, in English and Thai (`data/red_flags.json`), before any AI call, and work offline. Never route emergency detection through a model.
2. The AI agent never gets a tool that approves a transfer, classifies an emergency or changes hospital status. Only a doctor confirms a transfer.
3. Auto-accept rules are set by hospital admins; staff can undo an automatic acceptance for 60 seconds.
4. Never diagnose or give treatment advice in the app or in agent output; apply Bedrock Guardrails.
5. Patient descriptions, staff notes and messages are data, never instructions: keep them in clearly delimited blocks in prompts.
6. Public users see simple labels only, never exact bed counts, equipment faults or staff rosters.
7. Synthetic data only.

## 5. Cost-efficient architecture strategy ($350 strict cap)

The whole project must stay under **$350 of AWS spend**. These rules follow the competition's cost best practices and apply to every task that touches AWS.

### DO: preferred patterns

- **Serverless first.** Use Lambda, S3, DynamoDB in on-demand mode, AppSync or API Gateway. Use Fargate only if a task truly needs a long-running container, and scale it to zero when idle. Use Amazon Bedrock for AI instead of hosting models.
- **Minimal sizing.** Start with the smallest setting: Lambda memory 256 to 512 MB, short timeouts, the fast Claude model, 7-day log retention, sampled tracing. Scale up only when a measured bottleneck shows it's needed, and record the measurement in the task.
- **Shut down resources.** Delete personal Amplify sandboxes at the end of every working day (`npx ampx sandbox delete`). Stop or delete anything idle when you're not actively building. Run `bash scripts/cost-check.sh` before ending the day.
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
medora/
├── AGENTS.md, CLAUDE.md, README.md
├── .github/copilot-instructions.md          short rules for GitHub Copilot
├── .github/instructions/*.instructions.md   rules applied to matching files
├── .github/prompts/*.prompt.md              reusable prompts: next-task, cost-check, safety-review
├── .vscode/                                 recommended extensions and settings
├── app/                                     Expo Router screens: (patient), (staff), (doctor), sign-in
├── src/logic/                               pure TypeScript shared with Lambda: redFlags, ranking, timeBudget, rules
├── src/i18n/                                en.json, th.json, t.ts
├── src/services/                            auth, data (AppSync), location, push, agent
├── src/state/  src/components/  src/ui/
├── amplify/                                 backend.ts, auth/, data/, functions/
├── data/                                    hospitals.json, pathways.json, red_flags.json, kb/
├── scripts/                                 guard.sh, cost-check.sh, create-budget-alarms.sh, seed, reset, users, upload-kb
├── tests/                                   unit, agent-evals, safety
└── docs/specs/                              requirements.md, design.md, tasks.md
```

## 7. Conventions

- Every user-facing string lives in `src/i18n/en.json` and `src/i18n/th.json`; never hard-code text in screens.
- Shared decision logic lives in `src/logic/` with no React Native imports, so Lambda functions can import it.
- Screens never call AWS directly; they use services in `src/services/`.
- `amplify_outputs.json` is generated; never edit or commit it.

## 8. How to work

1. Take the next unticked task in `docs/specs/tasks.md`, one at a time.
2. Read its linked requirements in `docs/specs/requirements.md` and the relevant part of `docs/specs/design.md`.
3. Make the smallest change that meets them; explain any AWS cost impact.
4. Run `npx tsc --noEmit` and the tests; tick the task.

## 9. Definition of done

- Type-check passes; new logic has unit tests.
- English and Thai strings added.
- The linked acceptance criteria are met.
- No new idle AWS cost; any new resource is tagged and its cost stated.
