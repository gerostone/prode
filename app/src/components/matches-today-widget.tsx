'use client';

import { useEffect, useMemo, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const AR_TZ = 'America/Argentina/Buenos_Aires';

type MatchState = 'live' | 'finished' | 'scheduled';

type DayMatch = {
  id: number;
  utcDate: string;
  dayKey: string;
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
  all: 'No hay partidos este día.',
  live: 'No hay partidos en vivo en este momento.',
  scheduled: 'No quedan partidos por jugarse este día.',
  finished: 'Todavía no terminó ningún partido este día.',
};

// Día calendario AR del instante actual (YYYY-MM-DD).
function arDayKey(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: AR_TZ });
}

// Mismo formato pero desplazando N días desde una key dada (mediodía AR evita saltos de TZ).
function shiftKey(key: string, days: number): string {
  const base = new Date(`${key}T12:00:00-03:00`);
  return new Date(base.getTime() + days * 86_400_000).toLocaleDateString('en-CA', {
    timeZone: AR_TZ,
  });
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function MatchesTodayWidget() {
  const [matches, setMatches] = useState<DayMatch[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const res = await fetch('/api/matches-today');
        if (!res.ok) return;
        const data = (await res.json()) as { matches: DayMatch[] };
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

  const todayKey = useMemo(() => arDayKey(), []);
  const yesterdayKey = useMemo(() => shiftKey(todayKey, -1), [todayKey]);
  const tomorrowKey = useMemo(() => shiftKey(todayKey, 1), [todayKey]);

  // Días con al menos un partido, ordenados.
  const days = useMemo(() => {
    const set = new Set((matches ?? []).map((m) => m.dayKey));
    return [...set].sort();
  }, [matches]);

  // Día por defecto: hoy si tiene partidos; si no, el próximo con partidos; si no, el último.
  const defaultKey = useMemo(() => {
    if (!days.length) return todayKey;
    if (days.includes(todayKey)) return todayKey;
    return days.find((d) => d >= todayKey) ?? days[days.length - 1];
  }, [days, todayKey]);

  const activeKey = selectedKey && days.includes(selectedKey) ? selectedKey : defaultKey;
  const idx = days.indexOf(activeKey);
  const canPrev = idx > 0;
  const canNext = idx >= 0 && idx < days.length - 1;

  // Partidos del día activo. En "hoy" subimos arriba los que sigan en vivo aunque
  // hayan arrancado otro día (caso del partido que cruza la medianoche).
  const dayMatches = useMemo(() => {
    const all = matches ?? [];
    let list = all.filter((m) => m.dayKey === activeKey);
    if (activeKey === todayKey) {
      const liveOther = all.filter((m) => m.state === 'live' && m.dayKey !== activeKey);
      list = [...liveOther, ...list];
    }
    return [...list].sort((a, b) => {
      const rank = (s: MatchState) => (s === 'live' ? 0 : s === 'scheduled' ? 1 : 2);
      if (rank(a.state) !== rank(b.state)) return rank(a.state) - rank(b.state);
      return a.utcDate.localeCompare(b.utcDate);
    });
  }, [matches, activeKey, todayKey]);

  const liveCount = dayMatches.filter((m) => m.state === 'live').length;

  const shown = filter === 'all' ? dayMatches : dayMatches.filter((m) => m.state === filter);

  const label =
    activeKey === todayKey
      ? 'Hoy'
      : activeKey === yesterdayKey
        ? 'Ayer'
        : activeKey === tomorrowKey
          ? 'Mañana'
          : capitalize(
              new Date(`${activeKey}T12:00:00-03:00`).toLocaleDateString('es-AR', {
                weekday: 'short',
                day: '2-digit',
                month: '2-digit',
                timeZone: AR_TZ,
              }),
            );

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Partidos</CardTitle>
          {liveCount > 0 && (
            <span className="flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-600">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-600" />
              {liveCount} en vivo
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => canPrev && setSelectedKey(days[idx - 1])}
            disabled={!canPrev}
            aria-label="Día anterior"
            className="flex h-9 w-9 items-center justify-center rounded-md border transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setSelectedKey(defaultKey)}
            title="Volver a hoy"
            className="flex h-9 flex-1 items-center justify-center gap-2 rounded-md border font-semibold transition hover:bg-accent"
          >
            <Calendar className="h-4 w-4 text-muted-foreground" />
            {label}
          </button>
          <button
            type="button"
            onClick={() => canNext && setSelectedKey(days[idx + 1])}
            disabled={!canNext}
            aria-label="Día siguiente"
            className="flex h-9 w-9 items-center justify-center rounded-md border transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
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

function MatchRow({ m }: { m: DayMatch }) {
  const time = new Date(m.utcDate).toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: AR_TZ,
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
