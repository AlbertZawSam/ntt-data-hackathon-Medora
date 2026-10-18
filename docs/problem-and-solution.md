# Medora: problem and solution (final)

This is the north star for the build. Every feature, task and pull request must serve at least one root cause below.

## Problem statement

**One line:** In Bangkok, people don't know which hospital can actually treat their health problem right now, so patients go to the nearest hospital and may be sent on, and doctors phone hospital after hospital to place a patient.

**Full version:** Whether a hospital is the right place for a patient depends on things that change by the hour: whether the right department is open, a specialist is on duty, a key machine such as a CT scanner is working, and a bed is ready. This information exists only inside each hospital, in its systems, phone calls and chat groups.

- **For people seeking care,** that means choosing a hospital by distance or habit, with no way to know if it can help them now, which specialist to see, or whether anyone there speaks their language. Many arrive at a hospital that has to send them elsewhere, or wait at the wrong one.
- **For doctors referring patients,** it means calling hospitals one by one while time-critical conditions such as stroke and heart attack get worse.

**Why it matters**

- Patients lose time and money on wasted trips, long waits at the wrong hospital, and avoidable transfers.
- Time-critical patients lose treatment time, when every minute counts.
- Tourists and foreign residents can't judge Thai hospitals or explain their needs in Thai.
- Hospitals lose staff time to phone calls and to patients they can't treat.

## Root causes

| ID | Root cause |
| --- | --- |
| RC1 | Hospitals' real-time readiness isn't captured or shared anywhere |
| RC2 | People can only judge hospitals by distance and reputation, not by what they can treat now |
| RC3 | Finding care, by a patient or a doctor, means guessing or phoning |
| RC4 | Language and specialist information is scattered and hard to compare |

## Solution statement

**One line:** Medora matches every patient to the closest hospital that can actually treat their health problem right now: people describe their problem and get the right hospital or specialist, and doctors get an AI agent that finds and confirms a place for their patient, using live readiness shared by hospitals.

| Root cause | Medora's answer | App | Requirements |
| --- | --- | --- | --- |
| RC1 | Hospitals share live readiness in one tap: ready beds, departments open or diverting, specialists on duty, equipment working; each item has an owner, a freshness label and reminders; Medora reserves and releases beds automatically | Medora for Hospitals | 9, 11, 19 |
| RC2 | People describe the problem in Thai or English; emergencies go to 1669 by fixed rules; otherwise AI understands the need and Medora shows hospitals that can help now, skipping closer ones that can't and explaining why | Medora | 3, 4, 5 |
| RC3 | Patients send a request to the chosen hospital and message staff before arriving. Doctors use an AI referral agent on Amazon Bedrock that asks several hospitals at once, weighs replies against the time window and recommends one for the doctor to confirm | Both | 6, 7, 10, 12, 13, 21 |
| RC4 | Find a specialist nearest to the user, filtered by the language the doctor speaks, with instant booking of published clinic slots | Medora | 2, 8 |

**Value for each group**

- **People seeking care:** the right hospital or specialist, faster, in their language, free.
- **Doctors:** a placement without a round of phone calls, with the decision still theirs.
- **Hospitals:** the right patients arrive, fewer calls, and their own rules for what they accept.

**What makes it trustworthy:** emergencies go to 1669 by fixed rules before any AI; Medora never diagnoses; hospitals set their own acceptance rules; doctors confirm every transfer; every step is logged; staff accounts require multi-factor authentication.

## How success is measured (requirement 20)

| Side | Metric | Target | Source |
| --- | --- | --- | --- |
| People seeking care | Requests accepted by a hospital that can treat the need (fewer redirections) | Higher than the baseline from interviews | Request outcomes in the activity log |
| People seeking care | Time from describing the problem to an accepted request | Under 3 minutes | Activity log timestamps |
| Doctors | Time from referral start to the agent's recommendation | Under 5 minutes | Referral timestamps |
| Doctors | Time-critical placements inside the treatment window | All, where a reachable hospital exists | Onset time plus drive time |
| Hospitals | Status items updated within 30 minutes | Over 90% | Freshness of status items |

Baselines come from 3 to 5 clinician interviews and a few people who recently looked for a hospital in Bangkok (ideally including one foreign resident). Never present a baseline that hasn't been measured.

## Pitch

> "When you're sick in Bangkok, you go to the hospital you know, not the one that can treat you right now. When a doctor needs to move a stroke patient, they phone hospital after hospital. Medora fixes both, by making every hospital's real-time readiness visible and letting AI do the matching."

**ภาษาไทย**

> **ปัญหา:** ผู้คนไม่รู้ว่าโรงพยาบาลไหนรักษาปัญหาสุขภาพของตนได้จริงในตอนนี้ ผู้ป่วยจึงไปโรงพยาบาลที่ใกล้ที่สุดและอาจถูกส่งต่อ ส่วนแพทย์ต้องโทรหาโรงพยาบาลทีละแห่งเพื่อส่งตัวผู้ป่วย
>
> **ทางออก:** เมดอร่าจับคู่ผู้ป่วยทุกคนกับโรงพยาบาลที่ใกล้และรักษาได้จริงในตอนนี้ ผู้ใช้บอกอาการแล้วได้โรงพยาบาลหรือแพทย์เฉพาะทางที่เหมาะสม และแพทย์มีเอเจนต์ AI ช่วยค้นหาและยืนยันที่รับผู้ป่วย โดยใช้ข้อมูลความพร้อมแบบเรียลไทม์จากโรงพยาบาล
