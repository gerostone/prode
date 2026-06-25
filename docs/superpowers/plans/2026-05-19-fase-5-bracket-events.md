# Fase 5 — UI Bracket para Eventos 2/3/4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir un `BracketForm` reusable que sirve `/eventos/2`, `/eventos/3`, `/eventos/4` (32avos, octavos, cuartos), plus admin UI `/admin/matches` para cargar los teams de los R32, plus banner+CLI de verificación contra el bracket FIFA oficial.

**Architecture:** Un componente client `BracketForm` parametrizado por `BracketConfig` (eventId+stage+kinds+points) renderiza N `BracketMatchRow`. Autosave por kind (winner / outcome) con debounce 800ms. El `saveSection` existente se generaliza para aceptar `event_id` + las 6 kinds bracket nuevas. `AdminToggle` y `openEvent`/`lockEvent` se generalizan para aceptar `event_id`. Una pantalla admin nueva `/admin/matches` permite editar `home_team_code`/`away_team_code` de los 31 matches. Un CLI `npm run db:verify-bracket` imprime el árbol del bracket para comparar contra FIFA.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind, Vitest, Zod, Supabase.

**Spec:** `docs/superpowers/specs/2026-05-19-fase-5-bracket-events.md`

---

## File Structure Overview

| Archivo | Responsabilidad |
|---|---|
| `app/src/lib/bracket-types.ts` | **NEW** — `BracketState`, `BracketConfig`, `BRACKET_CONFIGS`, helpers |
| `app/src/lib/bracket-validation.ts` | **NEW** — `isBracketComplete`, `validateBracketCoherence` (pure) |
| `app/src/lib/bracket-validation.test.ts` | **NEW** — Vitest tests para los helpers puros |
| `app/src/lib/bracket-predictions.ts` | **NEW** — `loadBracketState(userId, eventId)` |
| `app/src/app/(app)/eventos/[id]/actions.ts` | **MODIFY** — `saveSection` acepta `event_id` + nuevas kinds; `openEvent`/`lockEvent` aceptan `event_id` |
| `app/src/app/(app)/eventos/[id]/admin-toggle.tsx` | **MODIFY** — acepta `eventId` |
| `app/src/app/(app)/eventos/[id]/event-1-form.tsx` | **MODIFY** — pasa `event_id: 1` al `saveSection` |
| `app/src/app/(app)/eventos/[id]/page.tsx` | **MODIFY** — dispatcher 1 vs 2/3/4 |
| `app/src/app/(app)/eventos/[id]/bracket-form.tsx` | **NEW** — client root del bracket |
| `app/src/app/(app)/eventos/[id]/bracket-match-row.tsx` | **NEW** — 1 match con 2 inputs |
| `app/src/app/(app)/admin/matches/page.tsx` | **NEW** — server: carga 31 matches + 48 teams |
| `app/src/app/(app)/admin/matches/matches-editor.tsx` | **NEW** — client: autosave home/away + banner + pairings inline |
| `app/src/app/(app)/admin/matches/actions.ts` | **NEW** — `updateMatchTeams` |
| `app/src/app/(app)/admin/page.tsx` | **MODIFY** — 5ta card "Matches" |
| `app/scripts/verify-bracket.ts` | **NEW** — CLI imprime árbol del bracket |
| `app/package.json` | **MODIFY** — script `db:verify-bracket` |

---

## Task 1: Shared types, loader, validation (con tests TDD)

**Files:**
- Create: `app/src/lib/bracket-types.ts`
- Create: `app/src/lib/bracket-validation.ts`
- Create: `app/src/lib/bracket-validation.test.ts`
- Create: `app/src/lib/bracket-predictions.ts`

- [ ] **Step 1: Crear `bracket-types.ts`**

Create `app/src/lib/bracket-types.ts`:
```ts
import type { MatchOutcome, PredictionKind } from './database.types';

export type BracketStage = 'r32' | 'r16' | 'qf';

export interface BracketState {
  winners: Record<number, string>;
  outcomes: Record<number, MatchOutcome>;
}

export function emptyBracketState(): BracketState {
  return { winners: {}, outcomes: {} };
}

export interface BracketConfig {
  eventId: number;
  stage: BracketStage;
  winnerKind: PredictionKind;
  outcomeKind: PredictionKind;
  pointsWinner: number;
  pointsOutcome: number;
  expectedMatchCount: number;
}

export const BRACKET_CONFIGS: Record<number, BracketConfig> = {
  2: {
    eventId: 2, stage: 'r32',
    winnerKind: 'r32_winner', outcomeKind: 'r32_outcome',
    pointsWinner: 8, pointsOutcome: 2, expectedMatchCount: 16,
  },
  3: {
    eventId: 3, stage: 'r16',
    winnerKind: 'r16_winner', outcomeKind: 'r16_outcome',
    pointsWinner: 15, pointsOutcome: 5, expectedMatchCount: 8,
  },
  4: {
    eventId: 4, stage: 'qf',
    winnerKind: 'qf_winner', outcomeKind: 'qf_outcome',
    pointsWinner: 20, pointsOutcome: 10, expectedMatchCount: 4,
  },
};
```

- [ ] **Step 2: Escribir tests (failing) para validation**

