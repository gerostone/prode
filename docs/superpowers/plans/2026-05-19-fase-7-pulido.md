# Fase 7 — Pulido pre-Mundial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar gaps operacionales antes del kickoff del Mundial (11 jun): lock-out automático via cron, auto-set de `closes_at` desde FD sync, header mobile-friendly, card de "Próximo cierre" en dashboard.

**Architecture:** Migration 0010 hace `actor_user_id` nullable para audit logs system-triggered. El cron `/api/cron/sync-matches` se extiende con dos fases nuevas (auto-set closes_at + auto-lock vencidos) al final de su pipeline existente. El header usa `flex-wrap` en lugar de `hidden sm:flex`. El dashboard suma una 5ta card condicional con el próximo cierre.

**Tech Stack:** Postgres + Supabase, Next.js 14 App Router (Route Handler + Server Component), Tailwind, Lucide.

**Spec:** `docs/superpowers/specs/2026-05-19-fase-7-pulido.md`

---

## File Structure Overview

| Archivo | Responsabilidad |
|---|---|
| `app/supabase/migrations/0010_audit_log_nullable.sql` | **NEW** — drop not null en actor_user_id |
| `app/src/app/api/cron/sync-matches/route.ts` | **MODIFY** — agregar fases auto-set + auto-lock |
| `app/src/components/app-header.tsx` | **MODIFY** — mobile nav (flex-wrap) |
| `app/src/app/(app)/dashboard/page.tsx` | **MODIFY** — card "Próximo cierre" |

---

## Task 1: Migration 0010 — audit_log.actor_user_id nullable

**Files:**
- Create: `app/supabase/migrations/0010_audit_log_nullable.sql`

⚠️ Solo crea el archivo. La migration se aplica antes de Task 5 (verificación).

- [ ] **Step 1: Crear el archivo**

Create `app/supabase/migrations/0010_audit_log_nullable.sql`:
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

- [ ] **Step 2: Commit**

```bash
cd /Users/Gero/Documents/Prode/Prode && git add app/supabase/migrations/0010_audit_log_nullable.sql && git commit -m "feat(db): migration 0010 — admin_audit_log.actor_user_id nullable"
```

---

## Task 2: Extender el cron con auto-set closes_at + auto-lock

**Files:**
- Modify: `app/src/app/api/cron/sync-matches/route.ts`

- [ ] **Step 1: Modificar el route handler**

En `app/src/app/api/cron/sync-matches/route.ts`, agregar dos fases nuevas al final del bloque `try`. Reemplazar:

```ts
  try {
    const result = await syncFromFD({ fdApiKey, supabaseUrl, supabaseServiceKey });
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    console.error('cron sync error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
```

Con:

```ts
  try {
    const result = await syncFromFD({ fdApiKey, supabaseUrl, supabaseServiceKey });

    // Fase A — Auto-set closes_at para Eventos 2/3/4 desde matches.scheduled_at
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

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
          .in('status', ['draft', 'open']);
      }
    }

    // Fase B — Auto-lock de eventos vencidos
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
          .eq('status', 'open');
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

    return NextResponse.json({ ok: true, syncResult: result, lockedEventIds });
  } catch (err) {
    console.error('cron sync error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
```

Nota: usamos `createClient` directo (no `createSupabaseServerClient`) porque ya estamos en un contexto sin cookies y usando service role key, igual que `syncFromFD`. Lo importamos dinámicamente para no agregar import top-level (evita romper si `syncFromFD` ya lo hace internamente).

⚠️ Optimización opcional: si `syncFromFD` expone su cliente Supabase, podríamos reusarlo en vez de crear uno nuevo. Para minimizar cambios al lib `sync-fd.ts`, creamos uno nuevo acá.

- [ ] **Step 2: Typecheck + lint**

```bash
cd /Users/Gero/Documents/Prode/Prode/app && npx tsc --noEmit && npm run lint
```
Expected: ambos limpios.

- [ ] **Step 3: Commit**

```bash
cd /Users/Gero/Documents/Prode/Prode && git add app/src/app/api/cron/sync-matches/route.ts && git commit -m "feat(cron): auto-set closes_at + auto-lock eventos vencidos"
```

---

## Task 3: Mobile-friendly header

**Files:**
- Modify: `app/src/components/app-header.tsx`

- [ ] **Step 1: Cambiar el `<nav>` className**

En `app/src/components/app-header.tsx`, encontrar:
```tsx
<nav className="hidden gap-4 text-sm sm:flex">
```

Reemplazar con:
```tsx
<nav className="flex flex-wrap gap-2 text-xs sm:gap-4 sm:text-sm">
```

Cero cambios al resto del archivo.

- [ ] **Step 2: Typecheck + lint**

```bash
cd /Users/Gero/Documents/Prode/Prode/app && npx tsc --noEmit && npm run lint
```
Expected: ambos limpios.

- [ ] **Step 3: Commit**

```bash
cd /Users/Gero/Documents/Prode/Prode && git add app/src/components/app-header.tsx && git commit -m "feat(header): nav siempre visible + wrap en mobile"
```

---

## Task 4: Card "Próximo cierre" en dashboard

**Files:**
- Modify: `app/src/app/(app)/dashboard/page.tsx`

- [ ] **Step 1: Agregar query al `Promise.all`**

