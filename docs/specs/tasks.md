# Implementation plan: Medora

Every task serves a root cause from `docs/problem-and-solution.md` (RC1 readiness not shared, RC2 judged by distance only, RC3 guessing or phoning, RC4 language and specialists). Work top to bottom, one task at a time (in VS Code, run `/next-task`; in Claude Code, `/next-task`). Each task ends with passing `npm run typecheck`, `npm test` and `bash scripts/guard.sh`, English and Thai strings for any new text, and the linked acceptance criteria met.

**Priorities:** **P0** is needed for the demo, **P1** makes it strong for judging, **P2** is stretch. Build every P0 first across all milestones, then P1, then P2. That way a complete patient-and-doctor demo exists early.

Paths follow the npm workspaces layout in `AGENTS.md` section 6: `frontend/`, `backend/amplify/`, `shared/`.

## Milestone 0: Cost guardrails

- [ ] 0. Budget alarms and daily checks **P0**
  - Team lead runs `bash scripts/create-budget-alarms.sh <team emails>`; turn on Cost Anomaly Detection (`bash scripts/create-anomaly-detection.sh <team email>`).
  - Everyone runs `bash scripts/cost-check.sh` and `npm run sandbox:delete` at the end of each day.
  - _Requirements: 16.1, 16.3, 16.4_

## Milestone 1: Foundation

