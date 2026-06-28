import type { MatchOutcome, PredictionKind } from './database.types';

export type BracketStage = 'r32' | 'r16' | 'qf';

export interface BracketState {
  winners: Record<number, string>;
  outcomes: Record<number, MatchOutcome>;
}

export function emptyBracketState(): BracketState {
  return { winners: {}, outcomes: {} };
}

export interface BracketConfig {
  eventId: number;
  stage: BracketStage;
  winnerKind: PredictionKind;
  outcomeKind: PredictionKind;
  pointsWinner: number;
  pointsOutcome: number;
  expectedMatchCount: number;
  // Si está activo, el resultado (L/E/V) se restringe al ganador elegido:
  // ganador local → solo Local/Empate; ganador visitante → solo Empate/Visitante.
  constrainOutcome: boolean;
}

export const BRACKET_CONFIGS: Record<number, BracketConfig> = {
  2: {
    eventId: 2, stage: 'r32',
    winnerKind: 'r32_winner', outcomeKind: 'r32_outcome',
    pointsWinner: 8, pointsOutcome: 2, expectedMatchCount: 16,
    constrainOutcome: false,
  },
  3: {
    eventId: 3, stage: 'r16',
    winnerKind: 'r16_winner', outcomeKind: 'r16_outcome',
    pointsWinner: 15, pointsOutcome: 5, expectedMatchCount: 8,
    constrainOutcome: true,
  },
  4: {
    eventId: 4, stage: 'qf',
    winnerKind: 'qf_winner', outcomeKind: 'qf_outcome',
    pointsWinner: 20, pointsOutcome: 10, expectedMatchCount: 4,
    constrainOutcome: true,
  },
};
