import { NextResponse } from 'next/server';

// El route corre en cada request (recalcula "hoy" en hora AR), pero el fetch a
// FD se cachea 60s (ver `next: { revalidate: 60 }` abajo). Así FD recibe como
// máximo 1 request por minuto sin importar cuántos usuarios entren — protege el
// rate limit (10/min) — y el filtro de fecha nunca queda congelado.
export const dynamic = 'force-dynamic';

type FDMatch = {
  id: number;
  utcDate: string;
  status: string;
  stage: string;
  group: string | null;
  homeTeam: { name: string | null; crest: string | null };
  awayTeam: { name: string | null; crest: string | null };
  score: { fullTime: { home: number | null; away: number | null } };
};

export type TodayMatch = {
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

const STAGE_LABEL: Record<string, string> = {
  GROUP_STAGE: 'Fase de grupos',
  LAST_32: '32avos',
  LAST_16: 'Octavos',
  QUARTER_FINALS: 'Cuartos',
  SEMI_FINALS: 'Semis',
  THIRD_PLACE: '3er puesto',
  FINAL: 'Final',
};

function stateOf(status: string): TodayMatch['state'] {
  if (status === 'IN_PLAY' || status === 'PAUSED') return 'live';
  if (status === 'FINISHED') return 'finished';
  return 'scheduled';
}

export async function GET() {
  const key = process.env.FOOTBALL_DATA_API_KEY;
  if (!key) return NextResponse.json({ matches: [] });

  let data: { matches: FDMatch[] };
  try {
    const res = await fetch('https://api.football-data.org/v4/competitions/WC/matches', {
      headers: { 'X-Auth-Token': key },
      next: { revalidate: 60 },
    });
    if (!res.ok) return NextResponse.json({ matches: [] });
    data = (await res.json()) as { matches: FDMatch[] };
  } catch {
    return NextResponse.json({ matches: [] });
  }

  // "Hoy" en hora Argentina (UTC-3): rango [hoy 00:00 AR, mañana 00:00 AR) en UTC.
  const now = Date.now();
  const arShift = 3 * 60 * 60 * 1000;
  const arNow = new Date(now - arShift);
  const startUtc = Date.UTC(arNow.getUTCFullYear(), arNow.getUTCMonth(), arNow.getUTCDate(), 3, 0, 0);
  const endUtc = startUtc + 24 * 60 * 60 * 1000;

  const matches: TodayMatch[] = (data.matches ?? [])
    .filter((m) => {
      const t = Date.parse(m.utcDate);
      const isToday = t >= startUtc && t < endUtc;
      const isLive = m.status === 'IN_PLAY' || m.status === 'PAUSED';
      return isToday || isLive;
    })
    .map((m) => ({
      id: m.id,
      utcDate: m.utcDate,
      state: stateOf(m.status),
      stage: STAGE_LABEL[m.stage] ?? m.stage,
      group: m.group ? m.group.replace('GROUP_', 'Grupo ') : null,
      home: m.homeTeam.name ?? '?',
      away: m.awayTeam.name ?? '?',
      homeCrest: m.homeTeam.crest,
      awayCrest: m.awayTeam.crest,
      homeScore: m.score?.fullTime?.home ?? null,
      awayScore: m.score?.fullTime?.away ?? null,
    }))
    .sort((a, b) => {
      const rank = (s: TodayMatch['state']) => (s === 'live' ? 0 : s === 'scheduled' ? 1 : 2);
      if (rank(a.state) !== rank(b.state)) return rank(a.state) - rank(b.state);
      return a.utcDate.localeCompare(b.utcDate);
    });

  return NextResponse.json({ matches });
}
