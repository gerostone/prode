import { describe, it, expect } from 'vitest';
import { isBracketComplete, validateBracketCoherence } from './bracket-validation';
import { emptyBracketState } from './bracket-types';
import type { Match } from './database.types';

function makeMatch(id: number, slot: string, home: string | null, away: string | null): Match {
  return {
    id, stage: 'r32', bracket_slot: slot,
    home_team_code: home, away_team_code: away,
    scheduled_at: null,
    home_score_90: null, away_score_90: null,
    home_score_120: null, away_score_120: null,
    went_to_penalties: false, winner_team_code: null,
    outcome_pre_penalties: null,
    parent_slot_home: null, parent_slot_away: null,
    external_id: null, locked: false,
  };
}

describe('isBracketComplete', () => {
  it('returns complete=true and missing=0 cuando no hay matches con teams', () => {
    const matches = [makeMatch(1, 'R32-01', null, null)];
    const result = isBracketComplete(emptyBracketState(), matches);
    expect(result.complete).toBe(true);
    expect(result.missing).toBe(0);
  });

  it('returns complete=false si falta winner', () => {
    const matches = [makeMatch(1, 'R32-01', 'ARG', 'BRA')];
    const state = emptyBracketState();
    state.outcomes[1] = 'home';
    const result = isBracketComplete(state, matches);
    expect(result.complete).toBe(false);
    expect(result.missing).toBe(1);
  });

  it('returns complete=true cuando todos los matches con teams están completos', () => {
    const matches = [
      makeMatch(1, 'R32-01', 'ARG', 'BRA'),
      makeMatch(2, 'R32-02', null, null), // sin teams: se ignora
    ];
    const state = emptyBracketState();
    state.winners[1] = 'ARG';
    state.outcomes[1] = 'home';
    const result = isBracketComplete(state, matches);
    expect(result.complete).toBe(true);
    expect(result.missing).toBe(0);
  });
});

describe('validateBracketCoherence', () => {
  it('rechaza si winner no es home ni away', () => {
    const matches = [makeMatch(1, 'R32-01', 'ARG', 'BRA')];
    const state = emptyBracketState();
    state.winners[1] = 'ESP';
    const result = validateBracketCoherence(state, matches);
    expect(result.ok).toBe(false);
  });

  it('acepta si winner es home', () => {
    const matches = [makeMatch(1, 'R32-01', 'ARG', 'BRA')];
    const state = emptyBracketState();
    state.winners[1] = 'ARG';
    const result = validateBracketCoherence(state, matches);
    expect(result.ok).toBe(true);
  });

  it('acepta si winner es away', () => {
    const matches = [makeMatch(1, 'R32-01', 'ARG', 'BRA')];
    const state = emptyBracketState();
    state.winners[1] = 'BRA';
    const result = validateBracketCoherence(state, matches);
    expect(result.ok).toBe(true);
  });

  it('ignora matches con teams nulos', () => {
    const matches = [makeMatch(1, 'R32-01', null, null)];
    const state = emptyBracketState();
    state.winners[1] = 'ARG'; // raro pero no es coherence error porque no hay teams a comparar
    const result = validateBracketCoherence(state, matches);
    expect(result.ok).toBe(true);
  });
});
