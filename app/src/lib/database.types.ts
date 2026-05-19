// Tipos manuales que reflejan el schema de Supabase.
// En Fase 3 pasamos a generarlos automáticamente con:
//   npm run db:generate-types
// Mientras tanto, mantenelos en sync con las migrations a mano.

export type UserRole = 'player' | 'scorer' | 'admin';
export type EventStatus = 'draft' | 'open' | 'locked' | 'scored';
export type Stage = 'r32' | 'r16' | 'qf' | 'sf' | 'final';
export type MatchOutcome = 'home' | 'draw' | 'away';
export type PredictionKind =
  | 'champion'
  | 'finalist'
  | 'semifinalist'
  | 'playoff_team'
  | 'group_winner'
  | 'r32_winner'
  | 'r32_outcome'
  | 'r16_winner'
  | 'r16_outcome'
  | 'qf_winner'
  | 'qf_outcome'
  | 'top_scorer';

export interface Profile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface Group {
  code: string;
  display_name: string;
}

export interface Team {
  code: string;
  name: string;
  flag_url: string | null;
  crest_url: string | null;
  fifa_ranking: number | null;
  group_code: string | null;
  group_position: number | null;
  external_id: number | null;
  eliminated_at_stage: string | null;
}

export interface Player {
  id: number;
  full_name: string;
  team_code: string;
  display_order: number;
  is_top_scorer: boolean;
  created_at: string;
}

export interface Event {
  id: number;
  name: string;
  description: string | null;
  opens_at: string | null;
  closes_at: string | null;
  max_points: number;
  status: EventStatus;
  created_at: string;
}

export interface EventCategory {
  id: number;
  event_id: number;
  kind: PredictionKind;
  required_count: number;
  points_per_correct: number;
  display_order: number;
}

export interface Match {
  id: number;
  stage: Stage;
  bracket_slot: string;
  home_team_code: string | null;
  away_team_code: string | null;
  scheduled_at: string | null;
  home_score_90: number | null;
  away_score_90: number | null;
  home_score_120: number | null;
  away_score_120: number | null;
  went_to_penalties: boolean;
  winner_team_code: string | null;
  outcome_pre_penalties: MatchOutcome | null;
  parent_slot_home: string | null;
  parent_slot_away: string | null;
  external_id: string | null;
  locked: boolean;
}

export type StagingStatus = 'pending' | 'approved' | 'rejected';

export interface MatchStaging {
  id: number;
  match_id: number;
  source: string;
  external_match_id: string | null;
  home_score_90: number | null;
  away_score_90: number | null;
  home_score_120: number | null;
  away_score_120: number | null;
  went_to_penalties: boolean | null;
  winner_team_code: string | null;
  scheduled_at: string | null;
  status: StagingStatus;
  fetched_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  notes: string | null;
}

export interface Prediction {
  id: number;
  user_id: string;
  event_id: number;
  kind: PredictionKind;
  team_code: string | null;
  match_id: number | null;
  player_id: number | null;
  outcome: MatchOutcome | null;
  meta: Record<string, unknown>;
  is_correct: boolean | null;
  awarded_points: number;
  created_at: string;
  updated_at: string;
}

export interface Score {
  user_id: string;
  event_id: number;
  points: number;
  correct_count: number;
  updated_at: string;
}

export interface LeaderboardEntry {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  total_points: number;
  total_correct: number;
}