- [x] 1. Project skeleton with two app variants **P0** (all)
  - Folders from `AGENTS.md` section 6; route groups `frontend/app/(patient)` for Medora and `frontend/app/(hospital)` with `staff`, `doctor`, `admin` screens for Medora for Hospitals.
  - Expo app variants (`APP_VARIANT=patient|hospital`): name, icon, bundle ID and the screen group to include.
  - Brand theme (green #0B6E57, saffron #F2A33A, ink #0E2A23, Bai Jamjuree), light and dark.
  - _Requirements: 1.1, 1.6_

- [x] 2. English and Thai **P0** (RC4)
  - `frontend/src/i18n/en.json`, `th.json`, `t.ts`, a `Bi` type for stored bilingual text, language toggle.
  - _Requirements: 2.1, 2.2_

- [x] 3. Shared logic in `shared/logic/` with unit tests in `shared/tests/` **P0**
  - [x] 3.1 Types; load `shared/data/hospitals.json`, `pathways.json`, `red_flags.json`.
  - [x] 3.2 `redFlags.ts` with tests for every English and Thai phrase and the safe examples. (RC2)
  - [x] 3.3 `ranking.ts` (failures, score, evaluate), `timeBudget.ts` (window, too far, ask policy), `rules.ts` (auto-accept, reserved beds not free). (RC1, RC3)
  - _Requirements: 4.1, 5.2, 5.3, 11.2, 12.3, 19.3_

## Milestone 2: AWS backend and security baseline

- [ ] 4. Amplify Gen 2 with two user pools **P0**
  - [ ] 4.1 Amplify Gen 2 in `backend/amplify/` (already scaffolded); deploy only to us-east-1 (`npm run sandbox` sets `AWS_REGION=us-east-1`); tags `project=medora`, `stage`. If CDK bootstrapping is blocked by the account's permissions, ask the organizers to bootstrap us-east-1, or deploy the same resources with AWS SAM (roles named `medora-*`).
  - [ ] 4.2 Public pool (self sign-up, email) via `defineAuth`.
  - [ ] 4.3 Staff pool (invite only, TOTP MFA required, groups `hospital_staff`, `doctors`, `admins`, `custom:hospitalId`) added in `backend/amplify/backend.ts`; register both pools as AppSync sign-in providers. Fallback if it blocks progress: one pool with groups and MFA enforced in the hospital app's sign-in flow; split pools later.
  - [ ] 4.4 Sign-in screens for each app; route hospital users by group.
  - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.7, 22.3_

- [ ] 5. Data models and seed **P0**
  - [ ] 5.1 Models from `design.md` in `backend/amplify/data/resource.ts`: `Hospital`, `StatusItem`, `PublicDirectory`, `Specialist`, `ClinicSlot`, `CareRequest`, `Reservation`, `Message`, `Referral`, `AgentState`, `TraceStep`, `Transfer`, `Activity`, `Device`, `Metric`.
  - [ ] 5.2 Authorization rules: public data and own records for patients; own hospital for staff; settings for admins only.
  - [x] 5.3 `scripts/seed.mjs` from `shared/data/hospitals.json` (with item owner units); `scripts/reset-demo.mjs`; `scripts/create-test-users.mjs` for both pools, including unit accounts: Rama Nine ward nurse (`ward`) and radiology technologist (`radiology`); Chao Phraya NICU nurse (`nicu`) and emergency charge nurse (`er`).
    _Done as `scripts/seed.ts` (`npm run seed`): 8 synthetic hospitals from `shared/data/hospitals.json` into your own sandbox; running it again resets them (so no separate reset script). Staff accounts: `scripts/create-test-users.mjs <hospital id>`._
  - _Requirements: 18.3, 15.1, 17.1_

- [ ] 6. Security baseline **P1** (trust)
  - Per-function IAM with named Bedrock ARNs; CloudWatch Logs data protection policy on Lambda log groups; IDs-only logger; S3 Block Public Access and TLS-only bucket policies; Bedrock model invocation logging confirmed off.
  - _Requirements: 18.1, 18.2, 18.4, 18.5_

## Milestone 3: Live hospital readiness (RC1)

- [ ] 7. "My unit" screen for nurses and technologists **P0**
  - [ ] 7.1 Add `custom:unit` to the staff pool; seed each hospital's status items with an owner unit.
  - [ ] 7.2 `my-unit` screen: only items for the signed-in user's unit (ward ready beds; ICU or NICU cots; emergency open or diverting; CT and MRI; cath lab ready, busy with "free in about X minutes", or down; specialists on duty). Plus and minus buttons, switches, optional note; reserved beds shown separately.
  - [ ] 7.3 Each update stores value, owner, source and time; freshness labels everywhere; "Still correct?" button.
  - [ ] 7.4 Fallback: a general staff account per hospital can update every item.
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 19.1, 19.2, 19.8, 19.10_

- [x] 8. Reservations **P1**
  - Reserve a bed on acceptance; release by DynamoDB time-to-live after 2 hours or on cancel or decline; convert on arrival; contradiction check prompts.
  - _Requirements: 19.3, 19.4, 19.6_

- [ ] 9. Reminders **P1**
  - EventBridge Scheduler: shift-change and 30-minute reminders to owners (30 seconds in the demo stage); 2-hour admin alert and "status unclear".
  - _Requirements: 19.5, 19.9_

- [ ] 10. Admin settings **P2**
  - Profile, departments, equipment, bed totals, specialists and clinic hours (spreadsheet upload with checks), item owners, auto-accept rules, staff invitations, QR codes for equipment.
  - _Requirements: 11.1, 11.3, 19.1, 19.7_

## Milestone 4: People seeking care (RC2, RC3, RC4)

- [ ] 11. Home and location **P0** (RC2)
  - GPS with permission handling, place search (built-in Bangkok places plus Amazon Location), pick on map, Call 1669.
  - _Requirements: 3.1 to 3.6_

- [x] 12. Two-layer emergency check **P0** (RC2)
  - Layer 1 on the phone (offline) and layer 2 in the `safety-gate` Lambda; 1669 screen with the nearest open emergency department; logged.
  - _Requirements: 4.1 to 4.5_

- [x] 13. Find care **P0** (RC2)
  - `patient-understand` Lambda (Nova Lite, JSON output, keyword fallback); hospitals that can help now with simple labels; map; "skipped because" for closer hospitals; disclaimer.
  - _Requirements: 5.1 to 5.7_

- [x] 14. Request to hospital and messages **P0** (RC3)
  - Request form (name, phone, description, arrival mode); auto-accept with 60-second undo; 45-second no-reply; live status; cancel; message thread with quick replies stored as keys.
  - _Requirements: 6.1 to 6.6, 7.1 to 7.4, 2.4_

- [x] 15. Find a specialist **P1** (RC4)
  - Location row with "Use my location"; specialty suggested from the last search; language filter; nearest first, then soonest slot; map; instant booking with slot lock.
  - _Requirements: 8.1 to 8.6_

## Milestone 5: Hospital inbox and alerts (RC3)

- [x] 16. Inbox **P0**
  - Requests with patient details, accept, decline with reason, optional note, undo countdown, messages, bookings; alert banner with sound and vibration.
  - _Requirements: 10.2, 10.3, 10.5_

- [ ] 17. Push notifications **P1**
  - Firebase apps for both bundle IDs; SNS platform application; `register-push` and `notify` Lambdas on the request and message streams; 60-second escalation for unopened referrals.
  - _Requirements: 10.1, 10.4, 6.5, 7.2_

## Milestone 6: Doctor referrals with the AI agent (RC3)

- [x] 18. Enable Bedrock **P0**
  - _Done: one test call each to Nova Lite, Nova Pro and Titan V2 in us-east-1; `MODEL_ID_FAST`, `MODEL_ID_STRONG`, `GUARDRAIL_ID` set in `backend.ts`; Bedrock Guardrail `MedoraGuardrail` (no diagnosis or treatment advice on outputs, prompt-attack filter, phone and email masking) defined in code. `EMBEDDING_MODEL_ID` waits for the knowledge base (task 23)._
  - In us-east-1, confirm access to `amazon.nova-pro-v1:0`, `amazon.nova-lite-v1:0` and `amazon.titan-embed-text-v2:0` with one `converse` test call each (no Marketplace needed). Set `MODEL_ID_STRONG`, `MODEL_ID_FAST`, `EMBEDDING_MODEL_ID`; create a Guardrail (no diagnosis or treatment advice, personal data masked) in `GUARDRAIL_ID`.
  - _Requirements: 12.8, 18.6, 22.1, 22.2_

<<<<<<< HEAD
- [-] 19. Agent and tools, first version **P0**
  - _Done: `agent-runner` on Nova (greedy decoding, pathway enum), guardrail on the case input and on every update and reason it stores, `<thinking>` never stored; verified with a heart-attack referral (stemi, 2 hospitals asked in parallel, accepted by rule, recommended in 58 s). `ask_hospitals` now returns as soon as every request has replied (polls every 2 s, never past the policy wait; tested in `backend/tests/askHospitals.test.ts`). Left: a Thai referral run against the deployed sandbox._
=======
- [x] 19. Agent and tools, first version **P0**
  - _Done: `agent-runner` on Nova (greedy decoding, pathway enum), guardrail on the case input and on every update and reason it stores, `<thinking>` never stored; verified with a heart-attack referral (stemi, 2 hospitals asked in parallel, accepted by rule, recommended in 58 s). `ask_hospitals` returns as soon as every request has replied; Thai referral run verified (preterm, recommended in 18 s)._
>>>>>>> 38fa272389a910585d497b15309be3c249db8472
  - `agent-step` Lambda in `backend/amplify/functions/` (Nova Pro; Nova Lite while developing; the existing `agent-runner` is the starting point) with the Converse tool-use loop, greedy decoding on tool-calling turns, input validation that returns correctable errors, and tools `assess_case`, `rank_hospitals`, `ask_hospitals`, `recommend`, `report_no_placement`; in this first version the Lambda creates requests and waits for replies itself. Trace steps, timing, rule-based backup.
  - Replies in the doctor's language; at most 8 turns, a token cap per call and a daily run limit per user.
  - _Requirements: 12.1 to 12.7, 12.9, 12.10, 2.3, 16.2, 22.4_

<<<<<<< HEAD
- [x] 20. Doctor screens **P0**
  - _Done in code: tap-to-fill sample cases (stroke, heart attack, premature baby), scrolling `Screen` shell. Not yet run against a deployed sandbox._
=======
- [-] 20. Doctor screens **P0**
>>>>>>> 38fa272389a910585d497b15309be3c249db8472
  - Description with samples, onset minutes, live trace, map with asked, declined and chosen hospitals, decision table, recommendation with reasons, confirm or set aside, simulated transfer tracking.
  - _Requirements: 13.1 to 13.4, 17.3_
  - Done: sample cases, live trace with elapsed time, decision table saved by the agent (`shared/logic/decisionTable.ts`), recommendation with reasons and time to recommendation, confirm (creates the transfer) or set aside with a reason, simulated transfer tracking. Left: the map, and one bed fewer on arrival (13.4).

- [x] 21. Demo replies **P0**
  - Optional switch: hospitals without an auto-accept rule reply after 8 seconds with preset notes (Rama Nine for stroke: neurologist free in about 40 minutes).
  - _Requirements: 17.2_
  - `shared/logic/demoReplies.ts`; `DEMO_REPLIES` on `agent-runner` (on by default, `MEDORA_DEMO_REPLIES=false` switches it off); only seeded demo hospitals reply. The agent also stops waiting once every asked hospital has replied (stroke sample: 21 s).

- [ ] 22. Move the referral to Step Functions Standard **P1**
  - States from `design.md`: `AgentStep`, `AskHospitals` (Map with task tokens and timeouts), `WaitForDoctor`, `StartTransfer`, `BackupPath`; conversation state in `AgentState`; replies and the doctor's decision return task tokens.
  - _Requirements: 21.1 to 21.6_

## Milestone 7: Knowledge base (RAG) (RC3)

- [-] 23. Knowledge base **P1**
  - _Done in code: 25 bilingual documents with Bedrock metadata in `shared/data/kb/` (`npm run kb`, checked by tests); an opt-in stack in `backend.ts` (`MEDORA_ENABLE_KB=true`): private S3 bucket (Block Public Access, TLS only), S3 Vectors bucket and index (1024, cosine, float32), knowledge base with Titan V2 and no chunking, a role scoped to those, `KB_ID` and `bedrock:Retrieve` on that one knowledge base for the agent; `npm run upload-kb` uploads and runs ingestion. Left: deploy with the flag, run `npm run upload-kb`, and test Thai and mixed Thai-English retrieval (nothing here has run against AWS yet)._
  - Upload `shared/data/kb/` to a private bucket in us-east-1; knowledge base with Titan Text Embeddings V2, no chunking, S3 Vectors; test retrieval with Thai and mixed Thai-English questions; `search_knowledge_base` tool; sources shown in the trace.
  - _Requirements: 14.1, 14.2, 14.3, 22.5_

## Milestone 8: Metrics and evidence (all)

- [x] 24. Success metrics **P1**
  - Record the requirement 20 measures; a small summary screen in the hospital app's activity tab for the demo stage.
  - Activity log screen, newest first, for staff and doctors.
  - _Requirements: 20.1 to 20.4, 15.2_

- [ ] 25. Agent evaluations **P1**
  - Stroke (with and without the 40-minute note), heart attack, preterm, child; 10 runs each on Nova Lite, then 10 on Nova Pro, in English and Thai. Pass: capable accepted hospital, window respected, sources cited, never approves, prompt-injection note ignored. Record in `docs/evals.md`.
  - _Requirements: 12.5, 12.10_

- [x] 26. Security tests **P1**
  - A patient account can't read operational data; a staff account can't write another hospital's status; staff sign-in requires MFA.
  - _Requirements: 1.4, 1.6, 18.3_

## Milestone 9: Demo

- [ ] 27. Demo stage and builds **P0**
  - Amplify `demo` branch with the stronger model; both app builds installed on demo phones; each role signed in; reset data.
  - _Requirements: 17.1_

- [ ] 28. Judging evidence **P0**
  - Problem slide with one quote from a clinician and one from a person who looked for a hospital; before-after chart for both sides from requirement 20; cost slide from Cost Explorer; three-minute script and backup video.
  - _Requirements: 20.4, 16.1_
