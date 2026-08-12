# Bomelh Backend

API de Bomelh: NestJS, GraphQL, Prisma, Postgres, Redis/BullMQ, notificaciones, planes, moderacion y subida de medios.

## Requisitos

- Node 22
- Postgres 16
- Redis 7
- Variables en `.env`

## Desarrollo

```bash
npm ci
npx prisma generate
npm run start:dev
```

API:

- REST health: `http://localhost:3000/health`
- GraphQL: `http://localhost:3000/graphql`

## Base De Datos

```bash
npx prisma migrate deploy
npm run seed
```

Para crear una migracion:

```bash
npx prisma migrate dev --name nombre_de_la_migracion
```

## Verificacion

```bash
npm run build
npm test -- --runInBand
npm run test:integration
```

El snapshot GraphQL protege el contrato usado por web y mobile. Si el cambio de schema es intencionado:

```bash
npm test -- schema.snapshot.spec -u
```

## Modulos Principales

- `auth`: login, JWT, Google OAuth y guards.
- `products`: publicacion, busqueda, boost, vistas y contacto.
- `users`: perfil, planes, permisos y admin.
- `home-sections`: secciones dinamicas de Home.
- `notifications`: in-app y push.
- `email`: plantillas y cola de emails.
- `upload`: almacenamiento local o S3-compatible.
- `audit`: acciones administrativas.

## Deploy

El deploy se ejecuta por GitHub Actions en push a `main`:

1. `npm ci`
2. `npx prisma generate`
3. build/test
4. build Docker
5. push a GHCR
6. restart en el droplet

Ver tambien `../docs/DEPLOYMENT.md`.
