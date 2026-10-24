#!/usr/bin/env bash
# Runs a command with the project's AWS settings, so no terminal needs `export` first:
#   bash scripts/with-aws.sh <command> [args...]
# Region is always us-east-1 (organizer rules). The `medora` SSO profile is used only when you have not chosen
# credentials yourself (AWS_PROFILE or access keys) and that profile exists in ~/.aws/config, so teammates
# with other credentials are not affected. Log in with `npm run login`.
export AWS_REGION=us-east-1
if [ -z "${AWS_PROFILE:-}" ] && [ -z "${AWS_ACCESS_KEY_ID:-}" ] && grep -q '^\[profile medora\]' "$HOME/.aws/config" 2>/dev/null; then
  export AWS_PROFILE=medora
fi
exec "$@"
