import { createSupabaseServerClient } from '@/lib/supabase-server';
import type { Team } from '@/lib/database.types';
import { TeamsEditor } from './teams-editor';

export default async function AdminTeamsPage() {
  const supabase = createSupabaseServerClient();
  const { data } = await supabase
    .from('teams')
    .select('*')
    .order('group_code')
    .order('name');

  return <TeamsEditor teams={(data ?? []) as Team[]} />;
}
