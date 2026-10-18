## What changed

Task from `docs/specs/tasks.md`: <!-- e.g. 7.2 (P0) -->
Root cause served: <!-- RC1 readiness / RC2 distance only / RC3 guessing or phoning / RC4 language and specialists -->
App: <!-- Medora / Medora for Hospitals / backend -->

## How to check it

<!-- Roles to sign in as, steps to follow -->

## Checklist

**Cost ($350 cap, AGENTS.md section 5)**
- [ ] No new AWS resource, or its idle and per-use cost is stated here: <!-- e.g. Lambda, pay per request, $0 idle -->
- [ ] Nothing billed hourly while idle (EC2, RDS, NAT gateway, load balancer, OpenSearch, GPU)
- [ ] New resources tagged `project=medora` and `stage`
- [ ] Smallest sizing that works (Lambda ≤ 512 MB unless explained)

**Models and region (AGENTS.md section 4a)**
- [ ] Everything in us-east-1
- [ ] Only Amazon Nova and Titan, direct model IDs from `MODEL_ID_*` / `EMBEDDING_MODEL_ID`

**Safety (AGENTS.md section 4)**
- [ ] Emergency check still runs on the phone and in the safety-gate Lambda before any AI call
- [ ] No agent tool approves transfers, decides emergencies or edits hospital status
- [ ] No diagnosis or treatment wording; user text kept as data in prompts; synthetic data only

**Security (AGENTS.md sections 4b and 4c, docs/roles.md)**
- [ ] Role rights enforced on the server (AppSync rules or Lambda checks), not only in screens
- [ ] Bedrock IAM names ARNs; Lambdas log IDs and statuses only
- [ ] `roles-security-reviewer` (Claude Code) or `/safety-review` run for sign-in, role, AppSync or IAM changes

**Quality**
- [ ] `npm run typecheck`, `npm test` and `bash scripts/guard.sh` pass
- [ ] English and Thai strings added
- [ ] Acceptance criteria of the linked requirements met
