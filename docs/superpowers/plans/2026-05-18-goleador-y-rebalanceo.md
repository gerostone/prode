# Goleador del torneo + rebalanceo Campeón — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bajar el Campeón del Evento 1 de 400 → 200 pts y agregar una sexta sección "Goleador del torneo" (1 pick entre 18 players, vale 200 pts). Total del evento se mantiene en 1350.

**Architecture:** Dos migrations SQL (separadas porque `ALTER TYPE ADD VALUE` no admite transacción), nueva tabla `players` con FK desde `predictions.player_id`. En TypeScript: el `Event1State` gana un campo `top_scorer: number | null`, el `Pick` se vuelve polimórfico (`team_code?` o `player_id?`), la sección UI nueva `top-scorer.tsx` reutiliza el patrón de radio-list de finalista/campeón. Server action `saveSection` valida per-kind y mapea `player_id` al insert.

**Tech Stack:** Postgres + Supabase (migrations), TypeScript, Vitest, Next.js 14 App Router + React, Zod.

**Spec:** `docs/superpowers/specs/2026-05-18-goleador-y-rebalanceo.md`

---

## File Structure Overview

| Archivo | Responsabilidad |
|---|---|
| `app/supabase/migrations/0006_prediction_kind_top_scorer.sql` | **NEW** — solo el `alter type` |
| `app/supabase/migrations/0007_top_scorer_schema.sql` | **NEW** — tabla, columna, scoring, seed, RLS, verificación |
| `app/src/lib/database.types.ts` | **MODIFY** — agregar `'top_scorer'` a `PredictionKind`, interface `Player`, `Prediction.player_id` |
| `app/src/lib/event1-types.ts` | **MODIFY** — `SECTION_KINDS`, `Event1State`, `Pick`, helpers |
| `app/src/lib/event1-validation.ts` | **MODIFY** — `isComplete` incluye top_scorer |
| `app/src/lib/event1-validation.test.ts` | **MODIFY** — actualizar tests existentes + agregar nuevos |
| `app/src/lib/predictions.ts` | **MODIFY** — select `player_id`, case top_scorer |
| `app/src/app/(app)/eventos/[id]/actions.ts` | **MODIFY** — Zod, validación per-kind, insert mapping |
| `app/src/app/(app)/eventos/[id]/page.tsx` | **MODIFY** — cargar players, pasarlos al form |
| `app/src/app/(app)/eventos/[id]/event-1-form.tsx` | **MODIFY** — sumar sección, prop `players`, resumen |
| `app/src/app/(app)/eventos/[id]/sections/top-scorer.tsx` | **NEW** — radio list con bandera + nombre |

---

## Task 1: Migrations SQL

**Files:**
- Create: `app/supabase/migrations/0006_prediction_kind_top_scorer.sql`
- Create: `app/supabase/migrations/0007_top_scorer_schema.sql`

⚠️ **Importante:** este task solo crea + commitea los archivos SQL. **Las migrations deben aplicarse a la DB de Supabase ANTES de Task 8 (verificación manual).** Hasta entonces, los inserts a `predictions` con `kind='top_scorer'` van a fallar en runtime (aunque typecheck/test pasen). El orden recomendado para aplicarlas:
1. Aplicar `0006` primero, **aislada** (sin transacción).
2. Aplicar `0007` después.

Para Supabase CLI: `supabase db push` lo maneja correctamente.
Para SQL Editor del dashboard: pegar cada archivo en queries separadas, una a la vez.

- [ ] **Step 1: Crear `0006_prediction_kind_top_scorer.sql`**

Create `app/supabase/migrations/0006_prediction_kind_top_scorer.sql`:
```sql
-- =================================================================
-- Prode Mundial 2026 — Agregar 'top_scorer' al enum prediction_kind
-- Migration 0006 (debe correrse aislada — ALTER TYPE no admite transacción)
-- =================================================================
alter type prediction_kind add value if not exists 'top_scorer';
```

