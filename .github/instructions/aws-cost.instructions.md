---
applyTo: "backend/amplify/**,scripts/**,**/*.yml,**/*.yaml,**/cdk*.ts"
---
# AWS cost rules for backend and infrastructure files ($350 strict cap)

When editing anything that defines or changes AWS resources:

## Do
- **Region:** everything in `us-east-1` (`npm run sandbox` sets it). Never write another region; only `us-east-1`, `ap-southeast-1`, `ap-southeast-7` are allowed by the organizers.
- **Serverless first:** Lambda (Arm), S3, DynamoDB with on-demand billing (`PAY_PER_REQUEST`), AppSync, Step Functions **Standard** (task-token waits cost nothing while waiting), EventBridge Scheduler, Bedrock. Fargate only with explicit approval and scale to zero.
- **Minimal sizing:** Lambda `memoryMB` 256 to 512 and the shortest workable `timeoutSeconds`; CloudWatch log retention 7 days; X-Ray sampling, not full tracing.
- **Tags:** every resource carries `project=medora` and `stage` (`dev` or `demo`); `backend/amplify/backend.ts` tags the whole app, so new resources inherit it.
- **Bedrock:** Amazon Nova and Titan only, direct model IDs from `MODEL_ID_FAST` (Nova Lite, default), `MODEL_ID_STRONG` (Nova Pro, final evaluation and demo only), `EMBEDDING_MODEL_ID` (Titan V2); cap `maxTokens`; at most 8 turns per agent run; a daily run limit per user.
- **Knowledge base:** Amazon S3 Vectors as the vector store, no chunking.

## Never
- EC2 or RDS or Aurora instances, GPU instances, SageMaker endpoints or notebooks.
- NAT gateways, VPCs for Lambda, Multi-AZ, Elastic IPs, load balancers.
- OpenSearch Serverless, provisioned concurrency, Bedrock provisioned throughput, QuickSight.
- Third-party model IDs or cross-region inference profiles (`us.`, `eu.`, `apac.`, `global.`).
- Changes to IAM beyond least-privilege permissions for a function's own needs; changes to budgets or billing.

## Every change
- Say in your reply what the change costs while idle and per use.
- Anything billed hourly while idle: stop and ask the team lead first.
- Never run `delete`, `terminate` or `remove` commands; write them out for a human.
