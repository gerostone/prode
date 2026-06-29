import type { Team, Player, Match, MatchOutcome } from './database.types';
import type { GroupCode } from './event1-types';
import { createSupabaseServerClient } from './supabase-server';

// Veredicto de una predicción una vez scoreado el evento:
//  - correct: acertó (sumó puntos)
//  - wrong:   erró y el resultado de esa categoría YA está cargado
//  - pending: todavía no se cargó el resultado que la define (no es ni ✓ ni ✗)
export type Verdict = 'correct' | 'wrong' | 'pending';

export type VerdictLine = {
  key: string;
  label: string | null;
  name: string;
  crestUrl: string | null;
  verdict: Verdict;
  points: number;
};

export type Event1ResultsData = {
  groupWinners: VerdictLine[];
  playoffTeams: VerdictLine[];
  semifinalists: VerdictLine[];
  finalist: VerdictLine | null;
  champion: VerdictLine | null;
  topScorer: VerdictLine | null;
  totalPoints: number;
  totalCorrect: number;
  totalPending: number;
  totalPicks: number;
};

export type BracketLine = {
  matchId: number;
  bracketSlot: string;
  homeName: string;
  awayName: string;
  homeCrest: string | null;
  awayCrest: string | null;
  teamsKnown: boolean;
  resultLoaded: boolean;
  winnerPickName: string | null;
  winnerVerdict: Verdict | null;
  winnerPoints: number;
  outcomePick: MatchOutcome | null;
  outcomeVerdict: Verdict | null;
  outcomePoints: number;
};

export type BracketResultsData = {
  lines: BracketLine[];
  totalPoints: number;
  totalCorrect: number;
  totalPending: number;
};

type PredRow = {
  kind: string;
  team_code: string | null;
  player_id: number | null;
  outcome: MatchOutcome | null;
  match_id: number | null;
  meta: { group_code?: GroupCode } | null;
  is_correct: boolean | null;
  awarded_points: number | null;
};

function verdictOf(isCorrect: boolean | null, resolved: boolean): Verdict {
  if (isCorrect) return 'correct';
  return resolved ? 'wrong' : 'pending';
}

export async function loadEvent1Results(
  userId: string,
  teams: Team[],
  players: Player[],
): Promise<Event1ResultsData> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from('predictions')
    .select('kind, team_code, player_id, outcome, match_id, meta, is_correct, awarded_points')
    .eq('user_id', userId)
    .eq('event_id', 1);
  if (error) throw error;
  const rows = (data ?? []) as PredRow[];

  const teamByCode = new Map(teams.map((t) => [t.code, t]));
  const playerById = new Map(players.map((p) => [p.id, p]));

  // Resolución por categoría (¿ya está cargado el resultado que la define?).
  const groupHasWinner = new Set<string>();
  for (const t of teams) {
    if (t.group_position === 1 && t.group_code) groupHasWinner.add(t.group_code);
  }

  // "Frente" del torneo: el rank de etapa más avanzado alcanzado por algún equipo.
  // Un equipo está ELIMINADO (terminal) solo si su etapa quedó POR DEBAJO del frente.
  // Si está en el frente, sigue vivo → su suerte en rondas posteriores es PENDIENTE.
  // Ej: con todos los clasificados en 'r32', Argentina (r32) sigue viva, así que su
  // pick de campeón es pendiente, no error. Cuando se cargue R32 y avancen a 'r16',
  // los que cayeron en R32 pasan a terminal y sus picks posteriores se marcan ✗.
  const STAGE_RANK: Record<string, number> = {
    group: 0, r32: 1, r16: 2, qf: 3, sf: 4, final: 5, champion: 6,
  };
  const rankOf = (s: string | null) => (s && s in STAGE_RANK ? STAGE_RANK[s] : -1);
  let maxRank = -1;
  for (const t of teams) maxRank = Math.max(maxRank, rankOf(t.eliminated_at_stage));
  const teamTerminal = (code: string | null) => {
    if (!code) return false;
    const r = rankOf(teamByCode.get(code)?.eliminated_at_stage ?? null);
    return r >= 0 && r < maxRank;
  };

  const topScorerResolved = players.some((p) => p.is_top_scorer);

  const teamName = (code: string | null) => (code && teamByCode.get(code)?.name) || code || '—';
  const teamCrest = (code: string | null) => (code && teamByCode.get(code)?.crest_url) || null;

  const out: Event1ResultsData = {
    groupWinners: [],
    playoffTeams: [],
    semifinalists: [],
    finalist: null,
    champion: null,
    topScorer: null,
    totalPoints: 0,
    totalCorrect: 0,
    totalPending: 0,
    totalPicks: 0,
  };

  for (const r of rows) {
    const pts = r.awarded_points ?? 0;
    out.totalPoints += pts;
    out.totalPicks += 1;
    if (r.is_correct) out.totalCorrect += 1;

    const bump = (v: Verdict) => {
      if (v === 'pending') out.totalPending += 1;
    };

    switch (r.kind) {
      case 'group_winner': {
        const g = r.meta?.group_code;
        const v = verdictOf(r.is_correct, !!g && groupHasWinner.has(g));
        bump(v);
        out.groupWinners.push({
          key: `gw-${g}`,
          label: `Grupo ${g}`,
          name: teamName(r.team_code),
          crestUrl: teamCrest(r.team_code),
          verdict: v,
          points: pts,
        });
        break;
      }
      case 'playoff_team': {
        const v = verdictOf(r.is_correct, teamTerminal(r.team_code));
        bump(v);
        out.playoffTeams.push({
          key: `pt-${r.team_code}`,
          label: null,
          name: teamName(r.team_code),
          crestUrl: teamCrest(r.team_code),
          verdict: v,
          points: pts,
        });
        break;
      }
      case 'semifinalist': {
        const v = verdictOf(r.is_correct, teamTerminal(r.team_code));
        bump(v);
        out.semifinalists.push({
          key: `sf-${r.team_code}`,
          label: null,
          name: teamName(r.team_code),
          crestUrl: teamCrest(r.team_code),
          verdict: v,
          points: pts,
        });
        break;
      }
      case 'finalist': {
        const v = verdictOf(r.is_correct, teamTerminal(r.team_code));
        bump(v);
        out.finalist = {
          key: 'finalist',
          label: null,
          name: teamName(r.team_code),
          crestUrl: teamCrest(r.team_code),
          verdict: v,
          points: pts,
        };
        break;
      }
      case 'champion': {
        const v = verdictOf(r.is_correct, teamTerminal(r.team_code));
        bump(v);
        out.champion = {
          key: 'champion',
          label: null,
          name: teamName(r.team_code),
          crestUrl: teamCrest(r.team_code),
          verdict: v,
          points: pts,
        };
        break;
      }
      case 'top_scorer': {
        const v = verdictOf(r.is_correct, topScorerResolved);
        bump(v);
        const pl = r.player_id !== null ? playerById.get(r.player_id) : null;
        out.topScorer = {
          key: 'top',
          label: null,
          name: pl?.full_name ?? '—',
          crestUrl: pl ? teamByCode.get(pl.team_code)?.crest_url ?? null : null,
          verdict: v,
          points: pts,
        };
        break;
      }
    }
  }

  out.groupWinners.sort((a, b) => (a.label ?? '').localeCompare(b.label ?? ''));
  out.playoffTeams.sort((a, b) => a.name.localeCompare(b.name));
  out.semifinalists.sort((a, b) => a.name.localeCompare(b.name));

  return out;
}

