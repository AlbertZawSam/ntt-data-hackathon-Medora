# Requirements Document

## Introduction

Medora is a bilingual (English and Thai) mobile app built on AWS that routes patients to the nearest Bangkok hospital able to treat them right now. Patients describe symptoms, receive ranked hospital recommendations, and send requests. Hospital staff keep their status current and respond to incoming requests. Doctors use an AI referral agent powered by Amazon Bedrock to place patients and confirm every transfer. The system is built for the NTT DATA Digital Innovation Challenge 2026, serves hospitals and users who register themselves and provide their own live data, and must stay within a strict $350 AWS budget.

The core principle is: **the agent coordinates; fixed rules and humans decide.**

## Glossary

- **System**: The Medora mobile app and its AWS Amplify Gen 2 backend collectively.
- **App**: The Expo (React Native) mobile application running on a user's device.
- **Backend**: The AWS Amplify Gen 2 serverless backend (Cognito, AppSync, DynamoDB, Lambda).
- **Agent**: The AI referral coordinator Lambda function running a Bedrock Converse tool-use loop.
- **Cognito**: Amazon Cognito user pool managing authentication and group membership.
- **AppSync**: AWS AppSync GraphQL API with real-time subscriptions.
- **Bedrock**: Amazon Bedrock service hosting Claude models and Guardrails.
- **Knowledge_Base**: Amazon Bedrock Knowledge Base indexed from department capability documents uploaded by hospital admins, stored on S3 Vectors.
- **Location_Service**: Amazon Location Service used for place search and route matrix calculations.
- **Patient**: An app user in the `patients` Cognito group seeking hospital care or specialists.
- **Staff**: An app user in the `hospital_staff` Cognito group managing a specific hospital.
- **Doctor**: An app user in the `doctors` Cognito group placing patients via the AI referral agent.
- **Admin**: A staff user also in the `admins` Cognito group who may edit auto-accept rules.
- **Pathway**: A clinical care pathway defined in `shared/data/pathways.json` (stroke, stemi, preterm, peds, maternity, injury, general) with required departments, equipment, doctors on duty, bed requirements, treatment windows, and prep times.
- **Red_Flag_Checker**: The offline, fixed-rule module that checks patient descriptions against `shared/data/red_flags.json` before any AI call.
- **Ranking_Engine**: The pure TypeScript module in `shared/logic/ranking.ts` that scores and sorts hospitals.
- **Auto_Accept_Engine**: The pure TypeScript module in `shared/logic/rules.ts` that evaluates auto-accept rules.
- **CareRequest**: A DynamoDB record representing a patient-to-hospital request or doctor-to-hospital referral request.
- **Referral**: A DynamoDB record representing a doctor-initiated AI referral workflow.
- **Transfer**: A DynamoDB record created when a doctor confirms placement.
- **Activity_Log**: The append-only DynamoDB record stream of all system events with bilingual entries.
- **TraceStep**: A DynamoDB record capturing one step of the agent's reasoning or tool use.
- **Hospital_Profile**: A DynamoDB record created when a hospital admin registers their hospital, containing name, location, departments, equipment, and staff.
- **Specialist**: A doctor profile linked to a hospital, created by the hospital admin, containing specialty, languages, and availability slots.

---

## Requirements

### Requirement 1: Sign-in and Role-Based Access

**User Story:** As a user, I want to sign in once and see only the screens appropriate for my role, so that patients, hospital staff, and doctors each get the right tools without accessing each other's functions.

#### Acceptance Criteria

1. WHEN a user submits an email address of at most 254 characters and a password of at most 128 characters, THE System SHALL authenticate the user with Cognito and mask the password field characters throughout entry.
2. IF authentication succeeds and the user belongs to the `doctors` group, THEN THE System SHALL route the user to the doctor screens.
3. IF authentication succeeds and the user belongs to the `hospital_staff` group, THEN THE System SHALL route the user to the hospital staff screens scoped to the hospital identified by the user's `custom:hospitalId` Cognito attribute.
4. IF authentication succeeds and the user does not belong to `doctors` or `hospital_staff`, THEN THE System SHALL route the user to the patient screens.
5. WHERE a user belongs to the `admins` group, THE System SHALL allow the user to create, update, and delete auto-accept rules for the hospital identified by the user's `custom:hospitalId` Cognito attribute.
6. WHERE a user belongs to `hospital_staff` but not `admins`, THE System SHALL display auto-accept rules as read-only.
7. IF authentication fails, THEN THE System SHALL display an error message in the user's selected language that does not disclose whether the submitted email address exists in the system.
8. WHEN an unauthenticated user attempts to navigate to a protected screen, THE System SHALL redirect the user to the sign-in screen and preserve the originally requested route so the user is redirected there upon successful authentication.
9. WHEN a user successfully authenticates, THE System SHALL issue a session token valid for no longer than 60 minutes of inactivity, after which THE System SHALL require the user to sign in again.

