import Link from 'next/link';
import type { Route } from 'next';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, Users, BarChart3 } from 'lucide-react';

export default async function AdminIndexPage() {
  const supabase = createSupabaseServerClient();

  const [teamsRes, playersRes, eventsRes] = await Promise.all([
    supabase.from('teams').select('code, group_position, eliminated_at_stage'),
    supabase.from('players').select('id, is_top_scorer'),
    supabase.from('events').select('id, status').order('id'),
  ]);

  const teams = teamsRes.data ?? [];
  const players = playersRes.data ?? [];
  const events = eventsRes.data ?? [];

  const teamsWithPosition = teams.filter((t) => t.group_position !== null).length;
  const teamsWithStage = teams.filter((t) => t.eliminated_at_stage !== null).length;
  const topScorerSet = players.filter((p) => p.is_top_scorer).length;
  const event1Status = events.find((e) => e.id === 1)?.status ?? '—';

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Link href={'/admin/teams' as Route} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg">
        <Card className="h-full transition-colors hover:bg-accent/40">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Equipos</CardTitle>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </div>
            <CardDescription>
              {teamsWithPosition}/{teams.length} con posición, {teamsWithStage}/{teams.length} con stage
            </CardDescription>
          </CardHeader>
        </Card>
      </Link>

      <Link href={'/admin/players' as Route} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg">
        <Card className="h-full transition-colors hover:bg-accent/40">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Jugadores</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </div>
            <CardDescription>
              Goleador marcado: {topScorerSet > 0 ? `✓ (${topScorerSet})` : '—'}
            </CardDescription>
          </CardHeader>
        </Card>
      </Link>

      <Link href={'/admin/scoring' as Route} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg">
        <Card className="h-full transition-colors hover:bg-accent/40">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Scoring</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </div>
            <CardDescription>Evento 1: {event1Status}</CardDescription>
          </CardHeader>
        </Card>
      </Link>

      <Card className="sm:col-span-2 lg:col-span-3">
        <CardContent className="py-4">
          <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
            ← Volver al dashboard
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