- [ ] **Step 2: Crear `0007_top_scorer_schema.sql`**

Create `app/supabase/migrations/0007_top_scorer_schema.sql`:
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

- [ ] **Step 3: Commit**

```bash
cd /Users/Gero/Documents/Prode/Prode && git add app/supabase/migrations/0006_prediction_kind_top_scorer.sql app/supabase/migrations/0007_top_scorer_schema.sql && git commit -m "feat(db): migration 0006+0007 — top_scorer kind y rebalanceo Campeón"
```

---

## Task 2: Actualizar database.types.ts

**Files:**
- Modify: `app/src/lib/database.types.ts`

- [ ] **Step 1: Agregar `'top_scorer'` al union `PredictionKind`**

En `app/src/lib/database.types.ts`, encontrar la definición existente:
```ts
export type PredictionKind =
  | 'champion'
  | 'finalist'
  | 'semifinalist'
  | 'playoff_team'
  | 'group_winner'
  | 'r32_winner'
  | 'r32_outcome'
  | 'r16_winner'
  | 'r16_outcome'
  | 'qf_winner'
  | 'qf_outcome';
```

Reemplazar con:
```ts
export type PredictionKind =
  | 'champion'
  | 'finalist'
  | 'semifinalist'
  | 'playoff_team'
  | 'group_winner'
  | 'r32_winner'
  | 'r32_outcome'
  | 'r16_winner'
  | 'r16_outcome'
  | 'qf_winner'
  | 'qf_outcome'
  | 'top_scorer';
```

- [ ] **Step 2: Agregar interface `Player`**

Insertar justo después de la interface `Team` (cerca de la línea 46):

```ts
export interface Player {
  id: number;
  full_name: string;
  team_code: string;
  display_order: number;
  created_at: string;
}
```

- [ ] **Step 3: Agregar `player_id` a la interface `Prediction`**

Encontrar la interface `Prediction` y agregar el campo justo después de `match_id`:

```ts
export interface Prediction {
  id: number;
  user_id: string;
  event_id: number;
  kind: PredictionKind;
  team_code: string | null;
  match_id: number | null;
  player_id: number | null;   // ← NUEVO
  outcome: MatchOutcome | null;
  meta: Record<string, unknown>;
  is_correct: boolean | null;
  awarded_points: number;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 4: Typecheck**

Run: `cd /Users/Gero/Documents/Prode/Prode/app && npx tsc --noEmit`
Expected: exit 0.

(Es posible que falle por usos posteriores de `Prediction` que asuman shape antiguo. Si falla, leer el error — debería resolverse en Tasks 5/6.)

- [ ] **Step 5: Commit**

```bash
cd /Users/Gero/Documents/Prode/Prode && git add app/src/lib/database.types.ts && git commit -m "feat(types): agregar PredictionKind 'top_scorer', interface Player, Prediction.player_id"
```

---

## Task 3: Actualizar event1-types.ts

**Files:**
- Modify: `app/src/lib/event1-types.ts`

- [ ] **Step 1: Agregar `'top_scorer'` a `SECTION_KINDS`**

Encontrar:
```ts
export const SECTION_KINDS = ['group_winner', 'playoff_team', 'semifinalist', 'finalist', 'champion'] as const;
```

Reemplazar con:
```ts
export const SECTION_KINDS = ['group_winner', 'playoff_team', 'semifinalist', 'finalist', 'champion', 'top_scorer'] as const;
```

- [ ] **Step 2: Ampliar `Pick` y agregar campo a `Event1State`**

Reemplazar la interface `Pick`:
```ts
export interface Pick {
  team_code?: string;
  player_id?: number;
  meta?: { group_code?: GroupCode };
}
```

Reemplazar `Event1State`:
```ts
export interface Event1State {
  group_winner: Partial<Record<GroupCode, string>>;
  playoff_team: string[];
  semifinalist: string[];
  finalist: string | null;
  champion: string | null;
  top_scorer: number | null;
}
```

- [ ] **Step 3: Actualizar `emptyEvent1State`**

Reemplazar:
```ts
export function emptyEvent1State(): Event1State {
  return {
    group_winner: {},
    playoff_team: [],
    semifinalist: [],
    finalist: null,
    champion: null,
    top_scorer: null,
  };
}
```

- [ ] **Step 4: Agregar caso `top_scorer` a `sectionToPicks`**

Dentro del `switch` de `sectionToPicks`, agregar el último case antes de cerrar:
```ts
    case 'top_scorer':
      return state.top_scorer !== null ? [{ player_id: state.top_scorer }] : [];
