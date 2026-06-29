import type { Verdict } from '@/lib/event-verdicts';

export function VerdictBadge({ verdict, points }: { verdict: Verdict; points?: number }) {
  if (verdict === 'correct') {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
        ✓{points ? ` +${points}` : ''}
      </span>
    );
  }
  if (verdict === 'wrong') {
    return (
      <span className="inline-flex shrink-0 items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-600">
        ✗
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      ⏳ pendiente
    </span>
  );
}
