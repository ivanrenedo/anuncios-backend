# Plans v2 — decisiones de Fase 0

Referencia para las siguientes fases. Cualquier desviación de estas decisiones debe actualizar este documento primero.

## Planes y precios (XAF)

| Plan | Precio/mes | Activos | Fotos/anuncio | Boosts incluidos/mes | Fijados en perfil |
|---|---|---|---|---|---|
| Free | 0 | 5 | 4 | 0 | 0 |
| Básico | 3.000 | 15 | 4 | 1 | 0 |
| Estrella | 12.000 | 30 | 6 | 3 | 4 |
| Premium | 35.000 | 100 | 6 | 8 | 10 |

## Boosts individuales

| Duración | Precio |
|---|---|
| 3 días | 1.000 XAF |
| 7 días | 2.000 XAF |
| 30 días | 5.000 XAF |

Descuento por volumen sobre boosts extra: Estrella −25 %, Premium −50 % (aplicado en Fase 5).

## Escala de descuentos por duración de activación

| Meses | Descuento |
|---|---|
| 1–2 | 0 % |
| 3–5 | 5 % |
| 6–11 | 10 % |
| 12 | 25 % |

Fórmula: `total = round(unitPrice × months × (1 − discountPct))`. Ver `common/plan-limits.ts` y `common/pricing.ts` (Fase 2).

## Decisiones abiertas resueltas en Fase 0

### 1. Política al activar un plan distinto al vigente
**Decisión: Reemplaza.** Si el admin activa un plan distinto al que el usuario tiene vigente, el nuevo pisa al anterior sin prorratear.
- `planExpiresAt = now + (months × 30 días)`
- El tiempo restante del plan anterior se pierde. Predecible para el admin.
- Solo cuando el plan es el mismo se acumula: `endsAt = max(now, planExpiresAt) + months`.

Aplica en Fase 3 (mutation `adminActivatePlan`).

### 2. Warning inline en admin cuando `months === 11`
**Decisión: Sí, warning con botón "usar 12 meses".** Activar 12 meses cuesta menos que 11 (315k vs 346k Premium por el −25 %). El admin ve:

> ⚠️ Con 12 meses pagaría 315.000 XAF y ahorra 31.500 XAF. **Cambiar a 12 meses**

Evita cobrar de menos por error humano. Aplica en Fase 8 (panel admin).

### 3. Push nativo a followers (Fase 7c mobile)
**Decisión: pre-requisito bloqueante de Sprint 4.** Antes de arrancar Sprint 4 mobile hay que:
- Configurar Firebase / FCM
- Generar nuevo build EAS con `google-services.json`
- Verificar que `PushToken.platform === 'android' | 'ios'` recibe pushes reales

Sin eso, la Fase 7c no cierra. La Fase 7 (paridad de UI) puede avanzar en paralelo; solo el handler final de `FollowerNotifyBatch` queda bloqueado.

Ver [[push-notifications]] en memoria para el estado de FCM.

### 4. Orden de commits en Fase 0
**Decisión: committear el WIP existente en `main` primero, luego ramificar `feat/plans-v2`.**
- Backend: descartado `prisma/seed.ts` (regresión "Objetivos"→"Objetos" y typo `ccesorios`).
- Mobile: commit `.gitignore .codex/` + subtitle de servicios.
- Frontend: commit único `feat(shop): batch de features shop` (notifs, followers, cookies, ads, explore, verificación).

## Modelo de datos existente que aprovechamos

- `UserPlan` enum ya existe (FREE/STAR/PREMIUM); Fase 1 añade BASIC vía migration.
- `VerificationRequest` ya existe con status pending/approved/rejected. Fase 5 añade la mutation `approveVerification` / `rejectVerification`.
- `PlanChange` ya existe como historial simple. La nueva `PlanActivation` (Fase 1) lo complementa con desglose de precio/descuento/meses; Fase 3 decide si `PlanChange` se retira o se mantiene como auditoría paralela.
- `Payment` ya existe como ledger. `PlanActivation` NO lo reemplaza: cada activación genera un `Payment` (concept=`plan_basic|plan_star|plan_premium`) y un `PlanActivation` (metadata de la venta).
- `Follower` ya existe. Fase 5 añade solo el resolver `followSeller`/`unfollowSeller` si aún no están.

## Addendum Fase 4 — 2026-08-09

### 5. Sello "Responde rápido" retirado de todo el scope de v2
**Decisión: no medimos `responseTimeMinutes` en v2 y no aparece en ninguna UI.** El schema actual solo trackea `Product.contacts` como contador — no hay señal real de que el vendedor haya respondido (WhatsApp/tel son externos, no hay DM interno). Medir "seller responds fast" honestamente requiere:
- Un sistema de mensajería interno (fuera de scope), o
- Un botón "ya le respondí" en mobile + honor system (fácilmente inflado).

Ninguna opción cabía en Fase 4 sin comprometer la calidad del sello. **Retiro completo de v2 (confirmado 2026-08-09):**
- Cron `responseTimeMinutes` NO se implementa (Fase 4.3).
- El campo `User.responseTimeMinutes` existe (migration aplicada) pero se queda `null`.
- El sello "Responde rápido" **NO se implementa en Shop (Fase 6), Mobile (Fase 7) ni en el admin panel (Fase 8)**. No hay flag oculto, no hay placeholder — está fuera del scope hasta v2.1.
- Se mantiene el resto de ventajas Premium (verificación, tienda, carrusel, analytics completo, etc.).
- Cuando en v2.1 (o posterior) llegue DM interno u otro sistema medible, se implementará cron + UI en un release aparte.

### 6. Retirada del onProductPublished follower handler
Antes: `NotificationsListener.onProductPublished` disparaba 1 notif inmediata por follower cada vez que un vendedor publicaba.
Ahora (v2 Fase 4.4): el listener inline queda solo para `savedSearches`. Un cron horario (`FollowerNotifyCron`) agrupa las publicaciones nuevas por vendedor y emite 1 notif agregada por follower como máximo cada 6h. Latencia efectiva del follow: 1h–7h.

Retención: 30 días para `PremiumCarouselDay` y `FollowerNotifyBatch`.

## Fases fuera de scope de v2

- Vídeo en anuncios
- Bulk upload CSV
- Multi-usuario / roles Premium
- Alertas / recomendaciones IA
- Planes verticales Business (Inmobiliaria / Vehículos / Empleo / Servicios) — ver [[v2-business-packages]] en memoria
- Pack de 5 boosts sueltos con descuento
- PDF de factura formal (el desglose en admin cubre el recibo interno)
