'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase-server';

const STAGES = ['group', 'r32', 'r16', 'qf', 'sf', 'final', 'champion'] as const;

const updateTeamSchema = z.object({
  code: z.string().min(1),
  patch: z.object({
    group_position: z.number().int().min(1).max(4).nullable().optional(),
    eliminated_at_stage: z.enum(STAGES).nullable().optional(),
  }),
});

export async function updateTeam(input: z.infer<typeof updateTeamSchema>) {
  const parsed = updateTeamSchema.safeParse(input);
  if (!parsed.success) return { error: 'Payload inválido.' };

  const { user } = await requireRole(['admin']);
  const supabase = createSupabaseServerClient();

  const { data: before } = await supabase
    .from('teams')
    .select('group_position, eliminated_at_stage')
    .eq('code', parsed.data.code)
    .single();

  const { error } = await supabase
    .from('teams')
    .update(parsed.data.patch)
    .eq('code', parsed.data.code);
  if (error) {
    console.error('updateTeam error:', error);
    return { error: 'No se pudo actualizar el equipo.' };
  }

  await supabase.from('admin_audit_log').insert({
    actor_user_id: user.id,
    action: 'update_team',
    target_table: 'teams',
    target_id: parsed.data.code,
    before_data: before ?? {},
    after_data: parsed.data.patch,
  });

  revalidatePath('/admin/teams');
  return { savedAt: new Date().toISOString() };
}

const updatePlayerSchema = z.object({
  id: z.number().int().positive(),
  patch: z.object({ is_top_scorer: z.boolean() }),
});

export async function updatePlayer(input: z.infer<typeof updatePlayerSchema>) {
  const parsed = updatePlayerSchema.safeParse(input);
  if (!parsed.success) return { error: 'Payload inválido.' };

  const { user } = await requireRole(['admin']);
  const supabase = createSupabaseServerClient();

  const { data: before } = await supabase
    .from('players')
    .select('is_top_scorer')
    .eq('id', parsed.data.id)
    .single();

  const { error } = await supabase
    .from('players')
    .update(parsed.data.patch)
    .eq('id', parsed.data.id);
  if (error) {
    console.error('updatePlayer error:', error);
    return { error: 'No se pudo actualizar el jugador.' };
  }

  await supabase.from('admin_audit_log').insert({
    actor_user_id: user.id,
    action: 'update_player',
    target_table: 'players',
    target_id: String(parsed.data.id),
    before_data: before ?? {},
    after_data: parsed.data.patch,
  });

  revalidatePath('/admin/players');
  return { savedAt: new Date().toISOString() };
}

const recalcSchema = z.object({ event_id: z.number().int().min(1).max(4) });

export type ScoreRow = { user_id: string; points: number; correct_count: number };

export async function recalcEventScoring(input: z.infer<typeof recalcSchema>) {
  const parsed = recalcSchema.safeParse(input);
  if (!parsed.success) return { error: 'event_id inválido.' };

  const { user } = await requireRole(['admin']);
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase.rpc('fn_score_event' as never, {
    p_event_id: parsed.data.event_id,
  });
  if (error) {
    console.error('fn_score_event error:', error);
    return { error: 'No se pudo recalcular.' };
  }

  await supabase.from('admin_audit_log').insert({
    actor_user_id: user.id,
    action: 'recalc_event_scoring',
    target_table: 'events',
    target_id: String(parsed.data.event_id),
    after_data: { row_count: data?.length ?? 0 },
  });

  revalidatePath('/admin/scoring');
  return { rows: (data ?? []) as ScoreRow[] };
}
