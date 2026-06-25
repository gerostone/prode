# Fase 7 — Pulido pre-Mundial

**Fecha:** 2026-05-19
**Estado:** Aprobada para implementación

## 1. Objetivo

Cerrar los gaps operacionales que quedan antes del kickoff del Mundial (11 jun): lock-out automático de eventos via cron, auto-set de `closes_at` desde matches sincronizados, header mobile-friendly y card de "Próximo cierre" en el dashboard. Plus migration que permite audit logs system-triggered.

## 2. Out of scope

- `/yo` (mis predicciones + breakdown) — post-mundial.
- `/comparar/[userId]` (ver predicciones ajenas) — post-mundial.
- Email/push notifications cuando un evento cierra.
- Hamburger menu (con `flex-wrap` basta).
- Re-revisión completa de copy (la hacemos puntual si aparecen casos).
- Tests automatizados nuevos (no hay módulo puro nuevo).
- Performance audit (la app ya es liviana).

## 3. Decisiones tomadas (con el usuario)

| Decisión | Elección |
|---|---|
| Lock-out approach | Extender `/api/cron/sync-matches` con auto-lock al final |
| Audit log de cron | `actor_user_id = null` (requiere migration que lo haga nullable) |
| Card "Próximo cierre" en dashboard | Incluir |
| Auto-set de `closes_at` desde matches | Incluir (cron lee `min(scheduled_at)` por stage) |
| Pre-fase bug fix | `/api/*` excluido del middleware auth gate (ya commiteado) |

## 4. Schema — migration `0010_audit_log_nullable.sql`

```sql
-- =================================================================
-- Prode Mundial 2026 — admin_audit_log.actor_user_id nullable
-- Migration 0010
-- =================================================================
-- Permite audit log entries sin usuario (system/cron operations).
-- Re-correr es idempotente: drop not null sobre una columna ya nullable
-- es no-op (no falla).
-- =================================================================

alter table admin_audit_log
  alter column actor_user_id drop not null;
```

## 5. Extender `/api/cron/sync-matches`

Modificar `app/src/app/api/cron/sync-matches/route.ts`. Después del bloque actual de `syncFromFD`, agregar dos fases secuenciales:

### Fase A — Auto-set de `closes_at`

Para Eventos 2/3/4, leer el primer `scheduled_at` de los matches del stage correspondiente y actualizar `events.closes_at`. Evento 1 queda manual (no tiene matches asociados).

```ts
const stageByEvent: Record<number, string> = { 2: 'r32', 3: 'r16', 4: 'qf' };
for (const [eventIdStr, stage] of Object.entries(stageByEvent)) {
  const eventId = Number(eventIdStr);
  const { data: minScheduled } = await supabase
    .from('matches')
    .select('scheduled_at')
    .eq('stage', stage)
    .not('scheduled_at', 'is', null)
    .order('scheduled_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (minScheduled?.scheduled_at) {
    await supabase
      .from('events')
      .update({ closes_at: minScheduled.scheduled_at })
      .eq('id', eventId)
      .in('status', ['draft', 'open']);  // no tocar locked/scored
  }
}
```

### Fase B — Auto-lock de eventos vencidos

```ts
const { data: openEvents } = await supabase
  .from('events')
  .select('id, closes_at')
  .eq('status', 'open')
  .not('closes_at', 'is', null);

const now = new Date().toISOString();
const lockedEventIds: number[] = [];

for (const e of openEvents ?? []) {
  if (e.closes_at && e.closes_at <= now) {
    const { error: lErr } = await supabase
      .from('events')
      .update({ status: 'locked' })
      .eq('id', e.id)
      .eq('status', 'open');  // race-safe (idempotente)
    if (!lErr) {
      lockedEventIds.push(e.id);
      await supabase.from('admin_audit_log').insert({
        actor_user_id: null,
        action: 'auto_lock_event',
        target_table: 'events',
        target_id: String(e.id),
        before_data: { status: 'open' },
        after_data: { status: 'locked', triggered_by: 'cron' },
      });
    }
  }
}
```

### Response actualizada

```ts
return NextResponse.json({
  ok: true,
  syncResult: result,
  lockedEventIds,
});
```

## 6. Mobile-friendly header

`app/src/components/app-header.tsx`:

Cambio único: el `<nav>` actual tiene `hidden sm:flex` que oculta toda la navegación en pantallas < 640px. Reemplazar con flex que siempre se muestra y wrappea.

