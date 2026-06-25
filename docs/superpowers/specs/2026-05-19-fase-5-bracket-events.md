# Fase 5 — UI Bracket para Eventos 2/3/4

**Fecha:** 2026-05-19
**Estado:** Aprobada para implementación

## 1. Objetivo

Construir la UI de pronóstico para los Eventos 2/3/4 (32avos, octavos, cuartos): cada jugador elige ganador + resultado (Local/Empate/Visitante) por cada match de la ronda. Un solo `BracketForm` reusable parametriza los 3 eventos. Plus admin UI nueva (`/admin/matches`) para que el admin cargue manualmente los teams `home`/`away` de los R32 después de la fase de grupos.

## 2. Out of scope

- Leaderboard público (Fase 6).
- Auto-derive de R32 teams desde reglas FIFA (admin lo hace manual via `/admin/matches`).
- Reordenar parent_slots de migration 0009 si el bracket FIFA oficial no coincide con el pairing consecutivo asumido (lo verificás cuando se conozca, fix puntual via SQL si hace falta).
- Edición de scheduled_at desde `/admin/matches` (queda solo via sync staging approval, Fase 4).
- Edición de scores desde `/admin/matches` (queda solo via staging).
- UI para predecir SF/Final (no son parte de los Eventos 2/3/4 según el reglamento — el campeón/finalista se predicen en Evento 1).
- Tests automatizados nuevos para el bracket (los tests de Evento 1 cubren el pattern de validación; los de bracket serían trabajo de Fase 7).

## 3. Decisiones tomadas (con el usuario)

| Decisión | Elección |
|---|---|
| Reuse strategy | Un solo `BracketForm` genérico que recibe `eventId` + `stage` |
| Carga de teams R32 | Admin manual desde nueva pantalla `/admin/matches` |
| Generalizar `AdminToggle` | Sí, aceptar `eventId` como prop |
| Reusar `saveSection` | Sí, parametrizar `event_id` + extender SECTION_KINDS |
| `/admin/matches` | Pantalla nueva (no sección dentro de /admin/teams) |

## 4. Tipos compartidos

### `app/src/lib/bracket-types.ts` (NEW)

```ts
import type { MatchOutcome, PredictionKind } from './database.types';

export type BracketStage = 'r32' | 'r16' | 'qf';

export interface BracketState {
  winners: Record<number, string>;                // match_id → team_code
  outcomes: Record<number, MatchOutcome>;         // match_id → 'home'|'draw'|'away'
}

export function emptyBracketState(): BracketState {
  return { winners: {}, outcomes: {} };
}

export interface BracketConfig {
  eventId: number;
  stage: BracketStage;
  winnerKind: PredictionKind;       // 'r32_winner' | 'r16_winner' | 'qf_winner'
  outcomeKind: PredictionKind;      // 'r32_outcome' | 'r16_outcome' | 'qf_outcome'
  pointsWinner: number;
  pointsOutcome: number;
  expectedMatchCount: number;       // 16 | 8 | 4
}

export const BRACKET_CONFIGS: Record<number, BracketConfig> = {
  2: { eventId: 2, stage: 'r32', winnerKind: 'r32_winner', outcomeKind: 'r32_outcome',
       pointsWinner: 8, pointsOutcome: 2, expectedMatchCount: 16 },
  3: { eventId: 3, stage: 'r16', winnerKind: 'r16_winner', outcomeKind: 'r16_outcome',
       pointsWinner: 15, pointsOutcome: 5, expectedMatchCount: 8 },
  4: { eventId: 4, stage: 'qf', winnerKind: 'qf_winner', outcomeKind: 'qf_outcome',
       pointsWinner: 20, pointsOutcome: 10, expectedMatchCount: 4 },
};
```

## 5. Loader

### `app/src/lib/bracket-predictions.ts` (NEW)

```ts
export async function loadBracketState(userId: string, eventId: number): Promise<BracketState>
```

