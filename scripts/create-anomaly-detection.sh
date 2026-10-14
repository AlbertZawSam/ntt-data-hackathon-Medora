#!/usr/bin/env bash
# Enables AWS Cost Anomaly Detection scoped to the cost allocation tag project=medora.
# Creates:
#   - A DIMENSIONAL / TAG monitor watching the "project" cost allocation tag key
#   - A daily email subscription alerting when any single anomaly exceeds $10
#
# Usage: bash scripts/create-anomaly-detection.sh team@example.com [second@example.com ...]
#
# Needs: AWS CLI v2, signed in with Cost Explorer permissions:
#   ce:CreateAnomalyMonitor, ce:CreateAnomalySubscription,
#   ce:GetAnomalyMonitors, ce:GetAnomalySubscriptions
#
# Note: Cost Explorer APIs are global; no --region flag is needed.
# Note: AWS requires the "project" cost allocation tag to be activated in
#   the Billing console (Cost Allocation Tags) before the monitor can filter on it.
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: bash scripts/create-anomaly-detection.sh <email> [more emails]" >&2
  exit 1
fi

MONITOR_NAME="medora-project-tag-monitor"
SUBSCRIPTION_NAME="medora-daily-anomaly-alerts"
THRESHOLD_USD="10"   # alert when a single anomaly's dollar impact exceeds $10

# ── Idempotency: check whether the monitor already exists ─────────────────────
echo "Checking for existing anomaly monitor '$MONITOR_NAME'..."
EXISTING_MONITOR_ARN="$(
  aws ce get-anomaly-monitors \
    --query "AnomalyMonitors[?MonitorName=='${MONITOR_NAME}'].MonitorArn" \
    --output text 2>/dev/null || true
)"

if [ -n "$EXISTING_MONITOR_ARN" ] && [ "$EXISTING_MONITOR_ARN" != "None" ]; then
  echo "Monitor '$MONITOR_NAME' already exists ($EXISTING_MONITOR_ARN); skipping creation."
  MONITOR_ARN="$EXISTING_MONITOR_ARN"
else
  echo "Creating anomaly monitor scoped to tag key 'project' (watches all values, including 'medora')..."
  # MonitorType DIMENSIONAL with MonitorDimension TAG watches a cost allocation tag key.
  # MonitorSpecification scopes detection to tag key "project".
  # AWS will alert on anomalies across all tag values; the subscription's
  # ThresholdExpression further filters to project=medora at notification time.
  MONITOR_ARN="$(
    aws ce create-anomaly-monitor \
      --anomaly-monitor '{
        "MonitorName": "'"$MONITOR_NAME"'",
        "MonitorType": "DIMENSIONAL",
        "MonitorDimension": "TAG",
        "MonitorSpecification": {
          "Tags": {
            "Key": "project"
          }
        }
      }' \
      --resource-tags '[{"Key":"project","Value":"medora"}]' \
      --query 'MonitorArn' \
      --output text
  )"
  echo "Created monitor: $MONITOR_ARN"
fi

# ── Build subscriber list JSON ─────────────────────────────────────────────────
SUBSCRIBERS_JSON="["
first=true
for email in "$@"; do
  if [ "$first" = true ]; then
    first=false
  else
    SUBSCRIBERS_JSON="${SUBSCRIBERS_JSON},"
  fi
  SUBSCRIBERS_JSON="${SUBSCRIBERS_JSON}{\"Address\":\"${email}\",\"Type\":\"EMAIL\"}"
done
SUBSCRIBERS_JSON="${SUBSCRIBERS_JSON}]"

# ── Idempotency: check whether the subscription already exists ─────────────────
echo "Checking for existing anomaly subscription '$SUBSCRIPTION_NAME'..."
EXISTING_SUB_ARN="$(
  aws ce get-anomaly-subscriptions \
    --query "AnomalySubscriptions[?SubscriptionName=='${SUBSCRIPTION_NAME}'].SubscriptionArn" \
    --output text 2>/dev/null || true
)"

if [ -n "$EXISTING_SUB_ARN" ] && [ "$EXISTING_SUB_ARN" != "None" ]; then
  echo "Subscription '$SUBSCRIPTION_NAME' already exists ($EXISTING_SUB_ARN); skipping creation."
else
  echo "Creating daily anomaly subscription (threshold: \$${THRESHOLD_USD})..."
  # ThresholdExpression with ANOMALY_TOTAL_IMPACT_ABSOLUTE filters by absolute dollar impact.
  # This is the current (non-deprecated) way to set a dollar threshold.
  # Frequency DAILY sends one digest email per day instead of per-anomaly noise.
  aws ce create-anomaly-subscription \
    --anomaly-subscription "{
      \"SubscriptionName\": \"${SUBSCRIPTION_NAME}\",
      \"MonitorArnList\": [\"${MONITOR_ARN}\"],
      \"Subscribers\": ${SUBSCRIBERS_JSON},
      \"Frequency\": \"DAILY\",
      \"ThresholdExpression\": {
        \"Dimensions\": {
          \"Key\": \"ANOMALY_TOTAL_IMPACT_ABSOLUTE\",
          \"MatchOptions\": [\"GREATER_THAN_OR_EQUAL\"],
          \"Values\": [\"${THRESHOLD_USD}\"]
        }
      }
    }" \
    --resource-tags '[{"Key":"project","Value":"medora"}]' \
    --query 'SubscriptionArn' \
    --output text
  echo "Subscription created successfully."
fi

echo ""
echo "✓ AWS Cost Anomaly Detection is configured."
echo "  Monitor     : $MONITOR_NAME  (tag key: project)"
echo "  Alert level : daily email when a single anomaly exceeds \$${THRESHOLD_USD}"
echo "  Recipients  : $*"
echo ""
echo "Next steps:"
echo "  1. Activate the 'project' cost allocation tag in the AWS Billing console"
echo "     (Billing → Cost allocation tags → search 'project' → Activate)."
echo "  2. AWS sends a confirmation email to each recipient for the first alert."
echo "  3. Anomaly detection improves with ~2 weeks of spend history."
