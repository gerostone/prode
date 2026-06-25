# Fase 6 — Leaderboard público con realtime

**Fecha:** 2026-05-19
**Estado:** Aprobada para implementación

## 1. Objetivo

Pantalla `/leaderboard` que muestra a todos los jugadores ranked por puntos acumulados, con desglose por evento expandible y actualización en tiempo real cuando admin recalcula scoring (sin reload manual).

## 2. Out of scope

- Página `/yo` (mis predicciones + desglose por categoría).
- Página `/comparar/[userId]` (ver predicciones ajenas post-lock).
- Animaciones (confetti, transiciones de cambio de posición).
- Filtros (ranking por evento específico).
- Histórico (cómo cambió el ranking en el tiempo).
- Tests automatizados (la lógica del leaderboard es 100% data display, sin reglas puras testeables).

## 3. Decisiones tomadas (con el usuario)

| Decisión | Elección |
|---|---|
| Alcance | Mínimo: solo `/leaderboard` (sin /yo ni /comparar) |
| Columnas | Total acumulado + dropdown expandible con desglose por evento |
| Realtime | Supabase Realtime channel sobre tabla `scores` |

## 4. Estructura de archivos

```
app/src/app/(app)/leaderboard/
  page.tsx                       NEW — server: carga datos
  leaderboard-table.tsx          NEW — client: tabla + expandable + realtime
```

```
app/src/components/app-header.tsx       MODIFY — agregar link "Leaderboard"
```

(El dashboard NO se toca — el link del header es suficiente. Si en el futuro queremos un card prominente, lo agregamos como pulido en Fase 7.)

Cero migration. Cero schema change. Cero server actions nuevas.

## 5. Loader (server component)

`app/src/app/(app)/leaderboard/page.tsx`:

```tsx
import { requireUser } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { LeaderboardTable, type LeaderboardRow } from './leaderboard-table';

export default async function LeaderboardPage() {
  const { user } = await requireUser();
  const supabase = createSupabaseServerClient();

  const [leaderboardRes, scoresRes] = await Promise.all([
    supabase.from('v_leaderboard').select('*'),
    supabase.from('scores').select('user_id, event_id, points, correct_count'),
  ]);

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

  const leaderboardData = (leaderboardRes.data ?? []) as LeaderboardViewRow[];
  const scoresData = (scoresRes.data ?? []) as ScoreRow[];

  // Build map user_id → { event_id → points }
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

## 6. Tabla (client)

`app/src/app/(app)/leaderboard/leaderboard-table.tsx`:

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

**Notas:**
- Uso `<img>` en lugar de `<Image>` para avatars porque vienen de URLs arbitrarias que no podemos predeclarar en `next.config.mjs`. El eslint comment suprime el warning.
- `router.refresh()` re-fetcha el server component sin reload — los nuevos datos llegan al cliente.

## 7. Setup Supabase Realtime

**Acción manual única, no es código:**
1. Dashboard Supabase → Database → Replication.
2. En la lista de tablas, encontrar `scores`.
3. Toggle **Source** = ON para que la tabla emita eventos por el canal Realtime.

Sin este paso, la subscription no recibe eventos pero el código no rompe (la tabla muestra los datos del SSR, solo no actualiza en vivo). Documentar en el verification checklist.

## 8. Header navigation

`app/src/components/app-header.tsx`:

Encontrar el `<nav>` block y agregar `<Link href="/leaderboard">Leaderboard</Link>` entre "Evento 1" y el conditional "Admin":

```tsx
        <nav className="hidden gap-4 text-sm sm:flex">
          <Link href="/dashboard" className="text-muted-foreground hover:text-foreground">
            Dashboard
          </Link>
          <Link href="/eventos/1" className="text-muted-foreground hover:text-foreground">
            Evento 1
          </Link>
          <Link href="/leaderboard" className="text-muted-foreground hover:text-foreground">
            Leaderboard
          </Link>
          {role === 'admin' && (
            <Link href={"/admin" as Route} className="text-muted-foreground hover:text-foreground">
              Admin
            </Link>
          )}
        </nav>
```

## 9. RLS

`scores` ya tiene RLS habilitado con policy "SELECT autenticado" (de Fase 1). `v_leaderboard` ya tiene `grant select to authenticated`. Cero cambios necesarios.

## 10. Realtime authorization

Las subscripciones de Realtime en Supabase requieren que la conexión esté autenticada Y que la tabla tenga políticas que permitan SELECT al user. Como `scores` permite SELECT a todos los `authenticated`, la subscription va a funcionar para todos los logged-in.

## 11. Riesgos / supuestos

- **Realtime no habilitado en dashboard:** la sub no recibe eventos. Mitigación: el SSR sigue dando datos correctos al cargar; solo se pierde la actualización en vivo. Verificable en Task 6.
- **Avatars de URLs arbitrarias:** uso `<img>` sin Next/Image porque no sabemos los hosts. Trade-off pequeño en performance, gana en simplicidad.
- **`router.refresh()` rate:** múltiples eventos en sucesión rápida (cuando admin recalcula con N usuarios) disparan N refreshes consecutivos. Para ~30 users, OK; si crece, agregar debounce de 300ms.
- **Empty states:** dos casos distintos (no rows vs todos con 0 pts) — la UI los distingue.

## 12. Verificación post-implementación

- [ ] `npm run test && npx tsc --noEmit && npm run lint` verde.
- [ ] `/leaderboard` carga sin error (al menos con tu user authenticated).
- [ ] Tabla muestra N rows en orden de total_points descendente.
- [ ] La fila del user actual aparece con borde primary + "(vos)" inline.
- [ ] Click en una row expande mostrando "Evento 1/2/3/4" con sus puntos.
- [ ] Link "Leaderboard" en header.
- [ ] Realtime habilitado en Supabase dashboard para `scores`.
- [ ] Test realtime: en una pestaña /leaderboard, en otra /admin/scoring → "Recalcular Evento 1". El leaderboard debería refrescar automáticamente.
- [ ] Empty state: si no hay scores en DB, mensaje "Todavía no se corrió el scoring..." aparece.
