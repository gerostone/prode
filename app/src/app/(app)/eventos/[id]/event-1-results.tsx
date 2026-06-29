import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Event1ResultsData, VerdictLine } from '@/lib/event-verdicts';
import { VerdictBadge } from './sections/verdict-badge';
import { ResultsSummary } from './results-summary';

export function Event1Results({ data }: { data: Event1ResultsData }) {
  return (
    <div className="space-y-4">
      <ResultsSummary
        points={data.totalPoints}
        correct={data.totalCorrect}
        pending={data.totalPending}
      />
      <Section title="Ganadores de grupo" lines={data.groupWinners} />
      <Section title="Equipos a playoffs" lines={data.playoffTeams} />
      <Section title="Semifinalistas" lines={data.semifinalists} />
      <Section title="Finalista" lines={data.finalist ? [data.finalist] : []} />
      <Section title="Campeón" lines={data.champion ? [data.champion] : []} />
      <Section title="Goleador" lines={data.topScorer ? [data.topScorer] : []} />
    </div>
  );
}

function Section({ title, lines }: { title: string; lines: VerdictLine[] }) {
  if (lines.length === 0) return null;
  const correct = lines.filter((l) => l.verdict === 'correct').length;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">{title}</CardTitle>
        <span className="text-xs text-muted-foreground">
          {correct}/{lines.length} ✓
        </span>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {lines.map((l) => (
            <li key={l.key} className="flex items-center gap-2 py-2">
              {l.label && (
                <span className="w-16 shrink-0 text-xs font-medium text-muted-foreground">
                  {l.label}
                </span>
              )}
              {l.crestUrl && <Image src={l.crestUrl} alt="" width={18} height={18} unoptimized />}
              <span className="min-w-0 flex-1 truncate text-sm">{l.name}</span>
              <VerdictBadge verdict={l.verdict} points={l.points} />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
