import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { loadEvent1State } from '@/lib/predictions';
import { loadBracketState } from '@/lib/bracket-predictions';
import { loadEvent1Results, loadBracketResults } from '@/lib/event-verdicts';
import { BRACKET_CONFIGS } from '@/lib/bracket-types';
import type { Event, Team, Player, Match } from '@/lib/database.types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AdminToggle } from './admin-toggle';
import { Event1Form } from './event-1-form';
import { Event1Results } from './event-1-results';
import { BracketForm } from './bracket-form';
import { BracketResults } from './bracket-results';

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
    const [teamsRes, playersRes] = await Promise.all([
      supabase.from('teams').select('*').order('group_code').order('name'),
      supabase.from('players').select('*').order('display_order'),
    ]);
    const teams = (teamsRes.data ?? []) as Team[];
    const players = (playersRes.data ?? []) as Player[];

    // Evento scoreado: en vez del form (deshabilitado) mostramos los aciertos.
    if (event.status === 'scored') {
      const results = await loadEvent1Results(user.id, teams, players);
      return (
        <div className="space-y-6">
          {header}
          <Event1Results data={results} />
        </div>
      );
    }

    const state = await loadEvent1State(user.id);
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
  const [matchesRes, teamsRes] = await Promise.all([
    supabase
      .from('matches').select('*')
      .eq('stage', config.stage)
      .order('bracket_slot'),
    supabase.from('teams').select('*').order('name'),
  ]);
  const matches = (matchesRes.data ?? []) as Match[];
  const teams = (teamsRes.data ?? []) as Team[];

  // Evento scoreado: mostramos los aciertos por partido en vez del form.
  if (event.status === 'scored') {
    const results = await loadBracketResults(user.id, eventIdNum, matches, teams);
    return (
      <div className="space-y-6">
        {header}
        <BracketResults data={results} />
      </div>
    );
  }

  const state = await loadBracketState(user.id, eventIdNum);

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
