import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { MatchOutcome } from '@/lib/database.types';
import type { BracketLine, BracketResultsData } from '@/lib/event-verdicts';
import { VerdictBadge } from './sections/verdict-badge';
import { ResultsSummary } from './results-summary';

const OUTCOME_LABEL: Record<MatchOutcome, string> = {
  home: 'Local',
  draw: 'Empate (penales)',
  away: 'Visitante',
};

export function BracketResults({ data }: { data: BracketResultsData }) {
  return (
    <div className="space-y-4">
      <ResultsSummary
        points={data.totalPoints}
        correct={data.totalCorrect}
        pending={data.totalPending}
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tus pronósticos por partido</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.lines.map((line) => (
            <MatchResultRow key={line.matchId} line={line} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function MatchResultRow({ line }: { line: BracketLine }) {
  return (
    <div className="space-y-2 border-b py-3 last:border-b-0">
      <div className="flex items-center gap-2 text-sm font-medium">
        <span className="text-muted-foreground">{line.bracketSlot}</span>
        {line.teamsKnown ? (
          <span className="flex items-center gap-1.5">
            {line.homeCrest && <Image src={line.homeCrest} alt="" width={16} height={16} unoptimized />}
            <span className="truncate">{line.homeName}</span>
            <span className="text-muted-foreground">vs</span>
            {line.awayCrest && <Image src={line.awayCrest} alt="" width={16} height={16} unoptimized />}
            <span className="truncate">{line.awayName}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">Equipos por definir</span>
        )}
      </div>

      <div className="grid gap-1.5 sm:grid-cols-2">
        <PickRow
          label="Ganador"
          pick={line.winnerPickName}
          verdict={line.winnerVerdict}
          points={line.winnerPoints}
        />
        <PickRow
          label="Resultado"
          pick={line.outcomePick ? OUTCOME_LABEL[line.outcomePick] : null}
          verdict={line.outcomeVerdict}
          points={line.outcomePoints}
        />
      </div>
    </div>
  );
}

function PickRow({
  label,
  pick,
  verdict,
  points,
}: {
  label: string;
  pick: string | null;
  verdict: 'correct' | 'wrong' | 'pending' | null;
  points?: number;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md bg-muted/40 px-2.5 py-1.5 text-sm">
      <span className="w-20 shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 truncate">{pick ?? <span className="text-muted-foreground">— sin pick</span>}</span>
      {verdict && <VerdictBadge verdict={verdict} points={points} />}
    </div>
  );
}
