# Medora for Hospitals: roles and access rights

Three hospital roles, each a Cognito group in the **staff user pool** (invite only, authenticator-app MFA required). Patients are a fourth role in the separate Medora app and public user pool. Everything runs in **us-east-1**.

## The three hospital roles

| Role | Cognito group | Who | Scope |
| --- | --- | --- | --- |
| **Hospital admin** | `admins` | Hospital IT or operations lead | Their hospital's settings and staff |
| **Unit staff (nurse or technologist)** | `hospital_staff` | Ward nurse, ICU or NICU nurse, emergency charge nurse, radiology technologist, cath lab team | **Exactly one unit** in their hospital (`custom:unit`) |
| **Doctor** | `doctors` | Referring doctors | Their own referrals from their hospital |

Every hospital account has `custom:hospitalId` (for example `H02`). A person can belong to more than one group (for example a senior doctor who is also an admin); their rights are the union of those groups.

## Units (one per unit staff account)

`custom:unit` holds exactly one value:

| `custom:unit` | Owns these status items |
| --- | --- |
| `ward` | Ready general beds |
| `icu` | ICU beds |
| `nicu` | NICU cots |
| `er` | Emergency department open or diverting |
| `radiology` | CT, MRI (working or down) |
| `cathlab` | Cath lab (ready, busy with "free in about X minutes", or down) |

Specialist on-duty switches belong to the unit the admin assigns them to (usually `er` or the specialist's department, set in settings). Each `StatusItem` has an `ownerUnit`; only unit staff whose `custom:unit` matches can change it.

## Access matrix

| Access right | Unit staff (`hospital_staff`) | Doctor (`doctors`) | Hospital admin (`admins`) |
| --- | --- | --- | --- |
| Main screens | My unit, inbox, messages | Refer, agent trace, transfers | Settings, staff invitations, auto-accept rules |
| Update beds and equipment | **Yes, only items owned by their unit** | No | No (assigns which unit owns each item) |
| Answer patient requests and referrals | Yes: accept, decline with note, undo, message | No | No |
| Start referrals with the AI agent | No | **Yes** | No |
| Confirm or set aside a transfer | No | **Yes, only their own referrals** | No |
| See their hospital's full status | Yes | Yes | Yes |
| Change profile, departments, specialists, clinic slots | No | No | **Yes** |
| Set auto-accept rules | No | No | **Yes** |
| Invite, change or remove staff (including setting `custom:unit`) | No | No | **Yes**, only in their hospital |
| See the activity log | Their hospital | Their hospital | Their hospital |
| See other hospitals' detailed data | No | Only what the agent shows in the trace | No |
| Multi-factor authentication | Required | Required | Required |

**Fallback for the demo:** a general staff account per hospital (unit staff with `custom:unit = all`) may update every item of that hospital. Use only if unit accounts aren't set up.

## How to implement it

1. **Staff user pool** (in `backend/amplify/backend.ts`): groups `admins`, `hospital_staff`, `doctors`; custom attributes `hospitalId` and `unit` (strings), both **writable only by admins** (not by the user themselves); MFA `REQUIRED` with software tokens only.
2. **Invitations:** an `invite-staff` Lambda (called by an admin through AppSync) runs `AdminCreateUser`, `AdminAddUserToGroup` and `AdminUpdateUserAttributes` in the staff pool. It refuses to create users for another hospital than the admin's own, and refuses `custom:unit` values outside the list above.
3. **AppSync authorization:**
   - `StatusItem` updates go through the `validateStatusUpdate` Lambda, which checks the caller is in `hospital_staff`, their `custom:hospitalId` equals the item's hospital, and their `custom:unit` equals the item's `ownerUnit` (or is `all`), then writes with a DynamoDB condition on `ownerUnit` and `version`.
   - `CareRequest` accept, decline and undo: `hospital_staff` of the request's hospital.
   - `Referral` create and confirm: `doctors`; confirm only by the referral's owner.
   - `Hospital`, `Specialist`, `ClinicSlot`, auto-accept rules, unit ownership: `admins` of that hospital.
   - Reads of operational data: any of the three groups, same hospital only. Patients (public pool) read only `PublicDirectory`, specialists and slots, and their own requests and messages.
4. **App routing (Medora for Hospitals):** after sign-in, read groups, `custom:hospitalId` and `custom:unit` from the ID token; show tabs by group; the My unit screen lists only the caller's unit items.
5. **Seed and test users** (`scripts/create-test-users.mjs`), all in us-east-1:

| Email | Group | Hospital | Unit |
| --- | --- | --- | --- |
| admin.rama9@medora.demo | `admins` | H02 | |
| ward.rama9@medora.demo | `hospital_staff` | H02 | `ward` |
| radiology.rama9@medora.demo | `hospital_staff` | H02 | `radiology` |
| nicu.chaophraya@medora.demo | `hospital_staff` | H03 | `nicu` |
| er.chaophraya@medora.demo | `hospital_staff` | H03 | `er` |
| doctor.thonburi@medora.demo | `doctors` | H04 | |
| staff.bangna@medora.demo | `hospital_staff` | H07 | `all` (fallback) |

## Tests that must pass

- A `ward` nurse can change ward beds at their hospital, and is refused when changing the CT or another hospital's beds.
- A `radiology` technologist can switch the CT to down; a stroke referral then skips that hospital.
- A doctor can start and confirm their own referral, and is refused when confirming another doctor's referral or changing status items.
- An admin can invite a nurse with a unit at their hospital, and is refused for another hospital.
- A patient account can't read `StatusItem`, `Referral` or the inbox.
- Staff sign-in without an authenticator code is refused.