Create `app/src/lib/bracket-validation.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { isBracketComplete, validateBracketCoherence } from './bracket-validation';
import { emptyBracketState } from './bracket-types';
import type { Match } from './database.types';

function makeMatch(id: number, slot: string, home: string | null, away: string | null): Match {
  return {
    id, stage: 'r32', bracket_slot: slot,
    home_team_code: home, away_team_code: away,
    scheduled_at: null,
    home_score_90: null, away_score_90: null,
    home_score_120: null, away_score_120: null,
    went_to_penalties: false, winner_team_code: null,
    outcome_pre_penalties: null,
    parent_slot_home: null, parent_slot_away: null,
    external_id: null, locked: false,
  };
}

describe('isBracketComplete', () => {
  it('returns complete=true and missing=0 cuando no hay matches con teams', () => {
    const matches = [makeMatch(1, 'R32-01', null, null)];
    const result = isBracketComplete(emptyBracketState(), matches);
    expect(result.complete).toBe(true);
    expect(result.missing).toBe(0);
  });

  it('returns complete=false si falta winner', () => {
    const matches = [makeMatch(1, 'R32-01', 'ARG', 'BRA')];
    const state = emptyBracketState();
    state.outcomes[1] = 'home';
    const result = isBracketComplete(state, matches);
    expect(result.complete).toBe(false);
    expect(result.missing).toBe(1);
  });

  it('returns complete=true cuando todos los matches con teams están completos', () => {
    const matches = [
      makeMatch(1, 'R32-01', 'ARG', 'BRA'),
      makeMatch(2, 'R32-02', null, null), // sin teams: se ignora
    ];
    const state = emptyBracketState();
    state.winners[1] = 'ARG';
    state.outcomes[1] = 'home';
    const result = isBracketComplete(state, matches);
    expect(result.complete).toBe(true);
    expect(result.missing).toBe(0);
  });
});

describe('validateBracketCoherence', () => {
  it('rechaza si winner no es home ni away', () => {
    const matches = [makeMatch(1, 'R32-01', 'ARG', 'BRA')];
    const state = emptyBracketState();
    state.winners[1] = 'ESP';
    const result = validateBracketCoherence(state, matches);
    expect(result.ok).toBe(false);
  });

  it('acepta si winner es home', () => {
    const matches = [makeMatch(1, 'R32-01', 'ARG', 'BRA')];
    const state = emptyBracketState();
    state.winners[1] = 'ARG';
    const result = validateBracketCoherence(state, matches);
    expect(result.ok).toBe(true);
  });

  it('acepta si winner es away', () => {
    const matches = [makeMatch(1, 'R32-01', 'ARG', 'BRA')];
    const state = emptyBracketState();
    state.winners[1] = 'BRA';
    const result = validateBracketCoherence(state, matches);
    expect(result.ok).toBe(true);
  });

  it('ignora matches con teams nulos', () => {
    const matches = [makeMatch(1, 'R32-01', null, null)];
    const state = emptyBracketState();
    state.winners[1] = 'ARG'; // raro pero no es coherence error porque no hay teams a comparar
    const result = validateBracketCoherence(state, matches);
    expect(result.ok).toBe(true);
  });
});
```

- [ ] **Step 3: Correr tests para ver que fallan**

```bash
cd /Users/Gero/Documents/Prode/Prode/app && npx vitest run src/lib/bracket-validation.test.ts
```

Expected: error "Cannot find module './bracket-validation'".

- [ ] **Step 4: Implementar `bracket-validation.ts`**

Create `app/src/lib/bracket-validation.ts`:
```ts
import type { Match } from './database.types';
import type { BracketState } from './bracket-types';

export function isBracketComplete(
  state: BracketState,
  matches: Match[],
): { complete: boolean; missing: number } {
  let missing = 0;
  for (const m of matches) {
    if (m.home_team_code === null || m.away_team_code === null) continue;
    if (!state.winners[m.id]) missing++;
    else if (!state.outcomes[m.id]) missing++;
  }
  return { complete: missing === 0, missing };
}

export function validateBracketCoherence(
  state: BracketState,
  matches: Match[],
): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const matchById = new Map(matches.map((m) => [m.id, m]));

  for (const [matchIdStr, winner] of Object.entries(state.winners)) {
    const matchId = Number(matchIdStr);
    const m = matchById.get(matchId);
    if (!m) continue;
    if (m.home_team_code === null || m.away_team_code === null) continue;
    if (winner !== m.home_team_code && winner !== m.away_team_code) {
      errors.push(
        `${m.bracket_slot}: ganador ${winner} no es ${m.home_team_code} ni ${m.away_team_code}.`,
      );
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
```

- [ ] **Step 5: Correr tests — todos verde**

```bash
cd /Users/Gero/Documents/Prode/Prode/app && npx vitest run src/lib/bracket-validation.test.ts
```

Expected: 7 tests pasan.

- [ ] **Step 6: Crear `bracket-predictions.ts`**

Create `app/src/lib/bracket-predictions.ts`:
```ts
import type { Prediction } from './database.types';
import { emptyBracketState, type BracketState } from './bracket-types';
import { createSupabaseServerClient } from './supabase-server';

export async function loadBracketState(
  userId: string,
  eventId: number,
): Promise<BracketState> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from('predictions')
    .select('kind, match_id, team_code, outcome')
    .eq('user_id', userId)
    .eq('event_id', eventId);

  if (error) throw error;

  const state = emptyBracketState();
  for (const row of (data ?? []) as Pick<Prediction, 'kind' | 'match_id' | 'team_code' | 'outcome'>[]) {
    if (row.match_id === null) continue;
    switch (row.kind) {
      case 'r32_winner':
      case 'r16_winner':
      case 'qf_winner':
        if (row.team_code) state.winners[row.match_id] = row.team_code;
        break;
      case 'r32_outcome':
      case 'r16_outcome':
      case 'qf_outcome':
        if (row.outcome) state.outcomes[row.match_id] = row.outcome;
        break;
    }
  }
  return state;
}
```

- [ ] **Step 7: Typecheck**

```bash
cd /Users/Gero/Documents/Prode/Prode/app && npx tsc --noEmit
```
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
cd /Users/Gero/Documents/Prode/Prode && git add app/src/lib/bracket-types.ts app/src/lib/bracket-validation.ts app/src/lib/bracket-validation.test.ts app/src/lib/bracket-predictions.ts && git commit -m "feat(bracket): tipos compartidos + validación pura con tests + loader"
```

---

## Task 2: Generalizar actions.ts + actualizar callers

**Files:**
- Modify: `app/src/app/(app)/eventos/[id]/actions.ts`
- Modify: `app/src/app/(app)/eventos/[id]/admin-toggle.tsx`
- Modify: `app/src/app/(app)/eventos/[id]/event-1-form.tsx`

⚠️ Este task tiene que landear los 3 archivos en un solo commit (typecheck rompe entre medio si solo se modifica actions.ts).

- [ ] **Step 1: Generalizar `actions.ts`**

En `app/src/app/(app)/eventos/[id]/actions.ts`:

**a)** Reemplazar el array de kinds (probablemente `SECTION_KINDS` importado de `event1-types`). Hay que crear un array local más amplio.

Encontrar el import existente:
```ts
import { GROUP_CODES, SECTION_KINDS, type GroupCode } from '@/lib/event1-types';
```

Cambiar a:
```ts
import { GROUP_CODES, type GroupCode } from '@/lib/event1-types';

