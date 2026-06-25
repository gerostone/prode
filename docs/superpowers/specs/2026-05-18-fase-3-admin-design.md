# Fase 3 — Admin + carga manual de resultados

**Fecha:** 2026-05-18
**Estado:** Aprobada para implementación

## 1. Objetivo

Habilitar al admin a cargar manualmente los resultados del Mundial 2026 a medida que el torneo avanza, y a triggerear el recálculo de puntajes del Evento 1. Resuelve dos huecos descubiertos en `fn_score_event` (group_winner deshabilitado, top_scorer no scorea).

## 2. Out of scope

- Sync automático con Football-Data.org (Fase 4).
- Pantalla pública de leaderboard (Fase 6).
- Editar `closes_at` de eventos desde UI (sigue manual via SQL o toggle existente en `/eventos/1`).
- CRUD de jugadores/equipos (agregar, eliminar) — solo edición de campos existentes.
- Cargar matches de Eventos 2/3/4 (Fase 5).
- Email de notificación al admin cuando un evento se cierra automáticamente.

## 3. Decisiones tomadas (con el usuario)

| Decisión | Elección |
|---|---|
| Alcance Fase 3 | Mínimo viable: admin carga resultados Evento 1 + triggerea scoring |
| Modelo de "ganador de grupo" | Nueva columna `teams.group_position smallint` (1-4) |
| Modelo de "goleador real" | Nueva columna `players.is_top_scorer boolean` |
| Estructura UI | `/admin` index + sub-páginas `/admin/teams`, `/admin/players`, `/admin/scoring` |

## 4. Schema — migration `0008_admin_carga_resultados.sql`

