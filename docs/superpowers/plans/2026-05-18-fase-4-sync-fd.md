# Fase 4 — Sync con Football-Data.org Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el pipeline FD → staging → approve → matches para sincronizar los 31 partidos eliminatorios del Mundial. Incluye Vercel Cron diario y UI admin para aprobar staging rows + mapear external_ids.

**Architecture:** Migration 0009 pre-seedea los 31 matches con bracket_slot/parent_slot cableados y agrega `matches.external_id`, `matches_staging.scheduled_at`, y la función `fn_propagate_winner`. Un módulo puro `lib/sync-fd.ts` hace el fetch a FD y escribe a staging por diff. Tres consumidores: script CLI (`npm run db:sync-matches`), Vercel Cron route (`/api/cron/sync-matches`), y un botón en `/admin/sync`. Server actions consolidan approve/reject/assignExternalId/syncNow.

**Tech Stack:** Postgres + Supabase, TypeScript, Next.js 14 App Router (Route Handler + Server Actions), Vercel Cron, Zod.

**Spec:** `docs/superpowers/specs/2026-05-18-fase-4-sync-fd-design.md`

---

## File Structure Overview

| Archivo | Responsabilidad |
|---|---|
| `app/supabase/migrations/0009_matches_seed.sql` | **NEW** — bracket seed + external_id + staging.scheduled_at + fn_propagate_winner |
| `app/src/lib/database.types.ts` | **MODIFY** — `Match.external_id`, `MatchStaging.scheduled_at` |
| `app/src/lib/sync-fd.ts` | **NEW** — función pura `syncFromFD()` |
| `app/scripts/sync-matches.ts` | **NEW** — CLI: corre sync local + imprime resumen |
| `app/package.json` | **MODIFY** — script `db:sync-matches` |
| `app/src/app/api/cron/sync-matches/route.ts` | **NEW** — GET handler con auth header |
| `app/src/app/(app)/admin/sync/page.tsx` | **NEW** — server: carga staging + matches |
| `app/src/app/(app)/admin/sync/pending-approvals.tsx` | **NEW** — client: lista con diff y botones |
| `app/src/app/(app)/admin/sync/external-id-editor.tsx` | **NEW** — client: tabla con autosave |
| `app/src/app/(app)/admin/sync/sync-now-button.tsx` | **NEW** — client: botón trigger manual |
| `app/src/app/(app)/admin/sync/actions.ts` | **NEW** — server actions |
| `app/src/app/(app)/admin/page.tsx` | **MODIFY** — agregar 4ta card-link Sync |
| `app/vercel.json` | **MODIFY** — agregar `crons` section |
| `app/.env.example` | **MODIFY** — agregar `CRON_SECRET` |

---

## Task 1: Migration 0009 — bracket seed + fn_propagate_winner

**Files:**
- Create: `app/supabase/migrations/0009_matches_seed.sql`

⚠️ Solo crea + commitea. La migration se aplica antes de Task 9.

- [ ] **Step 1: Crear el archivo**

