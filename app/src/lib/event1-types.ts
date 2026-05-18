import type { PredictionKind } from './database.types';

export type GroupCode = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K' | 'L';
export const GROUP_CODES: GroupCode[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

export const SECTION_KINDS = ['group_winner', 'playoff_team', 'semifinalist', 'finalist', 'champion', 'top_scorer'] as const;
export type SectionKind = (typeof SECTION_KINDS)[number];

export interface Pick {
  team_code?: string;
  player_id?: number;
  meta?: { group_code?: GroupCode };
}

export interface Event1State {
  group_winner: Partial<Record<GroupCode, string>>;
  playoff_team: string[];
  semifinalist: string[];
  finalist: string | null;
  champion: string | null;
  top_scorer: number | null;
}

export function emptyEvent1State(): Event1State {
  return {
    group_winner: {},
    playoff_team: [],
    semifinalist: [],
    finalist: null,
    champion: null,
    top_scorer: null,
  };
}

export function sectionToPicks(state: Event1State, kind: SectionKind): Pick[] {
  switch (kind) {
    case 'group_winner':
      return GROUP_CODES.flatMap((g) =>
        state.group_winner[g] ? [{ team_code: state.group_winner[g]!, meta: { group_code: g } }] : [],
      );
    case 'playoff_team':
      return state.playoff_team.map((t) => ({ team_code: t }));
    case 'semifinalist':
      return state.semifinalist.map((t) => ({ team_code: t }));
    case 'finalist':
      return state.finalist ? [{ team_code: state.finalist }] : [];
    case 'champion':
      return state.champion ? [{ team_code: state.champion }] : [];
    case 'top_scorer':
      return state.top_scorer !== null ? [{ player_id: state.top_scorer }] : [];
  }
}

export function kindToPredictionKind(kind: SectionKind): PredictionKind {
  return kind;
}
