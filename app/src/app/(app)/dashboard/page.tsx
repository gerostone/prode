import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { requireUser } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { Event } from '@/lib/database.types';
import { Calendar, Trophy, Users, Shield } from 'lucide-react';

export default async function DashboardPage() {
  const { user, profile } = await requireUser();
  const supabase = createSupabaseServerClient();

  // Próximo evento (el de menor id que esté en draft u open)
  const { data: nextEvent } = await supabase
    .from('events')
    .select('*')
    .in('status', ['draft', 'open'])
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle<Event>();

  // Equipos cargados hasta ahora
  const { count: teamsCount } = await supabase
    .from('teams')
    .select('*', { count: 'exact', head: true });

  // Cantidad de jugadores
  const { count: playersCount } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true });

  const roleLabel = profile?.role === 'admin' ? 'Admin' : profile?.role === 'scorer' ? 'Scorer' : 'Jugador';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Hola, {profile?.display_name ?? user.email}</h1>
        <p className="text-muted-foreground">
          Estás en el Prode Mundial 2026 como <strong>{roleLabel}</strong>.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {nextEvent ? (
          <Link href={`/eventos/${nextEvent.id}`} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg">
            <Card className="h-full transition-colors hover:bg-accent/40">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Próximo evento</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold">{nextEvent.name}</div>
                <p className="text-xs text-muted-foreground">
                  {nextEvent.status === 'open'
                    ? 'Abierto ahora — entrá a pronosticar →'
                    : profile?.role === 'admin'
                      ? 'En borrador — entrá para abrirlo →'
                      : 'Próximamente'}
                </p>
              </CardContent>
            </Card>
          </Link>
        ) : (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Próximo evento</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold">—</div>
              <p className="text-xs text-muted-foreground">Todos los eventos terminaron</p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tu puntaje</CardTitle>
            <Trophy className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">—</div>
            <p className="text-xs text-muted-foreground">Se calcula en Fase 5</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Equipos cargados</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{teamsCount ?? 0} / 48</div>
            <p className="text-xs text-muted-foreground">
              {teamsCount && teamsCount >= 48 ? 'Listos' : 'Falta correr db:sync-teams'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Jugadores</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{playersCount ?? 0}</div>
            <p className="text-xs text-muted-foreground">Registrados en el Prode</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Estado del proyecto</CardTitle>
          <CardDescription>Avance de implementación, fase a fase.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            <li>✅ <strong>Fase 0</strong> — Setup y auth con email + contraseña</li>
            <li>✅ <strong>Fase 1</strong> — Modelo de datos, RLS y seeds</li>
            <li>✅ <strong>Fase 2</strong> — Pantalla del Evento 1 (pronóstico inicial)</li>
            <li>⏳ <strong>Fase 3</strong> — Admin y carga manual de resultados</li>
            <li>⏳ <strong>Fase 4</strong> — Sync con Football-Data.org</li>
            <li>⏳ <strong>Fase 5</strong> — Eventos 2/3/4 (brackets)</li>
            <li>⏳ <strong>Fase 6</strong> — Scoring y leaderboard en realtime</li>
            <li>⏳ <strong>Fase 7</strong> — Pulido</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
