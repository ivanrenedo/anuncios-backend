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
COPY --from=build /app/package*.json ./

# Drop root privileges — the `node` user ships with the official image.
USER node

EXPOSE 3000

# Apply pending migrations, then start Nest. `exec` hands PID 1 to node so
# SIGTERM from Docker reaches it and shutdown is graceful.
CMD ["sh", "-c", "npx prisma migrate deploy && exec node dist/main.js"]
