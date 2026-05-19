/**
 * Función pura de sync con Football-Data.org.
 * Llamada desde:
 *   - Script CLI (scripts/sync-matches.ts)
 *   - Vercel Cron route (app/api/cron/sync-matches)
 *   - Server action (admin/sync/actions.ts syncNow)
 *
 * No usa cookies — usa service role key directo.
 */

import { createClient } from '@supabase/supabase-js';

const STAGE_MAP: Record<string, string> = {
  ROUND_OF_32: 'r32',
  LAST_16: 'r16',
  QUARTER_FINALS: 'qf',
  SEMI_FINALS: 'sf',
  FINAL: 'final',
};

interface FDTeam { tla: string | null }
interface FDScoreFrame { home: number | null; away: number | null }
interface FDMatch {
  id: number;
  utcDate: string;
  status: string;
  stage: string;
  homeTeam: FDTeam;
  awayTeam: FDTeam;
  score: {
    duration: 'REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT';
    winner: 'HOME_TEAM' | 'AWAY_TEAM' | 'DRAW' | null;
    fullTime: FDScoreFrame;
    extraTime?: FDScoreFrame;
    penalties?: FDScoreFrame;
  };
}
interface FDMatchesResponse { matches: FDMatch[] }

export interface SyncResult {
  inserted: number;
  skipped: number;
  unmapped: number;
  errors: Array<{ external_id: string; message: string }>;
}

export async function syncFromFD(options: {
  fdApiKey: string;
  supabaseUrl: string;
  supabaseServiceKey: string;
}): Promise<SyncResult> {
  const { fdApiKey, supabaseUrl, supabaseServiceKey } = options;
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

  const result: SyncResult = { inserted: 0, skipped: 0, unmapped: 0, errors: [] };

  const res = await fetch('https://api.football-data.org/v4/competitions/WC/matches', {
    headers: { 'X-Auth-Token': fdApiKey },
  });
  if (!res.ok) throw new Error(`FD ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as FDMatchesResponse;

  const elimFD = data.matches.filter((m) => m.stage in STAGE_MAP);

  // Lookup local matches by external_id
  const { data: localMatches, error: lmErr } = await supabase
    .from('matches')
    .select('*')
    .not('external_id', 'is', null);
  if (lmErr) throw lmErr;
  const byExternalId = new Map<string, any>(
    (localMatches ?? []).map((m) => [m.external_id as string, m]),
  );

  for (const fd of elimFD) {
    const local = byExternalId.get(String(fd.id));
    if (!local) {
      result.unmapped++;
      continue;
    }

    const proposedScheduledAt = fd.utcDate ?? null;
    const home90 = fd.score.fullTime?.home ?? null;
    const away90 = fd.score.fullTime?.away ?? null;
    const home120 = fd.score.extraTime?.home ?? null;
    const away120 = fd.score.extraTime?.away ?? null;
    const wentToPenalties = fd.score.duration === 'PENALTY_SHOOTOUT';
    let winner: string | null = null;
    if (fd.score.winner === 'HOME_TEAM') winner = fd.homeTeam.tla;
    else if (fd.score.winner === 'AWAY_TEAM') winner = fd.awayTeam.tla;

    const noChange =
      local.scheduled_at === proposedScheduledAt &&
      local.home_score_90 === home90 &&
      local.away_score_90 === away90 &&
      local.home_score_120 === home120 &&
      local.away_score_120 === away120 &&
      local.went_to_penalties === wentToPenalties &&
      local.winner_team_code === winner;

    if (noChange) {
      result.skipped++;
      continue;
    }

    const { error: insErr } = await supabase.from('matches_staging').insert({
      match_id: local.id,
      source: 'football-data.org',
      external_match_id: String(fd.id),
      home_score_90: home90,
      away_score_90: away90,
      home_score_120: home120,
      away_score_120: away120,
      went_to_penalties: wentToPenalties,
      winner_team_code: winner,
      scheduled_at: proposedScheduledAt,
      status: 'pending',
    });
    if (insErr) {
      result.errors.push({ external_id: String(fd.id), message: insErr.message });
    } else {
      result.inserted++;
    }
  }

  return result;
}
