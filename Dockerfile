# ─── deps ────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
# Generate the Prisma client BEFORE the tsc build — tsc validates its types.
RUN npx prisma generate

# ─── build ───────────────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma
COPY . .
RUN npm run build

# ─── runtime ─────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Copy node_modules including devDeps: the `prisma` CLI lives there and is
# needed at boot for `migrate deploy`. Peso extra aceptable frente al riesgo
# de mover paquetes entre deps/devDeps.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./
COPY --from=build /app/package*.json ./
# `prisma/seed.ts` imports from `../src/common/pin.util`; keep the sources and
# tsconfig so `npm run seed` (ts-node) can run against production. Adds ~3 MB.
COPY --from=build /app/src ./src
COPY --from=build /app/tsconfig.json ./

# Drop root privileges — the `node` user ships with the official image.
USER node

EXPOSE 3000

# Docker marks the container unhealthy after 3 consecutive 5-second failures,
# catching hangs and lost DB connectivity that `restart: unless-stopped`
# alone would miss. `start-period` gives `prisma migrate deploy` (39+ migrations)
# and Nest bootstrap time — 90 s cubre el arranque en frío en un droplet de 4 GB.
# `127.0.0.1` en vez de `localhost` — evita el fallo típico Alpine donde
# `localhost` resuelve primero a ::1 (IPv6) mientras Node escucha en 0.0.0.0
# (IPv4 only) → wget da "Connection refused" aunque Nest esté arriba.
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health > /dev/null 2>&1 || exit 1

# Apply pending migrations, then start Nest. `exec` hands PID 1 to node so
# SIGTERM from Docker reaches it and shutdown is graceful.
CMD ["sh", "-c", "npx prisma migrate deploy && exec node dist/main.js"]
