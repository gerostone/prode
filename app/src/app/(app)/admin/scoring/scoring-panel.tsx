'use client';

import { useState, useTransition } from 'react';
import type { Event } from '@/lib/database.types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { recalcEventScoring, type ScoreRow } from '../actions';

export type EventWithTop = {
  event: Event;
  top3: { user_id: string; display_name: string; points: number }[];
  lastRecalc: string | null;
};

export function ScoringPanel({ events }: { events: EventWithTop[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {events.map((e) => (
        <ScoringCard key={e.event.id} data={e} />
      ))}
    </div>
  );
}

function ScoringCard({ data }: { data: EventWithTop }) {
  const { event, top3, lastRecalc } = data;
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ScoreRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canRecalc = event.status !== 'draft';
  const needsConfirm = event.status === 'scored';

  function handleClick() {
    if (needsConfirm && !confirm(`Evento ${event.id} ya está scored. ¿Recalcular igual?`)) return;
    start(async () => {
      setError(null);
      const res = await recalcEventScoring({ event_id: event.id });
      if ('error' in res) {
        setError(res.error ?? null);
        setResult(null);
      } else {
        setResult(res.rows);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Evento {event.id} — {event.name}</CardTitle>
        <CardDescription>
          Status: <strong>{event.status}</strong>
          {lastRecalc && (
            <>
              {' · '}último recalc: {new Date(lastRecalc).toLocaleString('es-AR')}
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {top3.length > 0 ? (
          <ol className="space-y-1 text-sm">
            {top3.map((s, i) => (
              <li key={s.user_id}>
                {i + 1}. {s.display_name} — <strong>{s.points} pts</strong>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">Sin scores cargados.</p>
        )}

        <Button onClick={handleClick} disabled={!canRecalc || pending} className="w-full">
          {pending ? 'Recalculando...' : `Recalcular Evento ${event.id}`}
        </Button>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {result && (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">
              Ver resultado completo ({result.length} jugadores)
            </summary>
            <ol className="mt-2 space-y-1">
              {result.map((r, i) => (
                <li key={r.user_id}>
                  {i + 1}. {r.user_id.slice(0, 8)}… — {r.points} pts ({r.correct_count} aciertos)
                </li>
              ))}
            </ol>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
