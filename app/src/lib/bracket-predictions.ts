import type { Prediction } from './database.types';
import { emptyBracketState, type BracketState } from './bracket-types';
import { createSupabaseServerClient } from './supabase-server';

export async function loadBracketState(
  userId: string,
  eventId: number,
): Promise<BracketState> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from('predictions')
    .select('kind, match_id, team_code, outcome')
    .eq('user_id', userId)
    .eq('event_id', eventId);

  if (error) throw error;

  const state = emptyBracketState();
  for (const row of (data ?? []) as Pick<Prediction, 'kind' | 'match_id' | 'team_code' | 'outcome'>[]) {
    if (row.match_id === null) continue;
    switch (row.kind) {
      case 'r32_winner':
      case 'r16_winner':
      case 'qf_winner':
        if (row.team_code) state.winners[row.match_id] = row.team_code;
        break;
      case 'r32_outcome':
      case 'r16_outcome':
      case 'qf_outcome':
        if (row.outcome) state.outcomes[row.match_id] = row.outcome;
        break;
    }
  }
  return state;
}
