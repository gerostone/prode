import { requireUser } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { LeaderboardTable, type LeaderboardRow } from './leaderboard-table';

type LeaderboardViewRow = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  total_points: number;
  total_correct: number;
};

type ScoreRow = {
  user_id: string;
  event_id: number;
  points: number;
  correct_count: number;
};

export default async function LeaderboardPage() {
  const { user } = await requireUser();
  const supabase = createSupabaseServerClient();

  const [leaderboardRes, scoresRes] = await Promise.all([
    supabase.from('v_leaderboard').select('*'),
    supabase.from('scores').select('user_id, event_id, points, correct_count'),
  ]);

  const leaderboardData = (leaderboardRes.data ?? []) as LeaderboardViewRow[];
  const scoresData = (scoresRes.data ?? []) as ScoreRow[];

  const pointsByUser = new Map<string, Record<number, number>>();
  for (const s of scoresData) {
    if (!pointsByUser.has(s.user_id)) pointsByUser.set(s.user_id, {});
    pointsByUser.get(s.user_id)![s.event_id] = s.points;
  }

  const rows: LeaderboardRow[] = leaderboardData.map((r) => ({
    user_id: r.user_id,
    display_name: r.display_name,
    avatar_url: r.avatar_url,
    total_points: r.total_points,
    total_correct: r.total_correct,
    points_by_event: pointsByUser.get(r.user_id) ?? {},
  }));

  return <LeaderboardTable rows={rows} currentUserId={user.id} />;
}
