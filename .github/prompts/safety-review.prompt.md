---
mode: agent
description: Review changed code against Medora's safety rules
---
Review the current changes (or ${input:path:a file or folder}) against `AGENTS.md` section 4 and `.github/instructions/safety.instructions.md`.

Check: red-flag rules run before any AI call and offline; no agent tool can approve transfers, decide emergencies or edit status; prompts keep user text in delimited data blocks; no diagnosis or treatment wording in English or Thai; public screens show labels only; actions are logged; the rule-based backup path still works.

Report each issue with the file, the rule it breaks and a fix. Add a test that would catch it where possible.