Create `app/supabase/migrations/0009_matches_seed.sql`:
```sql
-- =================================================================
-- Prode Mundial 2026 — Bracket seed + sync infrastructure
-- Migration 0009
-- =================================================================

-- 1) external_id en matches para mapeo con Football-Data.org
alter table matches
  add column external_id text unique;

-- 2) scheduled_at en matches_staging (sync stagea cambios de calendario también)
alter table matches_staging
  add column scheduled_at timestamptz;

-- 3) Pre-seed 31 matches con bracket pairing consecutivo
insert into matches (stage, bracket_slot, parent_slot_home, parent_slot_away) values
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
  ('r16', 'R16-01', 'R32-01', 'R32-02'),
  ('r16', 'R16-02', 'R32-03', 'R32-04'),
  ('r16', 'R16-03', 'R32-05', 'R32-06'),
  ('r16', 'R16-04', 'R32-07', 'R32-08'),
  ('r16', 'R16-05', 'R32-09', 'R32-10'),
  ('r16', 'R16-06', 'R32-11', 'R32-12'),
  ('r16', 'R16-07', 'R32-13', 'R32-14'),
  ('r16', 'R16-08', 'R32-15', 'R32-16'),
  ('qf',  'QF-01',  'R16-01', 'R16-02'),
  ('qf',  'QF-02',  'R16-03', 'R16-04'),
  ('qf',  'QF-03',  'R16-05', 'R16-06'),
  ('qf',  'QF-04',  'R16-07', 'R16-08'),
  ('sf',  'SF-01',  'QF-01',  'QF-02'),
  ('sf',  'SF-02',  'QF-03',  'QF-04'),
  ('final','FINAL', 'SF-01',  'SF-02')
on conflict (bracket_slot) do nothing;

-- 4) fn_propagate_winner: cuando un match tiene winner, completa el child match
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

- [ ] **Step 2: Commit**

```bash
cd /Users/Gero/Documents/Prode/Prode && git add app/supabase/migrations/0009_matches_seed.sql && git commit -m "feat(db): migration 0009 — bracket seed + external_id + fn_propagate_winner"
```

---

## Task 2: Actualizar database.types.ts

**Files:**
- Modify: `app/src/lib/database.types.ts`

- [ ] **Step 1: Agregar `external_id` a `Match`**

En `app/src/lib/database.types.ts`, encontrar la interface `Match`:
```ts
export interface Match {
  id: number;
  stage: Stage;
  bracket_slot: string;
  home_team_code: string | null;
  away_team_code: string | null;
  scheduled_at: string | null;
  home_score_90: number | null;
  away_score_90: number | null;
  home_score_120: number | null;
  away_score_120: number | null;
  went_to_penalties: boolean;
  winner_team_code: string | null;
  outcome_pre_penalties: MatchOutcome | null;
  parent_slot_home: string | null;
  parent_slot_away: string | null;
  locked: boolean;
}
```

Agregar `external_id: string | null;` al final (antes de `locked`):
```ts
export interface Match {
  id: number;
  stage: Stage;
  bracket_slot: string;
  home_team_code: string | null;
  away_team_code: string | null;
  scheduled_at: string | null;
  home_score_90: number | null;
  away_score_90: number | null;
  home_score_120: number | null;
  away_score_120: number | null;
  went_to_penalties: boolean;
  winner_team_code: string | null;
  outcome_pre_penalties: MatchOutcome | null;
  parent_slot_home: string | null;
  parent_slot_away: string | null;
  external_id: string | null;
  locked: boolean;
}
```

- [ ] **Step 2: Agregar interface `MatchStaging`**

Buscar dónde están las interfaces del schema (después de `Match`) y agregar:
```ts
export type StagingStatus = 'pending' | 'approved' | 'rejected';

export interface MatchStaging {
  id: number;
  match_id: number;
  source: string;
  external_match_id: string | null;
  home_score_90: number | null;
  away_score_90: number | null;
  home_score_120: number | null;
  away_score_120: number | null;
  went_to_penalties: boolean | null;
  winner_team_code: string | null;
  scheduled_at: string | null;
  status: StagingStatus;
  fetched_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  notes: string | null;
}
```

- [ ] **Step 3: Typecheck**

```bash
cd /Users/Gero/Documents/Prode/Prode/app && npx tsc --noEmit
```
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
cd /Users/Gero/Documents/Prode/Prode && git add app/src/lib/database.types.ts && git commit -m "feat(types): Match.external_id + MatchStaging interface"
```

---

## Task 3: Módulo puro `sync-fd.ts`

**Files:**
- Create: `app/src/lib/sync-fd.ts`

- [ ] **Step 1: Implementar `syncFromFD`**

