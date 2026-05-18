import { describe, it, expect } from 'vitest';
import {
  validateCoherence,
  isComplete,
  type ValidationContext,
} from './event1-validation';
import { emptyEvent1State, GROUP_CODES } from './event1-types';
import type { Team } from './database.types';

function makeTeams(): Team[] {
  // 4 teams per group, code 'A1','A2','A3','A4','B1',...
  return GROUP_CODES.flatMap((g) =>
    [1, 2, 3, 4].map((n) => ({
      code: `${g}${n}`,
      name: `Team ${g}${n}`,
      flag_url: null,
      crest_url: null,
      fifa_ranking: null,
      group_code: g,
      group_position: null,
      external_id: null,
      eliminated_at_stage: null,
    })),
  );
}

const ctx: ValidationContext = { teams: makeTeams() };

describe('validateCoherence — group_winner', () => {
  it('rejects a team that does not belong to the group', () => {
    const s = emptyEvent1State();
    s.group_winner['A'] = 'B1';
    const res = validateCoherence(s, ctx);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.group_winner?.A).toMatch(/no pertenece al Grupo A/i);
  });

  it('accepts a team that belongs to the group', () => {
    const s = emptyEvent1State();
    s.group_winner['A'] = 'A2';
    const res = validateCoherence(s, ctx);
    expect(res.ok).toBe(true);
  });
});

describe('validateCoherence — playoff_team', () => {
  it('rejects more than 32 picks', () => {
    const s = emptyEvent1State();
    s.playoff_team = Array.from({ length: 33 }, (_, i) => `A${(i % 4) + 1}`);
    const res = validateCoherence(s, ctx);
    expect(res.ok).toBe(false);
  });

  it('rejects an unknown team code', () => {
    const s = emptyEvent1State();
    s.playoff_team = ['ZZZ'];
    const res = validateCoherence(s, ctx);
    expect(res.ok).toBe(false);
  });

  it('warns if a group_winner is not included', () => {
    const s = emptyEvent1State();
    s.group_winner['A'] = 'A1';
    s.playoff_team = ['B1'];
    const res = validateCoherence(s, ctx);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.playoff_team).toMatch(/A1/);
  });
});

describe('validateCoherence — semifinalist', () => {
  it('rejects a team not in playoff_teams', () => {
    const s = emptyEvent1State();
    s.playoff_team = ['A1', 'A2', 'A3', 'A4'];
    s.semifinalist = ['B1'];
    const res = validateCoherence(s, ctx);
    expect(res.ok).toBe(false);
  });

  it('rejects more than 4', () => {
    const s = emptyEvent1State();
    s.playoff_team = ['A1', 'A2', 'A3', 'A4', 'B1'];
    s.semifinalist = ['A1', 'A2', 'A3', 'A4', 'B1'];
    const res = validateCoherence(s, ctx);
    expect(res.ok).toBe(false);
  });
});

describe('validateCoherence — finalist & champion', () => {
  it('finalist must be a semifinalist', () => {
    const s = emptyEvent1State();
    s.playoff_team = ['A1', 'A2', 'A3', 'A4'];
    s.semifinalist = ['A1', 'A2', 'A3', 'A4'];
    s.finalist = 'B1';
    const res = validateCoherence(s, ctx);
    expect(res.ok).toBe(false);
  });

  it('champion must be a semifinalist', () => {
    const s = emptyEvent1State();
    s.playoff_team = ['A1', 'A2', 'A3', 'A4'];
    s.semifinalist = ['A1', 'A2', 'A3', 'A4'];
    s.finalist = 'A1';
    s.champion = 'B1';
    const res = validateCoherence(s, ctx);
    expect(res.ok).toBe(false);
  });

  it('valid full state passes coherence', () => {
    const s = emptyEvent1State();
    s.playoff_team = GROUP_CODES.flatMap((g) => [`${g}1`, `${g}2`, `${g}3`]).slice(0, 32);
    const playoffSet = new Set(s.playoff_team);
    for (const g of GROUP_CODES) {
      if (playoffSet.has(`${g}1`)) s.group_winner[g] = `${g}1`;
    }
    s.semifinalist = ['A1', 'B1', 'C1', 'D1'];
    s.finalist = 'A1';
    s.champion = 'B1';
    s.top_scorer = 1;
    const res = validateCoherence(s, ctx);
    expect(res.ok).toBe(true);
  });
});

describe('isComplete', () => {
  it('false when anything missing', () => {
    expect(isComplete(emptyEvent1State())).toBe(false);
  });

  it('true when 12/32/4/1/1/1 filled', () => {
    const s = emptyEvent1State();
    for (const g of GROUP_CODES) s.group_winner[g] = `${g}1`;
    s.playoff_team = GROUP_CODES.flatMap((g) => [`${g}1`, `${g}2`, `${g}3`]).slice(0, 32);
    s.semifinalist = ['A1', 'B1', 'C1', 'D1'];
    s.finalist = 'A1';
    s.champion = 'A1';
    s.top_scorer = 1;
    expect(isComplete(s)).toBe(true);
  });
});

describe('validateCoherence — top_scorer', () => {
  it('null pasa coherence', () => {
    const s = emptyEvent1State();
    const res = validateCoherence(s, ctx);
    expect(res.ok).toBe(true);
  });

  it('id positivo pasa coherence', () => {
    const s = emptyEvent1State();
    s.top_scorer = 42;
    const res = validateCoherence(s, ctx);
    expect(res.ok).toBe(true);
  });
});

describe('isComplete — top_scorer', () => {
  it('false si falta top_scorer aunque el resto esté completo', () => {
    const s = emptyEvent1State();
    for (const g of GROUP_CODES) s.group_winner[g] = `${g}1`;
    s.playoff_team = GROUP_CODES.flatMap((g) => [`${g}1`, `${g}2`, `${g}3`]).slice(0, 32);
    s.semifinalist = ['A1', 'B1', 'C1', 'D1'];
    s.finalist = 'A1';
    s.champion = 'A1';
    // top_scorer queda null
    expect(isComplete(s)).toBe(false);
  });
});
