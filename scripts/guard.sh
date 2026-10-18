#!/usr/bin/env bash
# Medora guardrails: fails if the code breaks the cost strategy or safety rules in AGENTS.md.
# Runs in GitHub Actions on every pull request, and locally: bash scripts/guard.sh
# Layout: npm workspaces (frontend/, backend/amplify/, shared/), see AGENTS.md section 6.
set -uo pipefail
cd "$(dirname "$0")/.."
FAIL=0
fail() { echo "::error::$1"; echo "FAIL  $1"; FAIL=1; }
pass() { echo "ok    $1"; }

AMPLIFY=backend/amplify
RED_FLAGS=shared/data/red_flags.json

# Files that define AWS resources or backend code.
INFRA_DIRS=""
for d in "$AMPLIFY" scripts infra cdk; do [ -d "$d" ] && INFRA_DIRS="$INFRA_DIRS $d"; done

check_forbidden() { # $1 = label, $2 = extended regex
  if [ -z "$INFRA_DIRS" ]; then pass "$1 (no backend code yet)"; return; fi
  hits=$(grep -rnEi --include='*.ts' --include='*.js' --include='*.mjs' --include='*.json' --include='*.yml' --include='*.yaml' \
         --exclude='guard.sh' --exclude='cost-check.sh' --exclude-dir=node_modules --exclude-dir=.amplify -e "$2" $INFRA_DIRS 2>/dev/null)
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
if [ -d "$AMPLIFY" ]; then
  big=$(grep -rnE --exclude-dir=node_modules 'memoryMB\s*:\s*([0-9]+)' "$AMPLIFY" | awk -F'memoryMB' '{ if (match($2,/[0-9]+/)) { v=substr($2,RSTART,RLENGTH); if (v+0>512) print $0 } }')
  if [ -n "$big" ]; then fail "Lambda memory above 512 MB needs a recorded reason (AGENTS.md section 5)"; echo "$big" | sed 's/^/      /'; else pass "Lambda memory at or below 512 MB"; fi
else pass "Lambda memory (no functions yet)"; fi

echo "== Safety rules =="
if [ -d "$AMPLIFY/functions" ]; then
  bad=$(grep -rnEi --exclude-dir=node_modules '(approve_transfer|confirm_transfer|classify_emergency|set_hospital_status|update_hospital_status)' "$AMPLIFY/functions")
  if [ -n "$bad" ]; then fail "Agent must not have tools that approve transfers, decide emergencies or edit status"; echo "$bad" | sed 's/^/      /'; else pass "No forbidden agent tools"; fi
else pass "Agent tools (no functions yet)"; fi
if RED_FLAGS="$RED_FLAGS" python3 - <<'PY'
import json, os, sys
d = json.load(open(os.environ["RED_FLAGS"], encoding="utf-8"))
pats = [p.lower() for f in d["flags"] for p in f["patterns"]]
hit = lambda t: any(p in t.lower() for p in pats)
bad = [e for e in d["emergencyExamples"] if not hit(e)] + [s for s in d["safeExamples"] if hit(s)]
has_thai = any(any("฀" <= ch <= "๿" for ch in p) for p in pats)
sys.exit(1 if bad or not has_thai else 0)
PY
then pass "Emergency phrases: English and Thai examples behave as expected"; else fail "Emergency phrases in $RED_FLAGS miss an emergency example, match a safe one, or lack Thai"; fi

echo "== AI models and region (AGENTS.md section 4a) =="
if python3 - <<'PY'
import pathlib, re, sys
ALLOWED = {"us-east-1", "ap-southeast-1", "ap-southeast-7"}
roots = [p for p in ("backend/amplify", "frontend/app", "frontend/src", "shared", "scripts", "infra", ".claude")
         if pathlib.Path(p).is_dir()]
skip_dirs = {"node_modules", ".amplify", ".expo", "dist"}
files = [f for r in roots for f in pathlib.Path(r).rglob("*")
         if f.is_file() and f.suffix in {".ts", ".tsx", ".js", ".mjs", ".json", ".yml", ".yaml", ".env"}
         and not skip_dirs.intersection(f.parts) and f.name not in {"guard.sh", "cost-check.sh"}]
files += [pathlib.Path(n) for n in ("template.yaml", "samconfig.toml", ".env.example", "backend/package.json",
                                    "frontend/app.json") if pathlib.Path(n).is_file()]
problems = []
third_party = re.compile(r"\b(anthropic|cohere|meta|mistral|ai21|stability|deepseek|writer)\.[a-z0-9][a-z0-9.\-:]*", re.I)
cross_region = re.compile(r"\b(us|eu|apac|global|us-gov)\.(amazon|anthropic|meta|mistral|cohere)\.[a-z0-9]", re.I)
region = re.compile(r"\b(?:us|eu|ap|ca|sa|me|af|il|mx)-(?:east|west|north|south|central|northeast|southeast|northwest|southwest)-\d\b")
for f in files:
    for i, line in enumerate(f.read_text(errors="ignore").splitlines(), 1):
        if third_party.search(line):
            problems.append(f"{f}:{i}: third-party model ID (Marketplace is blocked); use Amazon Nova or Titan")
        if cross_region.search(line):
            problems.append(f"{f}:{i}: cross-region inference profile; use the direct model ID in us-east-1")
        for r in region.findall(line):
            if r not in ALLOWED:
                problems.append(f"{f}:{i}: region {r} is not allowed (only us-east-1, ap-southeast-1, ap-southeast-7)")
for p in problems:
    print("      " + p)
sys.exit(1 if problems else 0)
PY
then pass "Only Amazon models, direct IDs, allowed regions"; else fail "Model or region rules broken (see lines above)"; fi

echo "== Security rules (AGENTS.md section 4b) =="
if [ -d "$AMPLIFY" ]; then
  if AMPLIFY="$AMPLIFY" python3 - <<'PY'
import os, pathlib, re, sys
problems = []
files = [p for p in pathlib.Path(os.environ["AMPLIFY"]).rglob("*.ts")
         if not {"node_modules", ".amplify"}.intersection(p.parts)]
for f in files:
    src = f.read_text(errors="ignore")
    # 1. Bedrock permissions must name resources, never "*"
    for m in re.finditer(r"new\s+(?:iam\.)?PolicyStatement\s*\(\s*\{(.*?)\}\s*\)", src, re.S):
        body = m.group(1)
        if "bedrock:" in body and re.search(r"resources\s*:\s*\[\s*['\"]\*['\"]\s*\]", body):
            problems.append(f"{f}: Bedrock permission uses resources ['*']; name the model, inference profile and knowledge base ARNs")
    # 2. Bedrock model invocation logging must stay off
    if re.search(r"ModelInvocationLogging|PutModelInvocationLoggingConfiguration", src):
        problems.append(f"{f}: Bedrock model invocation logging must stay off (it would store patient text)")
    # 3. Waits with task tokens need Standard workflows
    if "waitForTaskToken" in src and re.search(r"StateMachineType\.EXPRESS|['\"]EXPRESS['\"]", src):
        problems.append(f"{f}: Express workflows can't wait with task tokens; use Step Functions Standard")
    # 4. Any Cognito user pool defined in CDK (the staff pool) must require TOTP MFA without SMS
    if re.search(r"new\s+(cognito\.)?UserPool\s*\(", src):
        if not re.search(r"Mfa\.REQUIRED", src):
            problems.append(f"{f}: staff user pool must set mfa: Mfa.REQUIRED")
        if re.search(r"sms\s*:\s*true", src):
            problems.append(f"{f}: staff MFA must use authenticator apps (otp), not SMS")
    # 5. Never log patient text
    for i, line in enumerate(src.splitlines(), 1):
        if re.search(r"console\.(log|info|warn|error|debug)\(", line) and \
           re.search(r"\b(description|patientText|note|notes|phone|patient\.name|messageText|body\.text|input\.text)\b", line):
            problems.append(f"{f}:{i}: log line may contain patient text; log IDs and statuses only")
for p in problems:
    print("      " + p)
sys.exit(1 if problems else 0)
PY
  then pass "Security rules in backend code"; else fail "Security rules broken (see lines above)"; fi
else pass "Security rules (no backend code yet)"; fi

echo "== Repository hygiene =="
committed=$(git ls-files | grep -E '(^|/)amplify_outputs\.json$')
if [ -n "$committed" ]; then fail "amplify_outputs.json is committed; remove it (it is generated): $committed"; else pass "amplify_outputs.json not committed"; fi
secrets=$(git grep -nE 'AKIA[0-9A-Z]{16}|aws_secret_access_key\s*=' -- ':!scripts/guard.sh' 2>/dev/null)
if [ -n "$secrets" ]; then fail "Possible AWS credentials committed"; echo "$secrets" | sed 's/^/      /'; else pass "No AWS keys in the code"; fi
for f in AGENTS.md .github/copilot-instructions.md CLAUDE.md docs/problem-and-solution.md docs/roles.md docs/architecture.md; do [ -f "$f" ] && pass "$f present" || fail "$f missing"; done

echo
if [ "$FAIL" -ne 0 ]; then echo "Guardrails failed: see AGENTS.md sections 4 and 5."; exit 1; fi
echo "All guardrails passed."
