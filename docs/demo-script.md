# Three-minute demo script

Devices: patient phone, hospital staff phone (Rama Nine), doctor on a laptop or third phone mirrored to the projector. Reset demo data first.

1. **Problem (20 s):** "Finding a hospital that can treat a patient right now takes phone calls and guesswork; in stroke, every minute costs brain."
2. **Patient, in Thai (40 s):** type the pregnancy example; closer hospitals without obstetrics are skipped; send a request; the hospital phone chimes; the hospital replies "Please come to the emergency entrance", shown in Thai.
3. **Safety (15 s):** type "เจ็บหน้าอกร้าวไปที่แขนซ้าย": the 1669 screen appears with no AI.
4. **Doctor and agent (60 s):** stroke example, onset 40 minutes. The trace shows the plan, the time budget, the knowledge base sources, and requests to Rama Nine and Bang Na. Bang Na accepts by rule; Rama Nine accepts but notes the neurologist is free in about 40 minutes. The agent recommends Bang Na and explains why.
5. **Human decision (15 s):** the doctor confirms; the ambulance moves on the map; the activity log shows every step.
6. **Value and cost (30 s):** time to recommendation against the phone baseline; AWS spend against the $350 budget.
