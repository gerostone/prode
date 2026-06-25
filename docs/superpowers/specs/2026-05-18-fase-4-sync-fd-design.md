# Fase 4 — Sync con Football-Data.org

**Fecha:** 2026-05-18
**Estado:** Aprobada para implementación

## 1. Objetivo

Conectar Prode con Football-Data.org para automatizar la sincronización de los 31 partidos eliminatorios del Mundial 2026 (calendario + resultados). El flujo es: pull de FD → tabla `matches_staging` (pending) → aprobación admin → tabla `matches` + propagación al child match. Disparo automático via Vercel Cron 1x/día.

## 2. Out of scope

- Auto-mapping FD match → bracket_slot vía team pairing. El admin asigna el `external_id` manualmente desde `/admin/sync`.
- Sync de la fase de grupos (queda manual en `/admin/teams`).
- Cron de lock-out automático de eventos (`fn_lock_event` programado).
- Notificaciones (email/push) cuando hay aprobaciones pendientes.
- UI para editar el bracket directamente (admin solo aprueba/rechaza staging rows).
- Sync de eventos 5+ del Mundial (Fase 4 cubre solo elim + final).

## 3. Decisiones tomadas (con el usuario)

| Decisión | Elección |
|---|---|
| Alcance | Sync infra + Vercel Cron automático |
| Staging | Sí — sync escribe a `matches_staging`, admin aprueba |
| Bracket structure | Pre-seed los 31 matches en migration 0009, parent_slots cableados |
| Mapping FD ↔ match | Manual: admin pega FD id por slot desde `/admin/sync` |
| Cron frequency | 1x/día a las 12:00 UTC (9 AM Arg) — límite del plan Hobby |

## 4. Schema — migration `0009_matches_seed.sql`

```sql
-- =================================================================
-- Prode Mundial 2026 — Bracket + external_id + propagation
-- Migration 0009
-- =================================================================

-- 1) Agregar matches.external_id para mapeo con Football-Data.org
alter table matches
  add column external_id text unique;

-- 2) Pre-seed 31 matches eliminatorios con parent_slot cableado.
--    Pairing consecutivo: R32-01+R32-02→R16-01, etc.
insert into matches (stage, bracket_slot, parent_slot_home, parent_slot_away) values
  -- Round of 32: 16 matches (sin parents)
  ('r32', 'R32-01', null, null),
  ('r32', 'R32-02', null, null),
  ('r32', 'R32-03', null, null),
  ('r32', 'R32-04', null, null),
  ('r32', 'R32-05', null, null),
  ('r32', 'R32-06', null, null),
  ('r32', 'R32-07', null, null),
  ('r32', 'R32-08', null, null),
  ('r32', 'R32-09', null, null),
  ('r32', 'R32-10', null, null),
  ('r32', 'R32-11', null, null),
  ('r32', 'R32-12', null, null),
  ('r32', 'R32-13', null, null),
  ('r32', 'R32-14', null, null),
  ('r32', 'R32-15', null, null),
  ('r32', 'R32-16', null, null),
  -- Round of 16: 8 matches
  ('r16', 'R16-01', 'R32-01', 'R32-02'),
  ('r16', 'R16-02', 'R32-03', 'R32-04'),
  ('r16', 'R16-03', 'R32-05', 'R32-06'),
  ('r16', 'R16-04', 'R32-07', 'R32-08'),
  ('r16', 'R16-05', 'R32-09', 'R32-10'),
  ('r16', 'R16-06', 'R32-11', 'R32-12'),
  ('r16', 'R16-07', 'R32-13', 'R32-14'),
  ('r16', 'R16-08', 'R32-15', 'R32-16'),
  -- Quarter-finals: 4 matches
  ('qf',  'QF-01',  'R16-01', 'R16-02'),
  ('qf',  'QF-02',  'R16-03', 'R16-04'),
  ('qf',  'QF-03',  'R16-05', 'R16-06'),
  ('qf',  'QF-04',  'R16-07', 'R16-08'),
  -- Semi-finals: 2 matches
  ('sf',  'SF-01',  'QF-01',  'QF-02'),
  ('sf',  'SF-02',  'QF-03',  'QF-04'),
  -- Final
  ('final','FINAL', 'SF-01',  'SF-02')
on conflict (bracket_slot) do nothing;

-- 3) Función para propagar ganadores al child match
--    Llamada por el server action approveStaging después de copiar scores.
--    Si el match tiene winner_team_code, busca el child y completa home_team_code
--    o away_team_code según corresponda. Idempotente (no sobreescribe si ya hay valor).
create or replace function fn_propagate_winner(p_match_id int)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_slot text;
  v_winner text;
begin
  select bracket_slot, winner_team_code into v_slot, v_winner
  from matches where id = p_match_id;
  if v_winner is null or v_slot is null then return; end if;

  update matches
    set home_team_code = v_winner
    where parent_slot_home = v_slot and home_team_code is null;

  update matches
    set away_team_code = v_winner
    where parent_slot_away = v_slot and away_team_code is null;
end;
$$;

revoke all on function fn_propagate_winner(int) from public;
grant execute on function fn_propagate_winner(int) to authenticated;
```

