# Medora

**The right hospital, right now.** A bilingual (English and Thai) mobile app on AWS that routes patients to the closest hospital that can treat them now, with an AI referral agent on Amazon Bedrock and a doctor confirming every transfer. Built for the NTT DATA Digital Innovation Challenge 2026. Synthetic data only; not for medical use. In an emergency in Thailand, call 1669.

## What's in this starter (for VS Code)

The plan, the agent rules and the data, not the app code: you build it in VS Code with an AI agent (GitHub Copilot agent mode or Claude Code) by working through the tasks.

```text
AGENTS.md                               the full rules for every AI agent (safety, cost strategy, conventions)
CLAUDE.md                               Claude Code entry point (imports AGENTS.md)
.github/copilot-instructions.md         GitHub Copilot entry point
.github/instructions/
  aws-cost.instructions.md              cost rules, applied to amplify/ and scripts/
  safety.instructions.md                safety rules, applied to app/, src/ and agent functions
  i18n-ui.instructions.md               strings and UI rules, applied to screens and components
.github/prompts/
  next-task.prompt.md                   /next-task: implement the next task from the spec
  cost-check.prompt.md                  /cost-check: audit code and account against the cost strategy
  safety-review.prompt.md               /safety-review: check changes against the safety rules
.github/workflows/guardrails.yml       runs the cost and safety checks on every pull request
.github/pull_request_template.md        cost and safety checklist for every pull request
.github/CODEOWNERS                      team lead approves changes to AWS code and the rules
.vscode/                                recommended extensions and settings
scripts/
  guard.sh                              blocks cost anti-patterns and safety violations (local and in CI)
  create-budget-alarms.sh               team alarms below the $350 cap
  cost-check.sh                         read-only list of idle or orphaned AWS resources
docs/specs/                             requirements.md, design.md, tasks.md (26 tasks)
docs/demo-script.md                     the three-minute demo
docs/github-setup.md                    push to GitHub and protect the main branch
data/                                   10 synthetic hospitals, pathways, emergency phrases, 32 knowledge base documents
```

## Cost-efficient architecture strategy (summary)

| Do | Avoid |
| --- | --- |
| Serverless first: Lambda, S3, DynamoDB on-demand, AppSync, Bedrock | Overnight idle EC2 or RDS instances (Medora uses none) |
| Minimal sizing; scale up only on a measured bottleneck | GPU or large ML instances (all AI runs on Bedrock) |
| Shut down resources: delete sandboxes daily, run `cost-check.sh` | NAT gateways, VPC Lambdas, Multi-AZ, Elastic IPs |
| Team alarms below $350: $100, $200, $280, $320, forecast $350 | Orphaned EBS volumes, snapshots, load balancers, unused knowledge bases |

Details and the rules agents follow are in `AGENTS.md` section 5.

## How to start

1. **Create the app:** `npx create-expo-app@latest medora`
2. **Copy this starter into it:** put every file and folder from this package (including the hidden `.github/`, `.vscode/` and `.gitignore`) into the `medora` folder; merge `.gitignore` if one exists.
3. **Open the folder in VS Code** and install the recommended extensions when prompted (AWS Toolkit, Expo Tools, ESLint, Prettier, and your AI agent: GitHub Copilot Chat or Claude Code).
4. **Set the cost guardrails first:** sign in with `aws configure sso`, then the team lead runs `bash scripts/create-budget-alarms.sh <team emails>`.
5. **Build task by task:** in Copilot Chat (agent mode), run `/next-task`; in Claude Code, ask it to do the next task in `docs/specs/tasks.md`. Review every change before accepting it, especially safety rules and anything that creates AWS resources.
6. **End of every day:** `bash scripts/cost-check.sh` and `npx ampx sandbox delete`.

## Before the demo

- Thai text, emergency phrases and treatment windows reviewed by a Thai-speaking clinician.
- Agent evaluations recorded in `docs/evals.md`.
- Cost Explorer screenshot against the $350 budget.
