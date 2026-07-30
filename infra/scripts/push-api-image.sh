#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
TF_DIR="${ROOT_DIR}/infra/terraform"
AWS_PROFILE_NAME="${AWS_PROFILE:-checkout-lab}"
AWS_REGION_NAME="${AWS_REGION:-us-east-1}"
IMAGE_TAG="${1:-$(git -C "${ROOT_DIR}" rev-parse --short=12 HEAD)}"
REPOSITORY_URL="$(terraform -chdir="${TF_DIR}" output -raw ecr_repository_url)"
REGISTRY_HOST="${REPOSITORY_URL%%/*}"

aws ecr get-login-password \
  --profile "${AWS_PROFILE_NAME}" \
  --region "${AWS_REGION_NAME}" |
  docker login --username AWS --password-stdin "${REGISTRY_HOST}" >/dev/null

docker buildx build \
  --platform linux/amd64 \
  --tag "${REPOSITORY_URL}:${IMAGE_TAG}" \
  --push \
  "${ROOT_DIR}/backend"

echo "Imagen publicada con tag: ${IMAGE_TAG}"
echo "Actualiza api_image_tag en Terraform antes de habilitar el servicio."
