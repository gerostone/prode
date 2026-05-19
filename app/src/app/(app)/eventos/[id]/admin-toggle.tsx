'use client';

import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { openEvent, lockEvent } from './actions';

type Status = 'draft' | 'open' | 'locked' | 'scored';

export function AdminToggle({ status, eventId }: { status: Status; eventId: number }) {
  const [pending, start] = useTransition();

  if (status === 'draft') {
    return (
      <Button
        size="sm"
        disabled={pending}
        onClick={() => start(async () => { await openEvent({ event_id: eventId }); })}
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
        onClick={() => start(async () => { await lockEvent({ event_id: eventId }); })}
      >
        {pending ? 'Cerrando...' : 'Cerrar evento'}
      </Button>
    );
  }
  return null;
}
