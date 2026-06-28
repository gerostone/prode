import { createSupabaseServerClient } from '@/lib/supabase-server';
import type { Match, Team } from '@/lib/database.types';
import { ResultsEditor } from './results-editor';

const KNOCKOUT_STAGES = ['r32', 'r16', 'qf', 'sf', 'final'];

export default async function AdminResultsPage() {
  const supabase = createSupabaseServerClient();

  const [matchesRes, teamsRes] = await Promise.all([
    supabase.from('matches').select('*').in('stage', KNOCKOUT_STAGES).order('bracket_slot'),
    supabase.from('teams').select('*').order('name'),
  ]);

  const matches = (matchesRes.data ?? []) as Match[];
  const teams = (teamsRes.data ?? []) as Team[];

  return <ResultsEditor matches={matches} teams={teams} />;
}
