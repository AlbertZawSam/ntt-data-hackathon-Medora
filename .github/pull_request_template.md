## What changed

Task from `docs/specs/tasks.md`: <!-- e.g. 10.2 -->

## Checklist

**Cost ($350 cap, AGENTS.md section 5)**
- [ ] No new AWS resource, or its idle and per-use cost is stated here: <!-- e.g. Lambda, pay per request, $0 idle -->
- [ ] Nothing billed hourly while idle (EC2, RDS, NAT gateway, load balancer, OpenSearch, GPU)
- [ ] New resources tagged `project=medora` and `stage`
- [ ] Smallest sizing that works (Lambda ≤ 512 MB unless explained)

**Safety (AGENTS.md section 4)**
- [ ] Emergency check still runs before any AI call
- [ ] No agent tool approves transfers, decides emergencies or edits hospital status
- [ ] No diagnosis or treatment wording; user text kept as data in prompts

**Quality**
- [ ] `npx tsc --noEmit` and tests pass
- [ ] English and Thai strings added
- [ ] Acceptance criteria of the linked requirements met
