#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
TF_DIR="${ROOT_DIR}/infra/terraform"
AWS_PROFILE_NAME="${AWS_PROFILE:-checkout-lab}"

BUCKET="$(terraform -chdir="${TF_DIR}" output -raw frontend_bucket)"
DISTRIBUTION_ID="$(
  terraform -chdir="${TF_DIR}" output -raw cloudfront_distribution_id
)"
CLOUDFRONT_URL="$(terraform -chdir="${TF_DIR}" output -raw cloudfront_url)"

VITE_API_URL="${CLOUDFRONT_URL}/api" pnpm --dir "${ROOT_DIR}/frontend" run build
aws s3 sync "${ROOT_DIR}/frontend/dist" "s3://${BUCKET}" \
  --profile "${AWS_PROFILE_NAME}" \
  --delete
aws cloudfront create-invalidation \
  --profile "${AWS_PROFILE_NAME}" \
  --distribution-id "${DISTRIBUTION_ID}" \
  --paths "/*" \
  >/dev/null

echo "Frontend publicado en ${CLOUDFRONT_URL}"
