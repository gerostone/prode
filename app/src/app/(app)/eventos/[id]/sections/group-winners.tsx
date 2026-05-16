'use client';

import { useMemo } from 'react';
import type { Team } from '@/lib/database.types';
import { GROUP_CODES, type Event1State, type GroupCode } from '@/lib/event1-types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { SaveChip, type SaveState } from './save-chip';

export function GroupWinners({
  teams,
  state,
  onChange,
  saveState,
  error,
  readOnly,
}: {
  teams: Team[];
  state: Event1State;
  onChange: (gw: Partial<Record<GroupCode, string>>) => void;
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

  function handleChange(g: GroupCode, value: string) {
    const next = { ...state.group_winner };
    if (value === '') delete next[g];
    else next[g] = value;
    onChange(next);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>1. Ganadores de grupo (12 × 15 pts)</CardTitle>
        <SaveChip state={saveState} />
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Elegí el ganador de cada grupo. Solo aparecen los 4 equipos del grupo.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {GROUP_CODES.map((g) => {
            const opts = teamsByGroup[g] ?? [];
            const value = state.group_winner[g] ?? '';
            return (
              <div key={g} className="space-y-1">
                <Label htmlFor={`gw-${g}`}>Grupo {g}</Label>
                <select
                  id={`gw-${g}`}
                  value={value}
                  disabled={readOnly || opts.length === 0}
                  onChange={(e) => handleChange(g, e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="">— Elegir —</option>
                  {opts.map((t) => (
                    <option key={t.code} value={t.code}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
