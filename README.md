# Checkout Lab

Aplicación de checkout para un producto, formada por una SPA en Vue 3 y una API en NestJS. El proyecto está preparado para desarrollo local con PostgreSQL y para desplegarse posteriormente en AWS.

## Arquitectura

- `frontend/`: Vue 3, Vue Router, Vuex y Jest.
- `backend/`: NestJS, Prisma, PostgreSQL, Swagger y Jest.
- `docker-compose.yml`: PostgreSQL local aislado.

La API mantiene la lógica de negocio en servicios/casos de uso y dejará los controladores como adaptadores HTTP. Los datos de tarjeta no se persisten en navegador ni backend; solo se enviará un token de pago a la API.

## Inicio local

1. Copia `.env.example` a `.env`, `frontend/.env.example` a `frontend/.env` y `backend/.env.example` a `backend/.env`.
2. Define un usuario y contraseña locales únicamente en `.env`, y usa esos mismos valores para completar `DATABASE_URL` en `backend/.env`.
3. Inicia PostgreSQL: `docker compose up -d postgres`.
4. Instala dependencias: `pnpm --dir frontend install` y `pnpm --dir backend install`.
5. Inicia la API: `pnpm --dir backend start:dev`.
6. Inicia la SPA: `pnpm --dir frontend dev`.

Swagger estará disponible en `http://localhost:3000/docs`.

## Calidad

Los comandos de validación son:

- `pnpm --dir frontend build`
- `pnpm --dir frontend test:cov`
- `pnpm --dir backend build`
- `pnpm --dir backend test:cov`

La meta de entrega es una cobertura real superior al 80% en frontend y backend. El resultado verificado se incorporará aquí al finalizar las pruebas.

## Seguridad

- Nunca confirmes archivos `.env`, claves, tokens ni datos de tarjeta.
- Usa únicamente el entorno sandbox de la pasarela.
- Producción usará un gestor de secretos; no archivos de entorno versionados.
