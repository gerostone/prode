# Fase 6 — Leaderboard público con realtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir `/leaderboard` con tabla rankeada de jugadores, dropdown expandible por row con desglose por evento, y actualización en tiempo real cuando el admin recalcula scoring (Supabase Realtime sobre la tabla `scores`).

**Architecture:** Server component carga `v_leaderboard` + `scores`, combina y pasa a un client component que renderiza la tabla, manejá la expansión por row y suscribe a un Realtime channel que llama `router.refresh()` ante cualquier cambio en `scores`. Cero schema change, cero server actions.

**Tech Stack:** Next.js 14 App Router (Server + Client Components), Supabase JS + Realtime, Tailwind, Lucide icons.

**Spec:** `docs/superpowers/specs/2026-05-19-fase-6-leaderboard.md`

---

## File Structure Overview

| Archivo | Responsabilidad |
|---|---|
| `app/src/app/(app)/leaderboard/page.tsx` | **NEW** — server: carga `v_leaderboard` + `scores`, combina, pasa al table |
| `app/src/app/(app)/leaderboard/leaderboard-table.tsx` | **NEW** — client: tabla expandible + realtime channel |
| `app/src/components/app-header.tsx` | **MODIFY** — agregar link "Leaderboard" |

---

## Task 1: Página `/leaderboard` (server + client)

**Files:**
- Create: `app/src/app/(app)/leaderboard/page.tsx`
- Create: `app/src/app/(app)/leaderboard/leaderboard-table.tsx`

- [ ] **Step 1: Crear `leaderboard-table.tsx`**

Create `app/src/app/(app)/leaderboard/leaderboard-table.tsx`:
```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, Trophy } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export type LeaderboardRow = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  total_points: number;
  total_correct: number;
  points_by_event: Record<number, number>;
};

export function LeaderboardTable({
  rows,
  currentUserId,
}: {
  rows: LeaderboardRow[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Realtime: cuando admin recalcula scores → refresh
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel('scores-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'scores' },
        () => router.refresh(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [router]);

  function toggleExpand(userId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Todavía no hay jugadores con puntos. Esperá a que se cierre algún evento.
        </CardContent>
      </Card>
    );
  }

  const allZero = rows.every((r) => r.total_points === 0);
  if (allZero) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Todavía no se corrió el scoring de ningún evento. Volvé después de que el admin recalcule.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-yellow-600" />
          Leaderboard
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {rows.map((row, i) => {
          const isCurrent = row.user_id === currentUserId;
          const isExpanded = expanded.has(row.user_id);
          return (
            <div
              key={row.user_id}
              className={`rounded-md border ${isCurrent ? 'border-primary bg-primary/5' : 'border-border'}`}
            >
              <button
                type="button"
                onClick={() => toggleExpand(row.user_id)}
                className="flex w-full items-center gap-3 p-3 text-left hover:bg-accent/40"
              >
                <span className="w-8 text-center font-semibold text-muted-foreground">
                  {i + 1}
                </span>
                <Avatar name={row.display_name} url={row.avatar_url} />
                <span className={`flex-1 ${isCurrent ? 'font-semibold' : ''}`}>
                  {row.display_name}
                  {isCurrent && (
                    <span className="ml-2 text-xs text-primary">(vos)</span>
                  )}
                </span>
                <span className="font-bold tabular-nums">{row.total_points} pts</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {row.total_correct} aciertos
                </span>
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
              {isExpanded && (
                <div className="grid grid-cols-4 gap-2 border-t bg-muted/20 p-3 text-sm">
                  {[1, 2, 3, 4].map((eventId) => (
                    <div key={eventId} className="text-center">
                      <div className="text-xs text-muted-foreground">Evento {eventId}</div>
                      <div className="font-medium tabular-nums">
                        {row.points_by_event[eventId] ?? 0} pts
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={name} className="h-8 w-8 rounded-full" />;
  }
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-medium uppercase">
      {name.charAt(0)}
    </div>
  );
}
```

- [ ] **Step 2: Crear `page.tsx`**

Create `app/src/app/(app)/leaderboard/page.tsx`:
```tsx
import { requireUser } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { LeaderboardTable, type LeaderboardRow } from './leaderboard-table';

type LeaderboardViewRow = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  total_points: number;
  total_correct: number;
};

type ScoreRow = {
  user_id: string;
  event_id: number;
  points: number;
  correct_count: number;
};

export default async function LeaderboardPage() {
  const { user } = await requireUser();
  const supabase = createSupabaseServerClient();

  const [leaderboardRes, scoresRes] = await Promise.all([
    supabase.from('v_leaderboard').select('*'),
    supabase.from('scores').select('user_id, event_id, points, correct_count'),
  ]);

  const leaderboardData = (leaderboardRes.data ?? []) as LeaderboardViewRow[];
  const scoresData = (scoresRes.data ?? []) as ScoreRow[];

  const pointsByUser = new Map<string, Record<number, number>>();
  for (const s of scoresData) {
    if (!pointsByUser.has(s.user_id)) pointsByUser.set(s.user_id, {});
    pointsByUser.get(s.user_id)![s.event_id] = s.points;
  }

  const rows: LeaderboardRow[] = leaderboardData.map((r) => ({
    user_id: r.user_id,
    display_name: r.display_name,
    avatar_url: r.avatar_url,
    total_points: r.total_points,
    total_correct: r.total_correct,
    points_by_event: pointsByUser.get(r.user_id) ?? {},
  }));

  return <LeaderboardTable rows={rows} currentUserId={user.id} />;
}
```

- [ ] **Step 3: Typecheck + lint**