En `app/src/app/(app)/dashboard/page.tsx`, encontrar el bloque actual de queries. Probablemente algo así:
```tsx
  const { data: nextEvent } = await supabase
    .from('events')
    .select('*')
    .in('status', ['draft', 'open'])
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle<Event>();

  const { count: teamsCount } = await supabase
    .from('teams')
    .select('*', { count: 'exact', head: true });

  const { count: playersCount } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true });
```

⚠️ Si esas queries están separadas (await secuencial), está bien — solo agregamos la query nueva como una await más después de las existentes. Si están dentro de un Promise.all, agregamos al array.

Forma simple: agregar después de las queries existentes:
```tsx
  const { data: nextClose } = await supabase
    .from('events')
    .select('id, name, closes_at')
    .eq('status', 'open')
    .not('closes_at', 'is', null)
    .order('closes_at', { ascending: true })
    .limit(1)
    .maybeSingle<{ id: number; name: string; closes_at: string }>();
```

- [ ] **Step 2: Agregar el helper `formatTimeRemaining` arriba del componente**

Insertar antes de `export default async function DashboardPage()`:
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

- [ ] **Step 3: Agregar `Clock` al import de lucide-react**

Encontrar el import existente (algo como `import { Calendar, Trophy, Users, Shield } from 'lucide-react';`) y agregar `Clock`:

```tsx
import { Calendar, Trophy, Users, Shield, Clock } from 'lucide-react';
```

- [ ] **Step 4: Agregar la card "Próximo cierre" al grid**

En el JSX del dashboard, encontrar el grid de cards (probablemente `<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">`). Agregar dentro, después de las cards existentes:

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

Nota: el grid puede pasar de 4 a 5 cards en lg. Tailwind con `lg:grid-cols-4` rendea 5 cards en una 2da fila con 1 sola card. Acceptable. Si querés que llene mejor, cambiar a `lg:grid-cols-5` opcional (no requerido).

- [ ] **Step 5: Typecheck + lint**

```bash
cd /Users/Gero/Documents/Prode/Prode/app && npx tsc --noEmit && npm run lint
```
Expected: ambos limpios.

- [ ] **Step 6: Commit**

```bash
cd /Users/Gero/Documents/Prode/Prode && git add app/src/app/\(app\)/dashboard/page.tsx && git commit -m "feat(dashboard): card 'Próximo cierre' con tiempo restante"
```

---

## Task 5: Verificación end-to-end + push + marca Fase 7 completa

⚠️ **Antes de empezar:** aplicar migration 0010 a Supabase via SQL Editor.

1. https://supabase.com/dashboard/project/tafirbqrgthobkhtqitq/sql/new
2. Pegar:
   ```sql
   alter table admin_audit_log
     alter column actor_user_id drop not null;
   ```
3. Click Run.

- [ ] **Step 1: Tests + typecheck + lint + build**

```bash
cd /Users/Gero/Documents/Prode/Prode/app && npm run test && npx tsc --noEmit && npm run lint && npm run build 2>&1 | tail -22
```
Expected:
- Tests: 22 verde (sin tests nuevos esta fase).
- Typecheck: exit 0.
- Lint: 0 warnings/errors.
- Build: rutas listadas (sin cambios).

- [ ] **Step 2: Smoke local — cron extendido**

Levantar dev server: `npm run dev`.

En otra terminal, simular el cron (necesita CRON_SECRET cargado en `.env.local`):
```bash
source /Users/Gero/Documents/Prode/Prode/app/.env.local
curl -i -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/sync-matches
```
Expected: 200 OK con JSON `{ "ok": true, "syncResult": {...}, "lockedEventIds": [] }`.

- [ ] **Step 3: Smoke local — auto-lock**

En SQL Editor:
```sql
-- Asegurar que algún evento esté open con closes_at en el pasado
update events set status = 'open', closes_at = now() - interval '1 hour' where id = 1;
```

Re-ejecutar el curl del Step 2. Esperado: `"lockedEventIds": [1]`.

Verificar audit log:
```sql
select * from admin_audit_log where action = 'auto_lock_event' order by created_at desc limit 5;
```
Debería tener una row con `actor_user_id = null`, `target_id = '1'`, `after_data` incluyendo `triggered_by: 'cron'`.

Restaurar:
```sql
update events set status = 'open', closes_at = null where id = 1;
```

- [ ] **Step 4: Smoke local — dashboard y header**

Abrir http://localhost:3000/dashboard logueado.
- Si hay algún evento open con closes_at futuro: aparece la 5ta card "Próximo cierre" con el tiempo restante.
- Probar header en mobile (Chrome DevTools 360px width): los links del nav siempre visibles, wrap si es necesario.

- [ ] **Step 5: Marcar Fase 7 como completa en el dashboard**

En `app/src/app/(app)/dashboard/page.tsx`, encontrar:
```tsx
            <li>⏳ <strong>Fase 7</strong> — Pulido</li>
```
Cambiar a:
```tsx
            <li>✅ <strong>Fase 7</strong> — Pulido</li>
```

- [ ] **Step 6: Commit final + push todos**

```bash
cd /Users/Gero/Documents/Prode/Prode && git add app/src/app/\(app\)/dashboard/page.tsx && git commit -m "chore(dashboard): marcar Fase 7 como completa" && git push origin main
```

Vercel auto-deploya.

- [ ] **Step 7: Smoke en producción**

En la URL de Vercel:
- `/dashboard` carga, card "Próximo cierre" aparece si hay candidato.
- Header en mobile (abrir desde el celular o DevTools): nav visible.
- Trigger manual del cron desde Vercel Settings → Crons → "Run now". Verificar en Observability → Logs que devuelve 200 con el JSON esperado.
