---
description: Type-check, run tests and the guardrails; fix failures
---
Run from the repository root, in order:

1. `npm run typecheck`
2. `npm test`
3. `bash scripts/guard.sh`

Report each as pass or fail with the relevant output. For each failure, find the cause and fix it if it's in code this task changed; otherwise explain it and ask before changing unrelated code. Re-run the failing step until it passes. Never weaken a test or a guardrail to make it pass.
