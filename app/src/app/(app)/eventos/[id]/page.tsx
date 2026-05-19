import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { loadEvent1State } from '@/lib/predictions';
import { loadBracketState } from '@/lib/bracket-predictions';
import { BRACKET_CONFIGS } from '@/lib/bracket-types';
import type { Event, Team, Player, Match } from '@/lib/database.types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AdminToggle } from './admin-toggle';
import { Event1Form } from './event-1-form';
import { BracketForm } from './bracket-form';

export default async function EventoPage({ params }: { params: { id: string } }) {
  const eventIdNum = Number(params.id);
  if (!Number.isInteger(eventIdNum) || eventIdNum < 1 || eventIdNum > 4) notFound();

  const { user, profile } = await requireUser();
  if (!profile) notFound();

  const supabase = createSupabaseServerClient();
  const eventRes = await supabase
    .from('events').select('*').eq('id', eventIdNum).single<Event>();
  if (eventRes.error || !eventRes.data) notFound();
  const event = eventRes.data;

  const isAdmin = profile.role === 'admin';
  const canEdit = event.status === 'open' || (event.status === 'draft' && isAdmin);
  const isReadOnly = event.status === 'locked' || event.status === 'scored';

  const header = (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>{event.name}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">{event.description}</p>
          <p className="mt-2 text-xs uppercase tracking-wide text-muted-foreground">
            Estado: {event.status}
          </p>
        </div>
        {isAdmin && <AdminToggle status={event.status} eventId={eventIdNum} />}
      </CardHeader>
    </Card>
  );

  if (!canEdit && !isReadOnly) {
    return (
      <div className="space-y-6">
        {header}
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            El evento todavía no está abierto. Volvé más tarde.
          </CardContent>
        </Card>
      </div>
    );
  }

  if (eventIdNum === 1) {
    const [teamsRes, playersRes, state] = await Promise.all([
      supabase.from('teams').select('*').order('group_code').order('name'),
      supabase.from('players').select('*').order('display_order'),
      loadEvent1State(user.id),
    ]);
    const teams = (teamsRes.data ?? []) as Team[];
    const players = (playersRes.data ?? []) as Player[];

    return (
      <div className="space-y-6">
        {header}
        <Event1Form
          teams={teams}
          players={players}
          initialState={state}
          readOnly={isReadOnly}
        />
      </div>
    );
  }

  // Eventos 2/3/4
  const config = BRACKET_CONFIGS[eventIdNum];
  const [matchesRes, teamsRes, state] = await Promise.all([
    supabase
      .from('matches').select('*')
      .eq('stage', config.stage)
      .order('bracket_slot'),
    supabase.from('teams').select('*').order('name'),
    loadBracketState(user.id, eventIdNum),
  ]);
  const matches = (matchesRes.data ?? []) as Match[];
  const teams = (teamsRes.data ?? []) as Team[];

  return (
    <div className="space-y-6">
      {header}
      <BracketForm
        config={config}
        matches={matches}
        teams={teams}
        initialState={state}
        readOnly={isReadOnly}
      />
    </div>
  );
}
