import { NextResponse } from 'next/server';

// ISR: el route (y su fetch a FD) se revalida cada 60s. Con el auto-refresh del
// widget siempre hay tráfico, así que FD recibe ~1 request por minuto sin importar
// cuántos usuarios entren ni cuántos días naveguen — protege el rate limit (10/min).
// Devolvemos TODO el fixture: el filtro por día se hace en el cliente, así moverse
// entre fechas no genera más requests.
export const revalidate = 60;

const AR_TZ = 'America/Argentina/Buenos_Aires';

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

export type DayMatch = {
  id: number;
  utcDate: string;
  dayKey: string; // día calendario AR (YYYY-MM-DD)
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

function stateOf(status: string): DayMatch['state'] {
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

  const matches: DayMatch[] = (data.matches ?? [])
    .map((m) => ({
      id: m.id,
      utcDate: m.utcDate,
      // en-CA formatea como YYYY-MM-DD; con timeZone AR queda el día calendario argentino.
      dayKey: new Date(m.utcDate).toLocaleDateString('en-CA', { timeZone: AR_TZ }),
      state: stateOf(m.status),
      stage: STAGE_LABEL[m.stage] ?? m.stage,
      group: m.group ? m.group.replace('GROUP_', 'Grupo ') : null,
      home: m.homeTeam.name ?? 'Por definir',
      away: m.awayTeam.name ?? 'Por definir',
      homeCrest: m.homeTeam.crest,
      awayCrest: m.awayTeam.crest,
      homeScore: m.score?.fullTime?.home ?? null,
      awayScore: m.score?.fullTime?.away ?? null,
    }))
    .sort((a, b) => a.utcDate.localeCompare(b.utcDate));

  return NextResponse.json({ matches });
}
