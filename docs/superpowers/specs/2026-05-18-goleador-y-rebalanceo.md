# Fix pre-Fase 3 — Goleador del torneo + rebalanceo Campeón

**Fecha:** 2026-05-18
**Estado:** Aprobada para implementación

## 1. Objetivo

Dos cambios entrelazados en el reglamento del Evento 1:

1. Rebajar el Campeón de **400 → 200 pts**.
2. Liberar esos 200 pts para una nueva categoría: **Goleador del torneo**, con 1 pick entre 18 candidatos pre-cargados.

El total del Evento 1 se mantiene en **1350 pts**.

## 2. Out of scope

- UI admin para editar la lista de players (Fase 3+).
- Marcar players como inactivos cuando su equipo se elimina.
- Validaciones cruzadas adicionales (ej. goleador debe ser de un equipo que llegó a X ronda).
- Info adicional del player (club, posición, foto).
- Recalcular `scores` existentes — todavía no hay scoring corrido para Evento 1.

## 3. Decisiones tomadas (con el usuario)

| Decisión | Elección |
|---|---|
| Storage del pick de goleador | Columna nueva `predictions.player_id` (FK enforced) |
| Nombres de jugadores | Normalizados al nombre completo + bandera de su selección |
| Posición de la sección | Al final como 6ta sección (después de Campeón) |
| UX del picker | Radio list con bandera + nombre, igual patrón que finalista/campeón |

## 4. Schema — migrations `0006` + `0007`

**Por qué dos migrations:** `ALTER TYPE ... ADD VALUE` no puede correr dentro de un bloque transaccional en PostgreSQL. Si se mezcla con statements que usan el nuevo valor (ej. `insert ... 'top_scorer'`), falla. Por eso separamos:

- **`0006_prediction_kind_top_scorer.sql`** — solo el `alter type`.
- **`0007_top_scorer_schema.sql`** — todo el resto (tabla, columna, scoring, seed, RLS, verificación).

### `app/supabase/migrations/0006_prediction_kind_top_scorer.sql`

```sql
-- =================================================================
-- Prode Mundial 2026 — Agregar 'top_scorer' al enum prediction_kind
-- Migration 0006 (debe correrse aislada — ALTER TYPE no admite transacción)
-- =================================================================
alter type prediction_kind add value if not exists 'top_scorer';
```

### `app/supabase/migrations/0007_top_scorer_schema.sql`

```sql
-- =================================================================
-- Prode Mundial 2026 — Top scorer + rebalanceo Campeón
-- Migration 0007
-- =================================================================

-- 1) Tabla players
create table players (
  id serial primary key,
  full_name text not null,
  team_code text not null references teams(code) on delete restrict,
  display_order int not null default 0,
  created_at timestamptz not null default now()
);
create index players_team_idx on players(team_code);

-- 2) Columna nueva en predictions
alter table predictions add column player_id int references players(id) on delete cascade;
create index predictions_player_idx on predictions(player_id);

-- 3) Rebalanceo scoring + nueva categoría
update event_categories
  set points_per_correct = 200
  where event_id = 1 and kind = 'champion';

insert into event_categories (event_id, kind, required_count, points_per_correct, display_order)
  values (1, 'top_scorer', 1, 200, 6)
  on conflict (event_id, kind) do update
    set required_count = excluded.required_count,
        points_per_correct = excluded.points_per_correct,
        display_order = excluded.display_order;

-- 4) Extender uniqueness para top_scorer
drop index if exists predictions_singular_uq;
create unique index predictions_singular_uq
  on predictions(user_id, event_id, kind)
  where kind in ('champion', 'finalist', 'top_scorer');

-- 5) RLS de players (patrón teams/groups)
alter table players enable row level security;

create policy "players_read_authenticated"
  on players for select to authenticated using (true);

create policy "players_admin_write"
  on players for all to authenticated
  using (is_admin()) with check (is_admin());

-- 6) Seed: 18 jugadores candidatos a goleador
insert into players (full_name, team_code, display_order) values
  ('Lionel Messi',          'ARG',  1),
  ('Julián Álvarez',        'ARG',  2),
  ('Vinícius Júnior',       'BRA',  3),
  ('Raphinha',              'BRA',  4),
  ('Neymar Jr.',            'BRA',  5),
  ('Luis Díaz',             'COL',  6),
  ('Lamine Yamal',          'ESP',  7),
  ('Harry Kane',            'ENG',  8),
  ('Kylian Mbappé',         'FRA',  9),
  ('Ousmane Dembélé',       'FRA', 10),
  ('Cristiano Ronaldo',     'POR', 11),
  ('Erling Haaland',        'NOR', 12),
  ('Alexander Sørloth',     'NOR', 13),
  ('Nick Woltemade',        'GER', 14),
  ('Jamal Musiala',         'GER', 15),
  ('Memphis Depay',         'NED', 16),
  ('Mohamed Salah',         'EGY', 17),
  ('Sadio Mané',            'SEN', 18);

-- 7) Verificación: que el Evento 1 siga sumando 1350
do $$
declare v_sum int;
begin
  select sum(required_count * points_per_correct) into v_sum
  from event_categories where event_id = 1;
  if v_sum <> 1350 then
    raise exception 'Evento 1 ya no suma 1350: %', v_sum;
  end if;
  raise notice 'OK: Evento 1 suma 1350.';
end;
$$;
```

