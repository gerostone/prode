'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type MatchState = 'live' | 'finished' | 'scheduled';

type TodayMatch = {
  id: number;
  utcDate: string;
  state: MatchState;
  stage: string;
  group: string | null;
  home: string;
  away: string;
  homeCrest: string | null;
  awayCrest: string | null;
  homeScore: number | null;
  awayScore: number | null;
};

type Filter = 'all' | 'live' | 'scheduled' | 'finished';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'live', label: 'En vivo' },
  { key: 'scheduled', label: 'Próximos' },
  { key: 'finished', label: 'Finalizados' },
];

const EMPTY_BY_FILTER: Record<Filter, string> = {
  all: 'No hay partidos hoy.',
  live: 'No hay partidos en vivo en este momento.',
  scheduled: 'No quedan partidos por jugarse hoy.',
  finished: 'Todavía no terminó ningún partido hoy.',
};

export function MatchesTodayWidget() {
  const [matches, setMatches] = useState<TodayMatch[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const res = await fetch('/api/matches-today');
        if (!res.ok) return;
        const data = (await res.json()) as { matches: TodayMatch[] };
        if (active) setMatches(data.matches ?? []);
      } catch {
        // silencioso: si falla, dejamos el último estado conocido
      }
    }
    load();
    const id = setInterval(load, 60_000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  const liveCount = useMemo(
    () => (matches ?? []).filter((m) => m.state === 'live').length,
    [matches],
  );

  const shown = useMemo(() => {
    const all = matches ?? [];
    if (filter === 'all') return all;
    return all.filter((m) => m.state === filter);
  }, [matches, filter]);

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Partidos de hoy</CardTitle>
          {liveCount > 0 && (
            <span className="flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-600">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-600" />
              {liveCount} en vivo
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">Horarios en hora de Buenos Aires.</p>
        <div className="flex flex-wrap gap-1 rounded-md bg-muted p-1 text-xs sm:w-fit">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`rounded-sm px-3 py-1 font-medium transition ${
                filter === f.key
                  ? 'bg-background shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {f.label}
              {f.key === 'live' && liveCount > 0 ? ` (${liveCount})` : ''}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {matches === null ? (
          <p className="py-4 text-sm text-muted-foreground">Cargando…</p>
        ) : shown.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">{EMPTY_BY_FILTER[filter]}</p>
        ) : (
          shown.map((m) => <MatchRow key={m.id} m={m} />)
        )}
      </CardContent>
    </Card>
  );
}

function MatchRow({ m }: { m: TodayMatch }) {
  const time = new Date(m.utcDate).toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Argentina/Buenos_Aires',
  });
  const hasScore = m.homeScore !== null && m.awayScore !== null;
  const live = m.state === 'live';

  return (
    <div
      className={`flex items-center gap-3 rounded-md border px-3 py-2.5 ${
        live ? 'border-red-200 bg-red-50/60' : 'border-border'
      }`}
    >
      <div className="w-16 shrink-0 text-xs font-semibold">
        {live ? (
          <span className="flex items-center gap-1 text-red-600">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-600" />
            EN VIVO
          </span>
        ) : m.state === 'finished' ? (
          <span className="text-muted-foreground">FIN</span>
        ) : (
          <span className="text-muted-foreground">{time}</span>
        )}
      </div>

      <div className="flex flex-1 items-center justify-center gap-3">
        <div className="flex flex-1 items-center justify-end gap-2 text-right">
          <span className="truncate font-medium">{m.home}</span>
          {m.homeCrest && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={m.homeCrest} alt="" className="h-5 w-5 shrink-0" />
          )}
        </div>

        <div className="shrink-0 text-center tabular-nums">
          {hasScore ? (
            <span className={`text-lg font-bold ${live ? 'text-red-700' : ''}`}>
              {m.homeScore} <span className="text-muted-foreground">-</span> {m.awayScore}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">vs</span>
          )}
        </div>

        <div className="flex flex-1 items-center justify-start gap-2 text-left">
          {m.awayCrest && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={m.awayCrest} alt="" className="h-5 w-5 shrink-0" />
          )}
          <span className="truncate font-medium">{m.away}</span>
        </div>
      </div>

      <div className="hidden w-20 shrink-0 truncate text-right text-xs text-muted-foreground sm:block">
        {m.group ?? m.stage}
      </div>
    </div>
  );
}
