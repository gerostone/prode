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
          Todavía no hay jugadores registrados.
        </CardContent>
      </Card>
    );
  }

  const allZero = rows.every((r) => r.total_points === 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-yellow-600" />
          Leaderboard
        </CardTitle>
        {allZero && (
          <p className="text-xs text-muted-foreground">
            Todos los puntajes están en 0 — el scoring aún no encontró aciertos. Los puntos aparecen
            a medida que el admin carga los resultados reales y recalcula.
          </p>
        )}
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