**Notas:**
- `alter type ... add value if not exists` (en 0006) es idempotente.
- El `insert ... on conflict` permite re-correr 0007 sin error.
- `drop index if exists ... ; create unique index ...` reemplaza el constraint para incluir `top_scorer`.

## 5. Cambios en tipos TypeScript

### `app/src/lib/database.types.ts`

```ts
export type PredictionKind =
  | 'champion' | 'finalist' | 'semifinalist' | 'playoff_team' | 'group_winner'
  | 'r32_winner' | 'r32_outcome' | 'r16_winner' | 'r16_outcome'
  | 'qf_winner' | 'qf_outcome'
  | 'top_scorer';   // ← nuevo

export interface Player {
  id: number;
  full_name: string;
  team_code: string;
  display_order: number;
  created_at: string;
}

export interface Prediction {
  // ...campos existentes...
  player_id: number | null;  // ← nuevo
}
```

### `app/src/lib/event1-types.ts`

- `SECTION_KINDS`: agregar `'top_scorer'` al final.
- `type SectionKind` se actualiza automáticamente.
- `Event1State`: agregar `top_scorer: number | null` (almacena `player_id`).
- `emptyEvent1State()`: agregar `top_scorer: null`.
- `Pick`: ampliar a `{ team_code?: string; player_id?: number; meta?: { group_code?: GroupCode } }` y agregar invariante de que al menos uno de los dos esté presente.
- `sectionToPicks()`: agregar caso `case 'top_scorer': return state.top_scorer ? [{ player_id: state.top_scorer }] : [];`.

### `app/src/lib/event1-validation.ts`

- En `validateCoherence`: agregar bloque para `top_scorer` que valida que el id (si está) sea positivo. La validación contra la lista real ocurre server-side (Zod no la conoce — la valida la FK al insertar).
- `isComplete`: agregar `&& Boolean(state.top_scorer)` al final.
- `applyCascade`: sin cambios (goleador no depende de ningún upstream del bracket).

### Tests `app/src/lib/event1-validation.test.ts`

- Actualizar el test `'true when 12/32/4/1/1 filled'` → `'true when 12/32/4/1/1/1 filled'`: incluir `s.top_scorer = 1`.
- Actualizar el test `'valid full state passes coherence'` ídem.
- Agregar 1-2 tests específicos:
  - `top_scorer null pasa coherence` (es válido tener vacío durante la edición).
  - `isComplete false sin top_scorer aunque el resto esté completo`.

## 6. Loader y server actions

### `app/src/lib/predictions.ts`

- Extender `.select('kind, team_code, player_id, meta')`.
- Agregar caso al switch:
  ```ts
  case 'top_scorer':
    if (row.player_id) state.top_scorer = row.player_id;
    break;
  ```

### `app/src/app/(app)/eventos/[id]/actions.ts`

`pickSchema` cambia para soportar `player_id` (manteniendo el cast `GROUP_CODES as [GroupCode, ...GroupCode[]]` que ya usa el archivo):

```ts
const pickSchema = z
  .object({
    team_code: z.string().min(1).optional(),
    player_id: z.number().int().positive().optional(),
    meta: z
      .object({
        group_code: z.enum(GROUP_CODES as [GroupCode, ...GroupCode[]]).optional(),
      })
      .optional(),
  })
  .refine((p) => p.team_code !== undefined || p.player_id !== undefined, {
    message: 'pick debe tener team_code o player_id',
  });
```

**Validación per-kind dentro de `saveSection`** (antes del insert): el Pick es polimórfico pero cada `kind` espera un solo campo. Evitamos persistir picks malformados:

