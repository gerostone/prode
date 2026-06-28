import Link from 'next/link';
import type { Route } from 'next';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, Users, BarChart3, RefreshCcw, Swords, UserCog, ClipboardCheck } from 'lucide-react';

export default async function AdminIndexPage() {
  const supabase = createSupabaseServerClient();

  const [teamsRes, playersRes, eventsRes, stagingRes, matchesRes, profilesRes] = await Promise.all([
    supabase.from('teams').select('code, group_position, eliminated_at_stage'),
    supabase.from('players').select('id, is_top_scorer'),
    supabase.from('events').select('id, status').order('id'),
    supabase.from('matches_staging').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('matches').select('id, home_team_code, away_team_code, winner_team_code, stage'),
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
  ]);

  const teams = teamsRes.data ?? [];
  const players = playersRes.data ?? [];
  const events = eventsRes.data ?? [];

  const teamsWithPosition = teams.filter((t) => t.group_position !== null).length;
  const teamsWithStage = teams.filter((t) => t.eliminated_at_stage !== null).length;
  const topScorerSet = players.filter((p) => p.is_top_scorer).length;
  const event1Status = events.find((e) => e.id === 1)?.status ?? '—';
  const pendingStaging = stagingRes.count ?? 0;

  const allMatches = (matchesRes.data ?? []) as {
    home_team_code: string | null;
    away_team_code: string | null;
    winner_team_code: string | null;
    stage: string;
  }[];
  const matchesFilled = allMatches.filter((m) => m.home_team_code !== null && m.away_team_code !== null).length;
  const matchesTotal = allMatches.length;

  const KNOCKOUT = ['r32', 'r16', 'qf', 'sf', 'final'];
  const koMatches = allMatches.filter((m) => KNOCKOUT.includes(m.stage));
  const koWithResult = koMatches.filter((m) => m.winner_team_code !== null).length;

  const usersCount = profilesRes.count ?? 0;

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

      <Link href={"/admin/sync" as Route} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg">
        <Card className="h-full transition-colors hover:bg-accent/40">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Sync FD</CardTitle>
              <RefreshCcw className="h-4 w-4 text-muted-foreground" />
            </div>
            <CardDescription>
              {pendingStaging > 0 ? `${pendingStaging} pendientes` : 'Sin pendientes'}
            </CardDescription>
          </CardHeader>
        </Card>
      </Link>

      <Link href={"/admin/matches" as Route} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg">
        <Card className="h-full transition-colors hover:bg-accent/40">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Matches</CardTitle>
              <Swords className="h-4 w-4 text-muted-foreground" />
            </div>
            <CardDescription>
              {matchesFilled}/{matchesTotal} con home+away
            </CardDescription>
          </CardHeader>
        </Card>
      </Link>

      <Link href={"/admin/results" as Route} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg">
        <Card className="h-full transition-colors hover:bg-accent/40">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Resultados</CardTitle>
              <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
            </div>
            <CardDescription>
              {koWithResult}/{koMatches.length} partidos de bracket cargados
            </CardDescription>
          </CardHeader>
        </Card>
      </Link>

      <Link href={"/admin/users" as Route} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg">
        <Card className="h-full transition-colors hover:bg-accent/40">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Usuarios</CardTitle>
              <UserCog className="h-4 w-4 text-muted-foreground" />
            </div>
            <CardDescription>
              {usersCount} registrados
            </CardDescription>
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
