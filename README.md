# Medora

**The right hospital, right now.** A bilingual (English and Thai) mobile app on AWS that sends patients to the nearest hospital that can treat them right now. Doctors place patients through an AI referral agent on Amazon Bedrock and confirm every transfer themselves. Built for the NTT DATA Digital Innovation Challenge 2026.

> [!WARNING]
> Synthetic data only; not for medical use. In an emergency in Thailand, call **1669**.

## Tech stack

| Layer | Technology |
| --- | --- |
| App | Expo (React Native), TypeScript, Expo Router |
| Backend | AWS Amplify Gen 2: Cognito, AppSync, DynamoDB, Lambda (Node.js) |
| AI | Amazon Bedrock (Claude, Converse API with tool use), Guardrails, Knowledge Bases on S3 Vectors |
| Maps | Amazon Location Service |
| Notifications | Amazon SNS (FCM, APNs) |

## Project structure

```text
medora/
├── app/                              # Expo Router screens (one app, role-based)
│   ├── _layout.tsx                   # providers, auth gate, role routing
│   ├── sign-in.tsx                   # email/password sign-in, reads Cognito groups
│   ├── (patient)/
│   │   ├── home.tsx                  # location, Call 1669, quick actions
│   │   ├── care.tsx                  # red-flag check, ranked hospitals, map, request form
│   │   ├── specialists.tsx           # specialist search and booking
│   │   └── requests.tsx              # my requests, status, messages
│   ├── (staff)/
│   │   ├── capacity.tsx              # beds, departments, equipment, on-call doctors
│   │   ├── inbox.tsx                 # incoming requests: accept, decline, undo, messages
│   │   └── rules.tsx                 # auto-accept rules (admins)
│   └── (doctor)/
│       ├── refer.tsx                 # AI referral: live agent trace, map, confirm transfer
│       └── transfers.tsx             # simulated ambulance tracking
│
├── src/
│   ├── logic/                        # pure TypeScript, shared with Lambda (no React Native)
│   │   ├── types.ts
│   │   ├── redFlags.ts               # offline emergency phrase check (EN/TH)
│   │   ├── ranking.ts                # drive estimate, failsFor, score, evaluate
│   │   ├── timeBudget.ts             # remaining treatment window, ask policy
│   │   └── rules.ts                  # auto-accept rules
│   ├── i18n/
│   │   ├── en.json
│   │   ├── th.json
│   │   └── t.ts                      # t(key, params), Bi type
│   ├── services/                     # the only layer that talks to AWS
│   │   ├── auth.ts
│   │   ├── data.ts                   # AppSync client and live subscriptions
│   │   ├── location.ts               # GPS, place search
│   │   ├── push.ts
│   │   └── agent.ts
│   ├── state/
│   │   └── AppProvider.tsx           # language, session, live data snapshot
│   ├── components/
│   │   ├── MapView.tsx
│   │   ├── AgentTrace.tsx
│   │   ├── EmergencyCard.tsx
│   │   ├── HospitalCard.tsx
│   │   ├── MessageThread.tsx
│   │   ├── RequestAlert.tsx
│   │   ├── TrustBadge.tsx
│   │   └── LanguageToggle.tsx
│   └── ui/
│       └── theme.ts
│
├── amplify/                          # AWS backend (Amplify Gen 2)
│   ├── backend.ts                    # stack wiring and cost tags
│   ├── auth/resource.ts              # Cognito groups: patients, hospital_staff, doctors, admins
│   ├── data/resource.ts              # models: HospitalStatus, CareRequest, Message, Referral, ...
│   └── functions/
│       ├── agent-runner/             # Bedrock tool-use loop for the referral agent
│       │   ├── resource.ts
│       │   ├── handler.ts
│       │   ├── tools.ts
│       │   └── prompt.ts
│       ├── patient-understand/       # classifies the patient's need with the fast model
│       ├── notify/                   # DynamoDB stream to push notifications
│       └── register-push/            # registers device tokens with SNS
│
├── data/                             # synthetic data
│   ├── hospitals.json                # 10 Bangkok hospitals (H01–H10)
│   ├── pathways.json                 # stroke, STEMI, preterm, pediatrics, ...
│   ├── red_flags.json                # emergency phrases in English and Thai
│   └── kb/H01 … H10/*.md             # 32 department documents for the knowledge base
│
├── scripts/
│   ├── guard.sh                      # cost and safety checks (local and CI)
│   ├── cost-check.sh                 # lists idle or orphaned AWS resources
│   ├── create-budget-alarms.sh       # budget alarms below the $350 cap
│   ├── create-test-users.mjs
│   ├── seed.mjs
│   ├── reset-demo.mjs
│   └── upload-kb.mjs
│
├── tests/
│   ├── unit/
│   ├── agent-evals/
│   └── safety/
│
├── docs/
│   ├── specs/
│   │   ├── requirements.md
│   │   ├── design.md
│   │   └── tasks.md
│   ├── demo-script.md
│   └── github-setup.md
│
├── .github/
│   ├── workflows/guardrails.yml      # cost, safety, type-check and tests on every PR
│   ├── instructions/                 # Copilot rules per file area
│   ├── prompts/                      # /next-task, /cost-check, /safety-review
│   ├── copilot-instructions.md
│   ├── pull_request_template.md
│   └── CODEOWNERS
│
├── AGENTS.md                         # rules for AI coding agents
├── CLAUDE.md
└── README.md
```

## Getting started

```bash
git clone https://github.com/AlbertZawSam/ntt-data-hackathon-Medora.git
cd ntt-data-hackathon-Medora
npm install
npx ampx sandbox --outputs-out-dir .   # deploy a personal backend
npx expo start                         # run the app
```

| Task | Command |
| --- | --- |
| Type-check | `npx tsc --noEmit` |
| Unit tests | `npm test` |
| Cost and safety checks | `bash scripts/guard.sh` |
| End of every day | `bash scripts/cost-check.sh && npx ampx sandbox delete` |

Never commit `amplify_outputs.json`, `.env`, `google-services.json` or AWS keys.

## License

[MIT](LICENSE)