```

- [ ] **Step 5: Typecheck**

Run: `cd /Users/Gero/Documents/Prode/Prode/app && npx tsc --noEmit`
Expected: exit 0 (puede fallar en archivos downstream — Tasks 4/5/6/7 los arreglan).

- [ ] **Step 6: NO commit todavía** — los cambios de Task 3 dependen de los tests/impl de Task 4 para typechear cleanly. Commitear juntos al final de Task 4.

---

## Task 4: Actualizar validación + tests (TDD)

**Files:**
- Modify: `app/src/lib/event1-validation.ts`
- Modify: `app/src/lib/event1-validation.test.ts`

- [ ] **Step 1: Actualizar tests existentes y agregar nuevos (failing)**

En `app/src/lib/event1-validation.test.ts`, encontrar el test `'valid full state passes coherence'` y agregar `s.top_scorer = 1;` antes de `const res = validateCoherence(...)`:

```ts
  it('valid full state passes coherence', () => {
    const s = emptyEvent1State();
    s.playoff_team = GROUP_CODES.flatMap((g) => [`${g}1`, `${g}2`, `${g}3`]).slice(0, 32);
    const playoffSet = new Set(s.playoff_team);
    for (const g of GROUP_CODES) {
      if (playoffSet.has(`${g}1`)) s.group_winner[g] = `${g}1`;
    }
    s.semifinalist = ['A1', 'B1', 'C1', 'D1'];
    s.finalist = 'A1';
    s.champion = 'B1';
    s.top_scorer = 1;
    const res = validateCoherence(s, ctx);
    expect(res.ok).toBe(true);
  });
```

Encontrar el test `'true when 12/32/4/1/1 filled'` (en `describe('isComplete')`) y renombrarlo + agregar el top_scorer:

```ts
  it('true when 12/32/4/1/1/1 filled', () => {
    const s = emptyEvent1State();
    for (const g of GROUP_CODES) s.group_winner[g] = `${g}1`;
    s.playoff_team = GROUP_CODES.flatMap((g) => [`${g}1`, `${g}2`, `${g}3`]).slice(0, 32);
    s.semifinalist = ['A1', 'B1', 'C1', 'D1'];
    s.finalist = 'A1';
    s.champion = 'A1';
    s.top_scorer = 1;
    expect(isComplete(s)).toBe(true);
  });
```

Agregar **al final del archivo** dos describe blocks nuevos:

```ts
describe('validateCoherence — top_scorer', () => {
  it('null pasa coherence', () => {
    const s = emptyEvent1State();
    const res = validateCoherence(s, ctx);
    expect(res.ok).toBe(true);
  });

  it('id positivo pasa coherence', () => {
    const s = emptyEvent1State();
    s.top_scorer = 42;
    const res = validateCoherence(s, ctx);
    expect(res.ok).toBe(true);
  });
});