```ts
const needsPlayerId = parsed.data.kind === 'top_scorer';
const wrong = parsed.data.picks.some((p) =>
  needsPlayerId ? !p.player_id : !p.team_code,
);
if (wrong) return { error: 'Pick no coincide con el kind de la sección.' };
```

En el `insert`, mapear `player_id` además de `team_code`:

```ts
const rows = parsed.data.picks.map((p) => ({
  user_id: user.id,
  event_id: 1,
  kind: parsed.data.kind,
  team_code: p.team_code ?? null,
  player_id: p.player_id ?? null,
  meta: p.meta ?? {},
}));
```

El strategy "replace by kind" sigue intacto.

## 7. UI — page + form + nueva sección

### `app/src/app/(app)/eventos/[id]/page.tsx`

- Agregar al `Promise.all` la query `supabase.from('players').select('*').order('display_order')`.
- Pasar `players` como nuevo prop a `<Event1Form>`.

### `app/src/app/(app)/eventos/[id]/event-1-form.tsx`

- Aceptar `players: Player[]` en props.
- Calcular `teamsByCode` con `useMemo` (mapa `code → Team`) para que la sección de Goleador pueda mostrar la bandera.
- Renderizar `<TopScorer ... />` al final, antes del card de Resumen.
- Actualizar el card de Resumen: agregar línea "Goleador: ✓/—" y ajustar el contador total a 6 ítems.

### `app/src/app/(app)/eventos/[id]/sections/top-scorer.tsx` (nuevo)

```tsx
'use client';

import Image from 'next/image';
import { useMemo } from 'react';
import type { Player, Team } from '@/lib/database.types';
import type { Event1State } from '@/lib/event1-types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { SaveChip, type SaveState } from './save-chip';

export function TopScorer({
  players,
  teamsByCode,
  state,
  onChange,
  saveState,
  error,
  readOnly,
}: {
  players: Player[];
  teamsByCode: Map<string, Team>;
  state: Event1State;
  onChange: (player_id: number | null) => void;
  saveState: SaveState;
  error: string | null;
  readOnly: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>
          6. Goleador del torneo <span className="text-sm text-muted-foreground">— 1 × 200 pts</span>
        </CardTitle>
        <SaveChip state={saveState} />
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">El máximo goleador del Mundial 2026.</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {players.map((p) => {
            const team = teamsByCode.get(p.team_code);
            return (
              <Label
                key={p.id}
                className="flex cursor-pointer items-center gap-2 rounded-md border p-2 hover:bg-accent has-[:checked]:border-primary has-[:checked]:bg-primary/5"
              >
                <input
                  type="radio"
                  name="top_scorer"
                  value={p.id}
                  checked={state.top_scorer === p.id}
                  disabled={readOnly}
                  onChange={() => onChange(p.id)}
                />
                {team?.crest_url && (
                  <Image src={team.crest_url} alt="" width={20} height={20} unoptimized />
                )}
                <span>{p.full_name}</span>
              </Label>
            );
          })}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
```

## 8. Riesgos / supuestos

- **Migrations en dos partes** — `0006` debe correrse aislada (sin transacción) por la restricción de `ALTER TYPE ... ADD VALUE`. Supabase CLI auto-splittea; si se aplica desde el SQL Editor, ejecutar cada archivo por separado en queries distintas.
- **Spelling de player names** — usado mi mejor conocimiento de fútbol. Si alguno está mal escrito, se corrige con un `UPDATE players SET full_name=... WHERE id=...` puntual (no requiere otra migration).
- **Mapping player → team_code** — si alguno está mal asignado (ej. transferencia reciente), idem: `UPDATE` puntual.

## 9. Verificación post-implementación

- [ ] Migrations 0006 + 0007 corren limpias y el NOTICE de 0007 confirma "OK: Evento 1 suma 1350".
- [ ] `select count(*) from players;` devuelve 18.
- [ ] Recargo http://localhost:3000/eventos/1 → ahora hay 6 secciones; la 6ta es "Goleador" con 18 radios + banderas.
- [ ] Marcar un goleador → autosave OK ("✓ Guardado").
- [ ] Resumen card lista 6 ítems incluyendo "Goleador: ✓".
- [ ] Refresh → la selección persiste.
- [ ] El botón "Finalizar" no se habilita hasta tener todos los 6 completos.
- [ ] La sección de Campeón ahora dice "200 pts" (no 400). El header de la card cambia con el `points` prop del RadioCard.
- [ ] `npm run test` verde (12 originales + ~2 nuevos).
- [ ] `npx tsc --noEmit && npm run lint` limpios.
