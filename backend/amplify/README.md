# backend/amplify/

AWS Amplify Gen 2 backend (region `ap-southeast-1`). Every resource is tagged `project=medora` and `stage=dev|prod`.

| Path | What it is | Idle cost | Per use |
| --- | --- | --- | --- |
| `backend.ts` | Root definition: tags, app-client write limits | | |
| `auth/resource.ts` | Cognito user pool: email sign-up, groups `patients`, `hospital_staff`, `doctors`, `admins`; attributes `custom:role`, `custom:hospitalId`, `custom:approved`, `custom:requestedHospitalId` | $0 | Free for the first 10,000 monthly active users |
| `auth/post-confirmation/` | Lambda (256 MB, 10 s, 7-day logs) that adds a new user to the group for their sign-up role | $0 | Fractions of a cent per sign-up |

The app can write only `email`, `custom:role` and `custom:requestedHospitalId`. `custom:hospitalId` and `custom:approved` are set by the backend, so users can't approve themselves or claim a hospital.

## Deploy your personal sandbox

```bash
npm run sandbox          # from the repo root; writes frontend/amplify_outputs.json (git-ignored)
npm run sandbox:delete   # end of every working day
```

A new sandbox starts empty: sign up each role in the app (patient, hospital admin, doctor) and register hospitals there; never create users in the Cognito console or insert records by script. Deleting the sandbox deletes everything entered in it.

The app reads `frontend/amplify_outputs.json`; without it, the app still opens but sign-in is disabled. Cognito sends verification emails from its default sender, which is limited to 50 emails a day; that's enough for development.