describe('isComplete — top_scorer', () => {
  it('false si falta top_scorer aunque el resto esté completo', () => {
    const s = emptyEvent1State();
    for (const g of GROUP_CODES) s.group_winner[g] = `${g}1`;
    s.playoff_team = GROUP_CODES.flatMap((g) => [`${g}1`, `${g}2`, `${g}3`]).slice(0, 32);
    s.semifinalist = ['A1', 'B1', 'C1', 'D1'];
    s.finalist = 'A1';
    s.champion = 'A1';
    // top_scorer queda null
    expect(isComplete(s)).toBe(false);
  });
});
```

- [ ] **Step 2: Correr tests para ver que fallan**

Run: `cd /Users/Gero/Documents/Prode/Prode/app && npx vitest run src/lib/event1-validation.test.ts`

Expected: el test nuevo `'false si falta top_scorer aunque el resto esté completo'` falla — porque `isComplete` actual no chequea top_scorer y devuelve `true` cuando el test espera `false`. Los otros tests modificados (`'valid full state passes coherence'` y `'true when 12/32/4/1/1/1 filled'`) siguen pasando porque coherence ignora top_scorer y isComplete con top_scorer=1 igual devuelve true por la regla vieja.

- [ ] **Step 3: Actualizar `isComplete` en event1-validation.ts**

Encontrar la función `isComplete`:
```ts
export function isComplete(state: Event1State): boolean {
  const allGroups = GROUP_CODES.every((g) => Boolean(state.group_winner[g]));
  return (
    allGroups &&
    state.playoff_team.length === 32 &&
    state.semifinalist.length === 4 &&
    Boolean(state.finalist) &&
    Boolean(state.champion)
  );
}
```

Reemplazar con (agregar la última línea):
```ts
export function isComplete(state: Event1State): boolean {
  const allGroups = GROUP_CODES.every((g) => Boolean(state.group_winner[g]));
  return (
    allGroups &&
    state.playoff_team.length === 32 &&
    state.semifinalist.length === 4 &&
    Boolean(state.finalist) &&
    Boolean(state.champion) &&
    state.top_scorer !== null
  );
}
```

- [ ] **Step 4: Correr tests, todos verde**

Run: `cd /Users/Gero/Documents/Prode/Prode/app && npx vitest run src/lib/event1-validation.test.ts`
Expected: 15/15 (o el total que sea) tests pasan.

- [ ] **Step 5: Typecheck**

Run: `cd /Users/Gero/Documents/Prode/Prode/app && npx tsc --noEmit`
Expected: exit 0 (puede fallar en archivos downstream — Tasks 5/6/7).

- [ ] **Step 6: Commit Tasks 3 + 4 juntos**

```bash
cd /Users/Gero/Documents/Prode/Prode && git add app/src/lib/event1-types.ts app/src/lib/event1-validation.ts app/src/lib/event1-validation.test.ts && git commit -m "feat(validation): incluir top_scorer en SECTION_KINDS + Event1State + isComplete"
```

---

## Task 5: Actualizar predictions loader

**Files:**
- Modify: `app/src/lib/predictions.ts`

- [ ] **Step 1: Extender `.select(...)` y agregar el case `top_scorer`**

En `app/src/lib/predictions.ts`, encontrar la query:
```ts
const { data, error } = await supabase
  .from('predictions')
  .select('kind, team_code, meta')
  .eq('user_id', userId)
  .eq('event_id', 1);
```

Cambiar el select a:
```ts
const { data, error } = await supabase
  .from('predictions')
  .select('kind, team_code, player_id, meta')
  .eq('user_id', userId)
  .eq('event_id', 1);
