import type { Team } from './database.types';
import {
  GROUP_CODES,
  type Event1State,
  type GroupCode,
  type SectionKind,
} from './event1-types';

export interface ValidationContext {
  teams: Team[];
}

export type ValidationErrors = {
  group_winner?: Partial<Record<GroupCode, string>>;
  playoff_team?: string;
  semifinalist?: string;
  finalist?: string;
  champion?: string;
  top_scorer?: string;
};

export type ValidationResult =
  | { ok: true }
  | { ok: false; errors: ValidationErrors };

function teamByCode(teams: Team[]): Map<string, Team> {
  return new Map(teams.map((t) => [t.code, t]));
}

export function validateCoherence(state: Event1State, ctx: ValidationContext): ValidationResult {
  const errors: ValidationErrors = {};
  const byCode = teamByCode(ctx.teams);

  // group_winner: cada team debe existir y pertenecer al grupo
  const groupErrors: Partial<Record<GroupCode, string>> = {};
  for (const g of GROUP_CODES) {
    const code = state.group_winner[g];
    if (!code) continue;
    const team = byCode.get(code);
    if (!team) groupErrors[g] = `Equipo ${code} no existe.`;
    else if (team.group_code !== g) groupErrors[g] = `${team.name} no pertenece al Grupo ${g}.`;
  }
  if (Object.keys(groupErrors).length > 0) errors.group_winner = groupErrors;

  // playoff_team: máximo 32, todos existen, incluye a todos los group_winners ya cargados
  const playoffMsgs: string[] = [];
  if (state.playoff_team.length > 32) {
    playoffMsgs.push(`No puede haber más de 32 equipos en playoffs (hay ${state.playoff_team.length}).`);
  }
  const unknownPlayoffs = state.playoff_team.filter((c) => !byCode.has(c));
  if (unknownPlayoffs.length > 0) {
    playoffMsgs.push(`Equipos desconocidos: ${unknownPlayoffs.join(', ')}.`);
  }
  const playoffSet = new Set(state.playoff_team);
  // Guarda incremental: si el usuario todavía no marcó nada en playoffs, no nos
  // quejamos por ganadores de grupo faltantes — aparecerá cuando empiece a cargar.
  if (state.playoff_team.length > 0) {
    const missingWinners = Object.values(state.group_winner).filter(
      (c): c is string => Boolean(c) && !playoffSet.has(c),
    );
    if (missingWinners.length > 0) {
      playoffMsgs.push(`Faltan ganadores de grupo en playoffs: ${missingWinners.join(', ')}.`);
    }
  }
  if (playoffMsgs.length > 0) errors.playoff_team = playoffMsgs.join(' ');

  // semifinalist: máximo 4, todos en playoff_team
  if (state.semifinalist.length > 4) {
    errors.semifinalist = `Máximo 4 semifinalistas (hay ${state.semifinalist.length}).`;
  }
  const semiOutOfPlayoff = state.semifinalist.filter((c) => !playoffSet.has(c));
  if (semiOutOfPlayoff.length > 0) {
    errors.semifinalist = `Estos semifinalistas no están en playoffs: ${semiOutOfPlayoff.join(', ')}.`;
  }

  // finalist: debe ser semifinalista
  const semiSet = new Set(state.semifinalist);
  if (state.finalist && !semiSet.has(state.finalist)) {
    errors.finalist = `El finalista debe ser uno de los semifinalistas.`;
  }

  // champion: debe ser semifinalista
  if (state.champion && !semiSet.has(state.champion)) {
    errors.champion = `El campeón debe ser uno de los semifinalistas.`;
  }

  return Object.keys(errors).length === 0 ? { ok: true } : { ok: false, errors };
}

export function isComplete(state: Event1State): boolean {
  const allGroups = GROUP_CODES.every((g) => Boolean(state.group_winner[g]));
  return (
    allGroups &&
    state.playoff_team.length === 32 &&
    state.semifinalist.length === 4 &&
    Boolean(state.finalist) &&
    Boolean(state.champion) &&
    state.top_scorer !== null
  );
}

/**
 * Cascada: aplicar consecuencias cuando algo se quita.
 * - Si un team sale de playoff_team y era semifinalist → sale de semifinalist.
 * - Si un team sale de semifinalist y era finalist/champion → finalist/champion = null.
 * - Si un team sale de group_winner → no auto-removemos de playoff_team (decisión UI).
 */
export function applyCascade(state: Event1State): Event1State {
  const playoffSet = new Set(state.playoff_team);
  const semiFiltered = state.semifinalist.filter((c) => playoffSet.has(c));
  const semiSet = new Set(semiFiltered);
  return {
    ...state,
    semifinalist: semiFiltered,
    finalist: state.finalist && semiSet.has(state.finalist) ? state.finalist : null,
    champion: state.champion && semiSet.has(state.champion) ? state.champion : null,
  };
}