const ALL_KINDS = [
  // Evento 1
  'group_winner', 'playoff_team', 'semifinalist', 'finalist', 'champion', 'top_scorer',
  // Eventos 2/3/4
  'r32_winner', 'r32_outcome',
  'r16_winner', 'r16_outcome',
  'qf_winner', 'qf_outcome',
] as const;
```

**b)** Actualizar `pickSchema` para aceptar `match_id` + `outcome`:

Encontrar el `pickSchema` actual y reemplazar con:
```ts
const pickSchema = z
  .object({
    team_code: z.string().min(1).optional(),
    player_id: z.number().int().positive().optional(),
    match_id: z.number().int().positive().optional(),
    outcome: z.enum(['home', 'draw', 'away']).optional(),
    meta: z
      .object({
        group_code: z.enum(GROUP_CODES as [GroupCode, ...GroupCode[]]).optional(),
      })
      .optional(),
  })
  .refine(
    (p) => p.team_code !== undefined || p.player_id !== undefined || p.outcome !== undefined,
    { message: 'pick necesita team_code, player_id u outcome.' },
  );
```

**c)** Actualizar `saveSectionSchema` para aceptar `event_id`:

```ts
const saveSectionSchema = z.object({
  event_id: z.number().int().min(1).max(4),
  kind: z.enum(ALL_KINDS),
  picks: z.array(pickSchema),
});
```

**d)** Actualizar la función `saveSection`. Encontrar el bloque que carga el evento:
```ts
const { data: event, error: eErr } = await supabase
  .from('events')
  .select('status')
  .eq('id', 1)
  .single();
```
Reemplazar `.eq('id', 1)` con `.eq('id', parsed.data.event_id)`.

**e)** Reemplazar el bloque de validación per-kind. Encontrar:
```ts
const needsPlayerId = parsed.data.kind === 'top_scorer';
const wrong = parsed.data.picks.some((p) =>
  needsPlayerId ? !p.player_id : !p.team_code,
);
if (wrong) return { error: 'Pick no coincide con el kind de la sección.' };
```

Reemplazar con:
```ts
const k = parsed.data.kind;
const isOutcomeKind = k === 'r32_outcome' || k === 'r16_outcome' || k === 'qf_outcome';
const isMatchWinnerKind = k === 'r32_winner' || k === 'r16_winner' || k === 'qf_winner';
const isTopScorerKind = k === 'top_scorer';

const wrong = parsed.data.picks.some((p) => {
  if (isOutcomeKind) return !p.match_id || !p.outcome;
  if (isMatchWinnerKind) return !p.match_id || !p.team_code;
  if (isTopScorerKind) return !p.player_id;
  // Evento 1 (champion/finalist/semi/playoff/group_winner)
  return !p.team_code;
});
if (wrong) return { error: 'Pick no coincide con el kind de la sección.' };
```

**f)** Actualizar el DELETE:
```ts
const { error: dErr } = await supabase
  .from('predictions')
  .delete()
  .eq('user_id', user.id)
  .eq('event_id', parsed.data.event_id)    // ← era 1
  .eq('kind', parsed.data.kind);
```

**g)** Actualizar el INSERT mapping:
```ts
const rows = parsed.data.picks.map((p) => ({
  user_id: user.id,
  event_id: parsed.data.event_id,         // ← era 1
  kind: parsed.data.kind,
  team_code: p.team_code ?? null,
  player_id: p.player_id ?? null,
  match_id: p.match_id ?? null,           // ← NUEVO
  outcome: p.outcome ?? null,             // ← NUEVO
  meta: p.meta ?? {},
}));
```

**h)** Generalizar `openEvent` y `lockEvent`. Reemplazar las firmas y cuerpos para aceptar `event_id`.

Reemplazar el bloque entero de `openEvent`:
```ts
const eventIdSchema = z.object({ event_id: z.number().int().min(1).max(4) });

export async function openEvent(input: z.infer<typeof eventIdSchema>) {
  const parsed = eventIdSchema.safeParse(input);
  if (!parsed.success) return { error: 'event_id inválido.' };
  const guard = await requireAdmin();
  if ('error' in guard) return { error: guard.error };
  const supabase = createSupabaseServerClient();
  const { data: cur } = await supabase
    .from('events').select('status').eq('id', parsed.data.event_id).single();
  if (!cur) return { error: 'Evento no encontrado.' };
  if (cur.status !== 'draft') return { error: `No se puede abrir desde status ${cur.status}.` };

  const { error } = await supabase
    .from('events')
    .update({ status: 'open', opens_at: new Date().toISOString() })
    .eq('id', parsed.data.event_id);
  if (error) {
    console.error('openEvent error:', error);
    return { error: 'No se pudo abrir el evento.' };
  }

  await supabase.from('admin_audit_log').insert({
    actor_user_id: guard.user.id,
    action: 'open_event',
    target_table: 'events',
    target_id: String(parsed.data.event_id),
    before_data: { status: 'draft' },
    after_data: { status: 'open' },
  });

  revalidatePath(`/eventos/${parsed.data.event_id}`);
  return { ok: true as const };
}
```

E igual para `lockEvent`:
```ts
export async function lockEvent(input: z.infer<typeof eventIdSchema>) {
  const parsed = eventIdSchema.safeParse(input);
  if (!parsed.success) return { error: 'event_id inválido.' };
  const guard = await requireAdmin();
  if ('error' in guard) return { error: guard.error };
  const supabase = createSupabaseServerClient();
  const { data: cur } = await supabase
    .from('events').select('status').eq('id', parsed.data.event_id).single();
  if (!cur) return { error: 'Evento no encontrado.' };
  if (cur.status !== 'open') return { error: `No se puede cerrar desde status ${cur.status}.` };

  const { error } = await supabase
    .from('events')
    .update({ status: 'locked', closes_at: new Date().toISOString() })
    .eq('id', parsed.data.event_id);
  if (error) {
    console.error('lockEvent error:', error);
    return { error: 'No se pudo cerrar el evento.' };
  }

  await supabase.from('admin_audit_log').insert({
    actor_user_id: guard.user.id,
    action: 'lock_event',
    target_table: 'events',
    target_id: String(parsed.data.event_id),
    before_data: { status: 'open' },
    after_data: { status: 'locked' },
  });

  revalidatePath(`/eventos/${parsed.data.event_id}`);
  return { ok: true as const };
}
```

- [ ] **Step 2: Actualizar `admin-toggle.tsx`**

En `app/src/app/(app)/eventos/[id]/admin-toggle.tsx`, reemplazar el contenido completo:

```tsx
'use client';

import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { openEvent, lockEvent } from './actions';

type Status = 'draft' | 'open' | 'locked' | 'scored';

