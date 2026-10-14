# Requirements: Medora MVP

## Introduction

Medora is a bilingual (English and Thai) mobile app that routes patients to the closest hospital in Bangkok that can treat them right now, and lets doctors place patients through an AI referral agent on Amazon Bedrock while confirming every transfer themselves. This spec covers the MVP for the NTT DATA Digital Innovation Challenge 2026: one app with role-based screens, an AWS serverless backend under a $350 budget, and live data only: patients, hospitals, staff and doctors sign up in the app and enter their own (mock) data. Nothing is pre-seeded, and no replies are generated automatically.

Acceptance criteria use EARS notation (WHEN / WHILE / IF / WHERE ... THE SYSTEM SHALL ...). "The app" is the Medora mobile app; "the backend" is the AWS Amplify Gen 2 backend; "the agent" is the referral coordinator running on Amazon Bedrock.

## Requirement 1: Sign-up, sign-in and roles

**User story:** As a user, I want to create my own account, sign in once and see only the screens for my role, so that patients, hospital staff and doctors each get the right tools.

1. WHEN a user signs up with email and password THE SYSTEM SHALL create a Cognito account after email verification, with the role they chose (patient, hospital admin or doctor); staff accounts are created only by invitation (Requirement 18).
2. WHEN a user signs in with email and password THE SYSTEM SHALL authenticate them with Amazon Cognito.
3. WHEN sign-in succeeds THE SYSTEM SHALL route a member of `doctors` to the doctor screens, a member of `hospital_staff` to the staff screens, and anyone else to the patient screens.
4. WHERE a staff member or doctor signs in THE SYSTEM SHALL scope their screens to the hospital in their `custom:hospitalId` attribute.
5. WHERE a staff member belongs to `admins` THE SYSTEM SHALL allow them to edit auto-accept rules.
6. IF sign-up or sign-in fails THEN THE SYSTEM SHALL show a message in the user's language without revealing whether the email exists.

## Requirement 2: English and Thai

**User story:** As a Thai or English speaker, I want the whole app in my language, so that I can use it under stress.

1. THE SYSTEM SHALL provide every user-facing string in English and Thai from `frontend/src/i18n/en.json` and `frontend/src/i18n/th.json`.
2. WHEN the user taps the language toggle THE SYSTEM SHALL switch all screens immediately and remember the choice on the device.
3. WHEN the agent or patient assistant replies THE SYSTEM SHALL reply in the language of the user who started the request.
4. WHEN a quick-reply message is shown THE SYSTEM SHALL display it in the reader's own language.

## Requirement 3: Patient location

**User story:** As a patient, I want Medora to know where I am, so that it can find hospitals near me.

1. WHEN the patient taps "Use my location" THE SYSTEM SHALL request foreground location permission and use the device position.
2. WHEN the patient types a place name in English or Thai THE SYSTEM SHALL suggest matching places from built-in Bangkok places and Amazon Location place search.
3. WHEN the patient taps the map in pick mode THE SYSTEM SHALL set that point as their location.
4. IF permission is denied or the position is unavailable THEN THE SYSTEM SHALL explain this and offer place search.
5. IF the position is outside the Bangkok service area THEN THE SYSTEM SHALL use Siam as the location and say so.
6. THE SYSTEM SHALL keep the patient's location on the device and not store it in the backend except as part of a request they send.

## Requirement 4: Emergency safety check

**User story:** As a patient with a possible emergency, I want to be told to call 1669 immediately, so that I don't lose time in an app.

1. WHEN a patient submits a description THE SYSTEM SHALL check it against the English and Thai red-flag phrases in `shared/data/red_flags.json` before any AI call.
2. WHEN a red flag matches THE SYSTEM SHALL show the emergency screen with a "Call 1669" button and the nearest hospital with an open emergency department, and SHALL NOT call any AI model.
3. WHILE the device is offline THE SYSTEM SHALL still perform the red-flag check and show the emergency screen.
4. WHEN the check runs THE SYSTEM SHALL write the result to the activity log.

## Requirement 5: Find care now

**User story:** As a patient, I want to describe what's wrong and see hospitals that can help me now, so that I don't go somewhere that has to send me away.

1. WHEN no red flag matches THE SYSTEM SHALL classify the need (maternity, child, injury or general) using the fast Claude model, falling back to keyword rules if the model is unavailable.
2. WHEN the need is known THE SYSTEM SHALL exclude hospitals whose required department is closed or diverting, whose required doctor is off duty, whose required equipment is down, or that have no free bed when one is required.
3. WHEN ranking hospitals THE SYSTEM SHALL order them by drive time plus wait × 0.2, adding 10 if the hospital's data is over 30 minutes old and 12 if its data is marked unclear.
4. WHEN results are shown THE SYSTEM SHALL show a map with the patient, the hospitals that can help, the crossed-out ones that can't, and the route to the best one.
5. WHERE the nearest hospital cannot help THE SYSTEM SHALL explain that it was skipped and why, in simple terms.
6. THE SYSTEM SHALL show public users only simple labels (Available, Limited, Not available, data freshness), never exact bed counts or equipment faults.
7. THE SYSTEM SHALL show the disclaimer "Medora doesn't give medical advice. In an emergency, call 1669." on this screen.