```

Y el tipo del cast:
```ts
for (const row of (data ?? []) as Pick<Prediction, 'kind' | 'team_code' | 'player_id' | 'meta'>[]) {
```

(El name colision con `Pick` de event1-types no aplica porque en este archivo se importa solo desde `database.types`.)

Dentro del `switch`, agregar el case después de `'champion'`:
```ts
    case 'top_scorer':
      if (row.player_id !== null) state.top_scorer = row.player_id;
      break;
```

- [ ] **Step 2: Typecheck**

Run: `cd /Users/Gero/Documents/Prode/Prode/app && npx tsc --noEmit`
Expected: exit 0 (puede fallar en actions.ts/UI — Tasks 6/7).

- [ ] **Step 3: Commit**

```bash
cd /Users/Gero/Documents/Prode/Prode && git add app/src/lib/predictions.ts && git commit -m "feat(loader): leer player_id de predictions y hidratar Event1State.top_scorer"
```

---

## Task 6: Actualizar server actions

**Files:**
- Modify: `app/src/app/(app)/eventos/[id]/actions.ts`

- [ ] **Step 1: Actualizar `pickSchema` Zod**

En `app/src/app/(app)/eventos/[id]/actions.ts`, encontrar:
```ts
const pickSchema = z.object({
  team_code: z.string().min(1),
  meta: z
    .object({
      group_code: z.enum(GROUP_CODES as [GroupCode, ...GroupCode[]]).optional(),
    })
    .optional(),
});
```

Reemplazar con:
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

- [ ] **Step 2: Agregar validación per-kind dentro de `saveSection`**

En la función `saveSection`, después del bloque que verifica `event.status` (autorización) y ANTES del `delete from predictions`, agregar:

```ts
  // Validación per-kind: top_scorer requiere player_id; el resto requiere team_code.
  const needsPlayerId = parsed.data.kind === 'top_scorer';
  const wrong = parsed.data.picks.some((p) =>
    needsPlayerId ? !p.player_id : !p.team_code,
  );
  if (wrong) return { error: 'Pick no coincide con el kind de la sección.' };
```

- [ ] **Step 3: Mapear `player_id` en el insert**

Encontrar el bloque `if (parsed.data.picks.length > 0) { const rows = ... }` y reemplazar el `rows = ...` con:

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

- [ ] **Step 4: Typecheck**

Run: `cd /Users/Gero/Documents/Prode/Prode/app && npx tsc --noEmit`
Expected: exit 0 (puede fallar en UI — Task 7).

- [ ] **Step 5: Commit**

```bash
cd /Users/Gero/Documents/Prode/Prode && git add app/src/app/\(app\)/eventos/\[id\]/actions.ts && git commit -m "feat(actions): pickSchema acepta player_id y validación per-kind en saveSection"
```

---

## Task 7: UI — nueva sección + page + form

**Files:**
- Create: `app/src/app/(app)/eventos/[id]/sections/top-scorer.tsx`
- Modify: `app/src/app/(app)/eventos/[id]/page.tsx`
- Modify: `app/src/app/(app)/eventos/[id]/event-1-form.tsx`

### Step 1-2: Crear el componente nuevo

- [ ] **Step 1: Crear `top-scorer.tsx`**

Create `app/src/app/(app)/eventos/[id]/sections/top-scorer.tsx`:
```tsx
'use client';

import Image from 'next/image';
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
          6. Goleador del torneo{' '}
          <span className="text-sm text-muted-foreground">— 1 × 200 pts</span>
        </CardTitle>
        <SaveChip state={saveState} />
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          El máximo goleador del Mundial 2026.
        </p>
        {players.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Todavía no hay candidatos cargados.
          </p>
        ) : (
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
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
```

### Step 3-4: Actualizar el champion display y rebalanceo en finalist-and-champion

- [ ] **Step 2: Cambiar el "points" del Campeón en `finalist-and-champion.tsx`**

En `app/src/app/(app)/eventos/[id]/sections/finalist-and-champion.tsx`, encontrar el segundo `<RadioCard>`:
```tsx
      <RadioCard
        name="champion"
        title="5. Campeón"
        points="1 × 400 pts"
```

Cambiar a:
```tsx
      <RadioCard
        name="champion"
        title="5. Campeón"
        points="1 × 200 pts"
```

### Step 3-5: Actualizar page.tsx — cargar players

- [ ] **Step 3: Cargar players en `page.tsx`**

En `app/src/app/(app)/eventos/[id]/page.tsx`, encontrar el bloque:
```tsx
  const [eventRes, teamsRes, state] = await Promise.all([
    supabase.from('events').select('*').eq('id', 1).single<Event>(),
    supabase.from('teams').select('*').order('group_code').order('name'),
    loadEvent1State(user.id),
  ]);
```

Cambiar a:
```tsx
  const [eventRes, teamsRes, playersRes, state] = await Promise.all([
    supabase.from('events').select('*').eq('id', 1).single<Event>(),
    supabase.from('teams').select('*').order('group_code').order('name'),
    supabase.from('players').select('*').order('display_order'),
    loadEvent1State(user.id),
  ]);
```

Encontrar el bloque que extrae `teams`:
```tsx
  const teams = (teamsRes.data ?? []) as Team[];
```

Inmediatamente debajo, agregar:
```tsx
  const players = (playersRes.data ?? []) as Player[];
```

Importar `Player` arriba (encontrar la línea `import type { Event, Team } from '@/lib/database.types';` y cambiarla):
```tsx
import type { Event, Team, Player } from '@/lib/database.types';
```

Encontrar el JSX:
```tsx
      {(canEdit || isReadOnly) && (
        <Event1Form
          teams={teams}
          initialState={state}
          readOnly={isReadOnly}
        />
      )}
```

Cambiar a:
```tsx
      {(canEdit || isReadOnly) && (
        <Event1Form
          teams={teams}
          players={players}
          initialState={state}
          readOnly={isReadOnly}
        />
      )}
```

### Step 4-6: Actualizar Event1Form

- [ ] **Step 4: Aceptar `players` y renderizar `<TopScorer>`**

En `app/src/app/(app)/eventos/[id]/event-1-form.tsx`:

1. Encontrar el import de `database.types`:
```ts
import type { Team } from '@/lib/database.types';
```
Cambiar a:
```ts
import type { Team, Player } from '@/lib/database.types';
```

2. Agregar el import del nuevo componente, junto a los otros section imports:
```ts
import { TopScorer } from './sections/top-scorer';
```

3. Encontrar la signature de `Event1Form` y agregar `players` al destructure y a las props:

```tsx
export function Event1Form({
  teams,
  players,
  initialState,
  readOnly,
}: {
  teams: Team[];
  players: Player[];
  initialState: Event1State;
  readOnly: boolean;
}) {
```

4. Agregar `top_scorer: null` al `useRef` de `timers` (es `Record<SectionKind, ...>` con valor inicial hardcodeado de 5 keys — al sumar `'top_scorer'` a `SECTION_KINDS`, TypeScript exige las 6 keys).

Encontrar:
```ts
  const timers = useRef<Record<SectionKind, ReturnType<typeof setTimeout> | null>>({
    group_winner: null,
    playoff_team: null,
    semifinalist: null,
    finalist: null,
    champion: null,
  });
```

Cambiar a:
```ts
  const timers = useRef<Record<SectionKind, ReturnType<typeof setTimeout> | null>>({
    group_winner: null,
    playoff_team: null,
    semifinalist: null,
    finalist: null,
    champion: null,
    top_scorer: null,
  });
```

5. Agregar un `useMemo` para `teamsByCode` (necesario para TopScorer). Insertar después de la definición de `validation`:

```ts
  const teamsByCode = useMemo(() => new Map(teams.map((t) => [t.code, t])), [teams]);
```

6. Renderizar `<TopScorer>` después de `<FinalistAndChampion>` y ANTES del Card de Resumen. Insertar:

```tsx
      <TopScorer
        players={players}
        teamsByCode={teamsByCode}
        state={state}
        onChange={(top_scorer) => update('top_scorer', { top_scorer })}
        saveState={saveStates.top_scorer}
        error={errorFor('top_scorer')}
        readOnly={readOnly}
      />
```

7. Actualizar el Card de Resumen — agregar la línea de Goleador al `<ul>`:

Encontrar:
```tsx
          <ul className="text-sm">
            <li>Ganadores de grupo: {Object.values(state.group_winner).filter(Boolean).length}/12</li>
            <li>Equipos a playoffs: {state.playoff_team.length}/32</li>
            <li>Semifinalistas: {state.semifinalist.length}/4</li>
            <li>Finalista: {state.finalist ? '✓' : '—'}</li>
            <li>Campeón: {state.champion ? '✓' : '—'}</li>
          </ul>
```

Cambiar a:
```tsx
          <ul className="text-sm">
            <li>Ganadores de grupo: {Object.values(state.group_winner).filter(Boolean).length}/12</li>
            <li>Equipos a playoffs: {state.playoff_team.length}/32</li>
            <li>Semifinalistas: {state.semifinalist.length}/4</li>
            <li>Finalista: {state.finalist ? '✓' : '—'}</li>
            <li>Campeón: {state.champion ? '✓' : '—'}</li>
            <li>Goleador: {state.top_scorer ? '✓' : '—'}</li>
          </ul>
```

- [ ] **Step 5: Typecheck + lint**

```bash
cd /Users/Gero/Documents/Prode/Prode/app && npx tsc --noEmit && npm run lint
```
Expected: ambos limpios.

Si lint flaggea unused imports (probable: `useMemo` ya estaba ahí; pueden quedar imports viejos sin uso), removelos antes de commitear.

- [ ] **Step 6: Commit**

```bash
cd /Users/Gero/Documents/Prode/Prode && git add app/src/app/\(app\)/eventos/\[id\]/sections/top-scorer.tsx app/src/app/\(app\)/eventos/\[id\]/sections/finalist-and-champion.tsx app/src/app/\(app\)/eventos/\[id\]/page.tsx app/src/app/\(app\)/eventos/\[id\]/event-1-form.tsx && git commit -m "feat(ui): nueva sección Goleador + ajuste Campeón 200 pts"
```

---

## Task 8: Verificación end-to-end + push

⚠️ **Antes de empezar Task 8, las migrations 0006 + 0007 deben estar aplicadas en Supabase.** Si todavía no, hacelo ahora:

- Con Supabase CLI: `cd app && supabase db push`
- O manualmente: SQL Editor → pegar `0006_prediction_kind_top_scorer.sql` → Run → después pegar `0007_top_scorer_schema.sql` → Run.

Confirmá con: `select count(*) from players;` → debe devolver `18`.

- [ ] **Step 1: Tests, typecheck, lint todos verde**

```bash
cd /Users/Gero/Documents/Prode/Prode/app && npm run test && npx tsc --noEmit && npm run lint
```
Expected: todo verde (15/15 tests aprox, exit 0, "No ESLint warnings or errors").

- [ ] **Step 2: Build de producción (sanity check)**

```bash
cd /Users/Gero/Documents/Prode/Prode/app && npm run build
```
Expected: "Compiled successfully" y el listado de rutas incluye `/eventos/[id]`.

- [ ] **Step 3: Dev server + manual smoke**

```bash
cd /Users/Gero/Documents/Prode/Prode/app && npm run dev
```

Abrir http://localhost:3000/eventos/1 (logueado como admin `gicornou@gmail.com`).

Checks:
- Hay 6 cards: Grupo, Playoffs, Semis, Finalista, Campeón, **Goleador** (nueva).
- El title de Campeón dice "1 × 200 pts" (NO 400).
- El Goleador muestra los 18 jugadores con su bandera al lado.
- Click en un goleador → chip "Editando..." → ~800ms → "Guardando..." → "✓ Guardado".
- El Resumen lista 6 ítems incluyendo "Goleador: ✓".
- Refrescar → la selección persiste.
- Si limpiás el goleador (tendrás que tocar el código o ir directamente a DB; en runtime los radios no permiten desmarcar — comportamiento esperado: solo cambiar entre opciones), el botón "Finalizar" se deshabilita.

- [ ] **Step 4: Push a origin/main**

```bash
cd /Users/Gero/Documents/Prode/Prode && git push origin main
```

Vercel re-deploya automáticamente. Una vez que termine, repetir el smoke en la URL de Vercel.

- [ ] **Step 5: Limpieza de TodoWrite**

Marcar el plan como completo en TodoWrite.
