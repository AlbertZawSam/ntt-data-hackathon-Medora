---
applyTo: "backend/amplify/**,frontend/src/services/**,frontend/src/state/**,frontend/app/**,shared/**"
---
# Live, real-time data (AGENTS.md rule 8 and section 7a)

- The backend starts empty. Every hospital, status, specialist, request, message, referral, trace step and transfer is created by a signed-in user, or by a Lambda acting on a user's action.
- Never add: seed scripts or migrations that insert records, prepared hospital JSON, accounts created in the AWS console or by script, sample hospitals shown when a list is empty, "reset demo" actions, or code that replies, accepts, declines or changes status on a hospital's behalf (only the admin's auto-accept rules may accept, and staff can undo for 60 seconds).
- The only bundled data is the rules in `shared/data/` (`pathways.json`, `red_flags.json`).
- Reads of changing data go through live subscriptions (`observeQuery`) in `frontend/src/services/data.ts`, exposed by `AppProvider`; updates must reach other phones within 2 seconds.
- Writes go through typed helpers in `frontend/src/services/`. Status writes set `updatedAt`; safety checks, requests, replies, messages and confirmations also write an `Activity` entry with English and Thai text.
- Show freshness: status older than 30 minutes is labelled "may be outdated" and ranks lower. Only staff confirming "Still correct?" refreshes the timestamp.
- Auto-accept, ranking and agent tools read current records at decision time; never cache hospital status between decisions.
- Empty results are a real state: say "no registered hospital can help right now" and show Call 1669.
- The transfer's ambulance position is the one simulated value (no ambulance service is connected) and is labelled "Simulated" on screen. Arrival is confirmed by the receiving hospital's staff.
- Tests make up the records they need inside the test; agent evaluations register hospitals through the real onboarding flow in a personal sandbox and delete them afterwards.