## Requirement 6: Request to hospital

**User story:** As a patient, I want to tell a hospital I'm coming, so that it can prepare for me.

1. WHEN the patient taps "Request to hospital" THE SYSTEM SHALL show a form with optional name and phone, a prefilled description, and how they are coming (car, taxi, ambulance, walking).
2. WHEN the patient sends the form THE SYSTEM SHALL create a request visible only to that hospital and the patient.
3. WHEN a request arrives at a hospital whose rule accepts patient visits and whose emergency department is open THE SYSTEM SHALL accept it automatically and allow staff to undo it for 60 seconds.
4. IF no one answers within 45 seconds THEN THE SYSTEM SHALL mark the request "no reply" and invite the patient to choose another hospital.
5. WHEN the request status changes THE SYSTEM SHALL update the patient's screen within 2 seconds and alert them.
6. WHEN the patient cancels a waiting or accepted request THE SYSTEM SHALL mark it cancelled and inform the hospital.

## Requirement 7: Messages between patient and hospital

**User story:** As a patient and as hospital staff, we want to message each other about a request, so that the patient arrives at the right entrance with what's needed.

1. WHEN a request is waiting or accepted THE SYSTEM SHALL let both sides send quick replies or free text of up to 300 characters.
2. WHEN a message is sent THE SYSTEM SHALL deliver it to the other side live and alert them.
3. THE SYSTEM SHALL store quick replies as keys so that each side reads them in its own language.
4. WHEN a request is declined, cancelled or completed THE SYSTEM SHALL close its message thread.

## Requirement 8: Find a specialist

**User story:** As a patient, I want to find a specialist near me who speaks my language, so that I can book a visit.

1. WHEN the patient opens Find a specialist THE SYSTEM SHALL use their current location and offer "Use my location".
2. WHERE the patient has described a need in Find care THE SYSTEM SHALL suggest a specialty (pregnancy: obstetrics; child: pediatrics; injury: orthopedics; other: internal medicine).
3. WHEN a specialty and language are chosen THE SYSTEM SHALL list matching specialists with the nearest hospitals first, then the soonest slot, and show the drive time and distance.
4. THE SYSTEM SHALL show a map with hospitals that have the specialist and the route to the nearest.
5. WHEN the patient taps a published slot THE SYSTEM SHALL confirm the booking instantly, prevent anyone else booking it, and notify the hospital.
6. WHERE a doctor has not consented to show their name THE SYSTEM SHALL show only the specialty and "name shared after booking".

## Requirement 9: Hospital status board

**User story:** As hospital staff, I want to update our status in one tap, so that Medora routes the right patients to us.

1. THE SYSTEM SHALL let staff change free beds, NICU cots, each department (open or diverting), each key equipment item (working or down) and each on-call doctor (on duty or not).
2. WHEN staff change status THE SYSTEM SHALL save it with a timestamp and update every patient and doctor screen within 2 seconds.
3. WHEN status is older than 30 minutes THE SYSTEM SHALL label it "may be outdated" everywhere it is shown and prompt staff with "Still correct?".
4. WHEN staff tap "Yes, all correct" THE SYSTEM SHALL refresh the timestamp without other changes.

## Requirement 10: Hospital inbox and alerts

**User story:** As hospital staff, I want to see and answer requests the moment they arrive, so that patients and doctors aren't kept waiting.

1. WHEN a request arrives for my hospital THE SYSTEM SHALL show an alert banner with sound and vibration if the app is open, and a push notification if it is closed.
2. THE SYSTEM SHALL let staff accept, or decline with a reason (no free bed, specialist busy, equipment down, department diverting), and add an optional note of up to 200 characters for the agent and the requester.
3. WHILE an automatic acceptance is within 60 seconds THE SYSTEM SHALL show an "Undo" option.
4. IF no on-duty staff member opens a waiting referral within 60 seconds THEN THE SYSTEM SHALL alert the next on-duty staff member.
5. THE SYSTEM SHALL show patient details (name, tap-to-call phone, arrival mode, description) and the message thread for patient requests.

## Requirement 11: Auto-accept rules

**User story:** As a hospital admin, I want to set when Medora may accept requests for us, so that routine requests need no staff action.

1. WHERE the user is a hospital admin THE SYSTEM SHALL let them turn rules on or off for patient visits, stroke, heart attack, preterm labor and child admissions, and set a minimum number of free beds.
2. WHEN a request matches an enabled rule, the hospital passes every requirement of the pathway and free beds are at or above the minimum THE SYSTEM SHALL accept automatically and log it as "accepted by rule".
3. WHERE the user is not an admin THE SYSTEM SHALL show the rules read-only.

## Requirement 12: AI referral agent

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

