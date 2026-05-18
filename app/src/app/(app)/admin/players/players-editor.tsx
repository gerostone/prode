'use client';

import Image from 'next/image';
import { useCallback, useMemo, useRef, useState } from 'react';
import type { Player, Team } from '@/lib/database.types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { SaveChip, type SaveState } from '@/app/(app)/eventos/[id]/sections/save-chip';
import { updatePlayer } from '../actions';

export function PlayersEditor({
  players: initial,
  teams,
}: {
  players: Player[];
  teams: Team[];
}) {
  const [players, setPlayers] = useState<Player[]>(initial);
  const [saveStates, setSaveStates] = useState<Record<number, SaveState>>({});
  const [errors, setErrors] = useState<Record<number, string | null>>({});
  const timers = useRef<Record<number, ReturnType<typeof setTimeout> | null>>({});

  const teamsByCode = useMemo(() => new Map(teams.map((t) => [t.code, t])), [teams]);
  const markedCount = useMemo(() => players.filter((p) => p.is_top_scorer).length, [players]);

  const scheduleSave = useCallback(
    (id: number, is_top_scorer: boolean) => {
      setSaveStates((s) => ({ ...s, [id]: 'dirty' }));
      setErrors((e) => ({ ...e, [id]: null }) as Record<number, string | null>);
      if (timers.current[id]) clearTimeout(timers.current[id]!);
      timers.current[id] = setTimeout(async () => {
        setSaveStates((s) => ({ ...s, [id]: 'saving' }));
        const res = await updatePlayer({ id, patch: { is_top_scorer } });
        if ('error' in res) {
          setSaveStates((s) => ({ ...s, [id]: 'error' }));
          setErrors((e) => ({ ...e, [id]: res.error }) as Record<number, string | null>);
        } else {
          setSaveStates((s) => ({ ...s, [id]: 'saved' }));
        }
      }, 800);
    },
    [],
  );

  function toggle(id: number, next: boolean) {
    setPlayers((prev) => prev.map((p) => (p.id === id ? { ...p, is_top_scorer: next } : p)));
    scheduleSave(id, next);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Goleador del torneo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Marcados como goleador: <strong>{markedCount}</strong>
          </p>
          {markedCount > 1 && (
            <p className="text-sm text-amber-600">
              ⚠ Solo un jugador debería ser el goleador del torneo (a menos que haya empate).
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="divide-y">
          {players.map((p) => {
            const team = teamsByCode.get(p.team_code);
            return (
              <div key={p.id} className="flex items-center gap-3 py-2">
                <Checkbox
                  id={`ts-${p.id}`}
                  checked={p.is_top_scorer}
                  onCheckedChange={(v) => toggle(p.id, Boolean(v))}
                />
                {team?.crest_url && (
                  <Image src={team.crest_url} alt="" width={20} height={20} unoptimized />
                )}
                <Label htmlFor={`ts-${p.id}`} className="flex-1 cursor-pointer">
                  {p.full_name}
                  <span className="ml-2 text-xs text-muted-foreground">({p.team_code})</span>
                </Label>
                <SaveChip state={saveStates[p.id] ?? 'idle'} />
                {errors[p.id] && (
                  <span className="text-xs text-destructive">{errors[p.id]}</span>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
