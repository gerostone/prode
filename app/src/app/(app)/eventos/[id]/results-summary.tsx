import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function ResultsSummary({
  points,
  correct,
  pending,
}: {
  points: number;
  correct: number;
  pending: number;
}) {
  return (
    <Card className="border-emerald-300 bg-emerald-50">
      <CardHeader>
        <CardTitle className="text-emerald-900">Tus aciertos</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="text-2xl font-bold text-emerald-900">{points} pts</span>
          <span className="text-sm text-emerald-800">{correct} aciertos</span>
          {pending > 0 && (
            <span className="text-sm text-muted-foreground">{pending} pendientes</span>
          )}
        </div>
        {pending > 0 && (
          <p className="text-xs text-muted-foreground">
            ⏳ Las predicciones <strong>pendientes</strong> son las que todavía no tienen el
            resultado cargado — no cuentan como acierto ni como error hasta que se definan.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