Create `app/src/lib/sync-fd.ts`:
```ts
/**
 * Función pura de sync con Football-Data.org.
 * Llamada desde:
 *   - Script CLI (scripts/sync-matches.ts)
 *   - Vercel Cron route (app/api/cron/sync-matches)
 *   - Server action (admin/sync/actions.ts syncNow)
 *
 * No usa cookies — usa service role key directo.
 */

import { createClient } from '@supabase/supabase-js';

const STAGE_MAP: Record<string, string> = {
  ROUND_OF_32: 'r32',
  LAST_16: 'r16',
  QUARTER_FINALS: 'qf',
  SEMI_FINALS: 'sf',
  FINAL: 'final',
};

interface FDTeam { tla: string | null }
interface FDScoreFrame { home: number | null; away: number | null }
interface FDMatch {
  id: number;
  utcDate: string;
  status: string;
  stage: string;
  homeTeam: FDTeam;
  awayTeam: FDTeam;
  score: {
    duration: 'REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT';
    winner: 'HOME_TEAM' | 'AWAY_TEAM' | 'DRAW' | null;
    fullTime: FDScoreFrame;
    extraTime?: FDScoreFrame;
    penalties?: FDScoreFrame;
  };
}
interface FDMatchesResponse { matches: FDMatch[] }

export interface SyncResult {
  inserted: number;
  skipped: number;
  unmapped: number;
  errors: Array<{ external_id: string; message: string }>;
}

export async function syncFromFD(options: {
  fdApiKey: string;
  supabaseUrl: string;
  supabaseServiceKey: string;
}): Promise<SyncResult> {
  const { fdApiKey, supabaseUrl, supabaseServiceKey } = options;
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

  const result: SyncResult = { inserted: 0, skipped: 0, unmapped: 0, errors: [] };

  const res = await fetch('https://api.football-data.org/v4/competitions/WC/matches', {
    headers: { 'X-Auth-Token': fdApiKey },
  });
  if (!res.ok) throw new Error(`FD ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as FDMatchesResponse;

  const elimFD = data.matches.filter((m) => m.stage in STAGE_MAP);

  // Lookup local matches by external_id
  const { data: localMatches, error: lmErr } = await supabase
    .from('matches')
    .select('*')
    .not('external_id', 'is', null);
  if (lmErr) throw lmErr;
  const byExternalId = new Map<string, any>(
    (localMatches ?? []).map((m) => [m.external_id as string, m]),
  );

  for (const fd of elimFD) {
    const local = byExternalId.get(String(fd.id));
    if (!local) {
      result.unmapped++;
      continue;
    }

    const proposedScheduledAt = fd.utcDate ?? null;
    const home90 = fd.score.fullTime?.home ?? null;
    const away90 = fd.score.fullTime?.away ?? null;
    const home120 = fd.score.extraTime?.home ?? null;
    const away120 = fd.score.extraTime?.away ?? null;
    const wentToPenalties = fd.score.duration === 'PENALTY_SHOOTOUT';
    let winner: string | null = null;
    if (fd.score.winner === 'HOME_TEAM') winner = fd.homeTeam.tla;
    else if (fd.score.winner === 'AWAY_TEAM') winner = fd.awayTeam.tla;

    const noChange =
      local.scheduled_at === proposedScheduledAt &&
      local.home_score_90 === home90 &&
      local.away_score_90 === away90 &&
      local.home_score_120 === home120 &&
      local.away_score_120 === away120 &&
      local.went_to_penalties === wentToPenalties &&
      local.winner_team_code === winner;

    if (noChange) {
      result.skipped++;
      continue;
    }

    const { error: insErr } = await supabase.from('matches_staging').insert({
      match_id: local.id,
      source: 'football-data.org',
      external_match_id: String(fd.id),
      home_score_90: home90,
      away_score_90: away90,
      home_score_120: home120,
      away_score_120: away120,
      went_to_penalties: wentToPenalties,
      winner_team_code: winner,
      scheduled_at: proposedScheduledAt,
      status: 'pending',
    });
    if (insErr) {
      result.errors.push({ external_id: String(fd.id), message: insErr.message });
    } else {
      result.inserted++;
    }
  }

  return result;
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/Gero/Documents/Prode/Prode/app && npx tsc --noEmit
```
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
cd /Users/Gero/Documents/Prode/Prode && git add app/src/lib/sync-fd.ts && git commit -m "feat(sync): syncFromFD core lib con diff contra matches y insert a staging"
```

---

## Task 4: CLI script + npm command

**Files:**
- Create: `app/scripts/sync-matches.ts`
- Modify: `app/package.json` (script)

- [ ] **Step 1: Crear el script**

Create `app/scripts/sync-matches.ts`:
```ts
/**
 * Sync local de matches desde Football-Data.org.
 *
 * Uso:
 *   npm run db:sync-matches
 *
 * Requiere envs en .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   FOOTBALL_DATA_API_KEY
 */

import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { syncFromFD } from '../src/lib/sync-fd';

loadEnv({ path: resolve(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FD_API_KEY = process.env.FOOTBALL_DATA_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !FD_API_KEY) {
  console.error('❌ Faltan envs en .env.local');
  process.exit(1);
}

async function main() {
  console.log('→ Sincronizando matches desde Football-Data.org...');
  const result = await syncFromFD({
    fdApiKey: FD_API_KEY!,
    supabaseUrl: SUPABASE_URL!,
    supabaseServiceKey: SUPABASE_SERVICE_ROLE_KEY!,
  });
  console.log(`✓ Resultado: ${result.inserted} nuevos en staging, ${result.skipped} sin cambios, ${result.unmapped} sin external_id mapeado.`);
  if (result.errors.length > 0) {
    console.error(`⚠ ${result.errors.length} errores:`);
    for (const e of result.errors) {
      console.error(`  ${e.external_id}: ${e.message}`);
    }
  }
}

main().catch((err) => {
  console.error('❌', err);
  process.exit(1);
});
```

- [ ] **Step 2: Agregar npm script**

En `app/package.json`, dentro de `"scripts"`, agregar (junto a `db:sync-teams` y `db:assign-groups`):
```json
"db:sync-matches": "tsx scripts/sync-matches.ts"
```

- [ ] **Step 3: Typecheck**

