'use client';

import Image from 'next/image';
import { useMemo, useState } from 'react';
import type { Team } from '@/lib/database.types';
import type { Event1State } from '@/lib/event1-types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SaveChip, type SaveState } from './save-chip';

export function Semifinalists({
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
  const [query, setQuery] = useState('');

  const playoffSet = useMemo(() => new Set(state.playoff_team), [state.playoff_team]);
  const playoffTeams = useMemo(
    () => teams.filter((t) => playoffSet.has(t.code)),
    [teams, playoffSet],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return playoffTeams;
    return playoffTeams.filter(
      (t) => t.name.toLowerCase().includes(q) || t.code.toLowerCase().includes(q),
    );
  }, [playoffTeams, query]);

  const selected = useMemo(() => new Set(state.semifinalist), [state.semifinalist]);

  function toggle(code: string) {
    const next = new Set(selected);
    if (next.has(code)) next.delete(code);
    else {
      if (next.size >= 4) return;
      next.add(code);
    }
    onChange([...next]);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>
          3. Semifinalistas (4 × 75 pts){' '}
          <span className="text-sm text-muted-foreground">— {selected.size}/4</span>
        </CardTitle>
        <SaveChip state={saveState} />
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Elegí 4 entre los equipos que marcaste como playoff (
          {playoffTeams.length} disponibles).
        </p>
        <Input
          type="search"
          placeholder="Buscar por nombre o código (ARG, BRA)..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={readOnly}
        />
        <ul className="max-h-72 space-y-1 overflow-y-auto rounded-md border p-2">
          {filtered.length === 0 && (
            <li className="p-2 text-sm text-muted-foreground">
              {playoffTeams.length === 0
                ? 'Primero marcá equipos en la sección de playoffs.'
                : 'Sin resultados.'}
            </li>
          )}
          {filtered.map((t) => {
            const isChecked = selected.has(t.code);
            return (
              <li key={t.code} className="flex items-center gap-2 p-1">
                <Checkbox
                  id={`semi-${t.code}`}
                  checked={isChecked}
                  disabled={readOnly || (!isChecked && selected.size >= 4)}
                  onCheckedChange={() => toggle(t.code)}
                />
                {t.crest_url && (
                  <Image src={t.crest_url} alt="" width={16} height={16} unoptimized />
                )}
                <Label htmlFor={`semi-${t.code}`}>{t.name}</Label>
              </li>
            );
          })}
        </ul>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
