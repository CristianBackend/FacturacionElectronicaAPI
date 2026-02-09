# ECF-API

API SaaS de Facturación Electrónica (e-CF) para República Dominicana.

## Stack

- **Runtime:** Node.js 20+ / TypeScript
- **Framework:** NestJS
- **Database:** PostgreSQL 16+
- **Cache/Queue:** Redis + BullMQ
- **ORM:** Prisma

## Setup Rápido

```bash
# 1. Instalar dependencias
npm install

# 2. Crear base de datos
createdb ecf_api

# 3. Configurar variables de entorno
cp .env.example .env

# 4. Ejecutar migraciones
npm run prisma:migrate

# 5. Seed de datos demo
npm run prisma:seed

# 6. Iniciar en modo desarrollo
npm run start:dev
```

## Endpoints

- `GET  /api/v1/health` - Estado del servicio
- `POST /api/v1/tenants/register` - Registrar tenant (público)
- `GET  /api/v1/tenants/me` - Info del tenant
- `POST /api/v1/auth/keys` - Crear API key
- `GET  /api/v1/auth/keys` - Listar API keys
- `POST /api/v1/companies` - Registrar empresa
- `GET  /api/v1/companies` - Listar empresas
- `POST /api/v1/companies/:id/certificates` - Subir .p12
- `POST /api/v1/sequences` - Registrar secuencia eNCF
- `GET  /api/v1/sequences/:companyId` - Ver secuencias

## Autenticación

Todas las rutas protegidas usan API Key en header:

```
Authorization: Bearer frd_test_xxxxxxxxxxxx
```

## Documentación Swagger

Disponible en `http://localhost:3000/docs`
