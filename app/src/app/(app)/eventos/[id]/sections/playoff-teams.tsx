'use client';

import Image from 'next/image';
import { useMemo } from 'react';
import type { Team } from '@/lib/database.types';
import { GROUP_CODES, type Event1State, type GroupCode } from '@/lib/event1-types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { SaveChip, type SaveState } from './save-chip';

export function PlayoffTeams({
  teams,
  state,
  onChange,
  saveState,
  error,
  readOnly,
}: {
  teams: Team[];
  state: Event1State;
  onChange: (next: string[]) => void;
  saveState: SaveState;
  error: string | null;
  readOnly: boolean;
}) {
  const teamsByGroup = useMemo(() => {
    const m: Partial<Record<GroupCode, Team[]>> = {};
    for (const g of GROUP_CODES) m[g] = [];
    for (const t of teams) {
      if (t.group_code && (GROUP_CODES as readonly string[]).includes(t.group_code)) {
        m[t.group_code as GroupCode]!.push(t);
      }
    }
    return m;
  }, [teams]);

  const lockedWinners = useMemo(
    () => new Set(Object.values(state.group_winner).filter(Boolean) as string[]),
    [state.group_winner],
  );
  const selected = useMemo(() => new Set(state.playoff_team), [state.playoff_team]);

  // Asegurar que todos los winners estén marcados (auto-include).
  const effective = useMemo(() => {
    const s = new Set(selected);
    for (const w of lockedWinners) s.add(w);
    return s;
  }, [selected, lockedWinners]);

  function toggle(code: string) {
    if (lockedWinners.has(code)) return; // no se puede destildar un winner
    const next = new Set(effective);
    if (next.has(code)) next.delete(code);
    else {
      if (next.size >= 32) return; // límite
      next.add(code);
    }
    onChange([...next]);
  }

  const count = effective.size;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>
          2. Equipos a playoffs (32 × 10 pts) <span className="text-sm text-muted-foreground">— {count}/32</span>
        </CardTitle>
        <SaveChip state={saveState} />
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Marcá los 32 equipos que vos creés que pasan a la Ronda de 32. Los ganadores de grupo
          que elegiste arriba ya quedan auto-marcados (no se pueden destildar acá).
        </p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {GROUP_CODES.map((g) => (
            <div key={g} className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Grupo {g}
              </p>
              <ul className="space-y-1">
                {(teamsByGroup[g] ?? []).map((t) => {
                  const isWinner = lockedWinners.has(t.code);
                  const isChecked = effective.has(t.code);
                  return (
                    <li key={t.code} className="flex items-center gap-2">
                      <Checkbox
                        id={`pt-${t.code}`}
                        checked={isChecked}
                        disabled={readOnly || isWinner}
                        onCheckedChange={() => toggle(t.code)}
                      />
                      {t.crest_url && (
                        <Image
                          src={t.crest_url}
                          alt=""
                          width={16}
                          height={16}
                          unoptimized
                        />
                      )}
                      <Label
                        htmlFor={`pt-${t.code}`}
                        className={isWinner ? 'opacity-70' : ''}
                      >
                        {t.name}
                        {isWinner && <span className="ml-1 text-xs text-muted-foreground">(ganador)</span>}
                      </Label>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