```sql
-- =================================================================
-- Prode Mundial 2026 — Carga manual de resultados
-- Migration 0008
-- =================================================================

-- 1) Nueva columna teams.group_position (1=ganador, 2=segundo, 3=tercero, 4=cuarto)
alter table teams
  add column group_position smallint check (group_position between 1 and 4);

-- 2) Nueva columna players.is_top_scorer
alter table players
  add column is_top_scorer boolean not null default false;
create index players_top_scorer_idx
  on players(is_top_scorer)
  where is_top_scorer = true;

-- 3) Reemplazar fn_score_event: habilitar group_winner + agregar top_scorer
create or replace function fn_score_event(p_event_id smallint)
returns table (
  user_id uuid,
  points int,
  correct_count int
)
language plpgsql
security definer set search_path = public
as $$
declare
  v_is_caller_privileged boolean;
begin
  v_is_caller_privileged := is_admin_or_scorer();
  if not v_is_caller_privileged then
    raise exception 'Solo admin o scorer puede recalcular puntajes';
  end if;

  -- 1) Resetear awarded_points e is_correct
  update predictions
    set awarded_points = 0, is_correct = null
  where event_id = p_event_id;

  -- 2.a) champion / finalist
  update predictions p
    set is_correct = (
      select case
        when p.kind = 'champion'  then t.eliminated_at_stage = 'champion'
        when p.kind = 'finalist'  then t.eliminated_at_stage in ('final','champion')
        else false
      end
      from teams t where t.code = p.team_code
    ),
    awarded_points = ec.points_per_correct
  from event_categories ec
  where ec.event_id = p.event_id
    and ec.kind = p.kind
    and p.kind in ('champion','finalist')
    and p.team_code is not null
    and exists (
      select 1 from teams t
      where t.code = p.team_code
        and (
          (p.kind = 'champion' and t.eliminated_at_stage = 'champion')
          or (p.kind = 'finalist' and t.eliminated_at_stage in ('final','champion'))
        )
    );

  -- 2.b) semifinalist
  update predictions p
    set is_correct = true, awarded_points = ec.points_per_correct
  from event_categories ec
  where ec.event_id = p.event_id
    and ec.kind = p.kind
    and p.kind = 'semifinalist'
    and exists (
      select 1 from teams t
      where t.code = p.team_code
        and t.eliminated_at_stage in ('sf','final','champion')
    );

  -- 2.c) playoff_team: avanzó más allá de fase de grupos
  update predictions p
    set is_correct = true, awarded_points = ec.points_per_correct
  from event_categories ec
  where ec.event_id = p.event_id
    and ec.kind = p.kind
    and p.kind = 'playoff_team'
    and exists (
      select 1 from teams t
      where t.code = p.team_code
        and t.eliminated_at_stage is distinct from 'group'
        and t.eliminated_at_stage is not null
    );

  -- 2.d) group_winner: team es el primero (group_position = 1) del grupo apuntado en meta
  update predictions p
    set is_correct = true, awarded_points = ec.points_per_correct
  from event_categories ec, teams t
  where ec.event_id = p.event_id
    and ec.kind = p.kind
    and p.kind = 'group_winner'
    and t.code = p.team_code
    and t.group_code = (p.meta->>'group_code')
    and t.group_position = 1;

  -- 2.e) top_scorer: player.is_top_scorer = true
  update predictions p
    set is_correct = true, awarded_points = ec.points_per_correct
  from event_categories ec, players pl
  where ec.event_id = p.event_id
    and ec.kind = p.kind
    and p.kind = 'top_scorer'
    and pl.id = p.player_id
    and pl.is_top_scorer = true;

  -- 2.f) *_winner (r32/r16/qf) — sin cambios respecto de 0003
  update predictions p
    set is_correct = true, awarded_points = ec.points_per_correct
  from event_categories ec, matches m
  where ec.event_id = p.event_id
    and ec.kind = p.kind
    and p.kind in ('r32_winner','r16_winner','qf_winner')
    and m.id = p.match_id
    and m.winner_team_code is not null
    and m.winner_team_code = p.team_code;

  -- 2.g) *_outcome (r32/r16/qf) — sin cambios respecto de 0003
  update predictions p
    set is_correct = true, awarded_points = ec.points_per_correct
  from event_categories ec, matches m
  where ec.event_id = p.event_id
    and ec.kind = p.kind
    and p.kind in ('r32_outcome','r16_outcome','qf_outcome')
    and m.id = p.match_id
    and m.outcome_pre_penalties is not null
    and m.outcome_pre_penalties = p.outcome;

  -- 3) Marcar incorrectos a los demás
  update predictions
    set is_correct = false
  where event_id = p_event_id and is_correct is null;

  -- 4) Refrescar tabla scores
  delete from scores where event_id = p_event_id;
  insert into scores (user_id, event_id, points, correct_count, updated_at)
  select p.user_id, p.event_id,
         coalesce(sum(p.awarded_points), 0),
         count(*) filter (where p.is_correct = true),
         now()
  from predictions p
  where p.event_id = p_event_id
  group by p.user_id, p.event_id;

  -- 5) Si todas las predicciones tienen is_correct definido, marcar evento como scored
  if not exists (
    select 1 from predictions where event_id = p_event_id and is_correct is null
  ) then
    update events set status = 'scored' where id = p_event_id and status = 'locked';
  end if;

  -- 6) Retornar
  return query
    select s.user_id, s.points, s.correct_count
    from scores s
    where s.event_id = p_event_id
    order by s.points desc;
end;
$$;

revoke all on function fn_score_event(smallint) from public;
grant execute on function fn_score_event(smallint) to authenticated;
```

## 5. TypeScript types

`app/src/lib/database.types.ts`:
- `Team`: agregar `group_position: number | null`.
- `Player`: agregar `is_top_scorer: boolean`.

## 6. Estructura de rutas y archivos

