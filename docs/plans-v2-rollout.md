# Plans v2 — rollout runbook

Todo lo que hay que hacer para pasar `feat/plans-v2` de las 3 ramas a producción sin dejar usuarios rotos. Diseñado para ejecutar en el orden que aparece, sin saltarse pasos.

## 0. Pre-requisitos bloqueantes

Antes de deploy, TODO esto debe estar resuelto:

- [ ] **FCM configurado** (Fase 0 decision, Fase 4.4 depende de esto)
  - `google-services.json` en el bucket EAS (production channel)
  - Firebase project con Cloud Messaging habilitado
  - EAS build de mobile con `expo-notifications` reciente
  - Test manual: publicar un producto con seller-Star y verificar que un follower recibe push (in-house)
  - Sin esto, los followers no reciben push aunque el backend agrupa correctamente.
- [ ] **Migraciones aplicadas a staging** — smoke test con schema real antes de prod.
- [ ] **Backup de Postgres producción** — `pg_dump` antes de correr `prisma migrate deploy`.
- [ ] **Test suite verde en CI** — 151 unit + 115 integration + tsc en 3 repos.
- [ ] **Docs revisados**: [docs/plans-v2-decisions.md](./plans-v2-decisions.md) actualizado.

## 1. Orden de despliegue

### 1.1 Backend (bloquea al resto)

```bash
# En el servidor de backend, con backup ya hecho:
git -C /opt/marketplace/backend fetch origin
git -C /opt/marketplace/backend checkout feat/plans-v2
DATABASE_URL=$PROD_DATABASE_URL npx prisma migrate deploy
docker compose -f /opt/marketplace/docker-compose.yml build backend
docker compose -f /opt/marketplace/docker-compose.yml up -d backend
```

**Verificación post-deploy backend:**
```bash
# Health check
curl -sf https://api.bomelh.gq/health
# El schema debe contener las mutations nuevas
curl -s https://api.bomelh.gq/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"{ __type(name:\"Mutation\") { fields { name } } }"}' \
  | grep -q adminActivatePlan
```

Cron jobs se registran automáticamente en `ScheduleModule` al bootear NestJS:
- `handleAutoBump` — cada hora
- `PremiumCarouselCron.pickForToday` — `0 23 * * *` UTC (00:00 GMT+1)
- `FollowerNotifyCron.flushBatches` — cada hora
- `handlePlanExpiry` — `EVERY_DAY_AT_3AM`
- `planExpiring` / `planExpired` / `activityDigest` / `adminWeeklySummary` — ya existentes

**Verificación crons (log tail):**
```bash
docker logs -f marketplace_backend | grep -E "Premium carousel|Follower notify batch|Auto-bump"
```
Esperar a que los primeros logs aparezcan (auto-bump cada hora, resto diario).

### 1.2 Frontend (shop web + admin) — después del backend

```bash
# En el servidor de frontend:
git -C /opt/marketplace/frontend fetch origin
git -C /opt/marketplace/frontend checkout feat/plans-v2
npm install
npm run build
docker compose -f /opt/marketplace/docker-compose.yml up -d frontend
```

Nada rompe si esto llega antes que backend porque los queries nuevos fallarían con "Unknown query" — mejor mantener el orden.

**Smoke test shop:**
- Abrir `https://bomelh.gq/plans` — deben verse 4 columnas con toggle Mensual/Anual.
- Login como user Free → sección "Premium" debe mostrar botón "Contratar por WhatsApp".
- Abrir un producto de un vendedor Star cuyo precio bajó en las últimas 48h → debe verse el chip 🔥 "Rebajado" junto al precio.
- Abrir perfil de un vendedor Premium con pinned products → deben renderse antes del grid.
- Abrir `/tienda/[user-id]` de un Premium → carga tienda; de un Free → redirect a `/user/[id]`.

**Smoke test admin:**
- Login admin, ir a `/admin/plans`.
- Click "Activar plan" en un usuario → modal aparece con 4 planes × selector 1-12 meses + preview breakdown.
- Seleccionar Premium × 11m → warning inline "Con 12 meses ahorra 31.500 XAF" con botón. Click cambia a 12m.
- Confirmar → historial muestra card v2 con desglose completo (total, %descuento, inicio, fin).
- Ir a `/admin/verifications` → si hay solicitud pending con `docs`, se muestran thumbnails clicables.

### 1.3 Mobile (Expo) — puede ir en paralelo con frontend

