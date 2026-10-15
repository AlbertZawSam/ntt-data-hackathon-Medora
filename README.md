# Medora

**The right hospital, right now.** A bilingual (English and Thai) mobile app on AWS that sends patients to the nearest hospital that can treat them right now. Doctors place patients through an AI referral agent on Amazon Bedrock and confirm every transfer themselves. Built for the NTT DATA Digital Innovation Challenge 2026.

> [!WARNING]
> Live, real-time data only: every hospital, staff member, doctor and patient signs up in the app during the demo and enters made-up data, and changes reach every phone within 2 seconds. The backend starts empty; nothing is pre-seeded. Not for medical use. In an emergency in Thailand, call **1669**.

## Tech stack

| Layer | Technology |
| --- | --- |
| App | Expo (React Native), TypeScript, Expo Router |
| Backend | AWS Amplify Gen 2: Cognito, AppSync, DynamoDB, Lambda (Node.js) |
| AI | Amazon Bedrock (Claude, Converse API with tool use), Guardrails, Knowledge Bases on S3 Vectors |
| Maps | Amazon Location Service |
| Notifications | Amazon SNS (FCM, APNs) |

## Project structure

An npm workspaces monorepo with three packages. Install once and run every command from the root.

```text
medora/
├── package.json                      # workspaces + root scripts: start, web, sandbox, test, typecheck
│
├── frontend/                         # @medora/frontend: the Expo app (one app, role-based screens)
│   ├── app/                          # Expo Router screens
│   │   ├── _layout.tsx               # providers, auth gate, role routing
│   │   ├── sign-in.tsx               # email/password sign-in, reads Cognito groups
│   │   ├── sign-up.tsx               # sign-up with role choice and email verification
│   │   ├── (admin)/                  # hospital setup, staff invites, specialists
│   │   ├── (patient)/                # home, care, specialists, requests
│   │   ├── (staff)/                  # status board, inbox, auto-accept rules
│   │   └── (doctor)/                 # pending approval, AI referral, transfers
│   ├── src/
│   │   ├── i18n/                     # en.json, th.json, t.ts
│   │   ├── services/                 # the only AWS layer: Amplify, auth, live AppSync data
│   │   ├── state/                    # AppProvider: language, session, useSyncExternalStore data snapshot
│   │   ├── components/               # LanguageToggle, ScreenStub (more arrive with each screen)
│   │   └── ui/                       # theme, Button, Field, FormScreen
│   ├── assets/                       # icon, splash
│   ├── tests/                        # app tests (i18n)
│   └── app.json, metro.config.js, babel.config.js, tsconfig.json
│
├── backend/                          # @medora/backend: AWS Amplify Gen 2
│   └── amplify/
│       ├── backend.ts                # stack wiring, cost tags, app-client limits
│       ├── auth/                     # Cognito groups + post-confirmation trigger
│       ├── data/resource.ts          # AppSync models and hospital/owner-scoped authorization
│       └── functions/
│           └── agent-runner/         # bounded Bedrock referral coordinator + fixed-rule backup
│
├── shared/                           # @medora/shared: pure TypeScript used by the app and Lambda
│   ├── logic/                        # redFlags, ranking, timeBudget, rules, referral, session, types
│   ├── data/                         # pathways.json, red_flags.json (rules)
│   └── tests/                        # unit and property tests for logic/
│
├── scripts/                          # guard.sh, cost-check.sh, create-budget-alarms.sh
├── docs/specs/                       # requirements.md, design.md, tasks.md
├── .github/                          # CI, Copilot instructions and prompts, CODEOWNERS
├── AGENTS.md                         # rules for AI coding agents
└── CLAUDE.md
```

Shared code is imported by package name, e.g. `import { redFlag } from '@medora/shared/logic/redFlags'`.

## Current architecture

The implemented path is deliberately live-data only:

- Amplify Data defines `HospitalProfile`, `HospitalStatus`, `Specialist`, `CareRequest`, `Message`, `Referral`, `TraceStep`, `Transfer`, `Activity`, and `Device`. Hospital-scoped rows compare `hospitalId` with the signed-in user's protected `custom:hospitalId` claim; patient-owned rows compare `ownerId` with `sub`.
- `frontend/src/services/data.ts` opens AppSync `observeQuery` subscriptions for every model a role may read. `AppProvider` exposes their one immutable snapshot through `useSyncExternalStore`. Empty records stay empty; no demo hospitals, replies, or fallback records are created.
- A doctor creates a `Referral` and calls the asynchronous `startReferral` mutation. The app observes `Referral` and `TraceStep` rows for its live trace and recommendation.
- `agent-runner` gives Bedrock only six tools: `assess_case`, `search_knowledge_base`, `ask_hospitals`, `check_replies`, `recommend`, and `report_no_placement`. Fixed shared rules calculate eligibility, treatment windows, and auto-acceptance. The agent cannot approve a transfer, classify emergencies, or change hospital status.
- The coordinator has an eight-model-turn cap, a 120-second model-work budget, and an eight-run daily cap per doctor. It uses a labelled fixed-rule backup when Bedrock is unavailable or cannot produce a valid recommendation.

The remaining role screens, onboarding functions, patient-understanding Lambda, knowledge-base ingestion, notifications, and transfer confirmation are tracked as unticked tasks in `docs/specs/tasks.md`; they are not represented as working features yet.

### Enable the Bedrock path before deploying

The referral handler is compiled and defaults to the safe rule-based path until a team lead configures the environment and IAM. Set `MODEL_ID_FAST`; set `MODEL_ID_STRONG` for `prod`; optionally set `GUARDRAIL_ID`, `GUARDRAIL_VERSION`, `KB_ID`, and `ROUTE_CALCULATOR_NAME`. The team lead must grant the Lambda only `bedrock:InvokeModel`, `bedrock:Retrieve`, and `geo:CalculateRouteMatrix` for the configured resources. This repository deliberately does not make IAM-policy changes from an agent.

There is no idle cost from Lambda, on-demand DynamoDB, AppSync, Bedrock, or Amazon Location. Lambda/DynamoDB/AppSync are charged by execution, requests, and storage; Bedrock by tokens and Knowledge Base/Location by their retrieval or route use. Configure the existing budget alarms before a deployment.

## Getting started

```bash
git clone https://github.com/AlbertZawSam/ntt-data-hackathon-Medora.git
cd ntt-data-hackathon-Medora
npm install          # installs all three packages
npm run sandbox      # deploy a personal backend; writes frontend/amplify_outputs.json
npm start            # run the app (press w for web, a for Android, i for iOS)
```

Without AWS access, `npm start` still works: the app opens and says it isn't connected to a backend yet.

The backend starts empty. In the app, sign up as a hospital admin and register a hospital, invite staff from the Team screen, sign up as a doctor and approve them from that hospital's admin account, then sign up as a patient. Deleting a sandbox deletes everything entered in it.

| Task | Command |
| --- | --- |
| Type-check all packages | `npm run typecheck` |
| Unit tests, all packages | `npm test` |
| Tests for one package | `npm test -w @medora/shared` |
| Add a dependency | `npm install <pkg> -w @medora/frontend` (Expo native modules: `cd frontend && npx expo install <pkg>`) |
| Cost and safety checks | `bash scripts/guard.sh` |
| End of every day | `bash scripts/cost-check.sh && npm run sandbox:delete` |

Never commit `amplify_outputs.json`, `.env`, `google-services.json` or AWS keys.

## License

[MIT](LICENSE)