```
app/src/app/(app)/admin/
  layout.tsx              Gate: requireRole(['admin']) + breadcrumb header
  page.tsx                Index con cards-link + stats rápidas
  actions.ts              Server actions: updateTeam, updatePlayer, recalcEventScoring
  teams/
    page.tsx              Server component carga teams; pasa a editor
    teams-editor.tsx      Client component con autosave por field
  players/
    page.tsx              Server component carga players
    players-editor.tsx    Client component con autosave por field
  scoring/
    page.tsx              Server component carga events + scores
    scoring-panel.tsx     Client component con botón recalc

app/src/lib/admin-helpers.ts   (opcional) — helpers de presentación (label de stage, etc.)
```

## 7. Server actions

`app/src/app/(app)/admin/actions.ts`:

```ts
'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase-server';

const STAGES = ['group', 'r32', 'r16', 'qf', 'sf', 'final', 'champion'] as const;

const updateTeamSchema = z.object({
  code: z.string().min(1),
  patch: z.object({
    group_position: z.number().int().min(1).max(4).nullable().optional(),
    eliminated_at_stage: z.enum(STAGES).nullable().optional(),
  }),
});

export async function updateTeam(input: z.infer<typeof updateTeamSchema>) {
  const parsed = updateTeamSchema.safeParse(input);
  if (!parsed.success) return { error: 'Payload inválido.' };
  const { user } = await requireRole(['admin']);
  const supabase = createSupabaseServerClient();

  // Snapshot pre-update para audit log
  const { data: before } = await supabase
    .from('teams').select('group_position, eliminated_at_stage')
    .eq('code', parsed.data.code).single();

  const { error } = await supabase
    .from('teams').update(parsed.data.patch).eq('code', parsed.data.code);
  if (error) {
    console.error('updateTeam error:', error);
    return { error: 'No se pudo actualizar el equipo.' };
  }

  await supabase.from('admin_audit_log').insert({
    actor_user_id: user.id,
    action: 'update_team',
    target_table: 'teams',
    target_id: parsed.data.code,
    before_data: before ?? {},
    after_data: parsed.data.patch,
  });

  revalidatePath('/admin/teams');
  return { savedAt: new Date().toISOString() };
}

const updatePlayerSchema = z.object({
  id: z.number().int().positive(),
  patch: z.object({ is_top_scorer: z.boolean() }),
});

export async function updatePlayer(input: z.infer<typeof updatePlayerSchema>) {
  // mismo patrón que updateTeam, target_table='players'
}

const recalcSchema = z.object({ event_id: z.number().int().min(1).max(4) });

export async function recalcEventScoring(input: z.infer<typeof recalcSchema>) {
  const parsed = recalcSchema.safeParse(input);
  if (!parsed.success) return { error: 'event_id inválido.' };
  const { user } = await requireRole(['admin']);
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .rpc('fn_score_event', { p_event_id: parsed.data.event_id });
  if (error) {
    console.error('fn_score_event error:', error);
    return { error: 'No se pudo recalcular.' };
  }

  await supabase.from('admin_audit_log').insert({
    actor_user_id: user.id,
    action: 'recalc_event_scoring',
    target_table: 'events',
    target_id: String(parsed.data.event_id),
    after_data: { row_count: data?.length ?? 0 },
  });

  revalidatePath('/admin/scoring');
  return { rows: (data ?? []) as Array<{ user_id: string; points: number; correct_count: number }> };
}
```

## 8. UX detalles

### `/admin` (index)

- Header: "Panel de admin".
- Tres cards-link:
  - "Equipos" → /admin/teams (subtítulo: "X/48 con posición cargada").
  - "Jugadores" → /admin/players (subtítulo: "Goleador marcado: ✓/—").
  - "Scoring" → /admin/scoring (subtítulo: "Evento 1: status").
- Plus link "Volver al dashboard".

### `/admin/teams`

- Header con counters: "Cargados: X/48 group_position, Y/48 eliminated_at_stage".
- Tabla por grupo (12 cards o 12 secciones), 4 filas por grupo:
  - Columnas: bandera (crest_url), nombre, `group_position` (select: —/1/2/3/4), `eliminated_at_stage` (select: —/group/r32/r16/qf/sf/final/champion).