Query: `predictions` filtered by `user_id` + `event_id`, select `kind, match_id, team_code, outcome`. Switch por kind:
- `*_winner` → `winners[match_id] = team_code`
- `*_outcome` → `outcomes[match_id] = outcome`
- Otros kinds (de Evento 1) → ignorar.

## 6. Server actions — `saveSection` generalizado

Cambios a `app/src/app/(app)/eventos/[id]/actions.ts`:

### Schema actualizado

```ts
const ALL_KINDS = [
  // Evento 1
  'group_winner', 'playoff_team', 'semifinalist', 'finalist', 'champion', 'top_scorer',
  // Eventos 2/3/4
  'r32_winner', 'r32_outcome', 'r16_winner', 'r16_outcome', 'qf_winner', 'qf_outcome',
] as const;

const pickSchema = z.object({
  team_code: z.string().min(1).optional(),
  player_id: z.number().int().positive().optional(),
  match_id: z.number().int().positive().optional(),
  outcome: z.enum(['home', 'draw', 'away']).optional(),
  meta: z.object({ group_code: z.enum(GROUP_CODES as [GroupCode, ...GroupCode[]]).optional() }).optional(),
}).refine(
  (p) => p.team_code || p.player_id || p.outcome,
  { message: 'pick necesita al menos uno de: team_code, player_id, outcome' },
);

const saveSectionSchema = z.object({
  event_id: z.number().int().min(1).max(4),     // ← NUEVO
  kind: z.enum(ALL_KINDS),                       // ← AMPLIADO
  picks: z.array(pickSchema),
});
```

### Validación per-kind ampliada

Dentro de `saveSection`, después de parse y antes del delete:

```ts
const k = parsed.data.kind;
const isOutcome = k === 'r32_outcome' || k === 'r16_outcome' || k === 'qf_outcome';
const isMatchWinner = k === 'r32_winner' || k === 'r16_winner' || k === 'qf_winner';
const isTopScorer = k === 'top_scorer';

const wrong = parsed.data.picks.some((p) => {
  if (isOutcome) return !p.match_id || !p.outcome;
  if (isMatchWinner) return !p.match_id || !p.team_code;
  if (isTopScorer) return !p.player_id;
  // Evento 1 (champion/finalist/semi/playoff/group_winner) requieren team_code
  return !p.team_code;
});
if (wrong) return { error: 'Pick no coincide con el kind de la sección.' };
```

### Insert mapping

```ts
const rows = parsed.data.picks.map((p) => ({
  user_id: user.id,
  event_id: parsed.data.event_id,    // ← PARAMETRIZADO
  kind: parsed.data.kind,
  team_code: p.team_code ?? null,
  player_id: p.player_id ?? null,
  match_id: p.match_id ?? null,      // ← NUEVO
  outcome: p.outcome ?? null,        // ← NUEVO
  meta: p.meta ?? {},
}));
```

### Status check

El check de `event.status === 'open'` ya filtra por `event.id = 1`. Hay que cambiarlo a `event.id = parsed.data.event_id`.

### `openEvent` y `lockEvent` también

Las actions `openEvent()` y `lockEvent()` actualmente hardcodean `id = 1`. Generalizarlas para aceptar `event_id`:

```ts
export async function openEvent(event_id: number) {
  // ... valida event_id 1-4, mismo flujo
}
export async function lockEvent(event_id: number) { ... }
```

### Caller updates

- El `<AdminToggle>` actual llama `openEvent()` sin args. Pasar `event_id`.
- El `<Event1Form>` actual llama `saveSection({ kind, picks })`. Pasar `event_id: 1` explícito.

## 7. `AdminToggle` generalizado

`app/src/app/(app)/eventos/[id]/admin-toggle.tsx`:

```tsx
export function AdminToggle({ status, eventId }: { status: EventStatus; eventId: number }) {
  // ... openEvent(eventId) / lockEvent(eventId)
}
```

## 8. Page dispatcher

