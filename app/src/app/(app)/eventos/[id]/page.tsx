import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { loadEvent1State } from '@/lib/predictions';
import type { Event, Team, Player } from '@/lib/database.types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AdminToggle } from './admin-toggle';
import { Event1Form } from './event-1-form';

export default async function EventoPage({ params }: { params: { id: string } }) {
  if (params.id !== '1') notFound(); // Otros eventos: Fase 5

  const { user, profile } = await requireUser();
  if (!profile) notFound();

  const supabase = createSupabaseServerClient();

  const [eventRes, teamsRes, playersRes, state] = await Promise.all([
    supabase.from('events').select('*').eq('id', 1).single<Event>(),
    supabase.from('teams').select('*').order('group_code').order('name'),
    supabase.from('players').select('*').order('display_order'),
    loadEvent1State(user.id),
  ]);

  if (eventRes.error || !eventRes.data) notFound();

  const event = eventRes.data;
  const teams = (teamsRes.data ?? []) as Team[];
  const players = (playersRes.data ?? []) as Player[];
  const isAdmin = profile.role === 'admin';

  const canEdit = event.status === 'open' || (event.status === 'draft' && isAdmin);
  const isReadOnly = event.status === 'locked' || event.status === 'scored';

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle>{event.name}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{event.description}</p>
            <p className="mt-2 text-xs uppercase tracking-wide text-muted-foreground">
              Estado: {event.status}
            </p>
          </div>
          {isAdmin && <AdminToggle status={event.status} eventId={1} />}
        </CardHeader>
      </Card>

      {!canEdit && !isReadOnly && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            El evento todavía no está abierto. Volvé más tarde.
          </CardContent>
        </Card>
      )}

      {(canEdit || isReadOnly) && (
        <Event1Form
          teams={teams}
          players={players}
          initialState={state}
          readOnly={isReadOnly}
        />
      )}
    </div>
  );
}
