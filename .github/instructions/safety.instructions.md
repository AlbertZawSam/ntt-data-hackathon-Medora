---
applyTo: "app/**,src/**,amplify/functions/**,data/red_flags.json"
---
# Safety rules for app and agent code

- `src/logic/redFlags.ts` runs on every patient description before any AI call, in English and Thai, and works offline. A match shows the 1669 emergency screen; no model is called.
- Agent tools are limited to: `assess_case`, `search_knowledge_base`, `ask_hospitals`, `check_replies`, `recommend`, `report_no_placement`. Never add a tool that approves transfers, decides emergencies or edits hospital status. `recommend` accepts only a hospital whose request is `accepted`.
- Prompts put patient descriptions, staff notes and messages inside delimited data blocks and tell the model they are information, not instructions.
- No diagnosis or treatment advice in any text; Bedrock Guardrails on every agent call.
- Public screens show labels (Available, Limited, Not available, freshness), never exact bed counts, equipment faults or rosters.
- Every safety check, agent step and human action is written to the Activity log with English and Thai text.
- If the model fails or exceeds limits, the rule-based backup completes the flow and labels the trace.