export function AdminToggle({ status, eventId }: { status: Status; eventId: number }) {
  const [pending, start] = useTransition();

  if (status === 'draft') {
    return (
      <Button
        size="sm"
        disabled={pending}
        onClick={() => start(async () => { await openEvent({ event_id: eventId }); })}
      >
        {pending ? 'Abriendo...' : 'Abrir evento'}
      </Button>
    );
  }
  if (status === 'open') {
    return (
      <Button
        size="sm"
        variant="destructive"
        disabled={pending}
        onClick={() => start(async () => { await lockEvent({ event_id: eventId }); })}
      >
        {pending ? 'Cerrando...' : 'Cerrar evento'}
      </Button>
    );
  }
  return null;
}
```

- [ ] **Step 3: Actualizar callers en `event-1-form.tsx`**

En `app/src/app/(app)/eventos/[id]/event-1-form.tsx`, encontrar la llamada a `saveSection` dentro de `scheduleSave`:
```ts
const res = await saveSection({ kind, picks: sectionToPicks(nextState, kind) });
```
Reemplazar con:
```ts
const res = await saveSection({ event_id: 1, kind, picks: sectionToPicks(nextState, kind) });
```

- [ ] **Step 4: Actualizar caller del page.tsx existente**

En `app/src/app/(app)/eventos/[id]/page.tsx`, encontrar la llamada al AdminToggle:
```tsx
{isAdmin && <AdminToggle status={event.status} />}
```
Reemplazar con:
```tsx
{isAdmin && <AdminToggle status={event.status} eventId={1} />}
```

(En Task 4 esto cambia de nuevo al ser dispatcher dinámico, pero hay que pasar typecheck ahora.)

- [ ] **Step 5: Typecheck**

```bash
cd /Users/Gero/Documents/Prode/Prode/app && npx tsc --noEmit
```
Expected: exit 0.

- [ ] **Step 6: Tests + lint**

```bash
cd /Users/Gero/Documents/Prode/Prode/app && npm run test && npm run lint
```
Expected: 15+7 = 22 tests pasan; lint limpio.

- [ ] **Step 7: Commit (4 archivos juntos)**

```bash
cd /Users/Gero/Documents/Prode/Prode && git add app/src/app/\(app\)/eventos/\[id\]/actions.ts app/src/app/\(app\)/eventos/\[id\]/admin-toggle.tsx app/src/app/\(app\)/eventos/\[id\]/event-1-form.tsx app/src/app/\(app\)/eventos/\[id\]/page.tsx && git commit -m "refactor(eventos): generalizar saveSection/openEvent/lockEvent y AdminToggle con event_id"
```

---

## Task 3: BracketForm + BracketMatchRow + page dispatcher

**Files:**
- Create: `app/src/app/(app)/eventos/[id]/bracket-match-row.tsx`
- Create: `app/src/app/(app)/eventos/[id]/bracket-form.tsx`
- Modify: `app/src/app/(app)/eventos/[id]/page.tsx`

- [ ] **Step 1: Crear `bracket-match-row.tsx`**

Create `app/src/app/(app)/eventos/[id]/bracket-match-row.tsx`:
```tsx
'use client';

import Image from 'next/image';
import type { Match, MatchOutcome, Team } from '@/lib/database.types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';

