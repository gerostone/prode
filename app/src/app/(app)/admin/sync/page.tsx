import { createSupabaseServerClient } from '@/lib/supabase-server';
import type { Match, MatchStaging } from '@/lib/database.types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SyncNowButton } from './sync-now-button';
import { PendingApprovals } from './pending-approvals';
import { ExternalIdEditor } from './external-id-editor';

export default async function AdminSyncPage() {
  const supabase = createSupabaseServerClient();

  const [stagingRes, matchesRes] = await Promise.all([
    supabase
      .from('matches_staging')
      .select('*')
      .eq('status', 'pending')
      .order('fetched_at', { ascending: true }),
    supabase.from('matches').select('*').order('stage').order('bracket_slot'),
  ]);

  const stagingRows = (stagingRes.data ?? []) as MatchStaging[];
  const matches = (matchesRes.data ?? []) as Match[];
  const matchById = new Map(matches.map((m) => [m.id, m]));

  const approvalsRows = stagingRows.map((s) => ({
    staging: s,
    match: matchById.get(s.match_id) ?? null,
  }));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Pendientes de aprobación ({approvalsRows.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <PendingApprovals rows={approvalsRows} />
        </CardContent>
      </Card>

      <ExternalIdEditor matches={matches} />

      <Card>
        <CardHeader>
          <CardTitle>Trigger manual</CardTitle>
        </CardHeader>
        <CardContent>
          <SyncNowButton />
        </CardContent>
      </Card>
    </div>
  );
}