**Nota sobre pairing:** Se usa "pairing consecutivo" estándar de bracket (R32-01+02→R16-01, R32-03+04→R16-02, etc.). El admin debe asignar `external_id` (FD match id) en `/admin/sync` respetando esta convención (R32-01 debe ser el FD match que va a jugar contra el de R32-02 en R16-01).

## 5. TypeScript types

`app/src/lib/database.types.ts`:
- `Match`: agregar `external_id: string | null`.

## 6. Sync core — `app/src/lib/sync-fd.ts`

Función pura reusable, llamada tanto desde el script CLI como desde la Vercel Cron route.

```ts
export interface SyncResult {
  inserted: number;
  skipped: number;
  unmapped: number;   // FD matches sin external_id local
  errors: Array<{ external_id: string; message: string }>;
}

export async function syncFromFD(options: {
  fdApiKey: string;
  supabaseUrl: string;
  supabaseServiceKey: string;
}): Promise<SyncResult> {
  // 1. GET https://api.football-data.org/v4/competitions/WC/matches
  // 2. Filtrar a stage in ('LAST_16', 'ROUND_OF_32', 'QUARTER_FINALS', 'SEMI_FINALS', 'FINAL')
  //    Nota: FD usa LAST_16 para Round of 16. Mapeo:
  //      ROUND_OF_32   → r32
  //      LAST_16       → r16
  //      QUARTER_FINALS → qf
  //      SEMI_FINALS   → sf
  //      FINAL         → final
  // 3. Por cada FD match, buscar matches.external_id == fd.id.
  //    - Si no existe: unmapped++
  //    - Si existe pero data no cambió: skipped++
  //    - Si existe y data cambió: insert row en matches_staging con status='pending'
  // 4. Devuelve SyncResult
}
```

Detalle del shape esperado de FD match → match local:

| FD path | Local column |
|---|---|
| `utcDate` | `scheduled_at` |
| `score.fullTime.home` | `home_score_90` |
| `score.fullTime.away` | `away_score_90` |
| `score.extraTime.home` | `home_score_120` |
| `score.extraTime.away` | `away_score_120` |
| `score.duration === 'PENALTY_SHOOTOUT'` | `went_to_penalties = true` |
| `score.winner` mapped to team tla via `homeTeam.tla` / `awayTeam.tla` | `winner_team_code` |

## 7. Script CLI — `app/scripts/sync-matches.ts`

Para correr local: `npm run db:sync-matches`. Carga env vars desde `.env.local`, llama a `syncFromFD`, imprime resumen.

## 8. Vercel Cron route — `app/src/app/api/cron/sync-matches/route.ts`

```ts
// GET /api/cron/sync-matches
// Auth: Authorization: Bearer ${process.env.CRON_SECRET}
// Vercel inyecta este header automáticamente para cron jobs.
```

El archivo `app/vercel.json` ya existe (creado en Fase 2 para forzar el framework). **Extenderlo** con la sección `crons`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs",
  "crons": [
    { "path": "/api/cron/sync-matches", "schedule": "0 12 * * *" }
  ]
}
```

12:00 UTC = 9:00 AM Argentina. Como Vercel está configurado con Root Directory = `app`, lee `vercel.json` desde ahí.

## 9. Env vars nuevas

- `CRON_SECRET`: random string 32+ caracteres. Setear en Vercel **y** en `.env.local`. Vercel auto-inyecta `Authorization: Bearer $CRON_SECRET` cuando llama el cron.
- `FOOTBALL_DATA_API_KEY`: ya existe.
- `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`: ya existen (la route corre server-side, podemos usar service role).

## 10. UI — `/admin/sync`

Dos secciones colapsadas (Card por sección):

### A) Pending approvals

Lista de filas en `matches_staging` con `status='pending'`, ordered by `fetched_at asc`.

Cada row:
- Header: bracket_slot, stage, scheduled_at (current).
- Tabla side-by-side:
  - **Current** (de `matches`): home_team_code, away_team_code, scores, winner, scheduled_at.
  - **Proposed** (de `matches_staging`): scores nuevos, winner nuevo, scheduled_at nuevo.
  - Diff highlights en amarillo los campos que cambian.
- Botones: **Aprobar** / **Rechazar**.

Si no hay pending: "No hay aprobaciones pendientes."

### B) Mapping FD ↔ matches

Tabla de los 31 matches:
- Columnas: bracket_slot, stage, teams actuales (si están), `external_id` (input editable), SaveChip.
- Cambio en `external_id` → autosave 800ms vía `assignExternalId`.
- Botón al final de la sección: **Sincronizar ahora** → llama a `syncNow()` y muestra resultado.

## 11. Server actions — `app/src/app/(app)/admin/sync/actions.ts`

```ts
'use server';