export async function loadBracketResults(
  userId: string,
  eventId: number,
  matches: Match[],
  teams: Team[],
): Promise<BracketResultsData> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from('predictions')
    .select('kind, team_code, player_id, outcome, match_id, meta, is_correct, awarded_points')
    .eq('user_id', userId)
    .eq('event_id', eventId);
  if (error) throw error;
  const rows = (data ?? []) as PredRow[];

  const teamByCode = new Map(teams.map((t) => [t.code, t]));
  const teamName = (code: string | null) => (code ? teamByCode.get(code)?.name ?? code : null);
  const teamCrest = (code: string | null) => (code ? teamByCode.get(code)?.crest_url ?? null : null);

  const winnerByMatch = new Map<number, PredRow>();
  const outcomeByMatch = new Map<number, PredRow>();
  for (const r of rows) {
    if (r.match_id === null) continue;
    if (r.kind.endsWith('_winner')) winnerByMatch.set(r.match_id, r);
    else if (r.kind.endsWith('_outcome')) outcomeByMatch.set(r.match_id, r);
  }

  const out: BracketResultsData = { lines: [], totalPoints: 0, totalCorrect: 0, totalPending: 0 };

  for (const m of matches) {
    const wp = winnerByMatch.get(m.id);
    const op = outcomeByMatch.get(m.id);
    const winnerLoaded = m.winner_team_code !== null;
    const outcomeLoaded = m.outcome_pre_penalties !== null;

    const winnerVerdict = wp ? verdictOf(wp.is_correct, winnerLoaded) : null;
    const outcomeVerdict = op ? verdictOf(op.is_correct, outcomeLoaded) : null;

    const winnerPoints = wp?.awarded_points ?? 0;
    const outcomePoints = op?.awarded_points ?? 0;
    out.totalPoints += winnerPoints + outcomePoints;
    if (wp?.is_correct) out.totalCorrect += 1;
    if (op?.is_correct) out.totalCorrect += 1;
    if (winnerVerdict === 'pending') out.totalPending += 1;
    if (outcomeVerdict === 'pending') out.totalPending += 1;

    out.lines.push({
      matchId: m.id,
      bracketSlot: m.bracket_slot,
      homeName: teamName(m.home_team_code) ?? 'Por definir',
      awayName: teamName(m.away_team_code) ?? 'Por definir',
      homeCrest: teamCrest(m.home_team_code),
      awayCrest: teamCrest(m.away_team_code),
      teamsKnown: m.home_team_code !== null && m.away_team_code !== null,
      resultLoaded: winnerLoaded || outcomeLoaded,
      winnerPickName: wp ? teamName(wp.team_code) : null,
      winnerVerdict,
      winnerPoints,
      outcomePick: op?.outcome ?? null,
      outcomeVerdict,
      outcomePoints,
    });
  }

  return out;
}
