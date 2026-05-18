import { createSupabaseServerClient } from '@/lib/supabase-server';
import type { Player, Team } from '@/lib/database.types';
import { PlayersEditor } from './players-editor';

export default async function AdminPlayersPage() {
  const supabase = createSupabaseServerClient();
  const [playersRes, teamsRes] = await Promise.all([
    supabase.from('players').select('*').order('display_order'),
    supabase.from('teams').select('*'),
  ]);

  return (
    <PlayersEditor
      players={(playersRes.data ?? []) as Player[]}
      teams={(teamsRes.data ?? []) as Team[]}
    />
  );
}
