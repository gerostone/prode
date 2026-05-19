import type { Match } from './database.types';
import type { BracketState } from './bracket-types';

export function isBracketComplete(
  state: BracketState,
  matches: Match[],
): { complete: boolean; missing: number } {
  let missing = 0;
  for (const m of matches) {
    if (m.home_team_code === null || m.away_team_code === null) continue;
    if (!state.winners[m.id]) missing++;
    else if (!state.outcomes[m.id]) missing++;
  }
  return { complete: missing === 0, missing };
}

export function validateBracketCoherence(
  state: BracketState,
  matches: Match[],
): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const matchById = new Map(matches.map((m) => [m.id, m]));

  for (const [matchIdStr, winner] of Object.entries(state.winners)) {
    const matchId = Number(matchIdStr);
    const m = matchById.get(matchId);
    if (!m) continue;
    if (m.home_team_code === null || m.away_team_code === null) continue;
    if (winner !== m.home_team_code && winner !== m.away_team_code) {
      errors.push(
        `${m.bracket_slot}: ganador ${winner} no es ${m.home_team_code} ni ${m.away_team_code}.`,
      );
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
