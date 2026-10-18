---
mode: agent
description: Review changed code against Medora's safety and security rules
---
Review the current changes (or ${input:path:a file or folder}) against `AGENTS.md` sections 4, 4a, 4b and 4c, `docs/roles.md`, `.github/instructions/safety.instructions.md` and `.github/instructions/security.instructions.md`.

Check:
- **Safety:** red-flag rules run on the phone (offline) and in the `safety-gate` Lambda before any AI call; no agent tool can approve transfers, decide emergencies or edit status; tool inputs are validated; prompts keep user text in delimited data blocks; no diagnosis or treatment wording in English or Thai; public screens show labels only; actions are logged; the rule-based backup path still works; synthetic data only.
- **Models and region:** only Nova and Titan by direct model ID from environment variables; only us-east-1 (or the other two allowed regions); no third-party models or cross-region profiles.
- **Security:** staff accounts only in the invite-only staff pool with TOTP MFA; role rights enforced in AppSync rules or Lambda checks (unit staff only their unit's items, doctors only their own referrals, admins only their hospital); `custom:hospitalId` and `custom:unit` writable only by admins; Bedrock IAM names ARNs; logs carry IDs and statuses only.

Report each issue with the file, the rule it breaks and a fix. Add a test that would catch it where possible.
