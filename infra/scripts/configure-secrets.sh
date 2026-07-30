#!/usr/bin/env bash
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TF_DIR="$(cd "${SCRIPT_DIR}/../terraform" && pwd)"
AWS_PROFILE_NAME="${AWS_PROFILE:-checkout-lab}"

for command_name in aws jq terraform; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Falta el comando requerido: ${command_name}" >&2
    exit 1
  fi
done

APP_SECRET_ARN="$(terraform -chdir="${TF_DIR}" output -raw application_secret_arn)"
RDS_SECRET_ARN="$(terraform -chdir="${TF_DIR}" output -raw rds_master_secret_arn)"
RDS_ENDPOINT="$(terraform -chdir="${TF_DIR}" output -raw rds_endpoint)"
RDS_SECRET_JSON="$(
  aws secretsmanager get-secret-value \
    --profile "${AWS_PROFILE_NAME}" \
    --secret-id "${RDS_SECRET_ARN}" \
    --query SecretString \
    --output text
)"

DB_USER="$(jq -r '.username' <<<"${RDS_SECRET_JSON}")"
DB_PASSWORD="$(jq -r '.password' <<<"${RDS_SECRET_JSON}")"
DB_USER_URI="$(jq -nr --arg value "${DB_USER}" '$value | @uri')"
DB_PASSWORD_URI="$(jq -nr --arg value "${DB_PASSWORD}" '$value | @uri')"
DATABASE_URL="postgresql://${DB_USER_URI}:${DB_PASSWORD_URI}@${RDS_ENDPOINT}:5432/checkout_lab?schema=public"

read -r -p "URL del API sandbox de pagos: " PAYMENT_API_URL
read -r -p "Llave pública sandbox: " PAYMENT_PUBLIC_KEY
read -r -s -p "Llave privada sandbox: " PAYMENT_PRIVATE_KEY
echo
read -r -s -p "Secreto de integridad sandbox: " PAYMENT_INTEGRITY_SECRET
echo

SECRET_JSON="$(
  jq -n \
    --arg database_url "${DATABASE_URL}" \
    --arg payment_api_url "${PAYMENT_API_URL}" \
    --arg payment_public_key "${PAYMENT_PUBLIC_KEY}" \
    --arg payment_private_key "${PAYMENT_PRIVATE_KEY}" \
    --arg payment_integrity_secret "${PAYMENT_INTEGRITY_SECRET}" \
    '{
      DATABASE_URL: $database_url,
      PAYMENT_API_URL: $payment_api_url,
      PAYMENT_PUBLIC_KEY: $payment_public_key,
      PAYMENT_PRIVATE_KEY: $payment_private_key,
      PAYMENT_INTEGRITY_SECRET: $payment_integrity_secret
    }'
)"

printf '%s' "${SECRET_JSON}" |
  aws secretsmanager put-secret-value \
    --profile "${AWS_PROFILE_NAME}" \
    --secret-id "${APP_SECRET_ARN}" \
    --secret-string file:///dev/stdin \
    >/dev/null

unset RDS_SECRET_JSON DB_PASSWORD DATABASE_URL PAYMENT_PRIVATE_KEY
unset PAYMENT_INTEGRITY_SECRET SECRET_JSON
echo "Secretos de aplicación configurados en AWS Secrets Manager."