```bash
cd /Users/Gero/Documents/Prode/Prode/app && npx tsc --noEmit
```
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
cd /Users/Gero/Documents/Prode/Prode && git add app/scripts/sync-matches.ts app/package.json && git commit -m "feat(sync): CLI script + npm run db:sync-matches"
```

---

## Task 5: Vercel Cron route

**Files:**
- Create: `app/src/app/api/cron/sync-matches/route.ts`

- [ ] **Step 1: Crear la route**

Create `app/src/app/api/cron/sync-matches/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { syncFromFD } from '@/lib/sync-fd';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // Vercel inyecta este header automáticamente para cron jobs autenticados con CRON_SECRET.
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json(
      { error: 'CRON_SECRET no configurado en el server.' },
      { status: 500 },
    );
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const fdApiKey = process.env.FOOTBALL_DATA_API_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!fdApiKey || !supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json(
      { error: 'Faltan envs (FD/Supabase) en el server.' },
      { status: 500 },
    );
  }

  try {
    const result = await syncFromFD({ fdApiKey, supabaseUrl, supabaseServiceKey });
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    console.error('cron sync error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/Gero/Documents/Prode/Prode/app && npx tsc --noEmit
```
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
cd /Users/Gero/Documents/Prode/Prode && git add app/src/app/api/cron/sync-matches && git commit -m "feat(cron): /api/cron/sync-matches route con auth CRON_SECRET"
```

---

## Task 6: Server actions del admin/sync

**Files:**
- Create: `app/src/app/(app)/admin/sync/actions.ts`

- [ ] **Step 1: Implementar las 4 acciones**

Create `app/src/app/(app)/admin/sync/actions.ts`:
```ts
'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { syncFromFD, type SyncResult } from '@/lib/sync-fd';

// ---------- syncNow ----------

export async function syncNow(): Promise<SyncResult | { error: string }> {
  await requireRole(['admin']);

  const fdApiKey = process.env.FOOTBALL_DATA_API_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!fdApiKey || !supabaseUrl || !supabaseServiceKey) {
    return { error: 'Faltan envs (FD/Supabase) en el server.' };
  }

  try {
    const result = await syncFromFD({ fdApiKey, supabaseUrl, supabaseServiceKey });
    revalidatePath('/admin/sync');
    return result;
  } catch (err) {
    console.error('syncNow error:', err);
    return { error: 'No se pudo sincronizar.' };
  }
}

// ---------- approveStaging ----------

const approveSchema = z.object({ staging_id: z.number().int().positive() });

export async function approveStaging(input: z.infer<typeof approveSchema>) {
  const parsed = approveSchema.safeParse(input);
  if (!parsed.success) return { error: 'Payload inválido.' };

  const { user } = await requireRole(['admin']);
  const supabase = createSupabaseServerClient();

  // Cargar staging row
  const { data: staging, error: sErr } = await supabase
    .from('matches_staging')
    .select('*')
    .eq('id', parsed.data.staging_id)
    .single();
  if (sErr || !staging) return { error: 'Staging row no encontrada.' };
  if (staging.status !== 'pending') return { error: `Status actual: ${staging.status}.` };

  // Snapshot del match antes (para audit)
  const { data: before } = await supabase
    .from('matches')
    .select('*')
    .eq('id', staging.match_id)
    .single();

  // Update match con la data del staging
  const matchPatch: Record<string, unknown> = {
    home_score_90: staging.home_score_90,
    away_score_90: staging.away_score_90,
    home_score_120: staging.home_score_120,
    away_score_120: staging.away_score_120,
    went_to_penalties: staging.went_to_penalties,
    winner_team_code: staging.winner_team_code,
  };
  if (staging.scheduled_at !== null) matchPatch.scheduled_at = staging.scheduled_at;

  const { error: uErr } = await supabase
    .from('matches')
    .update(matchPatch)
    .eq('id', staging.match_id);
  if (uErr) {
    console.error('approveStaging update match error:', uErr);
    return { error: 'No se pudo actualizar el match.' };
  }

  // Marcar staging como approved
  const { error: msErr } = await supabase
    .from('matches_staging')
    .update({
      status: 'approved',
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', staging.id);
  if (msErr) {
    console.error('approveStaging update staging error:', msErr);
    return { error: 'No se pudo marcar staging como aprobado.' };
  }

  // Si hay winner nuevo, propagar al child match
  if (staging.winner_team_code !== null) {
    const { error: pErr } = await supabase.rpc('fn_propagate_winner' as never, {
      p_match_id: staging.match_id,
    });
    if (pErr) {
      console.error('fn_propagate_winner error:', pErr);
      // No bloqueante — el approval ya quedó. Loguea y sigue.
    }
  }

  // Audit log
  await supabase.from('admin_audit_log').insert({
    actor_user_id: user.id,
    action: 'approve_staging',
    target_table: 'matches_staging',
    target_id: String(staging.id),
    before_data: before ?? {},
    after_data: matchPatch,
  });

  revalidatePath('/admin/sync');
  return { ok: true as const };
}

// ---------- rejectStaging ----------

const rejectSchema = z.object({
  staging_id: z.number().int().positive(),
  notes: z.string().optional(),
});

export async function rejectStaging(input: z.infer<typeof rejectSchema>) {
  const parsed = rejectSchema.safeParse(input);
  if (!parsed.success) return { error: 'Payload inválido.' };

  const { user } = await requireRole(['admin']);
  const supabase = createSupabaseServerClient();

  const { error } = await supabase
    .from('matches_staging')
    .update({
      status: 'rejected',
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      notes: parsed.data.notes ?? null,
    })
    .eq('id', parsed.data.staging_id)
    .eq('status', 'pending');
  if (error) {
    console.error('rejectStaging error:', error);
    return { error: 'No se pudo rechazar el staging row.' };
  }

  await supabase.from('admin_audit_log').insert({
    actor_user_id: user.id,
    action: 'reject_staging',
    target_table: 'matches_staging',
    target_id: String(parsed.data.staging_id),
    after_data: { notes: parsed.data.notes ?? null },
  });

  revalidatePath('/admin/sync');
  return { ok: true as const };
}

// ---------- assignExternalId ----------

const assignSchema = z.object({
  match_id: z.number().int().positive(),
  external_id: z.string().min(1).nullable(),
});

export async function assignExternalId(input: z.infer<typeof assignSchema>) {
  const parsed = assignSchema.safeParse(input);
  if (!parsed.success) return { error: 'Payload inválido.' };

  const { user } = await requireRole(['admin']);
  const supabase = createSupabaseServerClient();

  const { data: before } = await supabase
    .from('matches')
    .select('external_id')
    .eq('id', parsed.data.match_id)
    .single();

  const { error } = await supabase
    .from('matches')
    .update({ external_id: parsed.data.external_id })
    .eq('id', parsed.data.match_id);
  if (error) {
    console.error('assignExternalId error:', error);
    return { error: 'No se pudo asignar el external_id (¿duplicado?).' };
  }

  await supabase.from('admin_audit_log').insert({
    actor_user_id: user.id,
    action: 'assign_external_id',
    target_table: 'matches',
    target_id: String(parsed.data.match_id),
    before_data: before ?? {},
    after_data: { external_id: parsed.data.external_id },
  });

  revalidatePath('/admin/sync');
  return { savedAt: new Date().toISOString() };
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/Gero/Documents/Prode/Prode/app && npx tsc --noEmit
```
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
cd /Users/Gero/Documents/Prode/Prode && git add app/src/app/\(app\)/admin/sync/actions.ts && git commit -m "feat(admin): server actions syncNow + approveStaging + rejectStaging + assignExternalId"
```

---

## Task 7: UI /admin/sync (page + 3 client components)

**Files:**
- Create: `app/src/app/(app)/admin/sync/page.tsx`
- Create: `app/src/app/(app)/admin/sync/sync-now-button.tsx`
- Create: `app/src/app/(app)/admin/sync/pending-approvals.tsx`
- Create: `app/src/app/(app)/admin/sync/external-id-editor.tsx`

- [ ] **Step 1: `sync-now-button.tsx`**

Create `app/src/app/(app)/admin/sync/sync-now-button.tsx`:
```tsx
'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { syncNow } from './actions';
import type { SyncResult } from '@/lib/sync-fd';

export function SyncNowButton() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    start(async () => {
      setError(null);
      const res = await syncNow();
      if ('error' in res) {
        setError(res.error);
        setResult(null);
      } else {
        setResult(res);
      }
    });
  }

  return (
    <div className="space-y-2">
      <Button onClick={handleClick} disabled={pending}>
        {pending ? 'Sincronizando...' : 'Sincronizar ahora'}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {result && (
        <p className="text-sm text-muted-foreground">
          {result.inserted} nuevos en staging, {result.skipped} sin cambios, {result.unmapped} sin
          external_id.{result.errors.length > 0 && ` ${result.errors.length} errores.`}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: `pending-approvals.tsx`**

Create `app/src/app/(app)/admin/sync/pending-approvals.tsx`:
```tsx
'use client';

import { useState, useTransition } from 'react';
import type { Match, MatchStaging } from '@/lib/database.types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { approveStaging, rejectStaging } from './actions';

type Row = { staging: MatchStaging; match: Match | null };

export function PendingApprovals({ rows }: { rows: Row[] }) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          No hay aprobaciones pendientes.
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      {rows.map((row) => (
        <ApprovalRow key={row.staging.id} row={row} />
      ))}
    </div>
  );
}

function ApprovalRow({ row }: { row: Row }) {
  const { staging, match } = row;
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleApprove() {
    start(async () => {
      setError(null);
      const res = await approveStaging({ staging_id: staging.id });
      if ('error' in res) setError(res.error);
    });
  }

  function handleReject() {
    const notes = prompt('Motivo del rechazo (opcional):') ?? undefined;
    start(async () => {
      setError(null);
      const res = await rejectStaging({ staging_id: staging.id, notes });
      if ('error' in res) setError(res.error);
    });
  }

  function diff<T>(a: T, b: T): string {
    if (a === b) return String(a ?? '—');
    return `${String(a ?? '—')} → ${String(b ?? '—')}`;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {match?.bracket_slot ?? `match #${staging.match_id}`}{' '}
          <span className="text-xs text-muted-foreground">
            (fetched {new Date(staging.fetched_at).toLocaleString('es-AR')})
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <table className="w-full text-sm">
          <tbody className="divide-y">
            <tr>
              <td className="py-1 font-medium">scheduled_at</td>
              <td className="py-1">{diff(match?.scheduled_at ?? null, staging.scheduled_at)}</td>
            </tr>
            <tr>
              <td className="py-1 font-medium">90&apos; home/away</td>
              <td className="py-1">
                {diff(match?.home_score_90 ?? null, staging.home_score_90)} /{' '}
                {diff(match?.away_score_90 ?? null, staging.away_score_90)}
              </td>
            </tr>
            <tr>
              <td className="py-1 font-medium">120&apos; home/away</td>
              <td className="py-1">
                {diff(match?.home_score_120 ?? null, staging.home_score_120)} /{' '}
                {diff(match?.away_score_120 ?? null, staging.away_score_120)}
              </td>
            </tr>
            <tr>
              <td className="py-1 font-medium">penaltis</td>
              <td className="py-1">
                {diff(match?.went_to_penalties ?? false, staging.went_to_penalties ?? false)}
              </td>
            </tr>
            <tr>
              <td className="py-1 font-medium">winner</td>
              <td className="py-1">
                {diff(match?.winner_team_code ?? null, staging.winner_team_code)}
              </td>
            </tr>
          </tbody>
        </table>
        <div className="flex gap-2">
          <Button onClick={handleApprove} disabled={pending} size="sm">
            {pending ? '...' : 'Aprobar'}
          </Button>
          <Button onClick={handleReject} disabled={pending} size="sm" variant="destructive">
            Rechazar
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: `external-id-editor.tsx`**

Create `app/src/app/(app)/admin/sync/external-id-editor.tsx`:
```tsx
'use client';

import { useCallback, useRef, useState } from 'react';
import type { Match } from '@/lib/database.types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SaveChip, type SaveState } from '@/app/(app)/eventos/[id]/sections/save-chip';
import { assignExternalId } from './actions';

export function ExternalIdEditor({ matches: initial }: { matches: Match[] }) {
  const [matches, setMatches] = useState<Match[]>(initial);
  const [saveStates, setSaveStates] = useState<Record<number, SaveState>>({});
  const [errors, setErrors] = useState<Record<number, string | null>>({});
  const timers = useRef<Record<number, ReturnType<typeof setTimeout> | null>>({});

  const scheduleSave = useCallback(
    (match_id: number, external_id: string | null) => {
      setSaveStates((s) => ({ ...s, [match_id]: 'dirty' }) as Record<number, SaveState>);
      setErrors((e) => ({ ...e, [match_id]: null }) as Record<number, string | null>);
      if (timers.current[match_id]) clearTimeout(timers.current[match_id]!);
      timers.current[match_id] = setTimeout(async () => {
        setSaveStates((s) => ({ ...s, [match_id]: 'saving' }) as Record<number, SaveState>);
        const res = await assignExternalId({ match_id, external_id });
        if ('error' in res) {
          setSaveStates((s) => ({ ...s, [match_id]: 'error' }) as Record<number, SaveState>);
          setErrors((e) => ({ ...e, [match_id]: res.error }) as Record<number, string | null>);
        } else {
          setSaveStates((s) => ({ ...s, [match_id]: 'saved' }) as Record<number, SaveState>);
        }
      }, 800);
    },
    [],
  );

  function updateLocal(match_id: number, external_id: string | null) {
    setMatches((prev) => prev.map((m) => (m.id === match_id ? { ...m, external_id } : m)));
    scheduleSave(match_id, external_id);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mapping FD ↔ matches</CardTitle>
        <p className="text-sm text-muted-foreground">
          Asigná el ID de Football-Data.org a cada slot del bracket. Si no sabés cuál, podés
          ejecutar &quot;Sincronizar ahora&quot; primero y revisar los matches que vengan unmapped.
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {matches.map((m) => (
          <div key={m.id} className="grid grid-cols-12 items-center gap-2 border-b py-2 text-sm">
            <div className="col-span-2 font-medium">{m.bracket_slot}</div>
            <div className="col-span-2 text-xs text-muted-foreground">{m.stage}</div>
            <div className="col-span-3 text-xs">
              {m.home_team_code ?? '—'} vs {m.away_team_code ?? '—'}
            </div>
            <div className="col-span-4">
              <Label htmlFor={`ext-${m.id}`} className="sr-only">External ID</Label>
              <Input
                id={`ext-${m.id}`}
                type="text"
                placeholder="FD match id"
                value={m.external_id ?? ''}
                onChange={(e) => updateLocal(m.id, e.target.value === '' ? null : e.target.value)}
              />
            </div>
            <div className="col-span-1 text-right">
              <SaveChip state={saveStates[m.id] ?? 'idle'} />
              {errors[m.id] && (
                <p className="text-xs text-destructive">{errors[m.id]}</p>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: `page.tsx` (server)**

Create `app/src/app/(app)/admin/sync/page.tsx`:
```tsx
import { createSupabaseServerClient } from '@/lib/supabase-server';
import type { Match, MatchStaging } from '@/lib/database.types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SyncNowButton } from './sync-now-button';
import { PendingApprovals } from './pending-approvals';
import { ExternalIdEditor } from './external-id-editor';

export default async function AdminSyncPage() {
  const supabase = createSupabaseServerClient();

  const [stagingRes, matchesRes] = await Promise.all([
    supabase
      .from('matches_staging')
      .select('*')
      .eq('status', 'pending')
      .order('fetched_at', { ascending: true }),
    supabase.from('matches').select('*').order('stage').order('bracket_slot'),
  ]);

  const stagingRows = (stagingRes.data ?? []) as MatchStaging[];
  const matches = (matchesRes.data ?? []) as Match[];
  const matchById = new Map(matches.map((m) => [m.id, m]));

  const approvalsRows = stagingRows.map((s) => ({
    staging: s,
    match: matchById.get(s.match_id) ?? null,
  }));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Pendientes de aprobación ({approvalsRows.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <PendingApprovals rows={approvalsRows} />
        </CardContent>
      </Card>

      <ExternalIdEditor matches={matches} />

      <Card>
        <CardHeader>
          <CardTitle>Trigger manual</CardTitle>
        </CardHeader>
        <CardContent>
          <SyncNowButton />
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 5: Typecheck + lint**

```bash
cd /Users/Gero/Documents/Prode/Prode/app && npx tsc --noEmit && npm run lint
```
Expected: ambos limpios.

- [ ] **Step 6: Commit**

```bash
cd /Users/Gero/Documents/Prode/Prode && git add app/src/app/\(app\)/admin/sync && git commit -m "feat(admin): /admin/sync con pending approvals + external-id editor + sync now"
```

---

## Task 8: Admin index card + vercel.json + .env.example

**Files:**
- Modify: `app/src/app/(app)/admin/page.tsx`
- Modify: `app/vercel.json`
- Modify: `app/.env.example`

- [ ] **Step 1: Agregar 4ta card "Sync" al index**

En `app/src/app/(app)/admin/page.tsx`, encontrar el `Promise.all` y agregar una query para contar staging pending:

Reemplazar:
```tsx
  const [teamsRes, playersRes, eventsRes] = await Promise.all([
    supabase.from('teams').select('code, group_position, eliminated_at_stage'),
    supabase.from('players').select('id, is_top_scorer'),
    supabase.from('events').select('id, status').order('id'),
  ]);
```

Con:
```tsx
  const [teamsRes, playersRes, eventsRes, stagingRes] = await Promise.all([
    supabase.from('teams').select('code, group_position, eliminated_at_stage'),
    supabase.from('players').select('id, is_top_scorer'),
    supabase.from('events').select('id, status').order('id'),
    supabase.from('matches_staging').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
  ]);
```

Después de `const event1Status = ...`, agregar:
```tsx
  const pendingStaging = stagingRes.count ?? 0;
```

Agregar el icono import (al lado de `Shield, Users, BarChart3`):
```tsx
import { Shield, Users, BarChart3, RefreshCcw } from 'lucide-react';
```

En el JSX, después del Link a `/admin/scoring` y antes del Card "Volver al dashboard", insertar:
```tsx
      <Link href={"/admin/sync" as Route} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg">
        <Card className="h-full transition-colors hover:bg-accent/40">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Sync FD</CardTitle>
              <RefreshCcw className="h-4 w-4 text-muted-foreground" />
            </div>
            <CardDescription>
              {pendingStaging > 0 ? `${pendingStaging} pendientes` : 'Sin pendientes'}
            </CardDescription>
          </CardHeader>
        </Card>
      </Link>
```

Asegurarte que `import type { Route } from 'next';` está al inicio del archivo (debería estar de Task 3 de Fase 3; si no, agregarlo).

- [ ] **Step 2: Extender `app/vercel.json` con cron**

Reemplazar el contenido completo de `app/vercel.json` con:
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs",
  "crons": [
    { "path": "/api/cron/sync-matches", "schedule": "0 12 * * *" }
  ]
}
```

- [ ] **Step 3: Agregar `CRON_SECRET` a `.env.example`**

En `app/.env.example`, agregar al final (después de `NEXT_PUBLIC_SITE_URL`):
```
# --- Cron jobs ---
# Random string 32+ caracteres. Generar con: openssl rand -hex 32
# Setear el MISMO valor en Vercel (Project Settings → Environment Variables)
CRON_SECRET=
```

- [ ] **Step 4: Typecheck + lint**

```bash
cd /Users/Gero/Documents/Prode/Prode/app && npx tsc --noEmit && npm run lint
```
Expected: ambos limpios.

- [ ] **Step 5: Commit**

```bash
cd /Users/Gero/Documents/Prode/Prode && git add app/src/app/\(app\)/admin/page.tsx app/vercel.json app/.env.example && git commit -m "feat(admin): card Sync en index + vercel.json cron + CRON_SECRET en env.example"
```

---

## Task 9: Verificación end-to-end + push

⚠️ **Antes de empezar:**
1. **Aplicar migration 0009 en Supabase** vía SQL Editor (https://supabase.com/dashboard/project/tafirbqrgthobkhtqitq/sql/new — pegar el contenido de `app/supabase/migrations/0009_matches_seed.sql`, Run).
2. **Generar CRON_SECRET local + remote:**
   ```bash
   openssl rand -hex 32
   ```
   Copiar el valor a `.env.local` (`CRON_SECRET=...`) y a Vercel (Project Settings → Environment Variables, nombre `CRON_SECRET`, value el mismo, scope Production+Preview).

- [ ] **Step 1: Tests, typecheck, lint**

```bash
cd /Users/Gero/Documents/Prode/Prode/app && npm run test && npx tsc --noEmit && npm run lint
```
Expected: 15/15 tests, typecheck OK, lint OK.

- [ ] **Step 2: Build de producción**

```bash
cd /Users/Gero/Documents/Prode/Prode/app && npm run build
```
Expected: "Compiled successfully" y rutas listadas incluyen `/admin/sync` y `/api/cron/sync-matches`.

- [ ] **Step 3: Probar CLI local**

```bash
cd /Users/Gero/Documents/Prode/Prode/app && npm run db:sync-matches
```
Expected: imprime un resumen tipo "0 nuevos en staging, 0 sin cambios, N sin external_id mapeado" (N ≤ 31, depende de cuántos matches haya FD; con free plan probablemente 0 elim porque el WC todavía no empezó).

- [ ] **Step 4: Dev server + manual smoke**

```bash
cd /Users/Gero/Documents/Prode/Prode/app && npm run dev
```

Como admin (gicornou@gmail.com):

**A) Navegación**
- En `/admin`, aparece la 4ta card **Sync FD** con "Sin pendientes".
- Click → llegás a `/admin/sync`.
- Ves: "Pendientes de aprobación (0)", "Mapping FD ↔ matches" con 31 rows, "Trigger manual" con botón.

**B) External ID editor**
- En la fila R32-01, escribir cualquier número (ej. `123456`) → chip "Editando..." → "Guardando..." → "✓ Guardado".
- Refresh → persiste.
- Intentar pegar el MISMO id en R32-02 → error "No se pudo asignar el external_id (¿duplicado?)" (porque el constraint UNIQUE lo bloquea).
- Limpiar el campo R32-01 (dejarlo vacío) → autosave → external_id queda NULL.

**C) Sync now**
- Click "Sincronizar ahora" → mensaje "Sincronizando..." → resultado tipo "0 nuevos, 0 sin cambios, N unmapped".
- Si tenés algún external_id asignado a un match y FD tiene data para él, aparece un row en pendientes.

**D) Cron endpoint local**
- En otra terminal: `curl -i http://localhost:3000/api/cron/sync-matches` → debe responder **401 Unauthorized**.
- Con header: `curl -i -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/sync-matches` → 200 con `{ ok: true, result: {...} }` (asumiendo el env está cargado).

- [ ] **Step 5: Push**

```bash
cd /Users/Gero/Documents/Prode/Prode && git push origin main
```

Vercel auto-deploya. Verificar en Vercel dashboard:
- Project Settings → Environment Variables: `CRON_SECRET` está cargado.
- Project Settings → Functions/Crons: aparece `/api/cron/sync-matches` programado para `0 12 * * *`.

- [ ] **Step 6: Smoke en producción**

En la URL de Vercel:
- `/admin/sync` carga sin error.
- Asignar un external_id y "Sincronizar ahora" — verificar respuesta.

(El cron real corre 1x/día a las 12:00 UTC. Si querés forzar antes, podés llamarlo manualmente desde el dashboard de Vercel — Settings → Crons → tu cron → "Run now".)
