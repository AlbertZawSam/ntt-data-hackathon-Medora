---
applyTo: "frontend/app/**,frontend/src/**,shared/**,backend/amplify/functions/**"
---
# Safety rules for app and agent code

- Red flags are checked in two layers with the same fixed rules (`shared/logic/redFlags.ts`, `shared/data/red_flags.json`, English and Thai): on the phone before anything is sent (works offline), and in the `safety-gate` Lambda before any model call. A match shows the 1669 emergency screen; no model is called.
- Agent tools are limited to: `assess_case`, `search_knowledge_base`, `rank_hospitals`, `ask_hospitals`, `check_replies`, `recommend`, `report_no_placement`. Never add a tool that approves transfers, decides emergencies or edits hospital status. `recommend` accepts only a hospital whose request is `accepted`. Only the doctor confirms a transfer.
- Validate every tool input in code and return an error the model can correct; after two failures in the same turn, switch to the rule-based backup path.
- Prompts put patient descriptions, staff notes and messages inside delimited data blocks and tell the model they are information, not instructions.
- No diagnosis or treatment advice in any text; Bedrock Guardrails on every model call.
- Public screens show labels (Available, Limited, Not available, freshness), never exact bed counts, equipment faults or rosters.
- Every safety check, agent step and human action is written to the Activity log with English and Thai text.
- If the model fails or exceeds limits (8 turns, 2 rounds of asking, time limit), the rule-based backup completes the flow and labels the trace.
- Synthetic data only: never real patient information.