`app/src/app/(app)/eventos/[id]/page.tsx`:

```tsx
import { BRACKET_CONFIGS } from '@/lib/bracket-types';

export default async function EventoPage({ params }: { params: { id: string } }) {
  const eventIdNum = Number(params.id);
  if (!Number.isInteger(eventIdNum) || eventIdNum < 1 || eventIdNum > 4) notFound();

  const { user, profile } = await requireUser();
  if (!profile) notFound();

  const supabase = createSupabaseServerClient();
  const isAdmin = profile.role === 'admin';

  const eventRes = await supabase.from('events').select('*').eq('id', eventIdNum).single<Event>();
  if (eventRes.error || !eventRes.data) notFound();
  const event = eventRes.data;

  const canEdit = event.status === 'open' || (event.status === 'draft' && isAdmin);
  const isReadOnly = event.status === 'locked' || event.status === 'scored';

  // Layout común (header + AdminToggle)
  // ... + render condicional:

  if (eventIdNum === 1) {
    // Cargar teams + players + state Event1; render Event1Form
  } else {
    const config = BRACKET_CONFIGS[eventIdNum];
    // Cargar matches del stage + teams + state bracket
    // render BracketForm
  }
}
```

## 9. `BracketForm` (client)

`app/src/app/(app)/eventos/[id]/bracket-form.tsx`:

```tsx
'use client';

export function BracketForm({
  config,
  matches,           // filtered to stage; sorted by bracket_slot
  teams,             // los 48 para lookup nombre/crest
  initialState,
  readOnly,
}: {
  config: BracketConfig;
  matches: Match[];
  teams: Team[];
  initialState: BracketState;
  readOnly: boolean;
}) {
  // Estado local: BracketState
  // Save chip por kind (2 totales: winner + outcome)
  // Autosave debounced 800ms por kind
  // Cuando cambia winners o outcomes → schedule save para esa kind
  // sectionToPicks helper: BracketState + kind → Pick[]
  // Renderiza Resumen card al final + botón "Finalizar" visual
}
```

Helper `bracketStateToPicks(state, kind)`:
- `*_winner`: para cada match_id en winners, `{ match_id, team_code: winners[match_id] }`.
- `*_outcome`: para cada match_id en outcomes, `{ match_id, outcome: outcomes[match_id] }`.

## 10. `BracketMatchRow` (client)

`app/src/app/(app)/eventos/[id]/bracket-match-row.tsx`:

Por cada match renderiza:
- Header: `bracket_slot` + scheduled_at formateado (si no es null) + estado match (FINISHED/SCHEDULED si querés mostrar).
- Si `home_team_code === null OR away_team_code === null`: card grayed con "Equipos por definir", inputs disabled.
- Si ambos definidos:
  - Bandera + nombre home vs bandera + nombre away.
  - Radio "Ganador": home_team_code | away_team_code (2 opciones).
  - Radio "Resultado": Local | Empate | Visitante (`home` | `draw` | `away`).

Props:
```tsx
<BracketMatchRow
  match={Match}
  teamsByCode={Map<string, Team>}
  winner={string | null}
  outcome={MatchOutcome | null}
  onWinner={(v: string) => void}
  onOutcome={(v: MatchOutcome) => void}
  readOnly={boolean}
/>
```

## 11. `/admin/matches`

### Page (server)

`app/src/app/(app)/admin/matches/page.tsx`:

```tsx
import { createSupabaseServerClient } from '@/lib/supabase-server';
// Carga todos los matches (31) + todos los teams (48)
// Pasa a MatchesEditor
```

### Editor (client)

`app/src/app/(app)/admin/matches/matches-editor.tsx`:

Agrupa por stage (r32, r16, qf, sf, final). Por cada match:
- Header: bracket_slot + scheduled_at.
- 2 selects: home (lista de 48 teams + "—"), away (idem).
- SaveChip por match.

Autosave 800ms al cambiar home o away.

