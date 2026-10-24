# Requirements: Medora MVP

## Introduction

Medora matches every patient to the closest hospital that can actually treat their health problem right now. People seeking care describe their problem and get the right hospital or specialist; doctors get an AI agent that finds and confirms a place for their patient; both use live readiness shared by hospitals. The problem statement, root causes (RC1 to RC4) and success metrics are in `docs/problem-and-solution.md`; each requirement below names the root cause it serves.

This spec covers the build for the NTT DATA Digital Innovation Challenge 2026: two apps from one codebase, **Medora** (people seeking care) and **Medora for Hospitals** (hospital staff, admins and doctors), on a serverless AWS backend under a $350 budget, with synthetic data for 10 hospitals.

Acceptance criteria use EARS notation (WHEN / WHILE / IF / WHERE ... THE SYSTEM SHALL ...). "The patient app" is Medora; "the hospital app" is Medora for Hospitals; "the agent" is the referral coordinator running on Amazon Bedrock.

## Requirement 1: Two apps and sign-in (all root causes)

**User story:** As a person seeking care, I want a simple public app; as hospital staff or a doctor, I want a work app that only my colleagues can use, so that each of us gets the right tools and hospital data stays protected.

1. THE SYSTEM SHALL provide two apps built from one codebase: Medora for people seeking care, and Medora for Hospitals for hospital staff, admins and doctors.
2. WHEN a person signs up in the patient app THE SYSTEM SHALL create the account in the public Amazon Cognito user pool with email sign-in.
3. THE SYSTEM SHALL create hospital app accounts only by invitation from a hospital admin, in a separate staff user pool, with groups `hospital_staff`, `doctors` and `admins` and the attribute `custom:hospitalId`.
4. WHEN a hospital app user signs in THE SYSTEM SHALL require an authenticator-app code (TOTP multi-factor authentication) and SHALL NOT offer SMS codes.
5. WHEN sign-in succeeds in the hospital app THE SYSTEM SHALL show doctors the referral screens, staff the status and inbox screens, and admins the settings screens, scoped to their own hospital.
6. THE patient app SHALL contain no hospital operations screens, and its accounts SHALL NOT be able to read hospital operational data.
7. IF sign-in fails THEN THE SYSTEM SHALL show a message in the user's language without revealing whether the email exists.

## Requirement 2: English and Thai (RC4)

**User story:** As a Thai or English speaker, I want the whole app in my language, so that I can use it under stress.

1. THE SYSTEM SHALL provide every user-facing string in English and Thai from `frontend/src/i18n/en.json` and `frontend/src/i18n/th.json`.
2. WHEN the user taps the language toggle THE SYSTEM SHALL switch all screens immediately and remember the choice on the device.
3. WHEN the agent or patient assistant replies THE SYSTEM SHALL reply in the language of the user who started the request.
4. WHEN a quick-reply message is shown THE SYSTEM SHALL display it in the reader's own language.

## Requirement 3: Patient location (RC2)

**User story:** As a patient, I want Medora to know where I am, so that it can find hospitals near me.

1. WHEN the patient taps "Use my location" THE SYSTEM SHALL request foreground location permission and use the device position.
2. WHEN the patient types a place name in English or Thai THE SYSTEM SHALL suggest matching places from built-in Bangkok places and Amazon Location place search.
3. WHEN the patient taps the map in pick mode THE SYSTEM SHALL set that point as their location.
4. IF permission is denied or the position is unavailable THEN THE SYSTEM SHALL explain this and offer place search.
5. IF the position is outside the Bangkok demo area THEN THE SYSTEM SHALL use Siam as the location and say so.
6. THE SYSTEM SHALL keep the patient's location on the device and not store it in the backend except as part of a request they send.

## Requirement 4: Emergency safety check (RC2)

**User story:** As a patient with a possible emergency, I want to be told to call 1669 immediately, so that I don't lose time in an app.

1. WHEN a patient submits a description THE SYSTEM SHALL check it against the English and Thai red-flag phrases in `shared/data/red_flags.json` before any AI call.
2. WHEN a red flag matches THE SYSTEM SHALL show the emergency screen with a "Call 1669" button and the nearest hospital with an open emergency department, and SHALL NOT call any AI model.
3. WHILE the device is offline THE SYSTEM SHALL still perform the red-flag check and show the emergency screen.
4. WHEN the check runs THE SYSTEM SHALL write the result to the activity log.
5. WHEN a description reaches the backend THE SYSTEM SHALL run the same red-flag rules again in a Lambda function before any model call (second safety gate).

