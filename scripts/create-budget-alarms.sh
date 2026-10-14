#!/usr/bin/env bash
# Creates the Medora AWS budget with team alarms BELOW the $350 cap, for an early buffer.
# Alarms: actual spend reaches $100, $200, $280 and $320; forecast spend reaches $350.
# Usage: bash scripts/create-budget-alarms.sh team@example.com [second@example.com ...]
# Needs: AWS CLI v2, signed in with permission to manage AWS Budgets (team lead).
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: bash scripts/create-budget-alarms.sh <email> [more emails]" >&2
  exit 1
fi

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
BUDGET_NAME="medora-350-cap"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# Budget: $350 per month for the account. (AWS Budgets resets monthly; if the project
# spans several months, lower the alarm amounts so the TOTAL stays under $350.)
cat > "$WORK/budget.json" <<JSON
{
  "BudgetName": "$BUDGET_NAME",
  "BudgetLimit": { "Amount": "350", "Unit": "USD" },
  "TimeUnit": "MONTHLY",
  "BudgetType": "COST"
}
JSON

SUBSCRIBERS=""
for email in "$@"; do
  SUBSCRIBERS="$SUBSCRIBERS{\"SubscriptionType\":\"EMAIL\",\"Address\":\"$email\"},"
done
SUBSCRIBERS="[${SUBSCRIBERS%,}]"

alarm() { # $1 = ACTUAL or FORECASTED, $2 = dollar threshold
  echo "{\"Notification\":{\"NotificationType\":\"$1\",\"ComparisonOperator\":\"GREATER_THAN\",\"Threshold\":$2,\"ThresholdType\":\"ABSOLUTE_VALUE\"},\"Subscribers\":$SUBSCRIBERS}"
}
cat > "$WORK/notifications.json" <<JSON
[
  $(alarm ACTUAL 100),
  $(alarm ACTUAL 200),
  $(alarm ACTUAL 280),
  $(alarm ACTUAL 320),
  $(alarm FORECASTED 350)
]
JSON

if aws budgets describe-budget --account-id "$ACCOUNT_ID" --budget-name "$BUDGET_NAME" >/dev/null 2>&1; then
  echo "Budget $BUDGET_NAME already exists; leaving it unchanged. Edit alarms in the AWS Budgets console."
  exit 0
fi

aws budgets create-budget \
  --account-id "$ACCOUNT_ID" \
  --budget "file://$WORK/budget.json" \
  --notifications-with-subscribers "file://$WORK/notifications.json"

echo "Created budget $BUDGET_NAME with alarms at \$100, \$200, \$280, \$320 (actual) and \$350 (forecast)."
echo "Each subscriber receives a confirmation email from AWS for the first alert."
