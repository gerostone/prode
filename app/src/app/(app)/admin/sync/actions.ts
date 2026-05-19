'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { syncFromFD, type SyncResult } from '@/lib/sync-fd';

// ---------- syncNow ----------

export async function syncNow(): Promise<SyncResult | { error: string }> {
  await requireRole(['admin']);

  const fdApiKey = process.env.FOOTBALL_DATA_API_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!fdApiKey || !supabaseUrl || !supabaseServiceKey) {
    return { error: 'Faltan envs (FD/Supabase) en el server.' };
  }

  try {
    const result = await syncFromFD({ fdApiKey, supabaseUrl, supabaseServiceKey });
    revalidatePath('/admin/sync');
    return result;
  } catch (err) {
    console.error('syncNow error:', err);
    return { error: 'No se pudo sincronizar.' };
  }
}

// ---------- approveStaging ----------

const approveSchema = z.object({ staging_id: z.number().int().positive() });

export async function approveStaging(input: z.infer<typeof approveSchema>) {
  const parsed = approveSchema.safeParse(input);
  if (!parsed.success) return { error: 'Payload inválido.' };

  const { user } = await requireRole(['admin']);
  const supabase = createSupabaseServerClient();

  // Cargar staging row
  const { data: staging, error: sErr } = await supabase
    .from('matches_staging')
    .select('*')
    .eq('id', parsed.data.staging_id)
    .single();
  if (sErr || !staging) return { error: 'Staging row no encontrada.' };
  if (staging.status !== 'pending') return { error: `Status actual: ${staging.status}.` };

  // Snapshot del match antes (para audit)
  const { data: before } = await supabase
    .from('matches')
    .select('*')
    .eq('id', staging.match_id)
    .single();

  // Update match con la data del staging
  const matchPatch: Record<string, unknown> = {
    home_score_90: staging.home_score_90,
    away_score_90: staging.away_score_90,
    home_score_120: staging.home_score_120,
    away_score_120: staging.away_score_120,
    went_to_penalties: staging.went_to_penalties,
    winner_team_code: staging.winner_team_code,
  };
  if (staging.scheduled_at !== null) matchPatch.scheduled_at = staging.scheduled_at;

  const { error: uErr } = await supabase
    .from('matches')
    .update(matchPatch)
    .eq('id', staging.match_id);
  if (uErr) {
    console.error('approveStaging update match error:', uErr);
    return { error: 'No se pudo actualizar el match.' };
  }

  // Marcar staging como approved
  const { error: msErr } = await supabase
    .from('matches_staging')
    .update({
      status: 'approved',
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', staging.id);
  if (msErr) {
    console.error('approveStaging update staging error:', msErr);
    return { error: 'No se pudo marcar staging como aprobado.' };
  }

  // Si hay winner nuevo, propagar al child match
  if (staging.winner_team_code !== null) {
    const { error: pErr } = await supabase.rpc('fn_propagate_winner' as never, {
      p_match_id: staging.match_id,
    });
    if (pErr) {
      console.error('fn_propagate_winner error:', pErr);
      // No bloqueante — el approval ya quedó. Loguea y sigue.
    }
  }

  // Audit log
  await supabase.from('admin_audit_log').insert({
    actor_user_id: user.id,
    action: 'approve_staging',
    target_table: 'matches_staging',
    target_id: String(staging.id),
    before_data: before ?? {},
    after_data: matchPatch,
  });

  revalidatePath('/admin/sync');
  return { ok: true as const };
}

// ---------- rejectStaging ----------

const rejectSchema = z.object({
  staging_id: z.number().int().positive(),
  notes: z.string().optional(),
});

export async function rejectStaging(input: z.infer<typeof rejectSchema>) {
  const parsed = rejectSchema.safeParse(input);
  if (!parsed.success) return { error: 'Payload inválido.' };

  const { user } = await requireRole(['admin']);
  const supabase = createSupabaseServerClient();

  const { error } = await supabase
    .from('matches_staging')
    .update({
      status: 'rejected',
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      notes: parsed.data.notes ?? null,
    })
    .eq('id', parsed.data.staging_id)
    .eq('status', 'pending');
  if (error) {
    console.error('rejectStaging error:', error);
    return { error: 'No se pudo rechazar el staging row.' };
  }

  await supabase.from('admin_audit_log').insert({
    actor_user_id: user.id,
    action: 'reject_staging',
    target_table: 'matches_staging',
    target_id: String(parsed.data.staging_id),
    after_data: { notes: parsed.data.notes ?? null },
  });

  revalidatePath('/admin/sync');
  return { ok: true as const };
}

// ---------- assignExternalId ----------

const assignSchema = z.object({
  match_id: z.number().int().positive(),
  external_id: z.string().min(1).nullable(),
});

export async function assignExternalId(input: z.infer<typeof assignSchema>) {
  const parsed = assignSchema.safeParse(input);
  if (!parsed.success) return { error: 'Payload inválido.' };

  const { user } = await requireRole(['admin']);
  const supabase = createSupabaseServerClient();

  const { data: before } = await supabase
    .from('matches')
    .select('external_id')
    .eq('id', parsed.data.match_id)
    .single();

  const { error } = await supabase
    .from('matches')
    .update({ external_id: parsed.data.external_id })
    .eq('id', parsed.data.match_id);
  if (error) {
    console.error('assignExternalId error:', error);
    return { error: 'No se pudo asignar el external_id (¿duplicado?).' };
  }

  await supabase.from('admin_audit_log').insert({
    actor_user_id: user.id,
    action: 'assign_external_id',
    target_table: 'matches',
    target_id: String(parsed.data.match_id),
    before_data: before ?? {},
    after_data: { external_id: parsed.data.external_id },
  });

  revalidatePath('/admin/sync');
  return { savedAt: new Date().toISOString() };
}
