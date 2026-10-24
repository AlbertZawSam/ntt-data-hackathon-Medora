# Design: Medora

## Overview

Medora matches every patient to the closest hospital that can treat their health problem right now (see `docs/problem-and-solution.md`). Two apps from one Expo codebase share one serverless AWS backend:

- **Medora** (people seeking care): location, emergency check, find care, request to hospital, messages, find a specialist.
- **Medora for Hospitals** (staff, admins, doctors): live readiness status, inbox and alerts, settings and auto-accept rules, doctor referrals with the AI agent.

Fixed rules handle emergencies, filtering and auto-acceptance; Amazon Nova on Bedrock understands patient descriptions (Nova Lite) and coordinates referrals (Nova Pro); people make the final decisions. Diagrams of every flow are in `docs/architecture.md`.

Code layout (npm workspaces): `frontend/` holds the Expo app, `backend/amplify/` the Amplify Gen 2 backend, `shared/` the pure logic, rules data and their tests.

## Root causes to components

| Root cause | Components |
| --- | --- |
| RC1 readiness not shared | Status board with item owners, reservations, reminders, freshness labels (hospital app); `StatusItem`, `Reservation` models; EventBridge Scheduler |
| RC2 judged by distance only | Two-layer safety gate; patient-understanding Lambda (Nova Lite); ranking that skips hospitals that can't help (patient app) |
| RC3 guessing or phoning | Patient requests and messages; inbox and alerts; referral agent on Step Functions; doctor confirmation |
| RC4 language and specialists | English and Thai throughout; specialist search by location and language; slot booking |

## Components

### Patient app (Medora), `frontend/app/(patient)/`

| Screen | Responsibility |
| --- | --- |
| `home` | Location (GPS, place search, pick on map), Call 1669, Find care, Find a specialist |
| `care` | Description, safety gate 1, need understanding, hospitals that can help now with map and "skipped because" explanations, request form |
| `specialists` | Nearest-first specialists by specialty and language; booking |
| `requests` | Live status of requests and bookings; messages; cancel |

### Hospital app (Medora for Hospitals), `frontend/app/(hospital)/`

| Screen | Who | Responsibility |
| --- | --- | --- |
| `my-unit` | Staff (nurses, technologists) | Only their unit's items from `custom:unit`: ward ready beds; ICU or NICU cots; emergency open or diverting; CT and MRI; cath lab ready, busy (with "free in about X minutes") or down; specialists on duty. Plus and minus buttons, switches, optional note, "Still correct?". Reserved beds shown separately |
| `inbox` | Staff | Requests with patient details, accept, decline with reason and note, undo, messages, bookings; alert banner |
| `settings` | Admins | Profile, departments, equipment, bed totals, specialists and clinic hours, item owners, auto-accept rules, staff invitations |
| `refer` | Doctors | Description and onset time, live agent trace, map, decision table, recommendation, confirm or set aside |
| `transfers`, `activity` | Doctors, staff | Transfer tracking; audit log |

### Shared code

`shared/logic/` (red flags, pathways, ranking, time budget, rules; also imported by Lambda), `frontend/src/i18n/`, `frontend/src/services/`, `frontend/src/components/`. Two build variants select the screen groups and the Cognito pool.

### Backend (`backend/amplify/`)

| Resource | Responsibility |
| --- | --- |
| Cognito public pool | Patients: self sign-up, email |
| Cognito staff pool | Invite only; TOTP MFA required; groups `hospital_staff`, `doctors`, `admins`; attributes `custom:hospitalId` and `custom:unit` (`ward`, `icu`, `nicu`, `er`, `radiology`, `cathlab`, or a department `cardiology`, `surgery`, `obstetrics` that answers requests sent to it) |
| AppSync | One API with both pools as sign-in providers; per-model rules (public vs operational data) |
| `safety-gate` Lambda | Second red-flag check on every patient description |
| `patient-understand` Lambda | Nova Lite returns the type of care and a short summary in English and Thai (JSON) |
| `referral` Step Functions (Standard) | Agent steps, parallel hospital requests with task tokens, doctor confirmation, transfer, backup path |
| `agent-step` Lambda | One or more Bedrock Converse turns until the model asks hospitals, recommends or stops; saves conversation state |
| `tools` Lambdas | `assess_case`, `search_knowledge_base`, `rank_hospitals`, `create_requests`, `record_reply` |
| `notify` Lambda | DynamoDB Streams → SNS push to on-duty staff or the patient; escalation after 60 seconds |
| `status-reminder` schedule | EventBridge Scheduler: shift-change and 30-minute reminders; 2-hour admin alert |
| `invite-staff` Lambda | Creates staff pool users with group and hospital |

## Data models