## Requirement 5: Find care now (RC2)

**User story:** As a patient, I want to describe what's wrong and see hospitals that can help me now, so that I don't go somewhere that has to send me away.

1. WHEN no red flag matches THE SYSTEM SHALL classify the need (maternity, child, injury or general) using Amazon Nova Lite, falling back to keyword rules if the model is unavailable.
2. WHEN the need is known THE SYSTEM SHALL exclude hospitals whose required department is closed or diverting, whose required doctor is off duty, whose required equipment is down, or that have no free bed when one is required.
3. WHEN ranking hospitals THE SYSTEM SHALL order them by drive time plus wait × 0.2, adding 10 if the hospital's data is over 30 minutes old and 12 if its data is marked unclear.
4. WHEN results are shown THE SYSTEM SHALL show a map with the patient, the hospitals that can help, the crossed-out ones that can't, and the route to the best one.
5. WHERE the nearest hospital cannot help THE SYSTEM SHALL explain that it was skipped and why, in simple terms.
6. THE SYSTEM SHALL show public users only simple labels (Available, Limited, Not available, data freshness) and free beds as broad ranges (none, 1–2, 3–5, 6–10, 10+), never exact bed counts or equipment faults.
7. THE SYSTEM SHALL show the disclaimer "Medora doesn't give medical advice. In an emergency, call 1669." on this screen.

## Requirement 6: Request to hospital (RC3)

**User story:** As a patient, I want to tell a hospital I'm coming, so that it can prepare for me.

1. WHEN the patient taps "Request to hospital" THE SYSTEM SHALL show a form with optional name and phone, a prefilled description, and how they are coming (car, taxi, ambulance, walking).
2. WHEN the patient sends the form THE SYSTEM SHALL create a request visible only to that hospital and the patient.
3. WHEN a request arrives at a hospital whose rule accepts patient visits and whose emergency department is open THE SYSTEM SHALL accept it automatically and allow staff to undo it for 60 seconds.
4. IF no one answers within 45 seconds THEN THE SYSTEM SHALL mark the request "no reply" and invite the patient to choose another hospital.
5. WHEN the request status changes THE SYSTEM SHALL update the patient's screen within 2 seconds and alert them.
6. WHEN the patient cancels a waiting or accepted request THE SYSTEM SHALL mark it cancelled and inform the hospital.

## Requirement 7: Messages between patient and hospital (RC3)

**User story:** As a patient and as hospital staff, we want to message each other about a request, so that the patient arrives at the right entrance with what's needed.

1. WHEN a request is waiting or accepted THE SYSTEM SHALL let both sides send quick replies or free text of up to 300 characters.
2. WHEN a message is sent THE SYSTEM SHALL deliver it to the other side live and alert them.
3. THE SYSTEM SHALL store quick replies as keys so that each side reads them in its own language.
4. WHEN a request is declined, cancelled or completed THE SYSTEM SHALL close its message thread.

## Requirement 8: Find a specialist (RC4)

**User story:** As a patient, I want to find a specialist near me who speaks my language, so that I can book a visit.

1. WHEN the patient opens Find a specialist THE SYSTEM SHALL use their current location and offer "Use my location".
2. WHERE the patient has described a need in Find care THE SYSTEM SHALL suggest a specialty (pregnancy: obstetrics; child: pediatrics; injury: orthopedics; other: internal medicine).
3. WHEN a specialty and language are chosen THE SYSTEM SHALL list matching specialists with the nearest hospitals first, then the soonest slot, and show the drive time and distance.
4. THE SYSTEM SHALL show a map with hospitals that have the specialist and the route to the nearest.
5. WHEN the patient taps a published slot THE SYSTEM SHALL confirm the booking instantly, prevent anyone else booking it, and notify the hospital.
6. WHERE a doctor has not consented to show their name THE SYSTEM SHALL show only the specialty and "name shared after booking".

## Requirement 9: Hospital status board (RC1)

**User story:** As hospital staff, I want to update our status in one tap, so that Medora routes the right patients to us.

