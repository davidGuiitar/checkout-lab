#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TF_DIR="$(cd "${SCRIPT_DIR}/../terraform" && pwd)"
AWS_PROFILE_NAME="${AWS_PROFILE:-checkout-lab}"
AWS_REGION_NAME="${AWS_REGION:-us-east-1}"

CLUSTER="$(terraform -chdir="${TF_DIR}" output -raw ecs_cluster_name)"
TASK_DEFINITION="$(
  terraform -chdir="${TF_DIR}" output -raw ecs_task_definition_arn
)"
SECURITY_GROUP="$(
  terraform -chdir="${TF_DIR}" output -raw ecs_security_group_id
)"
SUBNET_LIST="$(
  terraform -chdir="${TF_DIR}" output -json ecs_private_subnet_ids |
    jq -r 'join(",")'
)"

TASK_ARN="$(
  aws ecs run-task \
    --profile "${AWS_PROFILE_NAME}" \
    --region "${AWS_REGION_NAME}" \
    --cluster "${CLUSTER}" \
    --task-definition "${TASK_DEFINITION}" \
    --launch-type FARGATE \
    --network-configuration "awsvpcConfiguration={subnets=[${SUBNET_LIST}],securityGroups=[${SECURITY_GROUP}],assignPublicIp=DISABLED}" \
    --overrides '{"containerOverrides":[{"name":"api","command":["sh","-c","pnpm prisma migrate deploy && pnpm prisma db seed"]}]}' \
    --query 'tasks[0].taskArn' \
    --output text
)"

aws ecs wait tasks-stopped \
  --profile "${AWS_PROFILE_NAME}" \
  --region "${AWS_REGION_NAME}" \
  --cluster "${CLUSTER}" \
  --tasks "${TASK_ARN}"

EXIT_CODE="$(
  aws ecs describe-tasks \
    --profile "${AWS_PROFILE_NAME}" \
    --region "${AWS_REGION_NAME}" \
    --cluster "${CLUSTER}" \
    --tasks "${TASK_ARN}" \
    --query 'tasks[0].containers[0].exitCode' \
    --output text
)"

if [[ "${EXIT_CODE}" != "0" ]]; then
  echo "La tarea de migración falló con código ${EXIT_CODE}." >&2
  exit 1
fi

echo "Migraciones y seed completados."
