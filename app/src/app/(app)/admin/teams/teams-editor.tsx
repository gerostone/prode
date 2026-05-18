'use client';

import Image from 'next/image';
import { useCallback, useMemo, useRef, useState } from 'react';
import type { Team } from '@/lib/database.types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { SaveChip, type SaveState } from '@/app/(app)/eventos/[id]/sections/save-chip';
import { updateTeam } from '../actions';

const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'] as const;
const STAGES = ['group', 'r32', 'r16', 'qf', 'sf', 'final', 'champion'] as const;
type Stage = (typeof STAGES)[number];
type TeamPatch = { group_position?: number | null; eliminated_at_stage?: Stage | null };

export function TeamsEditor({ teams: initial }: { teams: Team[] }) {
  const [teams, setTeams] = useState<Team[]>(initial);
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout> | null>>({});

  const teamsByGroup = useMemo(() => {
    const m = new Map<string, Team[]>();
    for (const g of GROUPS) m.set(g, []);
    for (const t of teams) {
      if (t.group_code && m.has(t.group_code)) m.get(t.group_code)!.push(t);
    }
    return m;
  }, [teams]);

  const stats = useMemo(() => {
    const withPos = teams.filter((t) => t.group_position !== null).length;
    const withStage = teams.filter((t) => t.eliminated_at_stage !== null).length;
    return { withPos, withStage, total: teams.length };
  }, [teams]);

  const scheduleSave = useCallback(
    (code: string, patch: TeamPatch) => {
      setSaveStates((s) => ({ ...s, [code]: 'dirty' }));
      setErrors((e) => ({ ...e, [code]: null } as Record<string, string | null>));
      if (timers.current[code]) clearTimeout(timers.current[code]!);
      timers.current[code] = setTimeout(async () => {
        setSaveStates((s) => ({ ...s, [code]: 'saving' }));
        const res = await updateTeam({ code, patch });
        if ('error' in res) {
          setSaveStates((s) => ({ ...s, [code]: 'error' }));
          setErrors((e) => ({ ...e, [code]: res.error } as Record<string, string | null>));
        } else {
          setSaveStates((s) => ({ ...s, [code]: 'saved' }));
        }
      }, 800);
    },
    [],
  );

  function updateLocal(code: string, patch: TeamPatch) {
    setTeams((prev) => prev.map((t) => (t.code === code ? { ...t, ...patch } : t)));
    scheduleSave(code, patch);
  }

  function duplicatePositionWarning(groupTeams: Team[]) {
    const positions = groupTeams
      .map((t) => t.group_position)
      .filter((p): p is number => p !== null);
    const dupes = positions.filter((p, i) => positions.indexOf(p) !== i);
    return dupes.length > 0 ? `Posición duplicada: ${[...new Set(dupes)].join(', ')}` : null;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="py-4 text-sm text-muted-foreground">
          Cargados: <strong>{stats.withPos}/{stats.total}</strong> group_position,{' '}
          <strong>{stats.withStage}/{stats.total}</strong> eliminated_at_stage.
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {GROUPS.map((g) => {
          const groupTeams = teamsByGroup.get(g) ?? [];
          const dupWarn = duplicatePositionWarning(groupTeams);
          return (
            <Card key={g}>
              <CardHeader>
                <CardTitle>Grupo {g}</CardTitle>
                {dupWarn && (
                  <p className="text-sm text-amber-600">⚠ {dupWarn}</p>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                {groupTeams.map((t) => (
                  <div key={t.code} className="space-y-1">
                    <div className="flex items-center gap-2">
                      {t.crest_url && (
                        <Image src={t.crest_url} alt="" width={16} height={16} unoptimized />
                      )}
                      <span className="text-sm font-medium">{t.name}</span>
                      <SaveChip state={saveStates[t.code] ?? 'idle'} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label htmlFor={`pos-${t.code}`} className="text-xs">Pos</Label>
                        <select
                          id={`pos-${t.code}`}
                          value={t.group_position ?? ''}
                          onChange={(e) =>
                            updateLocal(t.code, {
                              group_position: e.target.value === '' ? null : Number(e.target.value),
                            })
                          }
                          className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                        >
                          <option value="">—</option>
                          <option value="1">1</option>
                          <option value="2">2</option>
                          <option value="3">3</option>
                          <option value="4">4</option>
                        </select>
                      </div>
                      <div>
                        <Label htmlFor={`stage-${t.code}`} className="text-xs">Stage</Label>
                        <select
                          id={`stage-${t.code}`}
                          value={t.eliminated_at_stage ?? ''}
                          onChange={(e) =>
                            updateLocal(t.code, {
                              eliminated_at_stage:
                                e.target.value === '' ? null : (e.target.value as Stage),
                            })
                          }
                          className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                        >
                          <option value="">—</option>
                          {STAGES.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    {errors[t.code] && (
                      <p className="text-xs text-destructive">{errors[t.code]}</p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