1. THE SYSTEM SHALL let staff change free beds, NICU cots, each department (open or diverting), each key equipment item (working or down) and each on-call doctor (on duty or not).
2. WHEN staff change status THE SYSTEM SHALL save it with a timestamp and update every patient and doctor screen within 2 seconds.
3. WHEN status is older than 30 minutes THE SYSTEM SHALL label it "may be outdated" everywhere it is shown and prompt staff with "Still correct?".
4. WHEN staff tap "Yes, all correct" THE SYSTEM SHALL refresh the timestamp without other changes.

## Requirement 10: Hospital inbox and alerts (RC3)

**User story:** As hospital staff, I want to see and answer requests the moment they arrive, so that patients and doctors aren't kept waiting.

1. WHEN a request arrives for my hospital THE SYSTEM SHALL show an alert banner with sound and vibration if the app is open, and a push notification if it is closed.
2. THE SYSTEM SHALL let staff accept, or decline with a reason (no free bed, specialist busy, equipment down, department diverting), and add an optional note of up to 200 characters for the agent and the requester.
3. WHILE an automatic acceptance is within 60 seconds THE SYSTEM SHALL show an "Undo" option.
4. IF no on-duty staff member opens a waiting referral within 60 seconds THEN THE SYSTEM SHALL alert the next on-duty staff member.
5. THE SYSTEM SHALL show patient details (name, tap-to-call phone, arrival mode, description) and the message thread for patient requests.

## Requirement 11: Auto-accept rules (RC1)

**User story:** As a hospital admin, I want to set when Medora may accept requests for us, so that routine requests need no staff action.

1. WHERE the user is a hospital admin THE SYSTEM SHALL let them turn rules on or off for patient visits, stroke, heart attack, preterm labor and child admissions, and set a minimum number of free beds.
2. WHEN a request matches an enabled rule, the hospital passes every requirement of the pathway and free beds are at or above the minimum THE SYSTEM SHALL accept automatically and log it as "accepted by rule".
3. WHERE the user is not an admin THE SYSTEM SHALL show the rules read-only.

## Requirement 12: AI referral agent (RC3)

**User story:** As a referring doctor, I want an AI agent to find and ask the right hospital for my patient, so that I don't spend time phoning hospitals one by one.

1. WHEN a doctor submits a patient description and optional symptom onset (minutes ago) THE SYSTEM SHALL start the agent asynchronously and show its steps live.
2. THE agent SHALL use only these tools: `assess_case`, `search_knowledge_base`, `ask_hospitals`, `check_replies`, `recommend`, `report_no_placement`.
3. WHEN `assess_case` runs THE SYSTEM SHALL set the pathway (stroke, heart attack, preterm labor, child admission), compute the remaining treatment window from the onset time, and mark hospitals that cannot be reached in time as unable to help.
4. WHEN the agent asks hospitals THE SYSTEM SHALL create requests in parallel (as many as the urgency suggests), apply auto-accept rules, and return each reply with status, decline reason and staff note.
5. WHEN replies include staff notes about delays THE agent SHALL weigh drive time plus delay against the treatment window when choosing.
6. IF no hospital accepts THEN the agent SHALL ask the next best hospitals, at most two rounds, and then report no placement with an explanation.
7. WHEN the agent recommends a hospital THE SYSTEM SHALL require that its request is accepted, withdraw other requests, and show the reasons, including skipped closer hospitals.
8. THE agent SHALL never approve a transfer, diagnose or give treatment advice; Bedrock Guardrails SHALL be applied.
9. IF the model is unavailable or exceeds 8 turns or 120 seconds THEN THE SYSTEM SHALL complete the flow with rule-based steps and label the trace "Rule-based backup".
10. WHEN the run ends THE SYSTEM SHALL record the time from start to recommendation.

## Requirement 13: Doctor confirmation and transfer (RC3)

**User story:** As a referring doctor, I want to confirm the transfer in one tap and track it, so that I stay in control.

1. WHEN the agent recommends a hospital THE SYSTEM SHALL show "Confirm transfer" and "Not this one" to the doctor.
2. WHEN the doctor confirms THE SYSTEM SHALL create a transfer, notify the receiving hospital and send the ambulance crew a link by SMS (simulated in the demo).
3. WHILE a transfer is under way THE SYSTEM SHALL show the ambulance's position on the map and the minutes left (simulated in the demo).
4. WHEN the transfer arrives THE SYSTEM SHALL reduce the receiving hospital's free beds by one.

