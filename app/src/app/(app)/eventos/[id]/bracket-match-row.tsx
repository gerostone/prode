'use client';

import Image from 'next/image';
import type { Match, MatchOutcome, Team } from '@/lib/database.types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';

export function BracketMatchRow({
  match,
  teamsByCode,
  winner,
  outcome,
  onWinner,
  onOutcome,
  readOnly,
}: {
  match: Match;
  teamsByCode: Map<string, Team>;
  winner: string | null;
  outcome: MatchOutcome | null;
  onWinner: (v: string) => void;
  onOutcome: (v: MatchOutcome) => void;
  readOnly: boolean;
}) {
  const home = match.home_team_code ? teamsByCode.get(match.home_team_code) : null;
  const away = match.away_team_code ? teamsByCode.get(match.away_team_code) : null;
  const disabled = readOnly || !home || !away;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>{match.bracket_slot}</span>
          {match.scheduled_at && (
            <span className="text-xs font-normal text-muted-foreground">
              {new Date(match.scheduled_at).toLocaleString('es-AR', {
                day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
              })}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!home || !away ? (
          <p className="text-sm text-muted-foreground">Equipos por definir.</p>
        ) : (
          <>
            <div className="space-y-1">
              <Label className="text-xs">Ganador</Label>
              <div className="grid grid-cols-2 gap-2">
                {[home, away].map((t) => (
                  <Label
                    key={t.code}
                    className="flex cursor-pointer items-center gap-2 rounded-md border p-2 hover:bg-accent has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                  >
                    <input
                      type="radio"
                      name={`winner-${match.id}`}
                      value={t.code}
                      checked={winner === t.code}
                      disabled={disabled}
                      onChange={() => onWinner(t.code)}
                    />
                    {t.crest_url && (
                      <Image src={t.crest_url} alt="" width={20} height={20} unoptimized />
                    )}
                    <span>{t.name}</span>
                  </Label>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Resultado (90&apos;/120&apos;)</Label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { v: 'home' as const, label: 'Local' },
                  { v: 'draw' as const, label: 'Empate (penales)' },
                  { v: 'away' as const, label: 'Visitante' },
                ].map(({ v, label }) => (
                  <Label
                    key={v}
                    className="flex cursor-pointer items-center justify-center gap-1 rounded-md border p-2 text-xs hover:bg-accent has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                  >
                    <input
                      type="radio"
                      name={`outcome-${match.id}`}
                      value={v}
                      checked={outcome === v}
                      disabled={disabled}
                      onChange={() => onOutcome(v)}
                    />
                    <span>{label}</span>
                  </Label>
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
