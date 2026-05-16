'use client';

import Image from 'next/image';
import { useMemo } from 'react';
import type { Team } from '@/lib/database.types';
import type { Event1State } from '@/lib/event1-types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { SaveChip, type SaveState } from './save-chip';

export function FinalistAndChampion({
  teams,
  state,
  onFinalist,
  onChampion,
  finalistSave,
  championSave,
  finalistError,
  championError,
  readOnly,
}: {
  teams: Team[];
  state: Event1State;
  onFinalist: (code: string | null) => void;
  onChampion: (code: string | null) => void;
  finalistSave: SaveState;
  championSave: SaveState;
  finalistError: string | null;
  championError: string | null;
  readOnly: boolean;
}) {
  const semiTeams = useMemo(() => {
    const set = new Set(state.semifinalist);
    return teams.filter((t) => set.has(t.code));
  }, [teams, state.semifinalist]);

  return (
    <>
      <RadioCard
        name="finalist"
        title="4. Finalista"
        points="1 × 150 pts"
        subtitle="El otro equipo que llega a la final (no es el campeón, es el rival)."
        value={state.finalist}
        options={semiTeams}
        onChange={onFinalist}
        save={finalistSave}
        error={finalistError}
        readOnly={readOnly}
      />
      <RadioCard
        name="champion"
        title="5. Campeón"
        points="1 × 400 pts"
        subtitle="El equipo que gana el Mundial."
        value={state.champion}
        options={semiTeams}
        onChange={onChampion}
        save={championSave}
        error={championError}
        readOnly={readOnly}
      />
    </>
  );
}

function RadioCard({
  name,
  title,
  points,
  subtitle,
  value,
  options,
  onChange,
  save,
  error,
  readOnly,
}: {
  name: string;
  title: string;
  points: string;
  subtitle: string;
  value: string | null;
  options: Team[];
  onChange: (v: string | null) => void;
  save: SaveState;
  error: string | null;
  readOnly: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>
          {title} <span className="text-sm text-muted-foreground">— {points}</span>
        </CardTitle>
        <SaveChip state={save} />
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{subtitle}</p>
        {options.length === 0 ? (
          <p className="text-sm text-muted-foreground">Primero elegí los semifinalistas arriba.</p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {options.map((t) => (
              <Label
                key={t.code}
                className="flex cursor-pointer items-center gap-2 rounded-md border p-2 hover:bg-accent has-[:checked]:border-primary has-[:checked]:bg-primary/5"
              >
                <input
                  type="radio"
                  name={name}
                  value={t.code}
                  checked={value === t.code}
                  disabled={readOnly}
                  onChange={() => onChange(t.code)}
                />
                {t.crest_url && (
                  <Image src={t.crest_url} alt="" width={20} height={20} unoptimized />
                )}
                <span>{t.name}</span>
              </Label>
            ))}
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