## Requirement 14: Knowledge base (RAG) (RC3)

**User story:** As a judge or doctor, I want to see that the agent's hospital choices come from documented capabilities, so that I can trust them.

1. THE SYSTEM SHALL index one document per hospital department from `shared/data/kb/` in a Bedrock knowledge base with Amazon Titan Text Embeddings V2, no chunking and metadata (hospital ID, department).
2. WHEN the agent searches the knowledge base THE SYSTEM SHALL show the matching hospitals and source documents in the trace.
3. IF no knowledge base is configured THEN THE SYSTEM SHALL use built-in hospital profiles and say so in the trace.

## Requirement 15: Activity log and audit (trust)

**User story:** As a reviewer, I want a record of every safety check, agent step and human action, so that decisions can be reviewed.

1. THE SYSTEM SHALL write each safety check, agent step, request, reply, message, confirmation and status change to the activity log with time, actor and English and Thai text.
2. THE SYSTEM SHALL show the activity log to staff and doctors, newest first.

## Requirement 16: Cost control (budget)

**User story:** As the team lead, I want AWS spending to stay under $350, so that we meet the competition budget.

1. THE SYSTEM SHALL use only serverless, pay-per-use AWS services listed in `AGENTS.md` sections 2 and 5, and none of the anti-patterns listed there (idle EC2 or RDS instances, GPU or ML instances, NAT gateways, Multi-AZ, orphaned volumes, snapshots or load balancers).
2. THE SYSTEM SHALL limit each agent run to 8 model turns and cap tokens per call, and limit agent runs per user per day.
3. THE SYSTEM SHALL tag all resources with `project` and `stage`.
4. THE team SHALL receive budget alarms at $100, $200, $280 and $320 of actual spend and at $350 of forecast spend.

## Requirement 17: Demo support (demo)

**User story:** As a presenter, I want a reliable demo, so that judges see the full flow even on poor Wi-Fi.

1. WHERE the demo stage is used THE SYSTEM SHALL provide a "Reset demo data" action for staff and doctors.
2. WHERE "demo replies" is enabled THE SYSTEM SHALL let hospitals without an auto-accept rule reply automatically after 8 seconds with preset notes, including Rama Nine's "neurologist in surgery, free in about 40 minutes" for stroke.
3. THE SYSTEM SHALL show the time to recommendation on each completed referral.

## Requirement 18: Security (trust)

**User story:** As a hospital and as a patient, we want our data protected, so that we can trust Medora with health information.

1. THE SYSTEM SHALL encrypt all stored data with AWS KMS (AWS-managed keys) and all traffic with TLS; S3 bucket policies SHALL deny non-TLS requests and S3 Block Public Access SHALL be on.
2. THE SYSTEM SHALL give each Lambda function its own IAM role with only the permissions it needs; Bedrock permissions SHALL name the specific model or inference profile ARNs and the knowledge base ARN, never `*`.
3. THE SYSTEM SHALL enforce AppSync authorization rules: patients read only public data and their own requests, bookings and messages; staff read and write only their own hospital's data; only admins change hospital settings.
4. THE SYSTEM SHALL keep AWS CloudTrail event history and record every app decision in the activity log.
5. THE SYSTEM SHALL apply a CloudWatch Logs data protection policy to Lambda log groups, SHALL log only IDs and statuses (never descriptions, notes or messages), and SHALL keep Bedrock model invocation logging off.
6. THE SYSTEM SHALL apply Bedrock Guardrails to every model call.

## Requirement 19: Live readiness ownership and reservations (RC1)

**User story:** As a ward nurse, radiology technologist or cath lab team member, I want to update only the items I'm responsible for in one tap, so that Medora's view of our hospital stays accurate.