Server action nueva: `updateMatchTeams(match_id, { home_team_code?, away_team_code? })` en un nuevo `app/src/app/(app)/admin/matches/actions.ts`.

```ts
const updateMatchSchema = z.object({
  match_id: z.number().int().positive(),
  patch: z.object({
    home_team_code: z.string().nullable().optional(),
    away_team_code: z.string().nullable().optional(),
  }),
});

export async function updateMatchTeams(input: z.infer<typeof updateMatchSchema>) {
  // requireRole(['admin']) + Zod parse + snapshot before + update + audit log + revalidatePath
}
```

## 12. Admin index actualizado

`/admin` index suma una 5ta card:
- **Matches** → `/admin/matches`
- Subtítulo: "X/31 con home+away cargados" (count de matches con ambos no-null).

## 13. Estructura de archivos

```
app/src/lib/
  bracket-types.ts                                NEW
  bracket-predictions.ts                          NEW

app/src/app/(app)/eventos/[id]/
  page.tsx                                        MODIFY (dispatcher)
  actions.ts                                      MODIFY (saveSection generalizado + openEvent/lockEvent aceptan event_id)
  admin-toggle.tsx                                MODIFY (acepta eventId)
  bracket-form.tsx                                NEW
  bracket-match-row.tsx                           NEW
  event-1-form.tsx                                MODIFY (saveSection call con event_id: 1)

app/src/app/(app)/admin/matches/
  page.tsx                                        NEW
  matches-editor.tsx                              NEW
  actions.ts                                      NEW (updateMatchTeams)

app/src/app/(app)/admin/page.tsx                  MODIFY (5ta card Matches)

app/scripts/verify-bracket.ts                     NEW (verificación CLI vs FIFA)
app/package.json                                  MODIFY (script db:verify-bracket)
```

(El header NO se toca — el dashboard "Próximo evento" ya linkea dinámicamente, ver Section 15.)

## 14. Header navigation

Hoy el header tiene "Dashboard | Evento 1 | Admin (si admin)". Para mantener UX simple, agregamos solo "Evento 2/3/4" como un Link único al **próximo evento abierto** (server-side lookup): el evento con menor `id` y `status='open'`. Si todos están draft/locked/scored, mostrar el card pero deshabilitado.

Simplificación YAGNI: por ahora simplemente agregamos "Eventos" como dropdown? No — KISS. Mantenemos solo "Evento 1" y dejamos que el dashboard sea el hub de acceso a los demás eventos.

**Decisión:** dashboard card "Próximo evento" ya linkea al evento más urgente. Es el flow natural. No tocamos el header.

## 15. Cómo el dashboard maneja eventos > 1

`app/src/app/(app)/dashboard/page.tsx` ya tiene la query `nextEvent` (`status in ['draft','open']`, lowest id, single row). Cuando Evento 1 esté `scored`, automáticamente la card va a apuntar al 2. Cuando 2 esté scored, al 3. Sin cambios necesarios.

## 16. Validación

Pure helpers en `bracket-types.ts` (o nuevo `bracket-validation.ts`):

```ts
export function isBracketComplete(
  state: BracketState,
  matches: Match[],
): { complete: boolean; missing: number };

export function validateBracketCoherence(
  state: BracketState,
  matches: Match[],
): { ok: true } | { ok: false; errors: string[] };
```

- `isBracketComplete`: para cada match con teams cargados, debe tener winner + outcome. Devuelve cantidad faltante.
- `validateBracketCoherence`: el winner de cada match debe ser uno de los dos teams del match (home o away).

## 17. Riesgos / supuestos