**Antes:**
```tsx
<nav className="hidden gap-4 text-sm sm:flex">
```

**Después:**
```tsx
<nav className="flex flex-wrap gap-2 text-xs sm:gap-4 sm:text-sm">
```

Sin cambios al resto de la estructura del header.

## 7. Card "Próximo cierre" en dashboard

`app/src/app/(app)/dashboard/page.tsx`:

### Query nueva

Agregar al `Promise.all` existente:
```ts
supabase
  .from('events')
  .select('id, name, closes_at')
  .eq('status', 'open')
  .not('closes_at', 'is', null)
  .order('closes_at', { ascending: true })
  .limit(1)
  .maybeSingle<{ id: number; name: string; closes_at: string }>()
```

Llamarla `nextCloseRes` y extraer:
```ts
const nextClose = nextCloseRes.data;
```

### Helper de formato

Inline en el archivo (no helper externo):
```tsx
function formatTimeRemaining(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  if (diffMs <= 0) return 'cierra ahora';
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  if (days >= 1) {
    const remHours = hours - days * 24;
    return `cierra en ${days}d ${remHours}h`;
  }
  const mins = Math.floor((diffMs - hours * 1000 * 60 * 60) / (1000 * 60));
  return `cierra en ${hours}h ${mins}m`;
}
```

### Render

Sumar una 5ta card al grid de stats (al lado de "Próximo evento" etc.). Si `nextClose` es null, no renderizar la card (mantener el grid en 4 columnas).

```tsx
{nextClose && (
  <Card>
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium">Próximo cierre</CardTitle>
      <Clock className="h-4 w-4 text-muted-foreground" />
    </CardHeader>
    <CardContent>
      <div className="text-xl font-bold">{nextClose.name}</div>
      <p className="text-xs text-muted-foreground">{formatTimeRemaining(nextClose.closes_at)}</p>
    </CardContent>
  </Card>
)}
```

Agregar `Clock` al import de lucide-react.

## 8. Estructura de archivos

```
app/supabase/migrations/0010_audit_log_nullable.sql       NEW
app/src/app/api/cron/sync-matches/route.ts                MODIFY (auto-close + auto-lock)
app/src/components/app-header.tsx                         MODIFY (mobile nav)
app/src/app/(app)/dashboard/page.tsx                      MODIFY (card próximo cierre)
```

Cero archivos nuevos en TS de la app. Solo 1 SQL + 3 mods.

## 9. Riesgos / supuestos

- **Cron solo corre 1x/día (12:00 UTC):** si un evento debería cerrarse a las 14:00 UTC, el cron del día siguiente lo lockea con ~22 horas de delay. Mitigación: admin puede cerrar manual desde el AdminToggle si necesita precisión al minuto.
- **Auto-set de `closes_at` puede sobreescribir un valor que admin seteó manual:** si admin setea `closes_at = X` y luego el cron encuentra `min(scheduled_at) = Y ≠ X`, lo reescribe a Y. Acceptable porque `Y` es la fuente de verdad (FD). Si admin quiere override, puede setear `closes_at` después del cron y antes del próximo.
- **Migration 0010 es backward-compatible:** existing rows con `actor_user_id` quedan intactas.
- **`flex-wrap` puede causar el header en 2 líneas en mobile con muchos links:** acceptable (es más legible que truncar o hamburger).

## 10. Verificación post-implementación

- [ ] Migration 0010 aplica limpia.
- [ ] `npm run test && npx tsc --noEmit && npm run lint` verde.
- [ ] Trigger manual del cron desde Vercel Settings → Crons. Response 200 con `{ok: true, syncResult, lockedEventIds: []}` (esperado vacío si nada vence todavía).
- [ ] Test de auto-lock: en SQL Editor `update events set closes_at = now() - interval '1 hour' where id = 1;` + trigger cron → debería retornar `lockedEventIds: [1]` + insertar audit log con `actor_user_id = null`.
- [ ] Test de auto-set closes_at: después de un sync exitoso con matches de R32 cargados, `select id, closes_at from events where id in (2,3,4);` debería tener valores.
- [ ] Dashboard muestra card "Próximo cierre" si hay un evento open con `closes_at` futuro; no la muestra si no hay candidato.
- [ ] Header en mobile (Chrome DevTools 360px): los 3-4 links + email/Salir caben sin overflow horizontal (puede ser en 2 filas).
- [ ] Audit log: `select * from admin_audit_log where action = 'auto_lock_event';` muestra rows con `actor_user_id = null`.
