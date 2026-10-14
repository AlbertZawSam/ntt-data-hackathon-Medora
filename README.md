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
│   │   ├── services/                 # the only layer that talks to AWS: auth (data, location, push, agent later)
│   │   ├── state/                    # AppProvider: language, session, live data snapshot
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
│       ├── data/                     # (next) models: HospitalStatus, CareRequest, Message, Referral, ...
│       └── functions/                # (later) agent-runner, patient-understand, hospital-onboard, notify, register-push
│
├── shared/                           # @medora/shared: pure TypeScript used by the app and Lambda
│   ├── logic/                        # redFlags, ranking, timeBudget, rules, session, types
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
