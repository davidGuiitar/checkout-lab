output "cloudfront_url" {
  description = "URL HTTPS pública de la aplicación."
  value       = "https://${aws_cloudfront_distribution.frontend.domain_name}"
}

output "cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.frontend.id
}

output "frontend_bucket" {
  value = aws_s3_bucket.frontend.id
}

output "ecr_repository_url" {
  value = aws_ecr_repository.api.repository_url
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.main.name
}

output "ecs_service_name" {
  value = aws_ecs_service.api.name
}

output "ecs_task_definition_arn" {
  value = aws_ecs_task_definition.api.arn
}

output "ecs_private_subnet_ids" {
  value = aws_subnet.private[*].id
}

output "ecs_security_group_id" {
  value = aws_security_group.ecs.id
}

output "application_secret_arn" {
  value = aws_secretsmanager_secret.application.arn
}

output "rds_master_secret_arn" {
  value     = aws_db_instance.main.master_user_secret[0].secret_arn
  sensitive = true
}

output "rds_endpoint" {
  value = aws_db_instance.main.address
}