```bash
cd /Users/Gero/Documents/Prode/Prode/app && npx tsc --noEmit && npm run lint
```
Expected: ambos limpios.

⚠️ Si lint chilla por el `<img>` sin `next/image`, el comment `// eslint-disable-next-line` debería suprimirlo. Si no, agregá `/* eslint-disable jsx-a11y/alt-text */` arriba del archivo o convertí a `next/image` con `unoptimized` prop.

- [ ] **Step 4: Commit**

```bash
cd /Users/Gero/Documents/Prode/Prode && git add app/src/app/\(app\)/leaderboard && git commit -m "feat(leaderboard): /leaderboard con tabla expandible + realtime sub a scores"
```

---

## Task 2: Link "Leaderboard" en el header

**Files:**
- Modify: `app/src/components/app-header.tsx`

- [ ] **Step 1: Agregar el Link entre "Evento 1" y "Admin"**

En `app/src/components/app-header.tsx`, encontrar el bloque `<nav>`:
```tsx
        <nav className="hidden gap-4 text-sm sm:flex">
          <Link href="/dashboard" className="text-muted-foreground hover:text-foreground">
            Dashboard
          </Link>
          <Link href="/eventos/1" className="text-muted-foreground hover:text-foreground">
            Evento 1
          </Link>
          {role === 'admin' && (
            <Link href={"/admin" as Route} className="text-muted-foreground hover:text-foreground">
              Admin
            </Link>
          )}
          {/* Próximas fases: <Link href="/leaderboard">Leaderboard</Link> */}
        </nav>
```

Reemplazar con:
```tsx
        <nav className="hidden gap-4 text-sm sm:flex">
          <Link href="/dashboard" className="text-muted-foreground hover:text-foreground">
            Dashboard
          </Link>
          <Link href="/eventos/1" className="text-muted-foreground hover:text-foreground">
            Evento 1
          </Link>
          <Link href={"/leaderboard" as Route} className="text-muted-foreground hover:text-foreground">
            Leaderboard
          </Link>
          {role === 'admin' && (
            <Link href={"/admin" as Route} className="text-muted-foreground hover:text-foreground">
              Admin
            </Link>
          )}
        </nav>
```

(El cast `as Route` ya se usa en el archivo para `/admin`; mismo patrón.)

- [ ] **Step 2: Typecheck + lint**

```bash
cd /Users/Gero/Documents/Prode/Prode/app && npx tsc --noEmit && npm run lint
```
Expected: ambos limpios.

- [ ] **Step 3: Commit**

```bash
cd /Users/Gero/Documents/Prode/Prode && git add app/src/components/app-header.tsx && git commit -m "feat(nav): link 'Leaderboard' en el header"
```

---

## Task 3: Verificación end-to-end + push + dashboard mark

⚠️ **Antes de empezar:** habilitar Realtime en la tabla `scores` desde Supabase dashboard.

1. https://supabase.com/dashboard/project/tafirbqrgthobkhtqitq → Database → Replication.
2. En la lista de tablas, encontrar `scores`.
3. Toggle **Source** = ON.

Sin este paso, la subscription no recibe eventos pero el código sigue funcional (solo no se actualiza en vivo).

- [ ] **Step 1: Tests + typecheck + lint + build**

```bash
cd /Users/Gero/Documents/Prode/Prode/app && npm run test && npx tsc --noEmit && npm run lint && npm run build 2>&1 | tail -25
```
Expected:
- Tests: 22 verde (sin tests nuevos esta fase).
- Typecheck: exit 0.
- Lint: 0 warnings/errors.
- Build: `/leaderboard` listado en las rutas.

- [ ] **Step 2: Dev server + smoke manual**

```bash
cd /Users/Gero/Documents/Prode/Prode/app && npm run dev
```

Como admin (gicornou@gmail.com):

**A) /leaderboard**
- Carga sin error.
- Si no hay scores: aparece mensaje "Todavía no se corrió el scoring..."
- Si hay scores: tabla con N rows ordenadas por total_points descendente.
- Tu fila tiene borde primary + "(vos)" inline.
- Click en una row → expande con grid 4 cols mostrando puntos por evento.

**B) Header**
- Link "Leaderboard" aparece entre "Evento 1" y "Admin".

**C) Realtime test**
- Abrir `/leaderboard` en una pestaña.
- En otra pestaña, ir a `/admin/scoring` → click "Recalcular Evento 1".
- La pestaña del leaderboard debería refrescar automáticamente (sin reload manual).
- Si no refresca: verificar que Realtime está habilitado en el dashboard de Supabase.

**D) Empty state**
- Para validar: temporalmente, en SQL Editor `delete from scores;` y refrescar `/leaderboard`. Debe aparecer el mensaje de empty. Después restaurar con un recalc.

- [ ] **Step 3: Marcar Fase 6 como completa en el dashboard**

En `app/src/app/(app)/dashboard/page.tsx`, encontrar:
```tsx
            <li>⏳ <strong>Fase 6</strong> — Scoring y leaderboard en realtime</li>
```
Cambiar a:
```tsx
            <li>✅ <strong>Fase 6</strong> — Scoring y leaderboard en realtime</li>
```

- [ ] **Step 4: Commit dashboard + push todos**

```bash
cd /Users/Gero/Documents/Prode/Prode && git add app/src/app/\(app\)/dashboard/page.tsx && git commit -m "chore(dashboard): marcar Fase 6 como completa" && git push origin main
```

Vercel auto-deploya. Verificar en producción.

- [ ] **Step 5: Smoke en producción**

En la URL de Vercel, repetir steps A–C arriba. Si Realtime no anda, doublecheck el toggle en Supabase dashboard (puede tardar unos segundos en propagarse).
