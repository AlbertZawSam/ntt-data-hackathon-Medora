#!/usr/bin/env bash
# Builds the web app and uploads it to the team's Amplify Hosting app (us-east-1), so the public demo link
# shows the current code. Uses frontend/amplify_outputs.json as it is: run `npm run use-demo` first so the
# site talks to the shared demo backend. Cost: hosting storage and traffic only (cents), nothing billed while idle.
#   npm run deploy-web
set -euo pipefail
cd "$(dirname "$0")/.."
APP_ID="${MEDORA_WEB_APP_ID:-d167bekzanqsos}"
BRANCH="${MEDORA_WEB_BRANCH:-main}"
REGION=us-east-1
OUT="$(mktemp -d)"

(cd frontend && rm -rf dist && npx expo export --platform web >/dev/null)
(cd frontend/dist && zip -qr "$OUT/site.zip" .)
DEPLOY="$(bash scripts/with-aws.sh aws amplify create-deployment --region "$REGION" --app-id "$APP_ID" --branch-name "$BRANCH" --output json)"
JOB="$(printf '%s' "$DEPLOY" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).jobId))')"
URL="$(printf '%s' "$DEPLOY" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).zipUploadUrl))')"
curl -sf -T "$OUT/site.zip" "$URL" >/dev/null
bash scripts/with-aws.sh aws amplify start-deployment --region "$REGION" --app-id "$APP_ID" --branch-name "$BRANCH" --job-id "$JOB" >/dev/null
for _ in $(seq 1 60); do
  STATUS="$(bash scripts/with-aws.sh aws amplify get-job --region "$REGION" --app-id "$APP_ID" --branch-name "$BRANCH" --job-id "$JOB" --query 'job.summary.status' --output text)"
  [ "$STATUS" = SUCCEED ] && { echo "Live: https://$BRANCH.$APP_ID.amplifyapp.com"; exit 0; }
  [ "$STATUS" = FAILED ] && { echo "Deployment failed (job $JOB)"; exit 1; }
  sleep 5
done
echo "Still deploying (job $JOB); check the Amplify console."
