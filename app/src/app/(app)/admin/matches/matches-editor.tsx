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

// Referencia FIFA 2026 por slot R32 (M73–M88). Sirve para identificar qué
// partido del cuadro oficial corresponde a cada slot al cargar los equipos.
const R32_FIFA_REF: Record<string, { fifa: string; fecha: string; cruce: string }> = {
  'R32-01': { fifa: 'M73', fecha: '28/06 16:00', cruce: 'Sudáfrica vs Canadá' },
  'R32-02': { fifa: 'M74', fecha: '29/06 17:30', cruce: 'Alemania vs 3A/B/C/D/F' },
  'R32-03': { fifa: 'M75', fecha: '29/06 22:00', cruce: '1F vs Marruecos' },
  'R32-04': { fifa: 'M76', fecha: '29/06 14:00', cruce: 'Brasil vs 2F' },
  'R32-05': { fifa: 'M77', fecha: '30/06 18:00', cruce: '1I vs 3C/D/F/G/H' },
  'R32-06': { fifa: 'M78', fecha: '30/06 14:00', cruce: '2E vs 2I' },
  'R32-07': { fifa: 'M79', fecha: '30/06 22:00', cruce: 'México vs 3C/E/F/H/I' },
  'R32-08': { fifa: 'M80', fecha: '01/07 13:00', cruce: '1L vs 3E/H/I/J/K' },
  'R32-09': { fifa: 'M81', fecha: '01/07 21:00', cruce: 'Estados Unidos vs 3B/E/F/I/J' },
  'R32-10': { fifa: 'M82', fecha: '01/07 17:00', cruce: '1G vs 3A/E/H/I/J' },
  'R32-11': { fifa: 'M83', fecha: '02/07 20:00', cruce: '2K vs 2L' },
  'R32-12': { fifa: 'M84', fecha: '02/07 16:00', cruce: '1H vs 2J' },
  'R32-13': { fifa: 'M85', fecha: '03/07 00:00', cruce: 'Suiza vs 3E/F/G/I/J' },
  'R32-14': { fifa: 'M86', fecha: '03/07 19:00', cruce: 'Argentina vs 2H' },
  'R32-15': { fifa: 'M87', fecha: '03/07 22:30', cruce: '1K vs 3D/E/I/J/L' },
  'R32-16': { fifa: 'M88', fecha: '03/07 15:00', cruce: '2D vs 2G' },
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
      <Card className="border-emerald-300 bg-emerald-50">
        <CardHeader>
          <CardTitle className="text-emerald-900">✓ Bracket alineado con FIFA 2026</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-emerald-900">
          <p>
            La estructura del cuadro (octavos → final) ya está configurada según el bracket
            oficial de FIFA. Cada slot <strong>R32</strong> muestra al lado su partido FIFA
            (M73–M88), fecha y cruce: cargá el equipo que ocupa esa posición según tus
            resultados de grupo del Prode.
          </p>
          <p>
            Los octavos en adelante se completan solos al aprobar los resultados de cada ronda.
            Para revisar el árbol completo,{' '}
            <a
              href="https://www.fifa.com/fifaplus/en/tournaments/mens/worldcup/canadamexicousa2026/scores-fixtures"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              comparar contra FIFA
            </a>{' '}
            o correr <code>npm run db:verify-bracket</code>.
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
                      {R32_FIFA_REF[m.bracket_slot] && (
                        <span className="ml-2 text-xs font-normal text-emerald-700">
                          {R32_FIFA_REF[m.bracket_slot].fifa} · {R32_FIFA_REF[m.bracket_slot].fecha} ·{' '}
                          {R32_FIFA_REF[m.bracket_slot].cruce}
                        </span>
                      )}
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