import { syncFromFD } from '@/lib/sync-fd';
// ...

export async function syncNow(): Promise<SyncResult | { error: string }> {
  await requireRole(['admin']);
  return syncFromFD({ fdApiKey, supabaseUrl, supabaseServiceKey });
}

export async function approveStaging(staging_id: number) {
  await requireRole(['admin']);
  // 1. Cargar la row de staging.
  // 2. UPDATE matches con los nuevos campos (scheduled_at, scores, winner_team_code, etc.).
  // 3. UPDATE matches_staging.status='approved', reviewed_by=user.id, reviewed_at=now().
  // 4. Si winner_team_code se setó, llamar a supabase.rpc('fn_propagate_winner', { p_match_id }).
  // 5. Audit log.
  // 6. revalidatePath('/admin/sync').
}

export async function rejectStaging(staging_id: number, notes?: string) {
  await requireRole(['admin']);
  // UPDATE matches_staging.status='rejected', notes, reviewed_by, reviewed_at.
  // Audit log + revalidatePath.
}

export async function assignExternalId(match_id: number, external_id: string | null) {
  await requireRole(['admin']);
  // UPDATE matches SET external_id = ... WHERE id = match_id.
  // Validación: si external_id no es null, debe ser único (DB constraint lo asegura).
  // Audit log + revalidatePath.
}
```

Cada acción loguea en `admin_audit_log`.

## 12. Admin index actualizado

`/admin` index suma una 4ta card:
- **Sync** → `/admin/sync`
- Subtítulo: "X pendientes" (count de matches_staging.status='pending').

## 13. Estructura de rutas

```
app/src/app/(app)/admin/sync/
  page.tsx                       Server: carga staging pending + matches
  pending-approvals.tsx          Client: lista de aprobaciones con diff
  external-id-editor.tsx         Client: tabla de matches con input external_id
  sync-now-button.tsx            Client: botón "Sincronizar ahora"
  actions.ts                     Server actions: syncNow, approveStaging, rejectStaging, assignExternalId

app/src/app/api/cron/sync-matches/
  route.ts                       GET handler con auth check

app/src/lib/sync-fd.ts           Función pura syncFromFD

app/scripts/sync-matches.ts      Script CLI

app/vercel.json                  Cron config (extiende el existente)
```

## 14. Tests

- Sin tests automatizados nuevos (la sync function hits external API, mockear sería overhead).
- Verificación manual: correr `npm run db:sync-matches` con un match con `external_id` seteado y verificar que aparece en staging.

## 15. Riesgos / supuestos

- **FD coverage del Mundial 2026:** asumimos que el endpoint `/competitions/WC/matches` devuelve los partidos eliminatorios con `stage` correcto. Si no, el filtro falla silencioso y `unmapped` queda en N. Mitigación: log claro + admin puede ver el conteo en la respuesta de `syncNow`.
- **Rate limit FD free plan:** 10 req/min. Una sola llamada al endpoint general devuelve todos los matches del WC. Si cambia, agregar throttle.
- **Pairing consecutivo:** asume que el admin entiende el modelo y asigna external_ids respetando el bracket. Si se equivoca, hay que cambiar el external_id de uno y aprobar de nuevo.
- **`fn_propagate_winner` solo escribe si la columna está NULL:** intencional. Evita sobreescribir si un admin ya cargó manualmente desde otra UI.
- **CRON_SECRET en Vercel:** si no se configura, el endpoint queda público (cualquiera puede triggerear el sync). El check de header lo bloquea.
- **Idempotency del cron:** múltiples runs del cron en el mismo día generan rows duplicadas en staging si la data cambia entre runs. Acceptable porque admin las consolida al aprobar.

## 16. Verificación post-implementación

- [ ] Migration 0009 corre limpia. `select count(*) from matches;` devuelve 31.
- [ ] `select bracket_slot, parent_slot_home, parent_slot_away from matches order by stage, bracket_slot;` muestra el bracket esperado.
- [ ] `npm run db:sync-matches` ejecuta sin error y devuelve un SyncResult (probablemente todo `unmapped` la primera vez porque ningún `external_id` está cargado).
- [ ] En `/admin/sync` aparecen las dos secciones; mapping muestra 31 rows.
- [ ] Asignar un `external_id` a R32-01 (manualmente, copy/paste del id de FD) → autosave OK.
- [ ] Click "Sincronizar ahora" → si FD tiene data para ese match, aparece en staging.
- [ ] Aprobar el staging row → match se actualiza, scheduled_at queda con el valor de FD.
- [ ] `vercel.json` válido (`vercel build` no rompe).
- [ ] Endpoint `/api/cron/sync-matches` sin auth header devuelve 401.
- [ ] Endpoint con `Authorization: Bearer $CRON_SECRET` correcto retorna 200 + SyncResult.
- [ ] (Post-deploy) Vercel dashboard muestra el cron job registrado.
