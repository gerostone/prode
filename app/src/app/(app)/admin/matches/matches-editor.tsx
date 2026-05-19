'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import type { Match, Team } from '@/lib/database.types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { SaveChip, type SaveState } from '@/app/(app)/eventos/[id]/sections/save-chip';
import { updateMatchTeams } from './actions';

const STAGES_ORDER = ['r32', 'r16', 'qf', 'sf', 'final'] as const;
const STAGE_LABELS: Record<string, string> = {
  r32: 'Round of 32',
  r16: 'Round of 16',
  qf: 'Cuartos de final',
  sf: 'Semifinales',
  final: 'Final',
};

export function MatchesEditor({
  matches: initial,
  teams,
}: {
  matches: Match[];
  teams: Team[];
}) {
  const [matches, setMatches] = useState<Match[]>(initial);
  const [saveStates, setSaveStates] = useState<Record<number, SaveState>>({});
  const [errors, setErrors] = useState<Record<number, string | null>>({});
  const timers = useRef<Record<number, ReturnType<typeof setTimeout> | null>>({});

  const scheduleSave = useCallback(
    (match_id: number, patch: { home_team_code?: string | null; away_team_code?: string | null }) => {
      setSaveStates((s) => ({ ...s, [match_id]: 'dirty' }) as Record<number, SaveState>);
      setErrors((e) => ({ ...e, [match_id]: null }) as Record<number, string | null>);
      if (timers.current[match_id]) clearTimeout(timers.current[match_id]!);
      timers.current[match_id] = setTimeout(async () => {
        setSaveStates((s) => ({ ...s, [match_id]: 'saving' }) as Record<number, SaveState>);
        const res = await updateMatchTeams({ match_id, patch });
        if ('error' in res) {
          setSaveStates((s) => ({ ...s, [match_id]: 'error' }) as Record<number, SaveState>);
          setErrors((e) => ({ ...e, [match_id]: res.error ?? null }) as Record<number, string | null>);
        } else {
          setSaveStates((s) => ({ ...s, [match_id]: 'saved' }) as Record<number, SaveState>);
        }
      }, 800);
    },
    [],
  );

  function updateLocal(
    match_id: number,
    patch: { home_team_code?: string | null; away_team_code?: string | null },
  ) {
    setMatches((prev) => prev.map((m) => (m.id === match_id ? { ...m, ...patch } : m)));
    scheduleSave(match_id, patch);
  }

  const matchesByStage = useMemo(() => {
    const m: Record<string, Match[]> = {};
    for (const match of matches) {
      (m[match.stage] ??= []).push(match);
    }
    return m;
  }, [matches]);

  const stats = useMemo(() => {
    const total = matches.length;
    const filled = matches.filter(
      (m) => m.home_team_code !== null && m.away_team_code !== null,
    ).length;
    return { total, filled };
  }, [matches]);

  return (
    <div className="space-y-4">
      <Card className="border-amber-300 bg-amber-50">
        <CardHeader>
          <CardTitle className="text-amber-900">⚠ Verificación del bracket</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-amber-900">
          <p>
            Esta app asume <strong>pairing consecutivo</strong>: R32-01 + R32-02 → R16-01,
            R32-03 + R32-04 → R16-02, etc. Si el bracket FIFA oficial difiere, los puntos
            de winner van al match equivocado.
          </p>
          <p>
            Antes del primer R16,{' '}
            <a
              href="https://www.fifa.com/fifaplus/en/tournaments/mens/worldcup/canadamexicousa2026/scores-fixtures"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              comparar contra FIFA
            </a>{' '}
            o correr <code>npm run db:verify-bracket</code> para ver el árbol completo.
          </p>
          <p>
            Para corregir un slot:{' '}
            <code>update matches set parent_slot_home=&apos;R32-XX&apos;, parent_slot_away=&apos;R32-YY&apos; where bracket_slot=&apos;R16-NN&apos;;</code>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-4 text-sm text-muted-foreground">
          Cargados: <strong>{stats.filled}/{stats.total}</strong> matches con ambos teams.
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
                <div key={m.id} className="space-y-1 border-b py-2 last:border-b-0">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">
                      {m.bracket_slot}
                      {(m.parent_slot_home || m.parent_slot_away) && (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          ← winner({m.parent_slot_home ?? '—'}) + winner({m.parent_slot_away ?? '—'})
                        </span>
                      )}
                    </div>
                    <SaveChip state={saveStates[m.id] ?? 'idle'} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label htmlFor={`home-${m.id}`} className="text-xs">Home</Label>
                      <select
                        id={`home-${m.id}`}
                        value={m.home_team_code ?? ''}
                        onChange={(e) =>
                          updateLocal(m.id, {
                            home_team_code: e.target.value === '' ? null : e.target.value,
                          })
                        }
                        className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                      >
                        <option value="">—</option>
                        {teams.map((t) => (
                          <option key={t.code} value={t.code}>{t.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label htmlFor={`away-${m.id}`} className="text-xs">Away</Label>
                      <select
                        id={`away-${m.id}`}
                        value={m.away_team_code ?? ''}
                        onChange={(e) =>
                          updateLocal(m.id, {
                            away_team_code: e.target.value === '' ? null : e.target.value,
                          })
                        }
                        className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                      >
                        <option value="">—</option>
                        {teams.map((t) => (
                          <option key={t.code} value={t.code}>{t.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {errors[m.id] && (
                    <p className="text-xs text-destructive">{errors[m.id]}</p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
