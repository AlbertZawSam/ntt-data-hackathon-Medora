# Demo scenarios (synthetic data)

The demo uses 9 fictional Bangkok hospitals in `shared/data/hospitals.json` and 169 fictional specialists with weekly clinic sessions in `shared/data/specialists.json`, based on the team's data set (18 Nov 2026). Not real hospitals, people or availability. `npm run seed` loads them and removes earlier demo sets; `npm run team-logins` creates the team's staff and patient accounts and a local login page.

**Design rule: no hospital is perfect.** Each one is strong at some cases and limited at others, so different cases go to different hospitals and the agent has to weigh replies, delays and distance. The rules (`shared/data/pathways.json`) are unchanged; the data decides who can and will help.

How the team file maps to the app: ready beds are the ward-owned beds, ICU beds the ICU-owned units (ICU, CCU, stroke unit), NICU cots the NICU ward; on-duty roles come from the doctors on duty now; data marked "unclear" shows as limited and ranks lower; the typical wait is chosen by hospital type. Find a specialist offers six specialties.

Expected results come from the app's own ranking and referral logic. The deployed app uses Amazon Location drive times, so minutes on stage can differ a little.

## Hospitals: what each one is good at, and its limit

| ID | Hospital | Area | Strong at | Limit |
|---|---|---|---|---|
| H01 | Pathum Wan Medical Center | Pathum Wan | Almost everything, including a cath lab | Data marked unclear: "limited", ranks lower; referrals wait for its department staff |
| H02 | Rama Nine Neuro and Heart Hospital | Huai Khwang | Heart attack (cath lab ready) | Stroke: neurologist in surgery, free in about 40 minutes |
| H03 | Chao Phraya Women's and Children's Hospital | Bang Rak | Pregnancy, preterm labour (NICU), children: accepts automatically | Declines adult cases: no orthopaedic surgeon, no adult general medicine |
| H04 | Thonburi Riverside Hospital | Thon Buri | The referring hospital | No neurology, no cardiology: refers stroke and heart attack out |
| H05 | Lat Phrao University Hospital | Lat Phrao | Largest teaching hospital | Neurology diverting, data over 2 hours old; declines referrals |
| H06 | Asok Urgent Care Clinic | Watthana | Minor injuries and walk-ins | No beds, no CT: declines hospital referrals |
| H07 | Bang Na Heart and Stroke Institute | Bang Na | Stroke and heart attack ready now: accepts automatically | Farther from the centre |
| H08 | Chatuchak Children's Hospital | Chatuchak | Children: first for a child near Lat Phrao, accepts automatically | Children only: declines adult referrals |
| H11 | Khlong San Bone and Trauma Hospital | Khlong San | Fractures and injuries: orthopaedic surgeons, X-ray, CT, theatres; accepts injuries automatically | Bones and injuries only: declines other referrals |

## Doctor referrals (AI agent), from Thonburi: `h04.doctor1`

Each case goes to a different hospital, for a different reason.

| ID | Case | Expected result | Shows |
|---|---|---|---|
| R01 | **Stroke** sample (50 min after onset) | **Bang Na**: Rama Nine is closer (21 vs 31 min) but its neurologist is free only in 40 minutes, so care starts sooner at Bang Na | Soonest care, not the shortest drive |
| R02 | **Heart attack** sample | **Rama Nine**: closest hospital with a cath lab ready that accepted | A different case, a different hospital |
| R03 | Type: *"Man, 35, motorbike accident, broken leg"* | **Khlong San Bone and Trauma**; Chao Phraya Women's and Children's is asked too and **declines** ("No adult orthopaedic surgeon on duty") | Hospitals decide; a decline with its reason |
| R07 | Type: *"Woman, 45, severe stomach pain since this morning"* | **Rama Nine** (internal medicine and surgery); Khlong San, Chao Phraya and Asok are asked and **decline** (outside their specialty) | Specialty hospitals say no; the agent asks the next round |
| R04 | **Preterm labour** sample | **Chao Phraya** accepts by rule (NICU cots, obstetrician on duty) | Hard requirements: NICU and obstetrician |
| R05 | Stroke, Bang Na's CT set to down first (`radiology.bang-na`) | **Rama Nine**, with its 40-minute delay still inside the window | One unit's status switch changes the answer |
| R06 | Stroke, 200 min after onset (70 min left) | **Bang Na**: Rama Nine's delay breaks the treatment window | The time window is a hard rule |

## Patients

| ID | Account | Steps | Expected result | Shows |
|---|---|---|---|---|
| P01 | `patient.thai` | Location Lat Phrao, switch to Thai, type "ลูกชายอายุ 4 ขวบ มีไข้สูงตั้งแต่เมื่อวาน" | Category เด็ก (child); **Chatuchak Children's** first; accepted automatically | Thai understanding, live readiness, auto-accept |
| P02 | `patient.english` | Find a Specialist → Cardiology → English | English-speaking cardiologists, nearest first, with weekly hours; tapping a day books the first free slot | Specialist search by language; weekly clinic hours |
| P03 | any patient | Default location (Siam), "My child has a fever" | Asok Urgent Care is closest but skipped (no children's care); **Chao Phraya** first | The nearest hospital is skipped when it can't help |
| P04 | any patient | Default location, "I twisted my ankle" | **Asok Urgent Care** first, then Khlong San Bone and Trauma | Minor injuries go to urgent care |
| P05 | any patient | "Chest pain and can't breathe" | **Call 1669** before anything is sent | Emergency red flags are fixed rules, never the AI |

Before presenting: run `npm run seed` (statuses turn "may be outdated" after about 15 to 30 minutes).
