# Medora: instructions for Claude Code

All project rules are in AGENTS.md; follow them for every task.

@AGENTS.md

Claude Code specifics:
- If Claude Code is billed through Amazon Bedrock (`CLAUDE_CODE_USE_BEDROCK=1`), its usage counts against the team's $350 AWS budget: prefer the lighter model for routine edits and keep sessions focused on one task.
- Never run AWS commands that create, delete or modify resources without asking first; read-only commands (`describe`, `list`, `get`) are fine.
