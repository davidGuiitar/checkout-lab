variable "project_name" {
  description = "Nombre corto usado como prefijo de recursos."
  type        = string
  default     = "checkout-lab"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,30}$", var.project_name))
    error_message = "project_name debe usar minúsculas, números y guiones."
  }
}

variable "environment" {
  description = "Entorno de despliegue."
  type        = string
  default     = "prod"
}

variable "aws_region" {
  description = "Región de AWS."
  type        = string
  default     = "us-east-1"
}

variable "api_image_tag" {
  description = "Etiqueta inmutable de la imagen API publicada en ECR."
  type        = string
  default     = "latest"
}

variable "api_desired_count" {
  description = "Número de tareas API. Mantener en 0 hasta publicar imagen y secretos."
  type        = number
  default     = 0

  validation {
    condition     = var.api_desired_count >= 0 && var.api_desired_count <= 4
    error_message = "api_desired_count debe estar entre 0 y 4."
  }
}

variable "api_cpu" {
  description = "CPU de la tarea Fargate."
  type        = number
  default     = 256
}

variable "api_memory" {
  description = "Memoria en MiB de la tarea Fargate."
  type        = number
  default     = 512
}

variable "db_instance_class" {
  description = "Clase de instancia RDS."
  type        = string
  default     = "db.t4g.micro"
}

variable "db_allocated_storage" {
  description = "Almacenamiento inicial de RDS en GiB."
  type        = number
  default     = 20
}

variable "db_multi_az" {
  description = "Habilita réplica Multi-AZ de RDS."
  type        = bool
  default     = false
}

variable "enable_deletion_protection" {
  description = "Protege RDS contra eliminación accidental."
  type        = bool
  default     = true
}

variable "cloudfront_price_class" {
  description = "Clase de precio de CloudFront."
  type        = string
  default     = "PriceClass_100"
}
