---
mode: agent
description: Review the code and the AWS account for anything that breaks the $350 cost strategy
---
Check Medora against the cost-efficient architecture strategy in `AGENTS.md` section 5.

1. Search `backend/amplify/` and `scripts/` for anti-patterns: EC2, RDS, Aurora, GPU or SageMaker, NAT gateways, VPC settings on Lambda, Multi-AZ, Elastic IPs, load balancers, OpenSearch, provisioned concurrency, provisioned throughput, missing tags, Lambda memory above 512 MB without a recorded reason, log retention longer than 7 days, use of the strong model outside the demo stage, regions other than us-east-1, third-party model IDs.
2. Run `bash scripts/cost-check.sh` and summarize what it found (it only reads; it changes nothing).
3. Report a table: finding, file or resource, estimated cost impact, recommended fix. Write any delete commands out for a human to run; do not run them.
