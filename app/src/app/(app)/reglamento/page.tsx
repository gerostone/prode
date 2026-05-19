import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function ReglamentoPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Reglamento</h1>
        <p className="text-muted-foreground">Cómo se juega y se puntúa el Prode Mundial 2026.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Estructura general de puntos</CardTitle>
          <CardDescription>4 eventos de votación, 1790 puntos en total.</CardDescription>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2">Evento</th>
                <th className="py-2">Cuándo</th>
                <th className="py-2 text-right">Puntos</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr>
                <td className="py-2 font-medium">Evento 1 — Pronóstico inicial</td>
                <td className="py-2">Antes del kickoff del Mundial</td>
                <td className="py-2 text-right tabular-nums">1350</td>
              </tr>
              <tr>
                <td className="py-2 font-medium">Evento 2 — 32avos</td>
                <td className="py-2">Antes del Round of 32</td>
                <td className="py-2 text-right tabular-nums">160</td>
              </tr>
              <tr>
                <td className="py-2 font-medium">Evento 3 — Octavos</td>
                <td className="py-2">Antes del Round of 16</td>
                <td className="py-2 text-right tabular-nums">160</td>
              </tr>
              <tr>
                <td className="py-2 font-medium">Evento 4 — Cuartos</td>
                <td className="py-2">Antes de Cuartos de Final</td>
                <td className="py-2 text-right tabular-nums">120</td>
              </tr>
              <tr>
                <td className="py-2 font-bold">TOTAL</td>
                <td className="py-2">—</td>
                <td className="py-2 text-right font-bold tabular-nums">1790</td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Evento 1 — Pronóstico inicial (1350 pts)</CardTitle>
          <CardDescription>Se carga antes del kickoff del Mundial (11 jun).</CardDescription>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2">Categoría</th>
                <th className="py-2 text-right">Cantidad</th>
                <th className="py-2 text-right">Pts c/u</th>
                <th className="py-2 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr>
                <td className="py-2">Campeón</td>
                <td className="py-2 text-right tabular-nums">1</td>
                <td className="py-2 text-right tabular-nums">200</td>
                <td className="py-2 text-right tabular-nums">200</td>
              </tr>
              <tr>
                <td className="py-2">Finalista</td>
                <td className="py-2 text-right tabular-nums">1</td>
                <td className="py-2 text-right tabular-nums">150</td>
                <td className="py-2 text-right tabular-nums">150</td>
              </tr>
              <tr>
                <td className="py-2">Semifinalistas</td>
                <td className="py-2 text-right tabular-nums">4</td>
                <td className="py-2 text-right tabular-nums">75</td>
                <td className="py-2 text-right tabular-nums">300</td>
              </tr>
              <tr>
                <td className="py-2">Goleador del torneo</td>
                <td className="py-2 text-right tabular-nums">1</td>
                <td className="py-2 text-right tabular-nums">200</td>
                <td className="py-2 text-right tabular-nums">200</td>
              </tr>
              <tr>
                <td className="py-2">Equipos a Playoffs (Round of 32)</td>
                <td className="py-2 text-right tabular-nums">32</td>
                <td className="py-2 text-right tabular-nums">10</td>
                <td className="py-2 text-right tabular-nums">320</td>
              </tr>
              <tr>
                <td className="py-2">Ganadores de grupo</td>
                <td className="py-2 text-right tabular-nums">12</td>
                <td className="py-2 text-right tabular-nums">15</td>
                <td className="py-2 text-right tabular-nums">180</td>
              </tr>
              <tr>
                <td className="py-2 font-bold">Total Evento 1</td>
                <td className="py-2 text-right">—</td>
                <td className="py-2 text-right">—</td>
                <td className="py-2 text-right font-bold tabular-nums">1350</td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Eventos 2 / 3 / 4 — Brackets (440 pts)</CardTitle>
          <CardDescription>Antes de cada ronda eliminatoria, predecís ganador + resultado L/E/V por partido.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div>
            <div className="font-medium">Evento 2 — Antes de R32 (160 pts)</div>
            <div className="text-muted-foreground">16 × 8 pts (ganador) + 16 × 2 pts (resultado L/E/V)</div>
          </div>
          <div>
            <div className="font-medium">Evento 3 — Antes de R16 (160 pts)</div>
            <div className="text-muted-foreground">8 × 15 pts (ganador) + 8 × 5 pts (resultado L/E/V)</div>
          </div>
          <div>
            <div className="font-medium">Evento 4 — Antes de QF (120 pts)</div>
            <div className="text-muted-foreground">4 × 20 pts (ganador) + 4 × 10 pts (resultado L/E/V)</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Regla del &quot;Empate&quot;</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>En las rondas eliminatorias, el resultado del partido se determina así:</p>
          <ul className="list-disc space-y-1 pl-6">
            <li>Si se define en <strong>90 minutos</strong>: <strong>Local</strong> o <strong>Visitante</strong> según el ganador.</li>
            <li>Si se define en <strong>tiempo extra (120 minutos)</strong>: <strong>Local</strong> o <strong>Visitante</strong> según el ganador.</li>
            <li>Si llega empatado a <strong>penaltis</strong>: <strong>Empate</strong> (no importa quién gane los penaltis).</li>
          </ul>
          <p className="text-muted-foreground">
            En síntesis: &quot;Empate&quot; = &quot;se definió por penaltis&quot;.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Local y Visitante</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <p>
            En las rondas eliminatorias se considera <strong>Local</strong> al equipo con mejor ranking
            FIFA al cierre del evento de pronóstico correspondiente.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cuándo cierra cada evento</CardTitle>
          <CardDescription>Lock-out automático via cron diario; admin puede cerrar manual si necesita precisión al minuto.</CardDescription>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2">Evento</th>
                <th className="py-2">Cierra al kickoff de</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr>
                <td className="py-2 font-medium">Evento 1</td>
                <td className="py-2">Primer partido del Mundial (11 jun 2026)</td>
              </tr>
              <tr>
                <td className="py-2 font-medium">Evento 2</td>
                <td className="py-2">Primer partido del Round of 32 (28 jun aprox)</td>
              </tr>
              <tr>
                <td className="py-2 font-medium">Evento 3</td>
                <td className="py-2">Primer partido del Round of 16 (4 jul aprox)</td>
              </tr>
              <tr>
                <td className="py-2 font-medium">Evento 4</td>
                <td className="py-2">Primer partido de Cuartos de Final (10 jul aprox)</td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