export function BracketMatchRow({
  match,
  teamsByCode,
  winner,
  outcome,
  onWinner,
  onOutcome,
  readOnly,
}: {
  match: Match;
  teamsByCode: Map<string, Team>;
  winner: string | null;
  outcome: MatchOutcome | null;
  onWinner: (v: string) => void;
  onOutcome: (v: MatchOutcome) => void;
  readOnly: boolean;
}) {
  const home = match.home_team_code ? teamsByCode.get(match.home_team_code) : null;
  const away = match.away_team_code ? teamsByCode.get(match.away_team_code) : null;
  const disabled = readOnly || !home || !away;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>{match.bracket_slot}</span>
          {match.scheduled_at && (
            <span className="text-xs font-normal text-muted-foreground">
              {new Date(match.scheduled_at).toLocaleString('es-AR', {
                day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
              })}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!home || !away ? (
          <p className="text-sm text-muted-foreground">Equipos por definir.</p>
        ) : (
          <>
            <div className="space-y-1">
              <Label className="text-xs">Ganador</Label>
              <div className="grid grid-cols-2 gap-2">
                {[home, away].map((t) => (
                  <Label
                    key={t.code}
                    className="flex cursor-pointer items-center gap-2 rounded-md border p-2 hover:bg-accent has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                  >
                    <input
                      type="radio"
                      name={`winner-${match.id}`}
                      value={t.code}
                      checked={winner === t.code}
                      disabled={disabled}
                      onChange={() => onWinner(t.code)}
                    />
                    {t.crest_url && (
                      <Image src={t.crest_url} alt="" width={20} height={20} unoptimized />
                    )}
                    <span>{t.name}</span>
                  </Label>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Resultado (90'/120')</Label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { v: 'home' as const, label: 'Local' },
                  { v: 'draw' as const, label: 'Empate (penales)' },
                  { v: 'away' as const, label: 'Visitante' },
                ].map(({ v, label }) => (
                  <Label
                    key={v}
                    className="flex cursor-pointer items-center justify-center gap-1 rounded-md border p-2 text-xs hover:bg-accent has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                  >
                    <input
                      type="radio"
                      name={`outcome-${match.id}`}
                      value={v}
                      checked={outcome === v}
                      disabled={disabled}
                      onChange={() => onOutcome(v)}
                    />
                    <span>{label}</span>
                  </Label>
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Crear `bracket-form.tsx`**

Create `app/src/app/(app)/eventos/[id]/bracket-form.tsx`:
```tsx
'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import type { Match, MatchOutcome, Team } from '@/lib/database.types';
import {
  emptyBracketState,
  type BracketConfig,
  type BracketState,
} from '@/lib/bracket-types';
import { isBracketComplete, validateBracketCoherence } from '@/lib/bracket-validation';
import { saveSection } from './actions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SaveChip, type SaveState } from './sections/save-chip';
import { BracketMatchRow } from './bracket-match-row';

type Kind = 'winner' | 'outcome';

export function BracketForm({
  config,
  matches,
  teams,
  initialState,
  readOnly,
}: {
  config: BracketConfig;
  matches: Match[];
  teams: Team[];
  initialState: BracketState;
  readOnly: boolean;
}) {
  const [state, setState] = useState<BracketState>(initialState);
  const [saveStates, setSaveStates] = useState<Record<Kind, SaveState>>({
    winner: 'idle',
    outcome: 'idle',
  });
  const [errors, setErrors] = useState<Record<Kind, string | null>>({
    winner: null,
    outcome: null,
  });
  const timers = useRef<Record<Kind, ReturnType<typeof setTimeout> | null>>({
    winner: null,
    outcome: null,
  });

  const teamsByCode = useMemo(() => new Map(teams.map((t) => [t.code, t])), [teams]);

  const validation = useMemo(
    () => validateBracketCoherence(state, matches),
    [state, matches],
  );
  const { complete, missing } = useMemo(
    () => isBracketComplete(state, matches),
    [state, matches],
  );

  const playableMatches = useMemo(
    () => matches.filter((m) => m.home_team_code && m.away_team_code),
    [matches],
  );

  function bracketStateToPicks(s: BracketState, kind: Kind) {
    if (kind === 'winner') {
      return Object.entries(s.winners).map(([matchIdStr, team_code]) => ({
        match_id: Number(matchIdStr),
        team_code,
      }));
    }
    return Object.entries(s.outcomes).map(([matchIdStr, outcome]) => ({
      match_id: Number(matchIdStr),
      outcome,
    }));
  }

  const scheduleSave = useCallback(
    (kind: Kind, nextState: BracketState) => {
      if (readOnly) return;
      setSaveStates((s) => ({ ...s, [kind]: 'dirty' }));
      setErrors((e) => ({ ...e, [kind]: null }));
      if (timers.current[kind]) clearTimeout(timers.current[kind]!);
      timers.current[kind] = setTimeout(async () => {
        setSaveStates((s) => ({ ...s, [kind]: 'saving' }));
        const dbKind = kind === 'winner' ? config.winnerKind : config.outcomeKind;
        const res = await saveSection({
          event_id: config.eventId,
          kind: dbKind,
          picks: bracketStateToPicks(nextState, kind),
        });
        if ('error' in res) {
          setSaveStates((s) => ({ ...s, [kind]: 'error' }));
          setErrors((e) => ({ ...e, [kind]: res.error ?? null }));
        } else {
          setSaveStates((s) => ({ ...s, [kind]: 'saved' }));
        }
      }, 800);
    },
    [readOnly, config.eventId, config.winnerKind, config.outcomeKind],
  );

  function setWinner(matchId: number, team_code: string) {
    setState((prev) => {
      const next = { ...prev, winners: { ...prev.winners, [matchId]: team_code } };
      scheduleSave('winner', next);
      return next;
    });
  }

  function setOutcome(matchId: number, outcome: MatchOutcome) {
    setState((prev) => {
      const next = { ...prev, outcomes: { ...prev.outcomes, [matchId]: outcome } };
      scheduleSave('outcome', next);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Ganadores ({config.pointsWinner} pts c/u)</CardTitle>
          <SaveChip state={saveStates.winner} />
        </CardHeader>
        {errors.winner && (
          <CardContent>
            <p className="text-sm text-destructive">{errors.winner}</p>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Resultados ({config.pointsOutcome} pts c/u)</CardTitle>
          <SaveChip state={saveStates.outcome} />
        </CardHeader>
        {errors.outcome && (
          <CardContent>
            <p className="text-sm text-destructive">{errors.outcome}</p>
          </CardContent>
        )}
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        {matches.map((m) => (
          <BracketMatchRow
            key={m.id}
            match={m}
            teamsByCode={teamsByCode}
            winner={state.winners[m.id] ?? null}
            outcome={state.outcomes[m.id] ?? null}
            onWinner={(v) => setWinner(m.id, v)}
            onOutcome={(v) => setOutcome(m.id, v)}
            readOnly={readOnly}
          />
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Resumen</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="text-sm">
            <li>Matches disponibles: {playableMatches.length}/{config.expectedMatchCount}</li>
            <li>Predicciones faltantes: {missing}</li>
            {!validation.ok && (
              <li className="text-destructive">Errores de coherencia: {validation.errors.length}</li>
            )}
          </ul>
          <Button disabled={!complete || !validation.ok || readOnly} className="w-full">
            {complete && validation.ok
              ? '✓ Pronóstico completo'
              : 'Completá todas las predicciones'}
          </Button>
          <p className="text-xs text-muted-foreground">
            Todo se guarda solo. Lo que esté guardado al cerrarse el evento es lo que cuenta.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Actualizar `page.tsx` con el dispatcher**

Reemplazar el contenido completo de `app/src/app/(app)/eventos/[id]/page.tsx` con:

```tsx
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { loadEvent1State } from '@/lib/predictions';
import { loadBracketState } from '@/lib/bracket-predictions';
import { BRACKET_CONFIGS } from '@/lib/bracket-types';
import type { Event, Team, Player, Match } from '@/lib/database.types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AdminToggle } from './admin-toggle';
import { Event1Form } from './event-1-form';
import { BracketForm } from './bracket-form';

export default async function EventoPage({ params }: { params: { id: string } }) {
  const eventIdNum = Number(params.id);
  if (!Number.isInteger(eventIdNum) || eventIdNum < 1 || eventIdNum > 4) notFound();

  const { user, profile } = await requireUser();
  if (!profile) notFound();

  const supabase = createSupabaseServerClient();
  const eventRes = await supabase
    .from('events').select('*').eq('id', eventIdNum).single<Event>();
  if (eventRes.error || !eventRes.data) notFound();
  const event = eventRes.data;

  const isAdmin = profile.role === 'admin';
  const canEdit = event.status === 'open' || (event.status === 'draft' && isAdmin);
  const isReadOnly = event.status === 'locked' || event.status === 'scored';

  const header = (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>{event.name}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">{event.description}</p>
          <p className="mt-2 text-xs uppercase tracking-wide text-muted-foreground">
            Estado: {event.status}
          </p>
        </div>
        {isAdmin && <AdminToggle status={event.status} eventId={eventIdNum} />}
      </CardHeader>
    </Card>
  );

  if (!canEdit && !isReadOnly) {
    return (
      <div className="space-y-6">
        {header}
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            El evento todavía no está abierto. Volvé más tarde.
          </CardContent>
        </Card>
      </div>
    );
  }

  if (eventIdNum === 1) {
    const [teamsRes, playersRes, state] = await Promise.all([
      supabase.from('teams').select('*').order('group_code').order('name'),
      supabase.from('players').select('*').order('display_order'),
      loadEvent1State(user.id),
    ]);
    const teams = (teamsRes.data ?? []) as Team[];
    const players = (playersRes.data ?? []) as Player[];

    return (
      <div className="space-y-6">
        {header}
        <Event1Form
          teams={teams}
          players={players}
          initialState={state}
          readOnly={isReadOnly}
        />
      </div>
    );
  }

  // Eventos 2/3/4
  const config = BRACKET_CONFIGS[eventIdNum];
  const [matchesRes, teamsRes, state] = await Promise.all([
    supabase
      .from('matches').select('*')
      .eq('stage', config.stage)
      .order('bracket_slot'),
    supabase.from('teams').select('*').order('name'),
    loadBracketState(user.id, eventIdNum),
  ]);
  const matches = (matchesRes.data ?? []) as Match[];
  const teams = (teamsRes.data ?? []) as Team[];

  return (
    <div className="space-y-6">
      {header}
      <BracketForm
        config={config}
        matches={matches}
        teams={teams}
        initialState={state}
        readOnly={isReadOnly}
      />
    </div>
  );
}
```

- [ ] **Step 4: Typecheck + lint**

```bash
cd /Users/Gero/Documents/Prode/Prode/app && npx tsc --noEmit && npm run lint
```
Expected: ambos limpios.

- [ ] **Step 5: Commit**

```bash
cd /Users/Gero/Documents/Prode/Prode && git add app/src/app/\(app\)/eventos/\[id\]/bracket-match-row.tsx app/src/app/\(app\)/eventos/\[id\]/bracket-form.tsx app/src/app/\(app\)/eventos/\[id\]/page.tsx && git commit -m "feat(bracket): BracketForm + BracketMatchRow + dispatcher 1 vs 2/3/4"
```

---

## Task 4: /admin/matches (page + editor + actions + banner + pairings)

**Files:**
- Create: `app/src/app/(app)/admin/matches/page.tsx`
- Create: `app/src/app/(app)/admin/matches/matches-editor.tsx`
- Create: `app/src/app/(app)/admin/matches/actions.ts`

- [ ] **Step 1: Crear `actions.ts`**

Create `app/src/app/(app)/admin/matches/actions.ts`:
```ts
'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase-server';

const updateMatchSchema = z.object({
  match_id: z.number().int().positive(),
  patch: z.object({
    home_team_code: z.string().nullable().optional(),
    away_team_code: z.string().nullable().optional(),
  }),
});

export async function updateMatchTeams(input: z.infer<typeof updateMatchSchema>) {
  const parsed = updateMatchSchema.safeParse(input);
  if (!parsed.success) return { error: 'Payload inválido.' };

  const { user } = await requireRole(['admin']);
  const supabase = createSupabaseServerClient();

  const { data: before } = await supabase
    .from('matches')
    .select('home_team_code, away_team_code')
    .eq('id', parsed.data.match_id)
    .single();

  const { error } = await supabase
    .from('matches')
    .update(parsed.data.patch)
    .eq('id', parsed.data.match_id);
  if (error) {
    console.error('updateMatchTeams error:', error);
    return { error: 'No se pudo actualizar el match.' };
  }

  await supabase.from('admin_audit_log').insert({
    actor_user_id: user.id,
    action: 'update_match_teams',
    target_table: 'matches',
    target_id: String(parsed.data.match_id),
    before_data: before ?? {},
    after_data: parsed.data.patch,
  });

  revalidatePath('/admin/matches');
  return { savedAt: new Date().toISOString() };
}
```

- [ ] **Step 2: Crear `page.tsx`**

Create `app/src/app/(app)/admin/matches/page.tsx`:
```tsx
import { createSupabaseServerClient } from '@/lib/supabase-server';
import type { Match, Team } from '@/lib/database.types';
import { MatchesEditor } from './matches-editor';

export default async function AdminMatchesPage() {
  const supabase = createSupabaseServerClient();
  const [matchesRes, teamsRes] = await Promise.all([
    supabase.from('matches').select('*').order('stage').order('bracket_slot'),
    supabase.from('teams').select('*').order('name'),
  ]);

  return (
    <MatchesEditor
      matches={(matchesRes.data ?? []) as Match[]}
      teams={(teamsRes.data ?? []) as Team[]}
    />
  );
}
```

- [ ] **Step 3: Crear `matches-editor.tsx`**

Create `app/src/app/(app)/admin/matches/matches-editor.tsx`:
```tsx
'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import type { Match, Team } from '@/lib/database.types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { SaveChip, type SaveState } from '@/app/(app)/eventos/[id]/sections/save-chip';
import { updateMatchTeams } from './actions';

const STAGES_ORDER = ['r32', 'r16', 'qf', 'sf', 'final'] as const;
const STAGE_LABELS: Record<string, string> = {
  r32: 'Round of 32',
  r16: 'Round of 16',
  qf: 'Cuartos de final',
  sf: 'Semifinales',
  final: 'Final',
};

export function MatchesEditor({
  matches: initial,
  teams,
}: {
  matches: Match[];
  teams: Team[];
}) {
  const [matches, setMatches] = useState<Match[]>(initial);
  const [saveStates, setSaveStates] = useState<Record<number, SaveState>>({});
  const [errors, setErrors] = useState<Record<number, string | null>>({});
  const timers = useRef<Record<number, ReturnType<typeof setTimeout> | null>>({});

  const scheduleSave = useCallback(
    (match_id: number, patch: { home_team_code?: string | null; away_team_code?: string | null }) => {
      setSaveStates((s) => ({ ...s, [match_id]: 'dirty' }) as Record<number, SaveState>);
      setErrors((e) => ({ ...e, [match_id]: null }) as Record<number, string | null>);
      if (timers.current[match_id]) clearTimeout(timers.current[match_id]!);
      timers.current[match_id] = setTimeout(async () => {
        setSaveStates((s) => ({ ...s, [match_id]: 'saving' }) as Record<number, SaveState>);
        const res = await updateMatchTeams({ match_id, patch });
        if ('error' in res) {
          setSaveStates((s) => ({ ...s, [match_id]: 'error' }) as Record<number, SaveState>);
          setErrors((e) => ({ ...e, [match_id]: res.error ?? null }) as Record<number, string | null>);
        } else {
          setSaveStates((s) => ({ ...s, [match_id]: 'saved' }) as Record<number, SaveState>);
        }
      }, 800);
    },
    [],
  );

  function updateLocal(
    match_id: number,
    patch: { home_team_code?: string | null; away_team_code?: string | null },
  ) {
    setMatches((prev) => prev.map((m) => (m.id === match_id ? { ...m, ...patch } : m)));
    scheduleSave(match_id, patch);
  }

  const matchesByStage = useMemo(() => {
    const m: Record<string, Match[]> = {};
    for (const match of matches) {
      (m[match.stage] ??= []).push(match);
    }
    return m;
  }, [matches]);

  const stats = useMemo(() => {
    const total = matches.length;
    const filled = matches.filter(
      (m) => m.home_team_code !== null && m.away_team_code !== null,
    ).length;
    return { total, filled };
  }, [matches]);

  return (
    <div className="space-y-4">
      <Card className="border-amber-300 bg-amber-50">
        <CardHeader>
          <CardTitle className="text-amber-900">⚠ Verificación del bracket</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-amber-900">
          <p>
            Esta app asume <strong>pairing consecutivo</strong>: R32-01 + R32-02 → R16-01,
            R32-03 + R32-04 → R16-02, etc. Si el bracket FIFA oficial difiere, los puntos
            de winner van al match equivocado.
          </p>
          <p>
            Antes del primer R16,{' '}
            <a
              href="https://www.fifa.com/fifaplus/en/tournaments/mens/worldcup/canadamexicousa2026/scores-fixtures"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              comparar contra FIFA
            </a>{' '}
            o correr <code>npm run db:verify-bracket</code> para ver el árbol completo.
          </p>
          <p>
            Para corregir un slot:{' '}
            <code>update matches set parent_slot_home=&apos;R32-XX&apos;, parent_slot_away=&apos;R32-YY&apos; where bracket_slot=&apos;R16-NN&apos;;</code>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-4 text-sm text-muted-foreground">
          Cargados: <strong>{stats.filled}/{stats.total}</strong> matches con ambos teams.
        </CardContent>
      </Card>

      {STAGES_ORDER.map((stage) => {
        const stageMatches = matchesByStage[stage] ?? [];
        if (stageMatches.length === 0) return null;
        return (
          <Card key={stage}>
            <CardHeader>
              <CardTitle>{STAGE_LABELS[stage]}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {stageMatches.map((m) => (
                <div key={m.id} className="space-y-1 border-b py-2 last:border-b-0">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">
                      {m.bracket_slot}
                      {(m.parent_slot_home || m.parent_slot_away) && (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          ← winner({m.parent_slot_home ?? '—'}) + winner({m.parent_slot_away ?? '—'})
                        </span>
                      )}
                    </div>
                    <SaveChip state={saveStates[m.id] ?? 'idle'} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label htmlFor={`home-${m.id}`} className="text-xs">Home</Label>
                      <select
                        id={`home-${m.id}`}
                        value={m.home_team_code ?? ''}
                        onChange={(e) =>
                          updateLocal(m.id, {
                            home_team_code: e.target.value === '' ? null : e.target.value,
                          })
                        }
                        className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                      >
                        <option value="">—</option>
                        {teams.map((t) => (
                          <option key={t.code} value={t.code}>{t.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label htmlFor={`away-${m.id}`} className="text-xs">Away</Label>
                      <select
                        id={`away-${m.id}`}
                        value={m.away_team_code ?? ''}
                        onChange={(e) =>
                          updateLocal(m.id, {
                            away_team_code: e.target.value === '' ? null : e.target.value,
                          })
                        }
                        className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                      >
                        <option value="">—</option>
                        {teams.map((t) => (
                          <option key={t.code} value={t.code}>{t.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {errors[m.id] && (
                    <p className="text-xs text-destructive">{errors[m.id]}</p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Typecheck + lint**

```bash
cd /Users/Gero/Documents/Prode/Prode/app && npx tsc --noEmit && npm run lint
```
Expected: ambos limpios.

- [ ] **Step 5: Commit**

```bash
cd /Users/Gero/Documents/Prode/Prode && git add app/src/app/\(app\)/admin/matches && git commit -m "feat(admin): /admin/matches editor + banner verificación bracket + pairings inline"
```

---

## Task 5: 5ta card "Matches" en /admin index

**Files:**
- Modify: `app/src/app/(app)/admin/page.tsx`

- [ ] **Step 1: Sumar query de matches al `Promise.all`**

En `app/src/app/(app)/admin/page.tsx`, encontrar el bloque `const [teamsRes, playersRes, eventsRes, stagingRes] = await Promise.all([...])` y agregar la query de matches:

```tsx
  const [teamsRes, playersRes, eventsRes, stagingRes, matchesRes] = await Promise.all([
    supabase.from('teams').select('code, group_position, eliminated_at_stage'),
    supabase.from('players').select('id, is_top_scorer'),
    supabase.from('events').select('id, status').order('id'),
    supabase.from('matches_staging').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('matches').select('id, home_team_code, away_team_code'),
  ]);
```

- [ ] **Step 2: Calcular contador**

Después del bloque de cálculo de `pendingStaging`, agregar:
```tsx
  const allMatches = (matchesRes.data ?? []) as { home_team_code: string | null; away_team_code: string | null }[];
  const matchesFilled = allMatches.filter((m) => m.home_team_code !== null && m.away_team_code !== null).length;
  const matchesTotal = allMatches.length;
```

- [ ] **Step 3: Agregar el icono `Swords` al import (representa partidos)**

Encontrar el import de lucide:
```tsx
import { Shield, Users, BarChart3, RefreshCcw } from 'lucide-react';
```
Cambiar a:
```tsx
import { Shield, Users, BarChart3, RefreshCcw, Swords } from 'lucide-react';
```

- [ ] **Step 4: Agregar la card "Matches" en el JSX**

En el grid de cards, después del Link a `/admin/sync` y antes del Card "Volver al dashboard", insertar:
```tsx
      <Link href={"/admin/matches" as Route} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg">
        <Card className="h-full transition-colors hover:bg-accent/40">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Matches</CardTitle>
              <Swords className="h-4 w-4 text-muted-foreground" />
            </div>
            <CardDescription>
              {matchesFilled}/{matchesTotal} con home+away
            </CardDescription>
          </CardHeader>
        </Card>
      </Link>
```

- [ ] **Step 5: Typecheck + lint**

```bash
cd /Users/Gero/Documents/Prode/Prode/app && npx tsc --noEmit && npm run lint
```
Expected: ambos limpios.

- [ ] **Step 6: Commit**

```bash
cd /Users/Gero/Documents/Prode/Prode && git add app/src/app/\(app\)/admin/page.tsx && git commit -m "feat(admin): 5ta card 'Matches' en /admin index"
```

---

## Task 6: CLI script `db:verify-bracket`

**Files:**
- Create: `app/scripts/verify-bracket.ts`
- Modify: `app/package.json`

- [ ] **Step 1: Crear el script**

Create `app/scripts/verify-bracket.ts`:
```ts
/**
 * Imprime el árbol del bracket local para comparar contra el bracket FIFA oficial.
 *
 * Uso:
 *   npm run db:verify-bracket
 *
 * Requiere en .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';

loadEnv({ path: resolve(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Faltan envs en .env.local');
  process.exit(1);
}

interface MatchRow {
  bracket_slot: string;
  stage: string;
  parent_slot_home: string | null;
  parent_slot_away: string | null;
}

async function main() {
  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase
    .from('matches')
    .select('bracket_slot, stage, parent_slot_home, parent_slot_away');
  if (error) {
    console.error('❌ Error leyendo matches:', error);
    process.exit(1);
  }
  const matches = (data ?? []) as MatchRow[];
  const bySlot = new Map(matches.map((m) => [m.bracket_slot, m]));

  function printTree(slot: string, depth: number): void {
    const m = bySlot.get(slot);
    if (!m) {
      console.log(`${'  '.repeat(depth)}- ${slot} (no encontrado)`);
      return;
    }
    const parents =
      m.parent_slot_home || m.parent_slot_away
        ? ` ← winner(${m.parent_slot_home ?? '—'}) + winner(${m.parent_slot_away ?? '—'})`
        : '';
    console.log(`${'  '.repeat(depth)}- ${slot}${parents}`);
    if (m.parent_slot_home) printTree(m.parent_slot_home, depth + 1);
    if (m.parent_slot_away) printTree(m.parent_slot_away, depth + 1);
  }

  console.log('=== Árbol del bracket (raíz: FINAL) ===\n');
  printTree('FINAL', 0);

  console.log('\n=== SQL para regenerar parent_slot (si necesitás corregir) ===\n');
  for (const m of matches) {
    if (m.parent_slot_home || m.parent_slot_away) {
      console.log(
        `update matches set parent_slot_home=${m.parent_slot_home ? `'${m.parent_slot_home}'` : 'null'}, parent_slot_away=${m.parent_slot_away ? `'${m.parent_slot_away}'` : 'null'} where bracket_slot='${m.bracket_slot}';`,
      );
    }
  }
  console.log(
    '\n⚠ Compará el árbol arriba contra https://www.fifa.com/fifaplus/en/tournaments/mens/worldcup/canadamexicousa2026/scores-fixtures',
  );
}

main().catch((err) => {
  console.error('❌', err);
  process.exit(1);
});
```

- [ ] **Step 2: Agregar npm script**

En `app/package.json`, dentro de `"scripts"`, agregar `db:verify-bracket` junto a los otros db:*:
```json
"db:verify-bracket": "tsx scripts/verify-bracket.ts"
```

- [ ] **Step 3: Typecheck**

```bash
cd /Users/Gero/Documents/Prode/Prode/app && npx tsc --noEmit
```
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
cd /Users/Gero/Documents/Prode/Prode && git add app/scripts/verify-bracket.ts app/package.json && git commit -m "feat(sync): CLI db:verify-bracket — imprime árbol del bracket para verificación FIFA"
```

---

## Task 7: Verificación end-to-end + push

- [ ] **Step 1: Tests + typecheck + lint + build**

```bash
cd /Users/Gero/Documents/Prode/Prode/app && npm run test && npx tsc --noEmit && npm run lint && npm run build 2>&1 | tail -25
```
Expected:
- Tests: 22 verde (15 originales + 7 nuevos de bracket-validation).
- Typecheck: exit 0.
- Lint: 0 warnings/errors.
- Build: rutas listadas incluyen `/admin/matches`.

- [ ] **Step 2: Probar verify-bracket CLI**

```bash
cd /Users/Gero/Documents/Prode/Prode/app && npm run db:verify-bracket
```
Expected: imprime árbol desde FINAL hacia abajo, con los R32-01..16 como hojas.

- [ ] **Step 3: Dev server + smoke manual**

```bash
cd /Users/Gero/Documents/Prode/Prode/app && npm run dev
```

Como admin (gicornou@gmail.com):

**A) /admin/matches**
- Aparece banner amarillo de verificación arriba.
- 31 matches agrupados en cards por stage (r32: 16, r16: 8, qf: 4, sf: 2, final: 1).
- R16+/SF/Final muestran `← winner(...) + winner(...)` inline.
- Editar un home/away → chip "Editando..." → "✓ Guardado". Refresh persiste.

**B) /admin (index)**
- 5 cards: Equipos, Jugadores, Scoring, Sync FD, **Matches** (nueva).

**C) /eventos/2 (con admin, status=draft)**
- Header con AdminToggle "Abrir evento".
- BracketForm carga: 16 cards R32. Las que tengan home+away muestran 2 grupos de inputs. Las que no, "Equipos por definir".
- Click "Abrir evento" → status pasa a open.
- En un match con teams, elegir winner + outcome → autosave "✓ Guardado".
- Refresh → persisten.

**D) /eventos/3 y /eventos/4**
- Igual con 8 y 4 cards respectivamente.

**E) /eventos/5**
- 404.

**F) Player no-admin**
- Para `/eventos/2` con status=draft: muestra "El evento todavía no está abierto."

- [ ] **Step 4: Push**

```bash
cd /Users/Gero/Documents/Prode/Prode && git push origin main
```

Vercel auto-deploya. Verificar en producción que `/admin/matches` y `/eventos/2..4` cargan.

- [ ] **Step 5: Marcar Fase 5 como completa en dashboard**

En `app/src/app/(app)/dashboard/page.tsx`, encontrar la lista de fases y cambiar:
```tsx
<li>⏳ <strong>Fase 5</strong> — Eventos 2/3/4 (brackets)</li>
```
a:
```tsx
<li>✅ <strong>Fase 5</strong> — Eventos 2/3/4 (brackets)</li>
```

Commit + push:
```bash
cd /Users/Gero/Documents/Prode/Prode && git add app/src/app/\(app\)/dashboard/page.tsx && git commit -m "chore(dashboard): marcar Fase 5 como completa" && git push origin main
```