- Validación cliente: si en un grupo hay dos teams con la misma posición, mostrar warning amarillo arriba del grupo.
- Save chip por team (idem patrón Evento 1, 800ms debounce).

### `/admin/players`

- Tabla simple, 18 filas: bandera, nombre, checkbox `is_top_scorer`.
- Counter en el header: "Marcados como goleador: N".
- Si N > 1, warning amarillo "Solo un jugador debería ser el goleador" (no bloqueante).
- Save chip por player.

### `/admin/scoring`

- Lista de eventos (1, 2, 3, 4) como cards. Para cada uno:
  - Status (`draft` | `open` | `locked` | `scored`).
  - Último recalc: usar `max(scores.updated_at)` o "Nunca".
  - Top-3 scores (display_name + points).
  - Botón "Recalcular" — disabled si status es `draft` (sin sentido recalcular sin nada cargado).
  - Si status es `scored`, mostrar confirmación antes de re-recalc.
- Click Recalcular → ejecuta + muestra tabla completa de scores debajo, expandible.

## 9. Validación de input

- `updateTeam.patch`: `group_position` puede ser null (limpiar), `eliminated_at_stage` puede ser null.
- `updatePlayer.patch.is_top_scorer`: boolean estricto.
- `recalcEventScoring.event_id`: solo 1-4.
- Si el server action recibe payload que no parsea por Zod, devolver `{ error: 'Payload inválido.' }` (genérico).

## 10. Audit log

Cada server action loguea en `admin_audit_log` con:
- `actor_user_id`: el admin
- `action`: 'update_team' | 'update_player' | 'recalc_event_scoring'
- `target_table`: 'teams' | 'players' | 'events'
- `target_id`: code/id/event_id como text
- `before_data` / `after_data`: snapshots JSON

## 11. RLS

Las policies existentes (de Fase 1 + 2) ya cubren:
- `teams_admin_write`, `players_admin_write` permiten UPDATE solo a admin.
- `fn_score_event` chequea `is_admin_or_scorer()` internamente.

Cero cambios de RLS en esta fase.

## 12. Riesgos / supuestos

- **No hay constraint** de "un solo `is_top_scorer = true` a la vez". Si admin marca dos, fn_score_event scoreará a ambos. UX warning sin bloqueo es deliberado (admite empates).
- **No hay constraint** de "un solo `group_position = 1` por grupo". Idem: warning UX, no DB. Si admin se equivoca, los puntos se reparten incorrectamente y se vuelve a editar.
- **fn_score_event es idempotente** — re-correr no rompe nada, solo recalcula.
- **`v_leaderboard`** ya existe y muestra el total acumulado; no necesita cambios aquí.

## 13. Verificación post-implementación

- [ ] Migration 0008 aplica limpia (columnas nuevas + nueva versión de fn_score_event).
- [ ] `/admin` y sub-rutas redirigen a `/dashboard` si no sos admin.
- [ ] En `/admin/teams`, edito el `group_position` de un team → chip "✓ Guardado" en <1s → refresh → persiste.
- [ ] En `/admin/teams`, marcar dos teams del mismo grupo con position=1 dispara el warning amarillo.
- [ ] En `/admin/players`, marcar Messi como goleador → counter "Marcados: 1".
- [ ] En `/admin/scoring`, "Recalcular Evento 1" devuelve tabla con N filas (1 por jugador con predicciones).
- [ ] Con datos completos (todos los teams en stage final + 1 goleador marcado), recalc devuelve scores >0 que coinciden con los aciertos esperados (verificable contra el pronóstico del admin).
- [ ] `admin_audit_log` tiene una row por cada update + recalc.
- [ ] Si todas las predicciones del evento están scoreadas, `events.status` pasa a `scored` automáticamente.
