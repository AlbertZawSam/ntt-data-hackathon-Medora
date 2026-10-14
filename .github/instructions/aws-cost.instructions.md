---
applyTo: "amplify/**,scripts/**,**/*.yml,**/*.yaml,**/cdk*.ts"
---
# AWS cost rules for backend and infrastructure files ($350 strict cap)

When editing anything that defines or changes AWS resources:

## Do
- **Serverless first:** Lambda, S3, DynamoDB with on-demand billing (`PAY_PER_REQUEST`), AppSync or API Gateway, Bedrock. Fargate only with explicit approval and scale to zero.
- **Minimal sizing:** Lambda `memoryMB` 256 to 512 and the shortest workable `timeoutSeconds` (the agent runner is the exception: up to 300 s); CloudWatch log retention 7 days; X-Ray sampling, not full tracing.
- **Tags:** apply `project=medora` and `stage=${process.env.AWS_BRANCH ?? "dev"}` to every stack.
- **Bedrock:** read model IDs from `MODEL_ID_FAST` and `MODEL_ID_STRONG`; default to the fast model; cap `maxTokens`; at most 8 turns per agent run.
- **Knowledge base:** Amazon S3 Vectors as the vector store, no chunking.

## Never
- EC2 or RDS or Aurora instances, GPU instances, SageMaker endpoints or notebooks.
- NAT gateways, VPCs for Lambda, Multi-AZ, Elastic IPs, load balancers.
- OpenSearch Serverless, provisioned concurrency, Bedrock provisioned throughput, QuickSight.
- Changes to IAM beyond least-privilege permissions for a function's own needs; changes to budgets or billing.

## Every change
- Say in your reply what the change costs while idle and per use.
- Anything billed hourly while idle: stop and ask the team lead first.
- Never run `delete`, `terminate` or `remove` commands; write them out for a human.