- **Pairing consecutivo en migration 0009:** asumimos `R32-01+R32-02 → R16-01`, etc. Si el bracket FIFA real difiere, los puntos de winner del R16 van a apuntar a los teams equivocados después de que admin apruebe los resultados del R32. **Mitigación incluida en esta fase** (ver Section 17.5 "Bracket preview" + verificación CLI).
- **Admin tiene que cargar 16 R32 manualmente:** después de fase de grupos. Si se olvida, los jugadores no pueden predecir nada del Evento 2.
- **Outcome 'draw' significa "penales":** asumido del plan original. UI lo va a explicar al hover/tooltip de "Empate".
- **Lock-out automático:** sigue sin estar implementado. Admin abre/cierra manualmente desde el header del evento. Si admin se olvida de cerrar antes del kickoff, los jugadores pueden seguir editando (problema operacional, no técnico).

## 17.5 Fix preventivo: verificación del bracket FIFA

Dos piezas para que el admin compare el pairing local contra el bracket FIFA oficial **antes** de que se jueguen los R16:

### A) Banner + bracket preview en `/admin/matches`

Al tope de la página, un Card amarillo con texto:

> ⚠ **Verificación del bracket**
> Esta app asume el pairing consecutivo: R32-01 + R32-02 → R16-01, R32-03 + R32-04 → R16-02, etc.
> Si el bracket FIFA oficial difiere, los puntos de winner van a ir al match equivocado.
> Antes del primer R16, comparar contra https://www.fifa.com/fifaplus/en/tournaments/mens/worldcup/canadamexicousa2026/scores-fixtures
> Para corregir un slot mal: `update matches set parent_slot_home='R32-XX', parent_slot_away='R32-YY' where bracket_slot='R16-NN';`

En la sección de matches, para cada R16/QF/SF/Final mostrar inline (debajo del bracket_slot, en texto chico):
- `R16-01 ← winner(R32-01) + winner(R32-02)`

Esto visibiliza la estructura sin que el admin tenga que abrir el SQL.

### B) Script CLI `npm run db:verify-bracket`

`app/scripts/verify-bracket.ts` (NEW). Imprime el árbol completo:

```
FINAL ← winner(SF-01) + winner(SF-02)
  SF-01 ← winner(QF-01) + winner(QF-02)
    QF-01 ← winner(R16-01) + winner(R16-02)
      R16-01 ← winner(R32-01) + winner(R32-02)
      R16-02 ← winner(R32-03) + winner(R32-04)
    QF-02 ← winner(R16-03) + winner(R16-04)
      ...
  SF-02 ← winner(QF-03) + winner(QF-04)
    ...
```

Plus al final imprime el SQL para regenerar `parent_slot_home/away` por si admin tiene que cambiar todo de una.

Comando en `package.json`: `"db:verify-bracket": "tsx scripts/verify-bracket.ts"`.

Idea: el admin corre el script cuando se publica el bracket FIFA, lo compara visualmente, y si hay diff lo arregla con un UPDATE puntual.

## 18. Verificación post-implementación

- [ ] `npm run test && npx tsc --noEmit && npm run lint` verde.
- [ ] `/admin/matches` carga, muestra los 31 matches agrupados por stage.
- [ ] Setear home + away de R32-01 vía select → autosave.
- [ ] `/eventos/2` (logueado como admin para acceder en draft):
  - Muestra 16 cards.
  - Las que tienen teams permiten elegir winner + outcome.
  - Las que tienen team NULL muestran "Equipos por definir" disabled.
- [ ] Marcar winner + outcome en R32-01 → autosave "✓ Guardado".
- [ ] Refrescar → la selección persiste.
- [ ] AdminToggle en el header de Evento 2 abre/cierra solo Evento 2 (no toca Evento 1).
- [ ] `/eventos/3` muestra 8 cards (R16), `/eventos/4` muestra 4 (QF).
- [ ] `/eventos/5` → 404.
- [ ] Para player no-admin: Evento 2 en draft muestra "El evento todavía no está abierto", al abrirlo aparece editable.
- [ ] `/admin/matches` muestra el banner amarillo de verificación + las pairings inline en cada R16/QF/SF/Final.
- [ ] `npm run db:verify-bracket` imprime el árbol completo del bracket sin error.