1. WHERE a hospital admin assigns an item (a ward's ready beds, ICU or NICU cots, emergency department status, CT, MRI, cath lab, a specialist role) to a staff role THE SYSTEM SHALL show that item to that role on their status board.
2. WHEN an owner updates an item THE SYSTEM SHALL store the value, the owner, the source (staff, Medora or hospital system) and the time, and SHALL push it to every app and the agent within 5 seconds.
3. WHEN a hospital accepts a request or referral THE SYSTEM SHALL reserve one bed of the needed type, and IF the request is cancelled, declined or the patient has not arrived within 2 hours THEN THE SYSTEM SHALL release the reservation automatically.
4. WHEN a transfer or patient arrives THE SYSTEM SHALL turn the reservation into an occupied bed.
5. WHEN an item has not been updated for 30 minutes THE SYSTEM SHALL remind its owner, and WHEN a hospital has not updated anything for 2 hours THE SYSTEM SHALL alert its admin and show its status as unclear.
6. WHEN a hospital accepts while showing no free beds, or declines for "no free bed" while showing free beds, THE SYSTEM SHALL ask the owner to correct the count.
7. WHERE equipment has a QR code THE SYSTEM SHALL open that item's status switch directly when it is scanned in the hospital app.
8. THE SYSTEM SHALL identify each staff member's unit from the staff pool attribute `custom:unit` (`ward`, `icu`, `nicu`, `er`, `radiology`, `cathlab`) and SHALL show them a "My unit" screen with only that unit's items: plus and minus buttons for beds and cots, switches for equipment and departments, and an optional note of up to 100 characters.
9. WHERE the demo stage is used THE SYSTEM SHALL shorten the status reminder from 30 minutes to 30 seconds so the reminder can be shown live.
10. WHERE a hospital has only one general staff account THE SYSTEM SHALL let that account update all of the hospital's items (fallback when unit accounts aren't set up).

## Requirement 20: Success metrics (all root causes)

**User story:** As the team, we want to measure Medora's benefit for both people seeking care and doctors, so that we can show judges a before-after comparison.

1. THE SYSTEM SHALL record, for each patient request, the time from submitting the description to an accepted request, and whether the accepting hospital could treat the need.
2. THE SYSTEM SHALL record, for each referral, the time from start to recommendation and whether placement fell inside the treatment window.
3. THE SYSTEM SHALL record the share of status items updated within 30 minutes per hospital.
4. THE SYSTEM SHALL provide these figures for the demo stage as a simple summary screen or export.

## Requirement 21: Referral workflow orchestration (RC3)

**User story:** As a referring doctor, I want the referral to keep running reliably while hospitals and I take time to respond, so that nothing is lost or stuck.

1. WHEN a referral starts THE SYSTEM SHALL run it as an AWS Step Functions Standard workflow.
2. WHEN the agent asks hospitals THE SYSTEM SHALL create the requests in parallel and wait for each reply with a task token, with a timeout set by urgency; a timed-out request SHALL be marked "no reply".
3. WHEN a hospital accepts by its auto-accept rule or by staff THE SYSTEM SHALL return the task token so the workflow continues immediately.
4. THE SYSTEM SHALL save the agent's conversation state in DynamoDB between steps so that no Lambda function waits idle.
5. WHEN the agent recommends a hospital THE SYSTEM SHALL wait for the doctor's confirmation with a task token (timeout 30 minutes) before starting the transfer.
6. IF the agent exceeds 8 model turns, 2 rounds of asking or 10 minutes, or Bedrock is unavailable, THEN THE SYSTEM SHALL complete the referral on the rule-based backup path within the same workflow and label the trace.

## Requirement 22: AI models and region (organizer sandbox)

**User story:** As the team, we want the AI to run on models and in regions our competition account allows, so that nothing is blocked during the demo.

1. THE SYSTEM SHALL use only Amazon first-party models: Amazon Nova Pro for the referral agent, Amazon Nova Lite for patient understanding, and Amazon Titan Text Embeddings V2 for the knowledge base.
2. THE SYSTEM SHALL read model IDs from environment variables and SHALL call them by direct in-region model ID in us-east-1, without cross-region inference profiles.
3. THE SYSTEM SHALL deploy every resource to us-east-1 and SHALL NOT reference regions other than us-east-1, ap-southeast-1 and ap-southeast-7.
4. WHEN the model returns a tool call with invalid or missing input THE SYSTEM SHALL reject it with an error the model can correct, and IF the same turn fails twice THEN THE SYSTEM SHALL switch to the rule-based backup path.
5. THE SYSTEM SHALL be evaluated in English, Thai and mixed Thai-English for patient understanding and knowledge base retrieval before the demo.
