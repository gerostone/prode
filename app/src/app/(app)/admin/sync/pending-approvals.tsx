'use client';

import { useState, useTransition } from 'react';
import type { Match, MatchStaging } from '@/lib/database.types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { approveStaging, rejectStaging } from './actions';

type Row = { staging: MatchStaging; match: Match | null };

export function PendingApprovals({ rows }: { rows: Row[] }) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          No hay aprobaciones pendientes.
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      {rows.map((row) => (
        <ApprovalRow key={row.staging.id} row={row} />
      ))}
    </div>
  );
}

function ApprovalRow({ row }: { row: Row }) {
  const { staging, match } = row;
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleApprove() {
    start(async () => {
      setError(null);
      const res = await approveStaging({ staging_id: staging.id });
      if ('error' in res) setError(res.error ?? null);
    });
  }

  function handleReject() {
    const notes = prompt('Motivo del rechazo (opcional):') ?? undefined;
    start(async () => {
      setError(null);
      const res = await rejectStaging({ staging_id: staging.id, notes });
      if ('error' in res) setError(res.error ?? null);
    });
  }

  function diff<T>(a: T, b: T): string {
    if (a === b) return String(a ?? '—');
    return `${String(a ?? '—')} → ${String(b ?? '—')}`;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {match?.bracket_slot ?? `match #${staging.match_id}`}{' '}
          <span className="text-xs text-muted-foreground">
            (fetched {new Date(staging.fetched_at).toLocaleString('es-AR')})
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <table className="w-full text-sm">
          <tbody className="divide-y">
            <tr>
              <td className="py-1 font-medium">scheduled_at</td>
              <td className="py-1">{diff(match?.scheduled_at ?? null, staging.scheduled_at)}</td>
            </tr>
            <tr>
              <td className="py-1 font-medium">90&apos; home/away</td>
              <td className="py-1">
                {diff(match?.home_score_90 ?? null, staging.home_score_90)} /{' '}
                {diff(match?.away_score_90 ?? null, staging.away_score_90)}
              </td>
            </tr>
            <tr>
              <td className="py-1 font-medium">120&apos; home/away</td>
              <td className="py-1">
                {diff(match?.home_score_120 ?? null, staging.home_score_120)} /{' '}
                {diff(match?.away_score_120 ?? null, staging.away_score_120)}
              </td>
            </tr>
            <tr>
              <td className="py-1 font-medium">penaltis</td>
              <td className="py-1">
                {diff(match?.went_to_penalties ?? false, staging.went_to_penalties ?? false)}
              </td>
            </tr>
            <tr>
              <td className="py-1 font-medium">winner</td>
              <td className="py-1">
                {diff(match?.winner_team_code ?? null, staging.winner_team_code)}
              </td>
            </tr>
          </tbody>
        </table>
        <div className="flex gap-2">
          <Button onClick={handleApprove} disabled={pending} size="sm">
            {pending ? '...' : 'Aprobar'}
          </Button>
          <Button onClick={handleReject} disabled={pending} size="sm" variant="destructive">
            Rechazar
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
