#!/usr/bin/env bash
# Medora guardrails: fails if the code breaks the cost strategy or safety rules in AGENTS.md.
# Runs in GitHub Actions on every pull request, and locally: bash scripts/guard.sh
set -uo pipefail
cd "$(dirname "$0")/.."
FAIL=0
fail() { echo "::error::$1"; echo "FAIL  $1"; FAIL=1; }
pass() { echo "ok    $1"; }

# Files that define AWS resources or backend code.
INFRA_DIRS=""
for d in backend/amplify scripts infra cdk; do [ -d "$d" ] && INFRA_DIRS="$INFRA_DIRS $d"; done

check_forbidden() { # $1 = label, $2 = extended regex
  if [ -z "$INFRA_DIRS" ]; then pass "$1 (no backend code yet)"; return; fi
  hits=$(grep -rnEi --include='*.ts' --include='*.js' --include='*.mjs' --include='*.json' --include='*.yml' --include='*.yaml' \
         --exclude='guard.sh' --exclude='cost-check.sh' -e "$2" $INFRA_DIRS 2>/dev/null)
  if [ -n "$hits" ]; then fail "$1"; echo "$hits" | sed 's/^/      /'; else pass "$1"; fi
}

echo "== Cost strategy: AVOID anti-patterns =="
check_forbidden "No EC2 instances" 'ec2\.Instance\b|CfnInstance\b|new Instance\('
check_forbidden "No RDS or Aurora" 'aws-rds|DatabaseInstance|DatabaseCluster|ServerlessCluster|CfnDBInstance|CfnDBCluster'
check_forbidden "No GPU or SageMaker" 'aws-sagemaker|CfnEndpoint\b|CfnNotebookInstance|ml\.(g|p)[0-9]|InstanceType\.of\((G|P)[0-9]|\b(g4dn|g5|g6|p3|p4d|p5)\.'
check_forbidden "No NAT gateways" 'NatGateway|natGateways|CfnNatGateway'
check_forbidden "No VPC-attached Lambdas" '\bvpc\s*:|vpcSubnets|securityGroups\s*:'
check_forbidden "No Multi-AZ" 'multiAz\s*:\s*true|MultiAZ'
check_forbidden "No Elastic IPs or load balancers" 'CfnEIP|ApplicationLoadBalancer|NetworkLoadBalancer|aws-elasticloadbalancing'
check_forbidden "No OpenSearch Serverless" 'opensearchserverless|aws-opensearchservice|CfnCollection'
check_forbidden "No provisioned concurrency or throughput" 'provisionedConcurren|ProvisionedConcurrency|ProvisionedModelThroughput|provisioned-model'
check_forbidden "No QuickSight" 'aws-quicksight|quicksight:'
check_forbidden "DynamoDB on-demand only" 'BillingMode\.PROVISIONED|billingMode\s*:\s*["'"'"']?PROVISIONED'

echo "== Cost strategy: minimal sizing =="
if grep -rqE 'memoryMB' backend/amplify 2>/dev/null; then
  big=$(grep -rnE 'memoryMB\s*:\s*([0-9]+)' backend/amplify | awk -F'memoryMB' '{ if (match($2,/[0-9]+/)) { v=substr($2,RSTART,RLENGTH); if (v+0>512) print $0 } }')
  if [ -n "$big" ]; then fail "Lambda memory above 512 MB needs a recorded reason (AGENTS.md section 5)"; echo "$big" | sed 's/^/      /'; else pass "Lambda memory at or below 512 MB"; fi
else pass "Lambda memory (no functions yet)"; fi

echo "== Safety rules =="
# Shared logic runs in Lambda too, so it must not import React Native.
rn=$(grep -rnE "from ['\"](react-native|react|expo)" shared/logic 2>/dev/null)
if [ -n "$rn" ]; then fail "shared/logic must not import React Native or Expo"; echo "$rn" | sed 's/^/      /'; else pass "shared/logic has no React Native imports"; fi
if [ -d backend/amplify/functions ]; then
  bad=$(grep -rnEi '(approve_transfer|confirm_transfer|classify_emergency|set_hospital_status|update_hospital_status)' backend/amplify/functions)
  if [ -n "$bad" ]; then fail "Agent must not have tools that approve transfers, decide emergencies or edit status"; echo "$bad" | sed 's/^/      /'; else pass "No forbidden agent tools"; fi
else pass "Agent tools (no functions yet)"; fi
if python3 - <<'PY'
import json, sys
d = json.load(open("shared/data/red_flags.json"))
pats = [p.lower() for f in d["flags"] for p in f["patterns"]]
hit = lambda t: any(p in t.lower() for p in pats)
bad = [e for e in d["emergencyExamples"] if not hit(e)] + [s for s in d["safeExamples"] if hit(s)]
has_thai = any(any("\u0e00" <= ch <= "\u0e7f" for ch in p) for p in pats)
sys.exit(1 if bad or not has_thai else 0)
PY
then pass "Emergency phrases: English and Thai examples behave as expected"; else fail "Emergency phrases in shared/data/red_flags.json miss an emergency example, match a safe one, or lack Thai"; fi

echo "== Live data only (AGENTS.md rule 8) =="
seeds=$(git ls-files --cached --others --exclude-standard | grep -iE '(^|/)(seeds?|fixtures|mock-?data|sample-?data|demo-?data)(/|[._-])|(^|/)hospitals\.json$' )
if [ -n "$seeds" ]; then fail "Seed, fixture or prepared hospital data files found; data must be created in the app"; echo "$seeds" | sed 's/^/      /'; else pass "No seed or prepared hospital data files"; fi
seedcode=$(grep -rnE --include='*.ts' --include='*.tsx' --include='*.js' 'seedData|seedHospitals|resetDemo|loadFixtures|hospitals\.json' frontend/app frontend/src shared/logic backend/amplify 2>/dev/null)
if [ -n "$seedcode" ]; then fail "Code seeds or loads prepared data"; echo "$seedcode" | sed 's/^/      /'; else pass "No code that seeds or loads prepared data"; fi

echo "== Repository hygiene =="
if git ls-files | grep -q 'amplify_outputs\.json$'; then fail "amplify_outputs.json is committed; remove it (it is generated)"; else pass "amplify_outputs.json not committed"; fi
secrets=$(git grep -nE 'AKIA[0-9A-Z]{16}|aws_secret_access_key\s*=' -- ':!scripts/guard.sh' 2>/dev/null)
if [ -n "$secrets" ]; then fail "Possible AWS credentials committed"; echo "$secrets" | sed 's/^/      /'; else pass "No AWS keys in the code"; fi
for f in AGENTS.md .github/copilot-instructions.md CLAUDE.md; do [ -f "$f" ] && pass "$f present" || fail "$f missing"; done

echo
if [ "$FAIL" -ne 0 ]; then echo "Guardrails failed: see AGENTS.md sections 4 and 5."; exit 1; fi
echo "All guardrails passed."
