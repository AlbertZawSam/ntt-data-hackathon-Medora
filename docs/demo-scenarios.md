# Demo scenarios (synthetic data)

The demo hospitals and specialists come from the team's data set (18 Nov 2026): 10 made-up Bangkok hospitals in `shared/data/hospitals.json` and 48 made-up specialists with weekly clinic hours in `shared/logic/demoSpecialists.ts`. Every name, place and number is made up. `npm run seed` loads them and removes the 8 earlier demo hospitals.

Expected results below come from the app's own ranking and referral logic (`shared/logic/ranking.ts`, `referral.ts`, `demoReplies.ts`), with its built-in drive-time estimate for an ambulance at 14:00 on 20 Nov 2026 (rush hour where stated). The deployed app uses Amazon Location routes when they are available, so the minutes on stage can differ slightly; the eligible hospitals don't.

## Hospitals at a glance

| Hospital | Departments | Key equipment | Demo behaviour |
|---|---|---|---|
| Krungthep Central Medical Centre | All six | CT, MRI, cath lab | Real staff accounts; every referral and department request waits for a person. Longest wait (45 min). |
| Sathorn Heart Institute | Emergency, cardiology | CT, cath lab | Nearest to Siam. Cath lab busy, free in about 20 minutes: the demo reply says so and the agent checks it against the window. |
| Phra Nakhon Women and Children's Hospital | Emergency, paediatrics, obstetrics | (no CT) | Largest NICU; accepts preterm labour, children and pregnancy automatically. |
| Bang Kapi Trauma and Orthopaedic Hospital | Emergency, orthopaedics | CT, MRI | Accepts walk-in injuries automatically. |
| Ratchada Neuroscience Hospital | Emergency, neurology | CT, MRI | Stroke centre; accepts a stroke referral by demo reply after 8 seconds. |
| Sukhumvit International Hospital | All but neurology | CT, MRI (no cath lab) | Real staff accounts; English-speaking specialists. Best place to start the doctor demo. |
| Thong Lo Children's Hospital | Emergency, paediatrics | | 2 free beds: one accepted request makes it "limited". Demo reply declines referrals (no bed). |
| Bang Khae Maternity Hospital | Obstetrics only | | No emergency department: never shown for injuries or urgent care. |
| Min Buri General Hospital | Emergency, cardiology, orthopaedics, obstetrics | CT (no cath lab, no NICU) | Real staff accounts; far east, so it shows when distance beats the treatment window. Ultrasound down. |
| Nonthaburi Community Hospital | Emergency, paediatrics, orthopaedics | | Children's ward diverting, no paediatrician; status 48 minutes old ("may be outdated"). Demo reply declines referrals (busy). |

## Doctor referrals (AI agent)

Sign in as `doctor.sukhumvit@medora.demo` for the main demo (no second person needed), or `doctor.minburi@medora.demo` for the distance story.

| ID | Case | Change before the run | Expected result | Shows |
|---|---|---|---|---|
| R01 | Stroke from Sukhumvit, 40 min after onset | none | **Ratchada Neuroscience** accepts in about 8 s; Krungthep is asked too and waits for its staff | The agent filters out hospitals without neurology, CT or a neurologist and asks two at once. |
| R02 | Stroke from Sukhumvit, 215 min (55 min left) | none | **Ratchada** (Krungthep also fits) | The treatment window: drive plus preparation must fit what is left; far hospitals are "too far". |
| R03 | Stroke from Min Buri, 215 min, rush hour | none | **No placement** | Distance beats the window: an honest "no placement" instead of a guess. |
| R04 | Stroke from Sukhumvit, Ratchada's CT down | Ratchada radiology: CT down | **Krungthep** only, waiting for its staff | One status switch by one unit changes the answer at once. |
| R05 | Stroke from Sukhumvit, both CTs down | CT down at Ratchada and Krungthep | **No placement** | No capable hospital: the agent says so. |
| R06 | Heart attack from Sukhumvit, 30 min | none | **Sathorn Heart** accepts: cath lab free in about 20 min, still inside the 90 minutes left | The agent weighs a stated delay against the window; the rules alone cannot. |
| R07 | Heart attack from Min Buri, 30 min | none | **Krungthep**, once its cardiology staff accept (Sathorn's 20-minute delay makes it too late) | A stated delay rules out a hospital that accepted; the choice waits for a human answer. |
| R08 | Heart attack from Min Buri, 80 min (40 min left) | none | **No placement** | Rural reality: the drive alone exceeds the window. |
| R09 | Preterm labour from Sukhumvit | none | **Phra Nakhon** accepts by rule; Krungthep waits for staff | NICU cots and an obstetrician on duty are hard requirements. |
| R10 | Preterm labour from Min Buri | none | First round Sukhumvit and Krungthep (staff); with nobody answering, the second round reaches **Phra Nakhon**, which accepts by rule | Two rounds of asking; nothing waits on a phone call. |
| R11 | Preterm labour from Min Buri, night, no obstetrician anywhere | Obstetrician off at Phra Nakhon, Krungthep, Sukhumvit and Bang Khae | **No placement** | Night staffing gap. |
| R12 | Child admission from Sukhumvit | none | Thong Lo declines (no bed); the second round asks **Krungthep**, which waits for its paediatric staff | A decline is shown with its reason and the agent moves on to the next hospital. |
| R13 | Stroke from Sukhumvit, surge | Beds 0 at Ratchada and Krungthep | **No placement** | Bed counts are a hard requirement. |
| R14 | Stroke from Sukhumvit, beds held | Ratchada: 6 reserved beds | **Krungthep** only | Beds held for accepted patients count as taken, so two referrals never get the same bed. |

## Patients (Find care), from the default location (Siam)

| ID | The patient types | Expected result | Shows |
|---|---|---|---|
| P01 | "My 5-year-old has a high fever" (child) | Sukhumvit, then Krungthep; **Sathorn is shown as closer but can't help (no children's care)** | Find care skips the nearest hospital when it can't treat the need. |
| P02 | "I'm 30 weeks pregnant with pain" (pregnancy) | Sukhumvit first; Sathorn skipped as closer; Bang Khae listed | A maternity-only hospital without an emergency department still helps with pregnancy. |
| P03 | "I twisted my ankle" (injury) | Sathorn nearest; Bang Kapi accepts injuries automatically | Auto-accept by the hospital's rule, undoable for 60 seconds by staff. |
| P04 | Search "Nonthaburi" as the location, then a child | Nonthaburi's children's ward is diverting, so it's skipped; its status shows "may be outdated" | Diverting departments and data freshness. |
| P05 | "Chest pain and can't breathe" | **Call 1669** before anything is sent | Emergency red flags are fixed rules, never the AI. |
| P06 | Find a specialist: "heart", English | Sathorn and Krungthep cardiologists with weekly hours, for example "Monday 09:00–12:00" | Weekly clinic hours instead of a list of dates. |
