---
applyTo: "backend/amplify/**,frontend/app/**,frontend/src/services/**,frontend/src/state/**,scripts/**"
---
# Security rules (AGENTS.md section 4b, docs/roles.md)

- **Two Cognito pools.** Patients sign up in the public pool (email). Hospital accounts exist only in the staff pool, created by an admin through the `invite-staff` Lambda, with TOTP MFA required (`Mfa.REQUIRED`, `otp: true`, `sms: false`).
- **Roles:** groups `admins`, `hospital_staff`, `doctors`; attributes `custom:hospitalId` and `custom:unit` (`ward`, `icu`, `nicu`, `er`, `radiology`, `cathlab`, the departments `cardiology`, `surgery`, `obstetrics`, or `all` as the demo fallback) are writable only by admins, never by the user.
- **Enforce on the server.** AppSync rules and Lambda checks, never only hidden screens:
  - `StatusItem` writes go through `validateStatusUpdate`: caller in `hospital_staff`, same `custom:hospitalId`, `custom:unit` equals the item's `ownerUnit` (or `all`), conditional write on `ownerUnit` and `version`.
  - `CareRequest` accept, decline, undo: `hospital_staff` of that hospital. `Referral` create: `doctors`; confirm only by its owner.
  - `Hospital`, `Specialist`, `ClinicSlot`, auto-accept rules, unit ownership: `admins` of that hospital.
  - Patients read only `PublicDirectory`, specialists, slots and their own requests and messages. The patient app contains no hospital screens.
- **IAM:** one role per Lambda with only what it needs; Bedrock actions name the model, inference profile and knowledge base ARNs, never `*`.
- **Encryption:** AWS-managed KMS keys at rest; TLS only; S3 Block Public Access on and a TLS-only bucket policy.
- **Logging:** log IDs and statuses only, never descriptions, notes, messages, names or phone numbers; CloudWatch Logs data protection policy on Lambda log groups; Bedrock model invocation logging stays off.
- **Secrets:** never commit AWS keys, `.env`, `google-services.json` or `frontend/amplify_outputs.json`.
- After changing sign-in, roles, AppSync rules, IAM or Lambda permissions, run the `roles-security-reviewer` agent (Claude Code) or `/safety-review` (Copilot).
