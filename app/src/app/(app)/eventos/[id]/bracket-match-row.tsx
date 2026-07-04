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
  constrain = false,
  locked = false,
}: {
  match: Match;
  teamsByCode: Map<string, Team>;
  winner: string | null;
  outcome: MatchOutcome | null;
  onWinner: (v: string) => void;
  onOutcome: (v: MatchOutcome) => void;
  readOnly: boolean;
  constrain?: boolean;
  locked?: boolean;
}) {
  const home = match.home_team_code ? teamsByCode.get(match.home_team_code) : null;
  const away = match.away_team_code ? teamsByCode.get(match.away_team_code) : null;
  // locked: el partido ya tiene resultado cargado → no se puede editar, aunque el
  // evento esté abierto. Congela el pronóstico ya guardado (fairness).
  const disabled = readOnly || locked || !home || !away;

  // Resultado bloqueado según el ganador elegido: si ganó el local, no puede ser
  // "Visitante"; si ganó el visitante, no puede ser "Local". El empate (penales)
  // siempre queda habilitado.
  const blockedOutcome: MatchOutcome | null =
    !constrain || !winner
      ? null
      : winner === match.home_team_code
        ? 'away'
        : winner === match.away_team_code
          ? 'home'
          : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span>{match.bracket_slot}</span>
          {locked ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              🔒 Cerrado — ya se jugó
            </span>
          ) : (
            match.scheduled_at && (
              <span className="text-xs font-normal text-muted-foreground">
                {new Date(match.scheduled_at).toLocaleString('es-AR', {
                  day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                })}
              </span>
            )
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
                ].map(({ v, label }) => {
                  const isBlocked = blockedOutcome === v;
                  return (
                    <Label
                      key={v}
                      title={
                        isBlocked
                          ? 'El ganador que elegiste no permite este resultado'
                          : undefined
                      }
                      className={`flex items-center justify-center gap-1 rounded-md border p-2 text-xs ${
                        isBlocked
                          ? 'cursor-not-allowed border-dashed text-muted-foreground opacity-40'
                          : 'cursor-pointer hover:bg-accent has-[:checked]:border-primary has-[:checked]:bg-primary/5'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`outcome-${match.id}`}
                        value={v}
                        checked={outcome === v}
                        disabled={disabled || isBlocked}
                        onChange={() => onOutcome(v)}
                      />
                      <span>{label}</span>
                    </Label>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
