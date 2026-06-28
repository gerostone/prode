'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { syncNow } from './actions';
import type { SyncResult } from '@/lib/sync-fd';

export function SyncNowButton() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    start(async () => {
      setError(null);
      const res = await syncNow();
      if ('error' in res) {
        setError(res.error);
        setResult(null);
      } else {
        setResult(res);
      }
    });
  }

  return (
    <div className="space-y-2">
      <Button onClick={handleClick} disabled={pending}>
        {pending ? 'Sincronizando...' : 'Sincronizar ahora'}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {result && (
        <p className="text-sm text-muted-foreground">
          {result.inserted} nuevos en staging, {result.updated} actualizados, {result.skipped} sin
          cambios, {result.unmapped} sin external_id.
          {result.errors.length > 0 && ` ${result.errors.length} errores.`}
        </p>
      )}
    </div>
  );
}
