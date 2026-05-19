'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import type { Match, MatchOutcome, Team } from '@/lib/database.types';
import {
  type BracketConfig,
  type BracketState,
} from '@/lib/bracket-types';
import { isBracketComplete, validateBracketCoherence } from '@/lib/bracket-validation';
import { saveSection } from './actions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SaveChip, type SaveState } from './sections/save-chip';
import { BracketMatchRow } from './bracket-match-row';

type Kind = 'winner' | 'outcome';

export function BracketForm({
  config,
  matches,
  teams,
  initialState,
  readOnly,
}: {
  config: BracketConfig;
  matches: Match[];
  teams: Team[];
  initialState: BracketState;
  readOnly: boolean;
}) {
  const [state, setState] = useState<BracketState>(initialState);
  const [saveStates, setSaveStates] = useState<Record<Kind, SaveState>>({
    winner: 'idle',
    outcome: 'idle',
  });
  const [errors, setErrors] = useState<Record<Kind, string | null>>({
    winner: null,
    outcome: null,
  });
  const timers = useRef<Record<Kind, ReturnType<typeof setTimeout> | null>>({
    winner: null,
    outcome: null,
  });

  const teamsByCode = useMemo(() => new Map(teams.map((t) => [t.code, t])), [teams]);

  const validation = useMemo(
    () => validateBracketCoherence(state, matches),
    [state, matches],
  );
  const { complete, missing } = useMemo(
    () => isBracketComplete(state, matches),
    [state, matches],
  );

  const playableMatches = useMemo(
    () => matches.filter((m) => m.home_team_code && m.away_team_code),
    [matches],
  );

  function bracketStateToPicks(s: BracketState, kind: Kind) {
    if (kind === 'winner') {
      return Object.entries(s.winners).map(([matchIdStr, team_code]) => ({
        match_id: Number(matchIdStr),
        team_code,
      }));
    }
    return Object.entries(s.outcomes).map(([matchIdStr, outcome]) => ({
      match_id: Number(matchIdStr),
      outcome,
    }));
  }

  const scheduleSave = useCallback(
    (kind: Kind, nextState: BracketState) => {
      if (readOnly) return;
      setSaveStates((s) => ({ ...s, [kind]: 'dirty' }));
      setErrors((e) => ({ ...e, [kind]: null }));
      if (timers.current[kind]) clearTimeout(timers.current[kind]!);
      timers.current[kind] = setTimeout(async () => {
        setSaveStates((s) => ({ ...s, [kind]: 'saving' }));
        const dbKind = kind === 'winner' ? config.winnerKind : config.outcomeKind;
        const res = await saveSection({
          event_id: config.eventId,
          kind: dbKind,
          picks: bracketStateToPicks(nextState, kind),
        });
        if ('error' in res) {
          setSaveStates((s) => ({ ...s, [kind]: 'error' }));
          setErrors((e) => ({ ...e, [kind]: res.error ?? null }));
        } else {
          setSaveStates((s) => ({ ...s, [kind]: 'saved' }));
        }
      }, 800);
    },
    [readOnly, config.eventId, config.winnerKind, config.outcomeKind],
  );

  function setWinner(matchId: number, team_code: string) {
    setState((prev) => {
      const next = { ...prev, winners: { ...prev.winners, [matchId]: team_code } };
      scheduleSave('winner', next);
      return next;
    });
  }

  function setOutcome(matchId: number, outcome: MatchOutcome) {
    setState((prev) => {
      const next = { ...prev, outcomes: { ...prev.outcomes, [matchId]: outcome } };
      scheduleSave('outcome', next);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Ganadores ({config.pointsWinner} pts c/u)</CardTitle>
          <SaveChip state={saveStates.winner} />
        </CardHeader>
        {errors.winner && (
          <CardContent>
            <p className="text-sm text-destructive">{errors.winner}</p>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Resultados ({config.pointsOutcome} pts c/u)</CardTitle>
          <SaveChip state={saveStates.outcome} />
        </CardHeader>
        {errors.outcome && (
          <CardContent>
            <p className="text-sm text-destructive">{errors.outcome}</p>
          </CardContent>
        )}
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        {matches.map((m) => (
          <BracketMatchRow
            key={m.id}
            match={m}
            teamsByCode={teamsByCode}
            winner={state.winners[m.id] ?? null}
            outcome={state.outcomes[m.id] ?? null}
            onWinner={(v) => setWinner(m.id, v)}
            onOutcome={(v) => setOutcome(m.id, v)}
            readOnly={readOnly}
          />
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Resumen</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="text-sm">
            <li>Matches disponibles: {playableMatches.length}/{config.expectedMatchCount}</li>
            <li>Predicciones faltantes: {missing}</li>
            {!validation.ok && (
              <li className="text-destructive">Errores de coherencia: {validation.errors.length}</li>
            )}
          </ul>
          <Button disabled={!complete || !validation.ok || readOnly} className="w-full">
            {complete && validation.ok
              ? '✓ Pronóstico completo'
              : 'Completá todas las predicciones'}
          </Button>
          <p className="text-xs text-muted-foreground">
            Todo se guarda solo. Lo que esté guardado al cerrarse el evento es lo que cuenta.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