```bash
# EAS build (channel: production)
cd /path/to/mobile
eas build --profile production --platform all
# Cuando termine el build, submit a Play Store / TestFlight
eas submit --profile production --platform android
eas submit --profile production --platform ios
```

**Fase 7c (push a followers) depende de que FCM esté configurado en EAS** — ver §0.

**Smoke test mobile:**
- Home → rail "Tiendas Premium" aparece después de categorías si hay Premium activos ese día.
- ProductCard con precio recientemente bajado (seller Star/Premium) → chip 🔥 "Rebajado".
- `/plans` → 4 tiers con toggle.
- Perfil vendedor Star/Premium → sección "📌 Anuncios fijados" arriba.
- Producto de seller Star con teléfono → botón WhatsApp abre chat directo con el vendedor (no con el número business).
- `/tienda/[id]` → visible solo si Premium activo; else redirect.

## 2. Acceptance criteria (post-deploy)

Todo esto debe ser verdadero 24h después de deploy:

- [ ] `adminActivatePlan` mutation ejecuta correctamente en prod (probar con test user).
- [ ] `homeCarouselPremium` devuelve productos el día siguiente al primer run del cron (00:00 GMT+1 pasado).
- [ ] Auto-bump: verificar que un producto con `AutoBumpSlot` activo tiene su `bumpedAt` re-stampado en la ventana correcta (Star 7d, Premium 24h).
- [ ] Follower notify: publicar un producto siendo seller-con-followers, esperar 6h, ver 1 notif in-app + push nativo.
- [ ] `priceReducedUntil` se stampa al bajar precio (test manual desde UI).
- [ ] Verification approve → `businessVerifiedAt` se setea → 👑 aparece en shop y mobile.

## 3. Rollback plan

Si algo va mal en las primeras 2h:

### Rollback rápido (código, sin tocar DB)

```bash
# Backend
git -C /opt/marketplace/backend checkout main
docker compose -f /opt/marketplace/docker-compose.yml up -d --build backend

# Frontend
git -C /opt/marketplace/frontend checkout main
docker compose -f /opt/marketplace/docker-compose.yml up -d --build frontend
```

Consecuencia: las tablas nuevas quedan pero sin código que las use. Cero pérdida de datos. Los usuarios que ya activaron plan v2 mantienen su plan (User.plan es compatible con el enum v1 excepto BASIC).

### Downgrade de BASIC users (si hace falta)

Si algún admin activó plan BASIC en el rato entre deploy y rollback, esos usuarios no tendrán trato correcto en v1 (el código v1 no conoce BASIC). Mapear a FREE en emergencia:

```sql
UPDATE users SET plan = 'FREE' WHERE plan = 'BASIC';
```

Registrar la razón en `AdminAction`.

### Restauración completa desde backup (última opción)

```bash
pg_restore --clean --if-exists -d $DATABASE_URL /backups/pre-v2-YYYYMMDD.dump
```

Solo si la migración v2 corrompió datos o hay pérdida de integridad no reversible.

## 4. Post-launch checklist (semana 1)

- [ ] Ver métricas de PLAN_ACTIVATIONS: cuántas por plan × meses. Confirmar que el warning 11→12m funciona (esperado: 0 activations a 11m).
- [ ] Chequear cola de VerificationRequest pending — SLA 48h. Alerta si > 20.
- [ ] Métricas del carrusel Premium: CTR vs no-carousel (heuristic para métrica >5% del briefing).
- [ ] Distribución de plan cycles (`planCycle` field): esperado MONTHLY dominante, YEARLY solo Premium.
- [ ] Follower push metrics: % delivered vs failed en push queue.
- [ ] Errores en Sentry / logs por `activatePlan` fallando por mismatches de tipo (BASIC en clientes viejos).

## 5. Fuera de scope de v2 (para v2.1 o después)

Documentado en [docs/plans-v2-decisions.md](./plans-v2-decisions.md#addendum-fase-4--2026-08-09):
- Sello "Responde rápido" (Premium) — sin infra de mensajería, no medible.
- Vanity URLs `/tienda/<slug>` con `User.slug` (hoy usa `user.id`).
- Dashboard `/admin/plans` con MRR / churn / distribución agregada.
- PDF de factura formal.
- Planes verticales Business (Inmobiliaria / Vehículos / Empleo / Servicios).
- Bulk upload CSV Premium.
- Vídeo en anuncios.
- Pack de 5 boosts sueltos con descuento.
