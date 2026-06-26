'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type TodayMatch = {
  id: number;
  utcDate: string;
  state: 'live' | 'finished' | 'scheduled';
  stage: string;
  group: string | null;
  home: string;
  away: string;
  homeCrest: string | null;
  awayCrest: string | null;
  homeScore: number | null;
  awayScore: number | null;
};

export function MatchesTodayWidget() {
  const [matches, setMatches] = useState<TodayMatch[] | null>(null);

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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Partidos de hoy</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {matches === null ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : matches.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay partidos hoy.</p>
        ) : (
          matches.map((m) => <MatchRow key={m.id} m={m} />)
        )}
      </CardContent>
    </Card>
  );
}

function MatchRow({ m }: { m: TodayMatch }) {
  const time = new Date(m.utcDate).toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const hasScore = m.homeScore !== null && m.awayScore !== null;
  return (
    <div
      className={`flex items-center gap-3 rounded-md border p-2 text-sm ${
        m.state === 'live' ? 'border-red-300 bg-red-50' : ''
      }`}
    >
      <div className="w-20 shrink-0 text-xs">
        {m.state === 'live' ? (
          <span className="font-semibold text-red-600">● EN VIVO</span>
        ) : m.state === 'finished' ? (
          <span className="text-muted-foreground">Finalizado</span>
        ) : (
          <span className="text-muted-foreground">{time}</span>
        )}
      </div>
      <div className="flex flex-1 items-center justify-center gap-2">
        <TeamSide name={m.home} crest={m.homeCrest} align="right" />
        <span className="min-w-[3rem] text-center font-bold tabular-nums">
          {hasScore ? `${m.homeScore} - ${m.awayScore}` : 'vs'}
        </span>
        <TeamSide name={m.away} crest={m.awayCrest} align="left" />
      </div>
      <div className="hidden w-24 shrink-0 truncate text-right text-xs text-muted-foreground sm:block">
        {m.group ?? m.stage}
      </div>
    </div>
  );
}

function TeamSide({
  name,
  crest,
  align,
}: {
  name: string;
  crest: string | null;
  align: 'left' | 'right';
}) {
  return (
    <div
      className={`flex flex-1 items-center gap-1 ${
        align === 'right' ? 'justify-end text-right' : 'justify-start text-left'
      }`}
    >
      {align === 'right' && <span className="truncate">{name}</span>}
      {crest && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={crest} alt="" className="h-5 w-5 shrink-0" />
      )}
      {align === 'left' && <span className="truncate">{name}</span>}
    </div>
  );
}