| Model | Key fields | Access |
| --- | --- | --- |
| `Hospital` | id, names (EN, TH), location, departments, equipment list, bed totals, contacts | Public read (labels only) |
| `StatusItem` | hospitalId, itemType (beds by type, ICU, NICU, ED, CT, MRI, cath lab, specialist role), value, ownerRole, source, updatedAt, note | Owners write their items; patients see derived labels |
| `PublicDirectory` | hospitalId, labels per care type, freshness | Public read; derived from `StatusItem` |
| `Specialist`, `ClinicSlot` | hospitalId, specialty, languages, namePublic, weekly hours → slots, booked by | Public read; admins write |
| `CareRequest` | type (visit, referral, booking), hospitalId, ownerId, need, patient details, status, reason, note, auto, overrideUntil, taskToken, timestamps | Owner and that hospital |
| `Reservation` | hospitalId, bedType, requestId, expiresAt (TTL) | System |
| `Message` | requestId, from, quick-reply key or text, time | The two sides of the request |
| `Referral` | doctor, hospital, text, onsetMin, pathway, status, mode (ai or rules), chosenId, why (EN, TH), timestamps | Doctor's hospital |
| `AgentState` | referralId, conversation messages, rounds, turns | System only |
| `TraceStep`, `Transfer`, `Activity`, `Device`, `Metric` | As named | Hospital app; `Metric` for requirement 20 |

## Shared logic

Pathways, treatment windows and scoring weights live in `shared/data/pathways.json`. Score = drive + wait × 0.2 + 10 if data is over 30 minutes old + 12 if unclear + 3 if a needed bed is the last one − 3 if the preferred department is open. A hospital fails "too far" when drive time plus preparation time exceeds the remaining window. Auto-accept: rule on for the pathway, no failures, free beds at or above the rule's minimum (patient visits: rule on and emergency department open). Reserved beds count as not free.

## Agent design

**Models:** Amazon Nova Pro (`MODEL_ID_STRONG`) for the coordinator, Nova Lite (`MODEL_ID_FAST`) for patient understanding and development tests, both through the Bedrock Converse API with `toolConfig`, direct in-region model IDs in us-east-1, greedy decoding for tool-calling turns, Guardrails on every call. Knowledge base embeddings: Titan Text Embeddings V2 (`EMBEDDING_MODEL_ID`). No third-party models (Marketplace is blocked in our account).

**Tools:** `assess_case` (pathway and time budget), `search_knowledge_base` (RAG with sources), `rank_hospitals` (filters and score; results return to the agent), `ask_hospitals` (handed to Step Functions), `recommend` (accepted hospitals only; withdraws others), `report_no_placement`. No tool approves transfers, decides emergencies or edits status.

**Step Functions states:** `AgentStep` → choice on the model's request → `AskHospitals` (Map, `waitForTaskToken`, timeout by urgency: 30 to 60 seconds) → back to `AgentStep` with replies → `WaitForDoctor` (`waitForTaskToken`, 30 minutes) → `StartTransfer` → done. Limits: 8 model turns, 2 rounds of asking, 10 minutes; on any limit or Bedrock failure, `BackupPath` runs the rule-based steps.

**Prompt rules:** descriptions, staff notes and messages go in delimited data blocks and are described as information, not instructions; the model may use only tool results; reasons name skipped closer hospitals; final words in the doctor's language.

## Error handling

| Situation | Behavior |
| --- | --- |
| Bedrock unavailable, slow, over limits, or a malformed tool call from the model | Backup path; trace labeled "Rule-based backup" |
| Hospital doesn't reply | Task token times out; marked "no reply"; agent moves on |
| Doctor doesn't confirm in 30 minutes | Referral expires; requests withdrawn; reservations released |
| Status out of date | Lower rank, "may be outdated" label; the hospital's accept is still required |
| Phone offline | Safety gate 1 and the 1669 screen still work |
| Budget action at 90% | Model calls fail fast; backup path keeps the demo running |

## Security

Two Cognito pools (TOTP MFA required for staff); AWS-managed KMS encryption; TLS only; one least-privilege role per Lambda with named Bedrock ARNs; AppSync rules separating public and operational data; CloudTrail and the activity log; CloudWatch Logs data protection policy and IDs-only logging; Bedrock model invocation logging off; S3 Block Public Access; WAF rate limit in demo week only.

## Testing

- **Unit (`shared/tests/`):** red flags (every English and Thai phrase; safe phrases don't match), ranking, time budget, rules, reservations.
- **Agent evaluations:** stroke with and without the 40-minute note, heart attack, preterm, child admission; 10 runs each; pass criteria in `tasks.md`.
- **End to end:** patient phone and hospital phone in English and Thai; doctor referral on a third device; offline emergency check.
- **Security:** a patient account cannot read operational data; a staff account cannot write another hospital's status; a prompt-injection note doesn't change the agent's choice.

## Cost

All serverless; Bedrock is the main cost, lower with Nova (well under a few US cents per referral); Step Functions Standard costs fractions of a cent per referral; idle cost near zero. Rules in `AGENTS.md` section 5.
