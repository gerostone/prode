'use client';

import Image from 'next/image';
import type { Player, Team } from '@/lib/database.types';
import type { Event1State } from '@/lib/event1-types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { SaveChip, type SaveState } from './save-chip';

export function TopScorer({
  players,
  teamsByCode,
  state,
  onChange,
  saveState,
  error,
  readOnly,
}: {
  players: Player[];
  teamsByCode: Map<string, Team>;
  state: Event1State;
  onChange: (player_id: number | null) => void;
  saveState: SaveState;
  error: string | null;
  readOnly: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>
          6. Goleador del torneo{' '}
          <span className="text-sm text-muted-foreground">— 1 × 200 pts</span>
        </CardTitle>
        <SaveChip state={saveState} />
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          El máximo goleador del Mundial 2026.
        </p>
        {players.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Todavía no hay candidatos cargados.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {players.map((p) => {
              const team = teamsByCode.get(p.team_code);
              return (
                <Label
                  key={p.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md border p-2 hover:bg-accent has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                >
                  <input
                    type="radio"
                    name="top_scorer"
                    value={p.id}
                    checked={state.top_scorer === p.id}
                    disabled={readOnly}
                    onChange={() => onChange(p.id)}
                  />
                  {team?.crest_url && (
                    <Image src={team.crest_url} alt="" width={20} height={20} unoptimized />
                  )}
                  <span>{p.full_name}</span>
                </Label>
              );
            })}
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
