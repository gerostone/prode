'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import type { Team, Player } from '@/lib/database.types';
import {
  emptyEvent1State,
  sectionToPicks,
  SECTION_KINDS,
  type Event1State,
  type SectionKind,
} from '@/lib/event1-types';
import { applyCascade, isComplete, validateCoherence } from '@/lib/event1-validation';
import { saveSection } from './actions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { GroupWinners } from './sections/group-winners';
import { PlayoffTeams } from './sections/playoff-teams';
import { Semifinalists } from './sections/semifinalists';
import { FinalistAndChampion } from './sections/finalist-and-champion';
import { TopScorer } from './sections/top-scorer';
import type { SaveState } from './sections/save-chip';

export function Event1Form({
  teams,
  players,
  initialState,
  readOnly,
}: {
  teams: Team[];
  players: Player[];
  initialState: Event1State;
  readOnly: boolean;
}) {
  const [state, setState] = useState<Event1State>(initialState);
  const [saveStates, setSaveStates] = useState<Record<SectionKind, SaveState>>(
    () => Object.fromEntries(SECTION_KINDS.map((k) => [k, 'idle'])) as Record<SectionKind, SaveState>,
  );
  const [errorMsgs, setErrorMsgs] = useState<Record<SectionKind, string | null>>(
    () => Object.fromEntries(SECTION_KINDS.map((k) => [k, null])) as Record<SectionKind, string | null>,
  );
  const timers = useRef<Record<SectionKind, ReturnType<typeof setTimeout> | null>>({
    group_winner: null,
    playoff_team: null,
    semifinalist: null,
    finalist: null,
    champion: null,
    top_scorer: null,
  });

  const validation = useMemo(() => validateCoherence(state, { teams }), [state, teams]);
  const teamsByCode = useMemo(() => new Map(teams.map((t) => [t.code, t])), [teams]);
  const complete = isComplete(state);

  function errorFor(kind: SectionKind): string | null {
    if (errorMsgs[kind]) return errorMsgs[kind];
    if (validation.ok) return null;
    const err = validation.errors[kind];
    if (!err) return null;
    if (typeof err === 'string') return err;
    // group_winner es Partial<Record<GroupCode, string>>: lo resumimos en un string
    return 'Revisá las selecciones de grupo.';
  }

  const scheduleSave = useCallback(
    (kind: SectionKind, nextState: Event1State) => {
      if (readOnly) return;
      setSaveStates((s) => ({ ...s, [kind]: 'dirty' }));
      setErrorMsgs((m) => ({ ...m, [kind]: null }));
      if (timers.current[kind]) clearTimeout(timers.current[kind]!);
      timers.current[kind] = setTimeout(async () => {
        setSaveStates((s) => ({ ...s, [kind]: 'saving' }));
        const res = await saveSection({ kind, picks: sectionToPicks(nextState, kind) });
        if ('error' in res) {
          setSaveStates((s) => ({ ...s, [kind]: 'error' }));
          setErrorMsgs((m) => ({ ...m, [kind]: res.error }));
        } else {
          setSaveStates((s) => ({ ...s, [kind]: 'saved' }));
        }
      }, 800);
    },
    [readOnly],
  );

  const update = useCallback(
    (kind: SectionKind, patch: Partial<Event1State>) => {
      setState((prev) => {
        const merged = { ...prev, ...patch };
        const cascaded = applyCascade(merged);
        // Si la cascada removió cosas, hay que salvar los kinds afectados también
        const affected: SectionKind[] = [kind];
        if (cascaded.semifinalist.length !== merged.semifinalist.length) affected.push('semifinalist');
        if (cascaded.finalist !== merged.finalist) affected.push('finalist');
        if (cascaded.champion !== merged.champion) affected.push('champion');
        for (const k of new Set(affected)) scheduleSave(k, cascaded);
        return cascaded;
      });
    },
    [scheduleSave],
  );

  return (
    <div className="space-y-6">
      <GroupWinners
        teams={teams}
        state={state}
        onChange={(group_winner) => update('group_winner', { group_winner })}
        saveState={saveStates.group_winner}
        error={errorFor('group_winner')}
        readOnly={readOnly}
      />
      <PlayoffTeams
        teams={teams}
        state={state}
        onChange={(playoff_team) => update('playoff_team', { playoff_team })}
        saveState={saveStates.playoff_team}
        error={errorFor('playoff_team')}
        readOnly={readOnly}
      />
      <Semifinalists
        teams={teams}
        state={state}
        onChange={(semifinalist) => update('semifinalist', { semifinalist })}
        saveState={saveStates.semifinalist}
        error={errorFor('semifinalist')}
        readOnly={readOnly}
      />
      <FinalistAndChampion
        teams={teams}
        state={state}
        onFinalist={(finalist) => update('finalist', { finalist })}
        onChampion={(champion) => update('champion', { champion })}
        finalistSave={saveStates.finalist}
        championSave={saveStates.champion}
        finalistError={errorFor('finalist')}
        championError={errorFor('champion')}
        readOnly={readOnly}
      />
      <TopScorer
        players={players}
        teamsByCode={teamsByCode}
        state={state}
        onChange={(top_scorer) => update('top_scorer', { top_scorer })}
        saveState={saveStates.top_scorer}
        error={errorFor('top_scorer')}
        readOnly={readOnly}
      />

      <Card>
        <CardHeader>
          <CardTitle>Resumen</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="text-sm">
            <li>Ganadores de grupo: {Object.values(state.group_winner).filter(Boolean).length}/12</li>
            <li>Equipos a playoffs: {state.playoff_team.length}/32</li>
            <li>Semifinalistas: {state.semifinalist.length}/4</li>
            <li>Finalista: {state.finalist ? '✓' : '—'}</li>
            <li>Campeón: {state.champion ? '✓' : '—'}</li>
            <li>Goleador: {state.top_scorer ? '✓' : '—'}</li>
          </ul>
          <Button disabled={!complete || !validation.ok || readOnly} className="w-full">
            {complete && validation.ok ? '✓ Pronóstico completo' : 'Completá todas las secciones para finalizar'}
          </Button>
          <p className="text-xs text-muted-foreground">
            Todo se guarda solo. El botón &quot;Finalizar&quot; es solo una confirmación visual; lo que esté guardado al cerrarse el evento es lo que cuenta.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
