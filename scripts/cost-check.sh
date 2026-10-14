#!/usr/bin/env bash
# Read-only check for idle or orphaned AWS resources that break Medora's cost strategy.
# It never changes or deletes anything: it lists findings for a human to act on.
# Usage: bash scripts/cost-check.sh            (uses AWS_REGION or the CLI default region)
set -uo pipefail

REGION="${AWS_REGION:-$(aws configure get region 2>/dev/null)}"
REGION="${REGION:-ap-southeast-1}"
FOUND=0

section() { printf '\n== %s ==\n' "$1"; }
report() { # $1 = label, $2 = command output (empty means nothing found)
  if [ -n "$2" ] && [ "$2" != "None" ]; then
    printf 'FOUND  %s\n%s\n' "$1" "$2"; FOUND=$((FOUND + 1))
  else
    printf 'ok     %s\n' "$1"
  fi
}
run() { aws --region "$REGION" "$@" --output text 2>/dev/null; }

echo "Medora cost check in $REGION (read-only)"

section "AVOID: overnight idle instances"
report "Running EC2 instances" "$(run ec2 describe-instances --filters Name=instance-state-name,Values=running,stopped --query 'Reservations[].Instances[].[InstanceId,InstanceType,State.Name]')"
report "RDS or Aurora instances" "$(run rds describe-db-instances --query 'DBInstances[].[DBInstanceIdentifier,DBInstanceClass,DBInstanceStatus,MultiAZ]')"
report "Aurora clusters" "$(run rds describe-db-clusters --query 'DBClusters[].[DBClusterIdentifier,Status]')"

section "AVOID: oversized GPUs and ML instances"
report "SageMaker endpoints" "$(run sagemaker list-endpoints --query 'Endpoints[].[EndpointName,EndpointStatus]')"
report "SageMaker notebook instances in service" "$(run sagemaker list-notebook-instances --status-equals InService --query 'NotebookInstances[].[NotebookInstanceName,InstanceType]')"
report "Bedrock provisioned throughput" "$(run bedrock list-provisioned-model-throughputs --query 'provisionedModelSummaries[].[provisionedModelName,status]')"

section "AVOID: expensive network infrastructure"
report "NAT gateways" "$(run ec2 describe-nat-gateways --filter Name=state,Values=available,pending --query 'NatGateways[].[NatGatewayId,VpcId]')"
report "Elastic IPs (charged when allocated)" "$(run ec2 describe-addresses --query 'Addresses[].[PublicIp,AllocationId,AssociationId]')"
report "Load balancers" "$(run elbv2 describe-load-balancers --query 'LoadBalancers[].[LoadBalancerName,Type,State.Code]')"
report "Lambda functions attached to a VPC" "$(run lambda list-functions --query 'Functions[?VpcConfig.VpcId!=`null` && VpcConfig.VpcId!=``].[FunctionName]')"

section "AVOID: orphaned assets"
report "Unattached EBS volumes" "$(run ec2 describe-volumes --filters Name=status,Values=available --query 'Volumes[].[VolumeId,Size,CreateTime]')"
report "EBS snapshots owned by this account" "$(run ec2 describe-snapshots --owner-ids self --query 'Snapshots[].[SnapshotId,VolumeSize,StartTime]')"
report "OpenSearch Serverless collections" "$(run opensearchserverless list-collections --query 'collectionSummaries[].[name,status]')"
report "WAF web ACLs (regional)" "$(run wafv2 list-web-acls --scope REGIONAL --query 'WebACLs[].[Name]')"

section "Review: Medora's own resources"
report "Lambda functions with more than 512 MB memory" "$(run lambda list-functions --query 'Functions[?MemorySize>`512`].[FunctionName,MemorySize]')"
report "Log groups without a retention limit" "$(run logs describe-log-groups --query 'logGroups[?!retentionInDays].[logGroupName]')"
report "DynamoDB tables (check they use on-demand billing)" "$(for t in $(run dynamodb list-tables --query 'TableNames[]'); do mode=$(run dynamodb describe-table --table-name "$t" --query 'Table.BillingModeSummary.BillingMode'); [ "$mode" != "PAY_PER_REQUEST" ] && echo "$t $mode"; done)"
report "CloudFormation stacks (are old sandboxes still deployed?)" "$(run cloudformation list-stacks --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE --query 'StackSummaries[?contains(StackName, `sandbox`)].[StackName,LastUpdatedTime]')"

section "Spend so far this month"
START="$(date -u +%Y-%m-01)"; END="$(date -u -d '+1 day' +%Y-%m-%d 2>/dev/null || date -u -v+1d +%Y-%m-%d)"
aws ce get-cost-and-usage --time-period "Start=$START,End=$END" --granularity MONTHLY --metrics UnblendedCost \
  --query 'ResultsByTime[0].Total.UnblendedCost.[Amount,Unit]' --output text 2>/dev/null || echo "(Cost Explorer not available to this user)"

printf '\n%s finding(s). Nothing was changed. Delete or stop what you don'"'"'t need, or ask the team lead.\n' "$FOUND"
echo "Reminder: run 'npx ampx sandbox delete' at the end of the day."
