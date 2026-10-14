#!/usr/bin/env bash
# Creates the Medora AWS budget with team alarms BELOW the $350 cap, for an early buffer.
#
# Alarms: actual spend reaches $100, $200, $280, $320; forecast spend reaches $350.
# Notifications go to an SNS topic; the email(s) passed as arguments are subscribed to it.
# Budgets are scoped to the tag project=medora so only Medora resources are counted.
#
# Usage: bash scripts/create-budget-alarms.sh team@example.com [second@example.com ...]
# Needs: AWS CLI v2, signed in with permission to manage AWS Budgets,
#        SNS topics (team lead or CI role).
set -euo pipefail

# ── Input validation ──────────────────────────────────────────────────────────
if [ "$#" -lt 1 ]; then
  echo "Usage: bash scripts/create-budget-alarms.sh <email> [more emails]" >&2
  exit 1
fi

REGION="${AWS_REGION:-ap-southeast-1}"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
BUDGET_NAME="medora-350-cap"
SNS_TOPIC_NAME="medora-budget-alerts"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "Account : $ACCOUNT_ID"
echo "Region  : $REGION"
echo ""

# ── SNS topic (idempotent: create-topic returns the ARN whether it exists or not) ─
echo "Step 1/4  Setting up SNS topic '$SNS_TOPIC_NAME'..."
SNS_ARN="$(aws sns create-topic \
  --name "$SNS_TOPIC_NAME" \
  --region "$REGION" \
  --tags "Key=project,Value=medora" "Key=stage,Value=dev" \
  --query 'TopicArn' \
  --output text)"
echo "          SNS topic ARN: $SNS_ARN"

# ── Email subscriptions ───────────────────────────────────────────────────────
echo ""
echo "Step 2/4  Subscribing email address(es) to the SNS topic..."
for email in "$@"; do
  # subscribe returns the subscription ARN or "pending confirmation" — both are fine
  SUB_RESULT="$(aws sns subscribe \
    --topic-arn "$SNS_ARN" \
    --protocol email \
    --notification-endpoint "$email" \
    --region "$REGION" \
    --output text 2>&1 || true)"
  echo "          $email → $SUB_RESULT"
done
echo "          Each address will receive a confirmation email from AWS SNS."
echo "          Alarm emails are only delivered after the subscriber confirms."

# ── Budget definition ─────────────────────────────────────────────────────────
echo ""
echo "Step 3/4  Creating budget '$BUDGET_NAME' (tag filter: project=medora)..."

if aws budgets describe-budget \
     --account-id "$ACCOUNT_ID" \
     --budget-name "$BUDGET_NAME" \
     >/dev/null 2>&1; then
  echo "          Budget already exists — leaving it unchanged."
  echo "          To update thresholds, edit them in the AWS Budgets console."
else
  # Budget JSON with tag-based cost filter
  cat > "$WORK/budget.json" <<JSON
{
  "BudgetName": "$BUDGET_NAME",
  "BudgetLimit": { "Amount": "350", "Unit": "USD" },
  "TimeUnit": "MONTHLY",
  "BudgetType": "COST",
  "CostFilters": {
    "TagKeyValue": ["user:project\$medora"]
  }
}
JSON

  # Notification helper: $1 = ACTUAL|FORECASTED, $2 = threshold amount
  notification() {
    cat <<JSON
{
  "Notification": {
    "NotificationType": "$1",
    "ComparisonOperator": "GREATER_THAN",
    "Threshold": $2,
    "ThresholdType": "ABSOLUTE_VALUE"
  },
  "Subscribers": [
    {
      "SubscriptionType": "SNS",
      "Address": "$SNS_ARN"
    }
  ]
}
JSON
  }

  # Five threshold notifications
  cat > "$WORK/notifications.json" <<JSON
[
  $(notification ACTUAL 100),
  $(notification ACTUAL 200),
  $(notification ACTUAL 280),
  $(notification ACTUAL 320),
  $(notification FORECASTED 350)
]
JSON

  aws budgets create-budget \
    --account-id "$ACCOUNT_ID" \
    --budget "file://$WORK/budget.json" \
    --notifications-with-subscribers "file://$WORK/notifications.json"

  echo "          Budget created with tag filter project=medora."
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "Step 4/4  Summary"
echo "┌──────────────────────────────────────────────────────────────────────┐"
echo "│  Budget   : $BUDGET_NAME (monthly, tag filter project=medora)"
echo "│  SNS topic: $SNS_ARN"
echo "│  Alarms   : \$100, \$200, \$280, \$320 actual; \$350 forecasted"
echo "│  Emails   : $*"
echo "└──────────────────────────────────────────────────────────────────────┘"
echo ""
echo "Done. Confirm the SNS subscription email before alarms can fire."
echo "Reminder: run 'npx ampx sandbox delete' at the end of every working day."
