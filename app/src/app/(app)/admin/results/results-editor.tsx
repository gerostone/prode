'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import type { Match, MatchOutcome, Team } from '@/lib/database.types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SaveChip, type SaveState } from '@/app/(app)/eventos/[id]/sections/save-chip';
import { setMatchResult, clearMatchResult } from './actions';

const STAGES_ORDER = ['r32', 'r16', 'qf', 'sf', 'final'] as const;
const STAGE_LABELS: Record<string, string> = {
  r32: '16avos (Round of 32)',
  r16: 'Octavos',
  qf: 'Cuartos',
  sf: 'Semifinales',
  final: 'Final',
};

type Draft = { outcome: MatchOutcome | null; winner: string | null };

export function ResultsEditor({ matches: initial, teams }: { matches: Match[]; teams: Team[] }) {
  const [matches] = useState<Match[]>(initial);
  const [drafts, setDrafts] = useState<Record<number, Draft>>(() => {
    const d: Record<number, Draft> = {};
    for (const m of initial) {
      d[m.id] = { outcome: m.outcome_pre_penalties, winner: m.winner_team_code };
    }
    return d;
  });
  const [saveStates, setSaveStates] = useState<Record<number, SaveState>>({});
  const [errors, setErrors] = useState<Record<number, string | null>>({});
  const timers = useRef<Record<number, ReturnType<typeof setTimeout> | null>>({});

  const teamsByCode = useMemo(() => new Map(teams.map((t) => [t.code, t])), [teams]);

  const matchesByStage = useMemo(() => {
    const m: Record<string, Match[]> = {};
    for (const match of matches) (m[match.stage] ??= []).push(match);
    return m;
  }, [matches]);

  // slot padre → bracket_slot del partido que lo consume (para el hint "alimenta a…").
  const childOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of matches) {
      if (m.parent_slot_home) map.set(m.parent_slot_home, m.bracket_slot);
      if (m.parent_slot_away) map.set(m.parent_slot_away, m.bracket_slot);
    }
    return map;
  }, [matches]);

  const scheduleSave = useCallback((matchId: number, outcome: MatchOutcome, winner: string) => {
    setSaveStates((s) => ({ ...s, [matchId]: 'dirty' }));
    setErrors((e) => ({ ...e, [matchId]: null }));
    if (timers.current[matchId]) clearTimeout(timers.current[matchId]!);
    timers.current[matchId] = setTimeout(async () => {
      setSaveStates((s) => ({ ...s, [matchId]: 'saving' }));
      const res = await setMatchResult({ match_id: matchId, outcome, winner_team_code: winner });
      if ('error' in res) {
        setSaveStates((s) => ({ ...s, [matchId]: 'error' }));
        setErrors((e) => ({ ...e, [matchId]: res.error ?? null }));
      } else {
        setSaveStates((s) => ({ ...s, [matchId]: 'saved' }));
      }
    }, 700);
  }, []);

  function applyOutcome(m: Match, outcome: MatchOutcome) {
    // "gana local/visitante" fija el ganador solo; "empate" espera el ganador de penales.
    const winner =
      outcome === 'home'
        ? m.home_team_code
        : outcome === 'away'
          ? m.away_team_code
          : drafts[m.id]?.winner ?? null;
    setDrafts((d) => ({ ...d, [m.id]: { outcome, winner } }));
    if (winner) scheduleSave(m.id, outcome, winner);
    else {
      // empate sin ganador de penales todavía: queda pendiente, no guarda.
      setSaveStates((s) => ({ ...s, [m.id]: 'dirty' }));
    }
  }

  function applyPenaltyWinner(m: Match, winner: string) {
    setDrafts((d) => ({ ...d, [m.id]: { outcome: 'draw', winner } }));
    scheduleSave(m.id, 'draw', winner);
  }

  async function handleClear(m: Match) {
    if (timers.current[m.id]) clearTimeout(timers.current[m.id]!);
    setDrafts((d) => ({ ...d, [m.id]: { outcome: null, winner: null } }));
    setSaveStates((s) => ({ ...s, [m.id]: 'saving' }));
    const res = await clearMatchResult({ match_id: m.id });
    setSaveStates((s) => ({ ...s, [m.id]: 'error' in res ? 'error' : 'saved' }));
    if ('error' in res) setErrors((e) => ({ ...e, [m.id]: res.error ?? null }));
  }

  const stats = useMemo(() => {
    const total = matches.filter((m) => m.home_team_code && m.away_team_code).length;
    const done = matches.filter((m) => m.winner_team_code).length;
    return { total, done };
  }, [matches]);

  return (
    <div className="space-y-4">
      <Card className="border-sky-300 bg-sky-50">
        <CardHeader>
          <CardTitle className="text-sky-900">Cargar resultados (bracket)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-sky-900">
          <p>
            Elegí el resultado real de cada partido. Al guardar, el ganador se{' '}
            <strong>propaga solo</strong> al cruce de la ronda siguiente y queda listo para scorear
            en <code>/admin/scoring</code>.
          </p>
          <p className="text-xs">
            Ojo: si <strong>cambiás</strong> un ganador que ya se había propagado, el slot hijo no se
            reescribe solo — corregilo a mano en <code>/admin/matches</code>.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-4 text-sm text-muted-foreground">
          Cargados: <strong>{stats.done}/{stats.total}</strong> partidos con resultado.
        </CardContent>
      </Card>

      {STAGES_ORDER.map((stage) => {
        const stageMatches = matchesByStage[stage] ?? [];
        if (stageMatches.length === 0) return null;
        return (
          <Card key={stage}>
            <CardHeader>
              <CardTitle>{STAGE_LABELS[stage]}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {stageMatches.map((m) => (
                <ResultRow
                  key={m.id}
                  match={m}
                  child={childOf.get(m.bracket_slot) ?? null}
                  draft={drafts[m.id] ?? { outcome: null, winner: null }}
                  teamsByCode={teamsByCode}
                  saveState={saveStates[m.id] ?? 'idle'}
                  error={errors[m.id] ?? null}
                  onOutcome={(o) => applyOutcome(m, o)}
                  onPenaltyWinner={(w) => applyPenaltyWinner(m, w)}
                  onClear={() => handleClear(m)}
                />
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function ResultRow({
  match,
  child,
  draft,
  teamsByCode,
  saveState,
  error,
  onOutcome,
  onPenaltyWinner,
  onClear,
}: {
  match: Match;
  child: string | null;
  draft: Draft;
  teamsByCode: Map<string, Team>;
  saveState: SaveState;
  error: string | null;
  onOutcome: (o: MatchOutcome) => void;
  onPenaltyWinner: (w: string) => void;
  onClear: () => void;
}) {
  const home = match.home_team_code ? teamsByCode.get(match.home_team_code) : null;
  const away = match.away_team_code ? teamsByCode.get(match.away_team_code) : null;
  const playable = !!home && !!away;
  const winnerName = draft.winner ? teamsByCode.get(draft.winner)?.name ?? draft.winner : null;

  return (
    <div className="space-y-2 border-b py-3 last:border-b-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">
          {match.bracket_slot}
          {child && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              → alimenta {child}
            </span>
          )}
        </span>
        <div className="flex items-center gap-2">
          {draft.winner && <SaveChip state={saveState} />}
        </div>
      </div>

      {!playable ? (
        <p className="text-sm text-muted-foreground">Equipos por definir.</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <OutcomeButton
              label={`Gana ${home!.name}`}
              crest={home!.crest_url}
              active={draft.outcome === 'home'}
              onClick={() => onOutcome('home')}
            />
            <OutcomeButton
              label="Empate (penales)"
              active={draft.outcome === 'draw'}
              onClick={() => onOutcome('draw')}
            />
            <OutcomeButton
              label={`Gana ${away!.name}`}
              crest={away!.crest_url}
              active={draft.outcome === 'away'}
              onClick={() => onOutcome('away')}
            />
          </div>

          {draft.outcome === 'draw' && (
            <div className="space-y-1 rounded-md bg-muted/40 p-2">
              <p className="text-xs text-muted-foreground">¿Quién ganó los penales?</p>
              <div className="grid grid-cols-2 gap-2">
                <OutcomeButton
                  label={home!.name}
                  crest={home!.crest_url}
                  active={draft.winner === home!.code}
                  onClick={() => onPenaltyWinner(home!.code)}
                />
                <OutcomeButton
                  label={away!.name}
                  crest={away!.crest_url}
                  active={draft.winner === away!.code}
                  onClick={() => onPenaltyWinner(away!.code)}
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {winnerName ? <>Avanza: <strong>{winnerName}</strong></> : 'Sin resultado'}
            </span>
            {draft.winner && (
              <button
                type="button"
                onClick={onClear}
                className="text-xs text-muted-foreground underline hover:text-destructive"
              >
                Limpiar
              </button>
            )}
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </>
      )}
    </div>
  );
}

function OutcomeButton({
  label,
  crest,
  active,
  onClick,
}: {
  label: string;
  crest?: string | null;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-1.5 rounded-md border p-2 text-xs font-medium transition hover:bg-accent ${
        active ? 'border-primary bg-primary/5' : 'border-input'
      }`}
    >
      {crest && <Image src={crest} alt="" width={18} height={18} unoptimized />}
      <span className="truncate">{label}</span>
    </button>
  );
}

