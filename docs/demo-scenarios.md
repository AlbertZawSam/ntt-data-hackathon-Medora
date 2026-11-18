# Demo scenarios (synthetic data)

The demo uses the team's data set (18 Nov 2026): 10 fictional hospitals modelled on Thai hospital tiers, 8 in Bangkok and 2 in Nan province, in `shared/data/hospitals.json`, and 199 fictional specialists with weekly clinic sessions in `shared/data/specialists.json`. Not real hospitals, people or availability. `npm run seed` loads them and removes earlier demo sets; `npm run team-logins` creates the team's 76 staff and 2 patient accounts and a local login page.

How the team file maps to the app: ready beds are the ward-owned beds, ICU beds the ICU-owned units (ICU, CCU, stroke unit), NICU cots the NICU ward; on-duty roles come from the doctors on duty now; data marked "unclear" shows as limited and ranks lower; the typical wait is chosen by hospital type. Find a specialist offers six specialties, so anaesthesia, radiology, eye, skin and similar doctors are not listed.

Expected results come from the app's own ranking and referral logic. The deployed app uses Amazon Location drive times, so minutes on stage can differ a little; the hospitals don't.

## Hospitals

| ID | Hospital | Area | Demo behaviour |
|---|---|---|---|
| H01 | Pathum Wan Medical Center | Pathum Wan | Large private hospital; data marked unclear (two ICU updates disagree), so "limited" and ranked lower. Department staff accounts answer its referrals. |
| H02 | Rama Nine Neuro and Heart Hospital | Huai Khwang | Closer for the Thonburi stroke, but its demo reply says the neurologist is free in about 40 minutes. |
| H03 | Chao Phraya Women's and Children's Hospital | Bang Rak | Accepts preterm labour and children automatically. |
| H04 | Thonburi Riverside Hospital | Thon Buri | The referring hospital: no neurology, so its doctor refers stroke patients. |
| H05 | Lat Phrao University Hospital | Lat Phrao | Neurology diverting, data over 2 hours old ("may be outdated"); its demo reply declines. |
| H06 | Asok Urgent Care Clinic | Watthana | Nearest to Siam; minor injuries only, so skipped for children and pregnancy. |
| H07 | Bang Na Heart and Stroke Institute | Bang Na | Ready now: accepts stroke and heart attack automatically. The agent's stroke recommendation. |
| H08 | Chatuchak Children's Hospital | Chatuchak | First for a child near Lat Phrao; accepts children automatically. |
| H09 | Nan Valley Provincial Hospital | Mueang Nan | Rural referral centre; accepts stroke automatically. |
| H10 | Nan Hills District Hospital | Nan province | No CT or neurologist: the 2 a.m. rural stroke story starts here. |

Patients see hospitals within 80 km of where they are, so the Nan hospitals never appear in Bangkok; doctors' referrals see every hospital.

## Doctor referrals (AI agent)

| ID | Account | Case | Expected result | Shows |
|---|---|---|---|---|
| R01 | `h04.doctor1` (Thonburi) | Stroke sample, 50 min after onset | Rama Nine and Bang Na both accept; **Bang Na** is recommended in about 22 s because care starts sooner there (34 min drive, ready now) than at Rama Nine (21 min drive plus a 40-minute neurologist delay) | The agent weighs a stated delay: soonest care, not the shortest drive. |
| R02 | `h04.doctor1` | Stroke, Bang Na's CT set to down by `radiology.bang-na` first | **Rama Nine**, with its 40-minute delay still inside the window | One unit's status switch changes the answer. |
| R03 | `h04.doctor1` | Stroke, 200 min after onset (70 min left) | **Bang Na**: Rama Nine's delay breaks the window | The time window is a hard rule. |
| R04 | `h10.doctor1` (Nan Hills) | Stroke at night | **Nan Valley** accepts by rule in about 9 s (about an hour's drive) | The rural story: one referral instead of a round of phone calls. |
| R05 | `h04.doctor1` | Heart attack | Bang Na accepts by rule; Rama Nine accepts by demo reply; Pathum Wan waits for its cardiology staff | Several hospitals asked at once. |
| R06 | `h04.doctor1` | Preterm labour | **Chao Phraya** accepts by rule (6 min away) | NICU cots and an obstetrician are hard requirements. |

## Patients

| ID | Account | Steps | Expected result | Shows |
|---|---|---|---|---|
| P01 | `patient.thai` | Location Lat Phrao, switch to Thai, type "ลูกชายอายุ 4 ขวบ มีไข้สูงตั้งแต่เมื่อวาน" | Category เด็ก (child); **Chatuchak Children's** first; request accepted automatically (ตอบรับอัตโนมัติ) | Thai understanding, live readiness, auto-accept. |
| P02 | `patient.english` | Find a Specialist → Cardiology → English | 10 English-speaking cardiologists, nearest first, with weekly hours ("Thursday 9:00 AM–12:00 PM"); tapping a day books the first free slot | Specialist search by language; weekly clinic hours. |
| P03 | any patient | Default location (Siam), "My child has a fever" | Asok Urgent Care is closest but skipped (no children's care); Chao Phraya first | Find care skips the nearest hospital when it can't treat the need. |
| P04 | any patient | Default location, "I twisted my ankle" | Asok Urgent Care first | Minor injuries go to urgent care. |
| P05 | any patient | "Chest pain and can't breathe" | **Call 1669** before anything is sent | Emergency red flags are fixed rules, never the AI. |