## Requirement 13: Doctor confirmation and transfer

**User story:** As a referring doctor, I want to confirm the transfer in one tap and track it, so that I stay in control.

1. WHEN the agent recommends a hospital THE SYSTEM SHALL show "Confirm transfer" and "Not this one" to the doctor.
2. WHEN the doctor confirms THE SYSTEM SHALL create a transfer, notify the receiving hospital and show a shareable transfer link for the ambulance crew (no SMS until an ambulance service joins).
3. WHILE a transfer is under way THE SYSTEM SHALL show the minutes left from the route drive time and an ambulance position on the map, labelled "Simulated" until an ambulance service joins.
4. WHEN the receiving hospital's staff confirm the patient has arrived THE SYSTEM SHALL mark the transfer arrived and reduce that hospital's free beds by one.

## Requirement 14: Knowledge base (RAG)

**User story:** As a judge or doctor, I want to see that the agent's hospital choices come from documented capabilities, so that I can trust them.

1. THE SYSTEM SHALL index the department documents that hospital admins upload in the app (Requirement 18) in a Bedrock knowledge base with a multilingual embedding model, no chunking and metadata (hospital ID, department).
2. WHEN the agent searches the knowledge base THE SYSTEM SHALL show the matching hospitals and source documents in the trace.
3. IF no knowledge base is configured THEN THE SYSTEM SHALL use the departments and equipment from the registered hospital profiles and say so in the trace.

## Requirement 15: Activity log and audit

**User story:** As a reviewer, I want a record of every safety check, agent step and human action, so that decisions can be reviewed.

1. THE SYSTEM SHALL write each safety check, agent step, request, reply, message, confirmation and status change to the activity log with time, actor and English and Thai text.
2. THE SYSTEM SHALL show the activity log to staff and doctors, newest first.

## Requirement 16: Cost control

**User story:** As the team lead, I want AWS spending to stay under $350, so that we meet the competition budget.

1. THE SYSTEM SHALL use only serverless, pay-per-use AWS services listed in `AGENTS.md` sections 2 and 5, and none of the anti-patterns listed there (idle EC2 or RDS instances, GPU or ML instances, NAT gateways, Multi-AZ, orphaned volumes, snapshots or load balancers).
2. THE SYSTEM SHALL limit each agent run to 8 model turns and cap tokens per call, and limit agent runs per user per day.
3. THE SYSTEM SHALL tag all resources with `project` and `stage`.
4. THE team SHALL receive budget alarms at $100, $200, $280 and $320 of actual spend and at $350 of forecast spend.

## Requirement 17: Live data only

**User story:** As a hospital, doctor or patient, I want Medora to show only what real users have entered, so that every result reflects someone's actual input.

1. THE SYSTEM SHALL start with no hospitals, users, requests or referrals; every record SHALL be created through sign-up or in-app actions.
2. THE SYSTEM SHALL NOT generate hospital replies, status changes or bookings automatically, except through auto-accept rules set by a hospital admin (Requirement 11).
3. WHEN no registered hospital can help THE SYSTEM SHALL say so plainly instead of showing sample hospitals.
4. THE SYSTEM SHALL show the time to recommendation on each completed referral.
5. WHEN any user creates or changes a record (hospital status, request, reply, message, referral, trace step, transfer) THE SYSTEM SHALL show the change on every other signed-in screen that displays it within 2 seconds, without a manual refresh.
6. THE SYSTEM SHALL label any value that is simulated rather than entered by a user (the ambulance position) as "Simulated".

## Requirement 18: Hospital and staff onboarding

**User story:** As a hospital admin, I want to register my hospital and invite my staff, so that Medora can route patients to us.

1. WHEN a hospital admin signs up THE SYSTEM SHALL add them to `hospital_staff` and `admins` and require them to complete the hospital profile before any other screen.
2. WHEN the admin submits the hospital profile THE SYSTEM SHALL require the name in English and Thai, location (latitude and longitude inside the service area, or picked on the map), total beds (1 to 9,999), NICU cots (0 to 999), typical wait in minutes, at least one department, and the equipment available; it SHALL create the `HospitalProfile` and an initial `HospitalStatus`, and set `custom:hospitalId` on the admin's account.
3. WHEN an admin invites a staff member by email THE SYSTEM SHALL create the account in `hospital_staff` with the admin's `custom:hospitalId`, and the staff member sets a password on first sign-in.
4. WHEN an admin adds a specialist THE SYSTEM SHALL require a specialty, at least one language and name-display consent, and let the admin add and remove appointment slots.
5. WHEN an admin uploads a department document (Markdown or plain text, up to 50 KB) THE SYSTEM SHALL store it under the hospital's prefix and sync the knowledge base.
6. WHEN a doctor signs up THE SYSTEM SHALL ask which registered hospital they work at and show a "pending approval" screen until an admin of that hospital approves them; only then SHALL they reach the doctor screens.
7. WHEN a patient signs up THE SYSTEM SHALL route them straight to the patient home screen.
