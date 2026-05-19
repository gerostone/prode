'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase-server';

const updateMatchSchema = z.object({
  match_id: z.number().int().positive(),
  patch: z.object({
    home_team_code: z.string().nullable().optional(),
    away_team_code: z.string().nullable().optional(),
  }),
});

export async function updateMatchTeams(input: z.infer<typeof updateMatchSchema>) {
  const parsed = updateMatchSchema.safeParse(input);
  if (!parsed.success) return { error: 'Payload inválido.' };

  const { user } = await requireRole(['admin']);
  const supabase = createSupabaseServerClient();

  const { data: before } = await supabase
    .from('matches')
    .select('home_team_code, away_team_code')
    .eq('id', parsed.data.match_id)
    .single();

  const { error } = await supabase
    .from('matches')
    .update(parsed.data.patch)
    .eq('id', parsed.data.match_id);
  if (error) {
    console.error('updateMatchTeams error:', error);
    return { error: 'No se pudo actualizar el match.' };
  }

  await supabase.from('admin_audit_log').insert({
    actor_user_id: user.id,
    action: 'update_match_teams',
    target_table: 'matches',
    target_id: String(parsed.data.match_id),
    before_data: before ?? {},
    after_data: parsed.data.patch,
  });

  revalidatePath('/admin/matches');
  return { savedAt: new Date().toISOString() };
}
