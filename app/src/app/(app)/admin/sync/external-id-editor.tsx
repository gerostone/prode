'use client';

import { useCallback, useRef, useState } from 'react';
import type { Match } from '@/lib/database.types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SaveChip, type SaveState } from '@/app/(app)/eventos/[id]/sections/save-chip';
import { assignExternalId } from './actions';

export function ExternalIdEditor({ matches: initial }: { matches: Match[] }) {
  const [matches, setMatches] = useState<Match[]>(initial);
  const [saveStates, setSaveStates] = useState<Record<number, SaveState>>({});
  const [errors, setErrors] = useState<Record<number, string | null>>({});
  const timers = useRef<Record<number, ReturnType<typeof setTimeout> | null>>({});

  const scheduleSave = useCallback(
    (match_id: number, external_id: string | null) => {
      setSaveStates((s) => ({ ...s, [match_id]: 'dirty' }) as Record<number, SaveState>);
      setErrors((e) => ({ ...e, [match_id]: null }) as Record<number, string | null>);
      if (timers.current[match_id]) clearTimeout(timers.current[match_id]!);
      timers.current[match_id] = setTimeout(async () => {
        setSaveStates((s) => ({ ...s, [match_id]: 'saving' }) as Record<number, SaveState>);
        const res = await assignExternalId({ match_id, external_id });
        if ('error' in res) {
          setSaveStates((s) => ({ ...s, [match_id]: 'error' }) as Record<number, SaveState>);
          setErrors((e) => ({ ...e, [match_id]: res.error }) as Record<number, string | null>);
        } else {
          setSaveStates((s) => ({ ...s, [match_id]: 'saved' }) as Record<number, SaveState>);
        }
      }, 800);
    },
    [],
  );

  function updateLocal(match_id: number, external_id: string | null) {
    setMatches((prev) => prev.map((m) => (m.id === match_id ? { ...m, external_id } : m)));
    scheduleSave(match_id, external_id);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mapping FD ↔ matches</CardTitle>
        <p className="text-sm text-muted-foreground">
          Asigná el ID de Football-Data.org a cada slot del bracket. Si no sabés cuál, podés
          ejecutar &quot;Sincronizar ahora&quot; primero y revisar los matches que vengan unmapped.
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {matches.map((m) => (
          <div key={m.id} className="grid grid-cols-12 items-center gap-2 border-b py-2 text-sm">
            <div className="col-span-2 font-medium">{m.bracket_slot}</div>
            <div className="col-span-2 text-xs text-muted-foreground">{m.stage}</div>
            <div className="col-span-3 text-xs">
              {m.home_team_code ?? '—'} vs {m.away_team_code ?? '—'}
            </div>
            <div className="col-span-4">
              <Label htmlFor={`ext-${m.id}`} className="sr-only">External ID</Label>
              <Input
                id={`ext-${m.id}`}
                type="text"
                placeholder="FD match id"
                value={m.external_id ?? ''}
                onChange={(e) => updateLocal(m.id, e.target.value === '' ? null : e.target.value)}
              />
            </div>
            <div className="col-span-1 text-right">
              <SaveChip state={saveStates[m.id] ?? 'idle'} />
              {errors[m.id] && (
                <p className="text-xs text-destructive">{errors[m.id]}</p>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
