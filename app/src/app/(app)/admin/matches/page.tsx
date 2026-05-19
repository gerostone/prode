import { createSupabaseServerClient } from '@/lib/supabase-server';
import type { Match, Team } from '@/lib/database.types';
import { MatchesEditor } from './matches-editor';

export default async function AdminMatchesPage() {
  const supabase = createSupabaseServerClient();
  const [matchesRes, teamsRes] = await Promise.all([
    supabase.from('matches').select('*').order('stage').order('bracket_slot'),
    supabase.from('teams').select('*').order('name'),
  ]);

  return (
    <MatchesEditor
      matches={(matchesRes.data ?? []) as Match[]}
      teams={(teamsRes.data ?? []) as Team[]}
    />
  );
}
