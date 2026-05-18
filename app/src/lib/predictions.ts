import type { Prediction } from './database.types';
import {
  GROUP_CODES,
  emptyEvent1State,
  type Event1State,
  type GroupCode,
} from './event1-types';
import { createSupabaseServerClient } from './supabase-server';

export async function loadEvent1State(userId: string): Promise<Event1State> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from('predictions')
    .select('kind, team_code, player_id, meta')
    .eq('user_id', userId)
    .eq('event_id', 1);

  if (error) throw error;

  const state = emptyEvent1State();
  for (const row of (data ?? []) as Pick<Prediction, 'kind' | 'team_code' | 'player_id' | 'meta'>[]) {
    switch (row.kind) {
      case 'group_winner': {
        if (!row.team_code) break;
        const g = (row.meta as { group_code?: GroupCode } | null)?.group_code;
        if (g && GROUP_CODES.includes(g)) state.group_winner[g] = row.team_code;
        break;
      }
      case 'playoff_team':
        if (row.team_code) state.playoff_team.push(row.team_code);
        break;
      case 'semifinalist':
        if (row.team_code) state.semifinalist.push(row.team_code);
        break;
      case 'finalist':
        if (row.team_code) state.finalist = row.team_code;
        break;
      case 'champion':
        if (row.team_code) state.champion = row.team_code;
        break;
      case 'top_scorer':
        if (row.player_id !== null) state.top_scorer = row.player_id;
        break;
    }
  }
  return state;
}
