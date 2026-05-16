'use client';

import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { openEvent, lockEvent } from './actions';

export function AdminToggle({ status }: { status: 'draft' | 'open' | 'locked' | 'scored' }) {
  const [pending, start] = useTransition();

  if (status === 'draft') {
    return (
      <Button
        size="sm"
        disabled={pending}
        onClick={() => start(async () => { await openEvent(); })}
      >
        {pending ? 'Abriendo...' : 'Abrir evento'}
      </Button>
    );
  }
  if (status === 'open') {
    return (
      <Button
        size="sm"
        variant="destructive"
        disabled={pending}
        onClick={() => start(async () => { await lockEvent(); })}
      >
        {pending ? 'Cerrando...' : 'Cerrar evento'}
      </Button>
    );
  }
  return null;
}
