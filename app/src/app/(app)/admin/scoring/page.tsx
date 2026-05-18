import { createSupabaseServerClient } from '@/lib/supabase-server';
import type { Event, Profile, Score } from '@/lib/database.types';
import { ScoringPanel, type EventWithTop } from './scoring-panel';

export default async function AdminScoringPage() {
  const supabase = createSupabaseServerClient();
  const [eventsRes, scoresRes, profilesRes] = await Promise.all([
    supabase.from('events').select('*').order('id'),
    supabase.from('scores').select('*'),
    supabase.from('profiles').select('id, display_name'),
  ]);

  const events = (eventsRes.data ?? []) as Event[];
  const scores = (scoresRes.data ?? []) as Score[];
  const profiles = (profilesRes.data ?? []) as Pick<Profile, 'id' | 'display_name'>[];
  const nameById = new Map(profiles.map((p) => [p.id, p.display_name]));

  const eventsWithTop: EventWithTop[] = events.map((e) => {
    const eventScores = scores
      .filter((s) => s.event_id === e.id)
      .sort((a, b) => b.points - a.points)
      .slice(0, 3)
      .map((s) => ({
        user_id: s.user_id,
        display_name: nameById.get(s.user_id) ?? s.user_id,
        points: s.points,
      }));
    const lastRecalc = scores
      .filter((s) => s.event_id === e.id)
      .reduce<string | null>(
        (acc, s) => (acc === null || s.updated_at > acc ? s.updated_at : acc),
        null,
      );
    return { event: e, top3: eventScores, lastRecalc };
  });

  return <ScoringPanel events={eventsWithTop} />;
}
