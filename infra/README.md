# Infraestructura AWS

Terraform prepara la aplicación en `us-east-1` con:

- CloudFront HTTPS y bucket S3 privado para la SPA.
- Ruta `/api/*` de CloudFront hacia un ALB limitado a orígenes CloudFront.
- ECS Fargate en subredes privadas, ECR con escaneo y CloudWatch Logs.
- RDS PostgreSQL cifrado y privado, con contraseña administrada por AWS.
- Secrets Manager para `DATABASE_URL` y credenciales de pago.
- Una NAT Gateway para el acceso saliente de la API al sandbox y servicios AWS.

## Importante sobre costos

RDS, NAT Gateway, ALB, Fargate, CloudFront, ECR y Secrets Manager pueden generar
costos. No ejecutes `terraform apply` hasta aprobar explícitamente el gasto. El
valor predeterminado `api_desired_count = 0` evita iniciar tareas Fargate antes
de publicar la imagen y cargar los secretos, pero otros recursos sí generan
costos desde su creación.

## Autenticación segura

AWS CLI y Terraform deben estar instalados localmente. Configura un perfil SSO
dedicado sin compartir credenciales por chat:

```bash
aws configure sso --profile checkout-lab
aws sso login --profile checkout-lab
aws sts get-caller-identity --profile checkout-lab
```

El rol necesita permisos para VPC, EC2 networking, IAM, S3, CloudFront, ECR,
ECS, ELBv2, RDS, CloudWatch Logs y Secrets Manager.

## Secuencia controlada

1. Copia `terraform.tfvars.example` como `terraform.tfvars` y revisa costos,
   clase de RDS y protección contra borrado.
2. Ejecuta `terraform init`, `terraform fmt -check`, `terraform validate` y
   `terraform plan -out checkout-lab.tfplan`.
3. Tras aprobación explícita, ejecuta `terraform apply checkout-lab.tfplan`
   manteniendo `api_desired_count = 0`.
4. Carga secretos sin mostrarlos:
   `AWS_PROFILE=checkout-lab ../scripts/configure-secrets.sh`.
5. Publica la imagen:
   `AWS_PROFILE=checkout-lab ../scripts/push-api-image.sh`.
6. Actualiza `api_image_tag` con el tag mostrado y
   `api_desired_count = 1`; revisa y aplica un segundo plan.
7. Ejecuta migraciones:
   `AWS_PROFILE=checkout-lab ../scripts/run-migrations.sh`.
8. Publica la SPA:
   `AWS_PROFILE=checkout-lab ../scripts/deploy-frontend.sh`.
9. Valida la URL `cloudfront_url`, `/api/`, `/api/docs`, producto, checkout y
   pago sandbox.

Los scripts no escriben secretos en el repositorio. El script de configuración
los solicita de forma interactiva y envía el documento por entrada estándar.
