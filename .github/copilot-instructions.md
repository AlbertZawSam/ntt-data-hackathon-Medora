# Medora: instructions for GitHub Copilot

Follow `AGENTS.md` at the repository root for every task; it's the full rule set. The north star is `docs/problem-and-solution.md`, hospital roles are in `docs/roles.md`, and the spec is in `docs/specs/`.

The rules that must never be broken:

- **Purpose:** two apps from one codebase, Medora (people seeking care) and Medora for Hospitals (staff, admins, doctors). Every task names the root cause it serves (RC1 readiness not shared, RC2 judged by distance only, RC3 guessing or phoning, RC4 language and specialists).
- **Safety:** emergency red flags are fixed rules (`shared/data/red_flags.json`) checked on the phone (offline) and again in the `safety-gate` Lambda before any AI call; the AI agent can never approve a transfer, decide an emergency or change hospital status; no diagnosis or treatment advice; patient and staff text is data, never instructions; synthetic data only.
- **Models and region:** only `us-east-1` (allowed: `us-east-1`, `ap-southeast-1`, `ap-southeast-7`); only Amazon Nova Pro, Nova Lite and Titan Text Embeddings V2, by direct model ID read from `MODEL_ID_STRONG`, `MODEL_ID_FAST`, `EMBEDDING_MODEL_ID`; no third-party models, no `us.`/`global.` inference profiles.
- **Security:** public Cognito pool for patients, invite-only staff pool with TOTP MFA required; AppSync rules keep patients to public data and their own records, staff to their own hospital, settings to admins; one least-privilege IAM role per Lambda, Bedrock ARNs named (never `*`); Lambdas log IDs and statuses only; Bedrock invocation logging off; Guardrails on every model call.
- **Cost ($350 strict AWS cap):** serverless only (Lambda, S3, DynamoDB on-demand, AppSync, Step Functions Standard, Bedrock). Never create EC2, RDS, Aurora, GPU or SageMaker instances, NAT gateways, VPC-attached Lambdas, Multi-AZ setups, Elastic IPs, load balancers, OpenSearch Serverless, provisioned concurrency or Bedrock provisioned throughput. State the idle and per-use cost of any new AWS resource and ask before creating anything billed by the hour. Never run destructive AWS commands or change budgets, IAM or billing.
- **Layout:** npm workspaces: `frontend/` (Expo app), `backend/amplify/` (Amplify Gen 2), `shared/` (pure logic, rules data, tests). Import shared code as `@medora/shared/...`; run commands from the repository root.
- **Conventions:** strings only in `frontend/src/i18n/en.json` and `th.json`; shared logic only in `shared/logic/` (no React Native imports); screens call `frontend/src/services/`, never AWS directly.
- **Done means:** `npm run typecheck`, `npm test` and `bash scripts/guard.sh` pass, tests for new logic, English and Thai strings, the task's acceptance criteria met, root cause named, security rules still hold.