---

### Requirement 2: Bilingual Interface

**User Story:** As a Thai or English speaker, I want the entire application displayed in my language, so that I can use it accurately and without confusion under stressful conditions.

#### Acceptance Criteria

1. THE System SHALL provide every user-facing string in English from `frontend/src/i18n/en.json` and in Thai from `frontend/src/i18n/th.json`; no string SHALL be hard-coded in a screen component.
2. WHEN the user activates the language toggle, THE System SHALL switch the display language of all currently visible screens within 300 milliseconds without requiring a restart.
3. WHEN the user activates the language toggle, THE System SHALL persist the selected language to device storage so that subsequent app launches use the same language.
4. WHEN the Agent produces a reply or recommendation, THE System SHALL deliver that reply in the language that was active at the moment the Doctor submitted the referral request, regardless of any language change made after submission.
5. WHEN a quick-reply message is displayed, THE System SHALL render the message text using the reading user's stored language preference to look up the correct translation key from the active translation file.
6. WHEN the application is launched for the first time with no stored language preference, THE System SHALL default to English until the user activates the language toggle.
7. IF a translation key is absent from the active language file, THEN THE System SHALL display the English fallback string for that key without displaying a blank or raw key identifier.

---

### Requirement 3: Patient Location

**User Story:** As a patient, I want Medora to know where I am, so that it can find and rank hospitals near me.

#### Acceptance Criteria

1. WHEN the Patient taps the "Use my location" control, THE System SHALL request foreground location permission from the device operating system.
2. IF the device grants location permission and a device position fix is obtained within 10 seconds, THEN THE System SHALL use the returned latitude/longitude coordinates as the Patient's current location.
3. WHEN the Patient types a place name into the location search field, THE System SHALL display up to 5 matching place suggestions sourced from the built-in Bangkok places list and, where an Amazon Location API key is configured, from Location_Service place search results.
4. IF an Amazon Location API key is configured and the Location_Service place search request fails or does not return a response within 5 seconds, THEN THE System SHALL display suggestions from the built-in Bangkok places list only and show a notice informing the Patient that remote search is unavailable.
5. WHEN the Patient taps a point on the map while the map is in pick mode, THE System SHALL set that tapped coordinate as the Patient's current location.
6. IF the device denies location permission or a device position fix is not obtained within 10 seconds, THEN THE System SHALL display a message in the Patient's language explaining that location access is unavailable and present the place name search as an alternative input method.
7. IF the Patient's resolved coordinates fall outside the bounding box defined as latitude 13.4900°N to 14.0500°N and longitude 100.3300°E to 100.9300°E (the Bangkok service area), THEN THE System SHALL substitute the coordinates 13.7456°N, 100.5342°E (Siam district) as the Patient's current location and display a notice in the Patient's language informing them of this substitution.
8. THE System SHALL retain the Patient's location exclusively in device memory for the duration of the session and SHALL NOT transmit or persist the location to the Backend except as part of a CareRequest explicitly submitted by the Patient.

---

### Requirement 4: Emergency Safety Check

**User Story:** As a patient with a possible emergency, I want to be told immediately to call emergency services, so that I do not lose critical time inside an app when my life may be at risk.

#### Acceptance Criteria

1. WHEN a Patient submits a symptom description, THE System SHALL perform a case-insensitive substring match of the description against all English and Thai red-flag phrases in `shared/data/red_flags.json` using the Red_Flag_Checker before invoking any AI model or backend service.
2. WHEN the Red_Flag_Checker identifies a matching phrase, THE System SHALL display the emergency screen containing a "Call 1669" button linked to `tel:1669` and the name and location of the nearest hospital with an open emergency department, determined by the lowest haversine distance from the Patient's current coordinates; IF no hospital with an open emergency department is found, THE System SHALL display the nearest hospital regardless of department status; THE System SHALL NOT invoke any AI model during this flow.
3. WHILE the device has no network connectivity, THE System SHALL perform the red-flag evaluation using locally cached `shared/data/red_flags.json` and the last hospital list the device received from the backend, without requiring a network request.
4. WHEN the Red_Flag_Checker completes an evaluation, THE System SHALL append an Activity_Log entry recording whether a red flag was matched, the matched phrase if any, the UTC timestamp, and the actor's user identifier.

---

### Requirement 5: Find Care Now

**User Story:** As a patient, I want to describe my symptoms and see a ranked list of hospitals that can treat me right now, so that I do not travel to a hospital that cannot help me.

#### Acceptance Criteria

1. WHEN no red flag keyword (chest pain, can't breathe, unconscious, stroke, severe bleeding, seizure) is detected in the Patient's description, THE System SHALL classify the care need as one of: maternity, child, injury, or general by sending the description to the fast Claude model via the `understandNeed` Lambda.
2. IF the `understandNeed` Lambda returns an error or does not respond within 5 seconds, THEN THE System SHALL classify the care need using the keyword classification rules in `shared/logic/ranking.ts` and display an indicator that AI classification was unavailable.
3. WHEN the care need is determined, THE Ranking_Engine SHALL derive the required Pathway (the combination of department type, doctor type, and equipment type associated with the classified care need) and SHALL exclude any hospital where the required department is closed or diverting, the required doctor type has no on-duty staff, the required equipment is marked down, or no bed is marked as both unoccupied and unreserved when the Pathway requires a bed.
4. WHEN ranking eligible hospitals, THE Ranking_Engine SHALL compute a score for each hospital as: `drive_time_minutes + (typicalWaitMin × 0.2) + (10 if data age > 30 minutes) + (12 if data is marked unclear) + (3 if beds ≤ 1 and pathway requires a bed) − (3 if the preferred department is open)`; THE Ranking_Engine SHALL order hospitals from lowest score to highest.
5. WHEN results are displayed to the Patient, THE System SHALL show a map with a pin for the Patient's location, pins for eligible hospitals, crossed-out pins for ineligible hospitals, and a route line to the highest-ranked eligible hospital.
6. IF no eligible hospital exists after filtering, THEN THE System SHALL display a message indicating no nearby hospitals currently meet the care need and instruct the Patient to call 1669.
7. IF the nearest hospital to the Patient is ineligible, THEN THE System SHALL display a plain-language explanation in the Patient's selected language for why that hospital was skipped.
8. THE System SHALL display hospital availability to Patient users using only the labels: Available, Limited, Not available, and a data freshness indicator; THE System SHALL NOT display exact bed counts, equipment fault details, or staff roster information to Patient users.
9. THE System SHALL display the disclaimer "Medora doesn't give medical advice. In an emergency, call 1669." on every Find Care results screen.

---

### Requirement 6: Patient Request to Hospital

**User Story:** As a patient, I want to notify a hospital that I am coming, so that its staff can prepare for my arrival.

#### Acceptance Criteria

1. WHEN the Patient selects a hospital and taps "Request to hospital," THE System SHALL present a form with an optional name field (maximum 100 characters), an optional phone number field (maximum 20 characters), a pre-filled symptom description field (maximum 500 characters), and a required arrival mode selection of car, taxi, ambulance, or walking.
2. WHEN the Patient submits the request form with an arrival mode selected, THE System SHALL create a CareRequest record with status "waiting" that is accessible only to the selected hospital and the submitting Patient.
3. IF the Patient submits the request form without selecting an arrival mode, THEN THE System SHALL display a validation error indicating the arrival mode is required and SHALL NOT create a CareRequest record.
4. WHEN a CareRequest arrives at a hospital whose visit auto-accept rule is enabled and whose emergency department is open, THE System SHALL automatically set the request status to "accepted" and present an "Undo" option to on-duty Staff for 60 seconds; IF Staff activates the "Undo" option within that 60-second window, THEN THE System SHALL revert the request status to "waiting."
5. IF no Staff member accepts or rejects a CareRequest within 45 seconds of its creation, THEN THE System SHALL set the request status to "no reply" and display a prompt to the Patient to select a different hospital; an automatic acceptance per criterion 4 SHALL be treated as a Staff response and prevent the "no reply" outcome.
6. WHEN the status of a CareRequest changes, THE System SHALL update the Patient's request screen to reflect the new status within 2 seconds.
7. WHEN the Patient cancels a CareRequest whose status is "waiting" or "accepted," THE System SHALL set the status to "cancelled" and update the relevant hospital's Staff active request view within 2 seconds.

---

### Requirement 7: Messaging Between Patient and Hospital

**User Story:** As a patient and as hospital staff, we want to exchange messages about an active request, so that the patient arrives at the correct entrance with the right preparation.

#### Acceptance Criteria

1. WHILE a CareRequest has the status "waiting" or "accepted," THE System SHALL allow both the Patient and the Staff to send messages on the request's message thread; each message SHALL be either a quick-reply key or free text with a maximum length of 300 characters.
2. WHEN a message is sent on a request thread, THE System SHALL deliver the message to the other party within 10 seconds and display a visible in-app notification to alert them of the new message.
3. IF a message fails to deliver within 10 seconds, THEN THE System SHALL display an error indication to the sender and retain the message content in the input field so the sender can retry.
4. THE System SHALL store quick-reply messages as language-neutral keys; WHEN a quick-reply message is displayed to a user, THE System SHALL resolve the key to the translation matching that user's selected language.
5. IF no translation exists for a quick-reply key in the user's selected language, THEN THE System SHALL display the key's default English text as a fallback.
6. WHEN a CareRequest transitions to the status "declined," "cancelled," or "completed," THE System SHALL set the associated message thread to read-only so that existing messages remain visible but no further messages can be sent.

---

### Requirement 8: Find a Specialist

**User Story:** As a patient, I want to search for a specialist near me who speaks my language, so that I can book a consultation visit.

#### Acceptance Criteria

1. WHEN the Patient opens the Find a Specialist screen and location permission is granted, THE System SHALL set the search origin to the Patient's current coordinates and display a "Use my location" option; IF location permission is denied or unavailable, THEN THE System SHALL prompt the Patient to enter a location manually before the search can proceed.
2. WHERE the Patient has previously completed a Find Care session, THE System SHALL pre-select the specialty filter based on the most recent classified care need: obstetrics for maternity, pediatrics for child, orthopedics for injury, and internal medicine for all other needs.
3. WHEN the Patient selects a specialty and a preferred language, THE System SHALL query live Specialist records in DynamoDB and display a list of up to 20 matching specialists ordered first by distance from the Patient's search origin (nearest hospital first) and then by soonest available appointment slot, including drive time and distance for each hospital.
4. WHEN the Patient selects a specialty and a preferred language, THE System SHALL display a map showing the locations of hospitals with matching specialists and a route line from the Patient's search origin to the nearest matching hospital.
5. IF a search returns no specialists matching the selected specialty and preferred language within 100 km of the Patient's search origin, THEN THE System SHALL display a message indicating no matches were found and suggest that the Patient broaden the search by selecting a different language preference or expanding the search area.
6. WHEN the Patient taps an available Slot and confirms a booking, THE System SHALL record the booking within 3 seconds, mark that Slot as unavailable so no other Patient can book it, and send a notification to the relevant hospital.
7. IF a Slot selected by the Patient has already been booked by another Patient at the time of confirmation, THEN THE System SHALL reject the booking, display a message indicating the Slot is no longer available, and return the Patient to the specialist's availability view with the conflicting Slot removed.
8. WHEN a booking is successfully recorded, THE System SHALL display a confirmation to the Patient containing the specialist's medical specialty, hospital name, and the date and time of the booked Slot.
9. WHERE a specialist has not consented to public display of their name, THE System SHALL display only the specialist's medical specialty and the text "name shared after booking" in place of the specialist's name.

---

### Requirement 9: Hospital Status Board

**User Story:** As hospital staff, I want to update our hospital's status in real time, so that Medora routes only patients we can actually treat to us.

#### Acceptance Criteria

1. THE System SHALL allow Staff to update the following status fields for their hospital: number of free beds (integer from 0 to 999), number of free NICU cots (integer from 0 to 99), the operational state of each department (open or diverting), the operational state of each key equipment item (working or down), and the on-duty state of each on-call doctor role (on duty or not on duty).
2. WHEN Staff submits a status update, THE System SHALL persist the update along with the current timestamp within 2 seconds.
3. WHEN Staff submits a status update, THE System SHALL propagate the new status to all active Patient and Doctor screens within 2 seconds of the update being persisted.
4. IF a status update submission fails, THEN THE System SHALL display an error message indicating the update was not saved, retain the previously submitted field values in the form for resubmission, and not change the stored status record.
5. IF a hospital's status record has not been updated for more than 30 minutes, THEN THE System SHALL label the status "may be outdated" wherever it is displayed and present an in-app prompt to all Staff users associated with that hospital asking them to confirm whether the status is still accurate.
6. WHEN Staff confirms the status is still accurate by tapping "Yes, all correct," THE System SHALL update the status record timestamp to the current time without modifying any other status field.

---

### Requirement 10: Hospital Inbox and Alerts

**User Story:** As hospital staff, I want to be alerted the moment a request arrives and respond immediately, so that patients and doctors are not kept waiting.

#### Acceptance Criteria

1. WHEN a CareRequest is created for a hospital and the assigned Staff member's app is in the foreground, THE System SHALL display an alert banner accompanied by an audible sound and device vibration.
2. WHEN a CareRequest is created for a hospital and the assigned Staff member's app is in the background or closed, THE System SHALL deliver a push notification via Amazon SNS to that Staff member's registered device.
3. WHEN a Staff member views a CareRequest with status "waiting", THE System SHALL allow the Staff member to accept it or decline it with one of the following reasons: no free bed, specialist busy, equipment down, or department diverting; the Staff member MAY attach an optional note of up to 200 characters to either an acceptance or a decline.
4. WHILE an automatically accepted CareRequest has been accepted for fewer than 60 seconds, THE System SHALL display an "Undo" option that allows Staff to reverse the automatic acceptance.
5. IF a referral-type CareRequest has been in the "waiting" status for 60 seconds without any on-duty Staff member opening it, THEN THE System SHALL send an alert to the next on-duty Staff member at that hospital in ascending order of their on-duty roster sequence, and SHALL repeat this escalation every 60 seconds until a Staff member opens the CareRequest or no further on-duty Staff members remain.
6. WHEN a Staff member opens a CareRequest, THE System SHALL display the following patient-provided details: the patient's name (if provided), a tap-to-call phone number (if provided), the selected arrival mode, the symptom description, and the associated message thread.

---

### Requirement 11: Auto-Accept Rules

**User Story:** As a hospital admin, I want to configure conditions under which Medora may accept requests on our behalf, so that routine, low-risk requests require no manual staff action.

#### Acceptance Criteria

1. WHERE the authenticated user belongs to the `admins` group, THE System SHALL allow the user to enable or disable auto-accept rules for each of the following request types: patient visit, stroke, heart attack (stemi), preterm labor, and child admission (peds); the Admin SHALL also be able to set a minimum free-bed threshold per enabled rule, where the threshold must be an integer between 1 and 999 inclusive.
2. WHEN a CareRequest arrives and the corresponding auto-accept rule is enabled for that hospital, all required capability and availability fields defined in the CareRequest's pathway are present and marked as available in the hospital's current status, and the hospital's free beds are equal to or greater than the rule's minimum threshold, THE Auto_Accept_Engine SHALL set the CareRequest status to "accepted" and log the event as "accepted by rule."
3. WHERE the authenticated user belongs to `hospital_staff` but not `admins`, THE System SHALL display the auto-accept rules configuration in read-only mode.

---

### Requirement 12: AI Referral Agent

**User Story:** As a referring doctor, I want an AI agent to find the right hospital for my patient and request admission on my behalf, so that I do not spend time making individual calls to hospitals while my patient waits.

#### Acceptance Criteria

1. WHEN a Doctor submits a patient description of up to 2,000 characters and an optional symptom onset time in minutes, THE System SHALL create a Referral record, start the Agent asynchronously via the `startReferral` AppSync mutation, and stream each TraceStep record to the Doctor's screen within 2 seconds of the step being created.
2. THE Agent SHALL call only the following tools during its operation: `assess_case`, `search_knowledge_base`, `ask_hospitals`, `check_replies`, `recommend`, and `report_no_placement`; the Agent SHALL NOT call any tool outside this set.
3. WHEN the Agent invokes `assess_case`, THE System SHALL determine the clinical Pathway (one of: stroke, STEMI, trauma, obstetric, or general), compute the remaining treatment window as `windowMin − onsetMin`, and flag any hospital as unable to help when `drive_time + prep_time > remaining_window`.
4. WHEN the Agent invokes `ask_hospitals`, THE System SHALL create CareRequest records in parallel for the submitted hospital IDs, apply Auto_Accept_Engine rules immediately, and return each hospital's reply status, decline reason, and staff note to the Agent; the number of parallel requests SHALL follow the urgency ask policy: 1 hospital for non-urgent cases with a 60-second wait, 3 hospitals for urgent cases with fewer than 90 minutes remaining and a 30-second wait, and 2 hospitals for all other urgent cases with a 45-second wait.
5. IF a Staff reply for a candidate hospital contains a delay estimate and adding that delay to the current elapsed time would cause `drive_time + prep_time + delay > remaining_window`, THEN THE Agent SHALL remove that hospital from the candidate set before invoking `recommend`.
6. IF no hospital accepts after the first round of requests, THEN THE Agent SHALL send requests to the next-best hospitals for a maximum of one additional round; IF no hospital accepts after two total rounds, THEN THE Agent SHALL invoke `report_no_placement` with an explanation in English and Thai.
7. WHEN the Agent invokes `recommend`, THE System SHALL verify that the nominated hospital's CareRequest has the status "accepted," withdraw all other pending CareRequests for this Referral, and record the recommendation reasons in English and Thai on the Referral record.
8. THE Agent SHALL never invoke a tool that approves a Transfer, classifies an emergency, or modifies hospital status; Bedrock Guardrails SHALL be applied to every Converse API call to block diagnosis and treatment advice.
9. IF the Bedrock model is unavailable, IF the Agent reaches 8 model turns, OR IF 120 seconds elapse from the start of the Agent run, THEN THE System SHALL complete the referral flow using the rule-based backup path, which SHALL produce either a `recommend` call for the highest-scored available hospital or a `report_no_placement` call if no hospital is viable, and label the TraceStep record as "Rule-based backup."
10. WHEN the Agent run completes, THE System SHALL record the elapsed time in whole seconds from the start of the run to the moment the recommendation is made and store it on the Referral record.

---

### Requirement 13: Doctor Confirmation and Transfer Tracking

**User Story:** As a referring doctor, I want to confirm the recommended transfer with a single tap and then track the ambulance, so that I stay in control of every placement decision.

#### Acceptance Criteria

1. WHEN the Agent recommends a hospital, THE System SHALL display a "Confirm transfer" button and a "Not this one" button to the Doctor.
2. WHEN the Doctor taps "Confirm transfer," THE System SHALL create a Transfer record, send a notification to the receiving hospital's Staff containing the patient identifier, the sending hospital name, and the estimated arrival time, and show a shareable link to the live transfer tracking view for the ambulance crew (no SMS until an ambulance service joins).
3. WHILE a Transfer record has the status "in progress," THE System SHALL update and display the estimated minutes remaining and an ambulance position on the map labelled "Simulated", at intervals of no greater than 10 seconds.
4. WHEN the receiving hospital's Staff confirm the patient has arrived, THE System SHALL set the Transfer status to "arrived" and decrement that hospital's free bed count by one in the HospitalStatus record.
5. WHEN the Doctor taps "Not this one," THE System SHALL discard the current recommendation and return the Doctor to the recommendation view so that a new recommendation can be requested.
6. IF the Transfer record cannot be created due to a system error, THEN THE System SHALL display an error message indicating the transfer was not saved and retain the "Confirm transfer" and "Not this one" buttons so the Doctor can retry.

---

### Requirement 14: Knowledge Base (RAG)

**User Story:** As a judge or doctor, I want to see that the agent's hospital selection is grounded in documented hospital capabilities, so that I can trust the recommendations.

#### Acceptance Criteria

1. THE System SHALL index each hospital's department capability documents — uploaded by hospital admins via the app — into the Bedrock Knowledge_Base using a multilingual embedding model, no document chunking, and per-document metadata containing the hospital ID and the department name.
2. WHEN the Agent invokes `search_knowledge_base`, THE System SHALL retrieve up to 5 matching Knowledge_Base entries and include the matching hospital IDs and source document references in the associated TraceStep record visible to the Doctor.
3. IF the environment variable `KB_ID` is not configured, THEN THE System SHALL use the departments and equipment from registered HospitalProfile records as the retrieval source and record a note in the TraceStep indicating that the Knowledge_Base was not used.
4. WHEN a hospital admin uploads a department capability document (Markdown or plain text, maximum 50 KB), THE System SHALL store the document in S3 and trigger a Knowledge_Base sync for that hospital's documents.

---

### Requirement 15: Activity Log and Audit Trail

**User Story:** As a reviewer, I want a complete record of every system event, so that all safety checks, agent decisions, and human actions can be audited after the fact.

#### Acceptance Criteria

1. THE System SHALL append an Activity_Log entry for each of the following events: every Red_Flag_Checker evaluation, every Agent tool invocation, every CareRequest creation and status change, every message sent, every Transfer confirmation, and every hospital status update; each entry SHALL include the UTC timestamp, the authenticated user's unique ID and role in English and Thai, and a description of the event in English and Thai.
2. THE System SHALL display the Activity_Log to authenticated Staff and Doctor users, sorted with the most recent entries first, showing the 200 most recent entries by default with the option to load additional entries in batches of 200.

---

### Requirement 16: Cost Control

**User Story:** As the team lead, I want all AWS spending to remain below $350, so that the project meets the competition budget constraint.

#### Acceptance Criteria

1. THE System SHALL use only serverless, pay-per-use AWS services: Lambda, DynamoDB in on-demand billing mode, AppSync, S3, Amazon Bedrock, Amazon SNS, and Amazon Location Service; THE System SHALL NOT create EC2 instances, RDS instances, GPU or ML instances, NAT gateways, Multi-AZ configurations, OpenSearch Serverless, Aurora, provisioned-concurrency Lambda configurations, Bedrock provisioned throughput, or EBS volumes.
2. THE System SHALL cap each Agent run at 8 Bedrock model turns with a maximum of 8,000 input tokens and 1,000 output tokens per model call, and SHALL enforce a limit of 20 Agent runs per user per day.
3. THE System SHALL tag every AWS resource with the tags `project=medora` and `stage=dev` or `stage=prod` at the time of resource creation.
4. THE System SHALL trigger AWS Budget Alerts to the team email address at the following actual-spend thresholds: $100, $200, $280, and $320; and at a $350 forecast-spend threshold.

---

### Requirement 17: Hospital and User Onboarding

**User Story:** As a hospital administrator, I want to register my hospital and manage my staff accounts, so that Medora can route real patients to us.

#### Acceptance Criteria

1. WHEN a new hospital admin registers with an email and password, THE System SHALL create a Cognito user in the `hospital_staff` and `admins` groups and prompt them to complete their hospital profile before accessing any other screen.
2. WHEN a hospital admin completes the hospital profile form, THE System SHALL require: hospital name in English and Thai, latitude and longitude coordinates, total bed count (integer 1–9999), NICU cot count (integer 0–999), and at least one department; THE System SHALL create a HospitalStatus record from this data and a Hospital_Profile record.
3. WHEN a hospital admin invites a staff member by email, THE System SHALL create a Cognito invitation with the `hospital_staff` group and the admin's `custom:hospitalId` pre-assigned, so that the invited staff member is scoped to the correct hospital on first sign-in.
4. WHEN a hospital admin adds a specialist to their hospital, THE System SHALL require: medical specialty, at least one spoken language, and consent to public name display (yes or no); THE System SHALL create a Specialist record linked to the hospital.
5. WHEN a specialist's availability slots are added or removed by a hospital admin, THE System SHALL update the Specialist record immediately so that patients see current availability.
6. WHEN a patient signs up with email and password, THE System SHALL create a Cognito user in the `patients` group and route them directly to the patient home screen without requiring profile completion.
7. WHEN a doctor signs up, THE System SHALL require admin approval before the account is activated; until approved, THE System SHALL display a "pending approval" screen and SHALL NOT route the user to doctor screens.
