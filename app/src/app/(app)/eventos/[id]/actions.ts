'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { requireUser } from '@/lib/auth';
import { GROUP_CODES, type GroupCode } from '@/lib/event1-types';

const ALL_KINDS = [
  // Evento 1
  'group_winner', 'playoff_team', 'semifinalist', 'finalist', 'champion', 'top_scorer',
  // Eventos 2/3/4
  'r32_winner', 'r32_outcome',
  'r16_winner', 'r16_outcome',
  'qf_winner', 'qf_outcome',
] as const;

const pickSchema = z
  .object({
    team_code: z.string().min(1).optional(),
    player_id: z.number().int().positive().optional(),
    match_id: z.number().int().positive().optional(),
    outcome: z.enum(['home', 'draw', 'away']).optional(),
    meta: z
      .object({
        group_code: z.enum(GROUP_CODES as [GroupCode, ...GroupCode[]]).optional(),
      })
      .optional(),
  })
  .refine(
    (p) => p.team_code !== undefined || p.player_id !== undefined || p.outcome !== undefined,
    { message: 'pick necesita team_code, player_id u outcome.' },
  );

const saveSectionSchema = z.object({
  event_id: z.number().int().min(1).max(4),
  kind: z.enum(ALL_KINDS),
  picks: z.array(pickSchema),
});

export async function saveSection(input: z.infer<typeof saveSectionSchema>) {
  const parsed = saveSectionSchema.safeParse(input);
  if (!parsed.success) return { error: 'Payload inválido.' };

  const { user, profile } = await requireUser();
  if (!profile) return { error: 'Tu perfil no está disponible.' };

  const supabase = createSupabaseServerClient();

  // Verificar status del evento
  const { data: event, error: eErr } = await supabase
    .from('events')
    .select('status')
    .eq('id', parsed.data.event_id)
    .single();
  if (eErr || !event) return { error: 'No se pudo cargar el evento.' };

  const isAdmin = profile.role === 'admin';
  if (event.status !== 'open' && !(event.status === 'draft' && isAdmin)) {
    return { error: 'El evento no está abierto.' };
  }

  // Validación per-kind
  const k = parsed.data.kind;
  const isOutcomeKind = k === 'r32_outcome' || k === 'r16_outcome' || k === 'qf_outcome';
  const isMatchWinnerKind = k === 'r32_winner' || k === 'r16_winner' || k === 'qf_winner';
  const isTopScorerKind = k === 'top_scorer';

  const wrong = parsed.data.picks.some((p) => {
    if (isOutcomeKind) return !p.match_id || !p.outcome;
    if (isMatchWinnerKind) return !p.match_id || !p.team_code;
    if (isTopScorerKind) return !p.player_id;
    // Evento 1 (champion/finalist/semi/playoff/group_winner)
    return !p.team_code;
  });
  if (wrong) return { error: 'Pick no coincide con el kind de la sección.' };

  // Replace-by-kind: delete + insert
  const { error: dErr } = await supabase
    .from('predictions')
    .delete()
    .eq('user_id', user.id)
    .eq('event_id', parsed.data.event_id)
    .eq('kind', parsed.data.kind);
  if (dErr) {
    console.error('saveSection delete error:', dErr);
    return { error: 'No se pudo guardar tu pronóstico.' };
  }

  if (parsed.data.picks.length > 0) {
    const rows = parsed.data.picks.map((p) => ({
      user_id: user.id,
      event_id: parsed.data.event_id,
      kind: parsed.data.kind,
      team_code: p.team_code ?? null,
      player_id: p.player_id ?? null,
      match_id: p.match_id ?? null,
      outcome: p.outcome ?? null,
      meta: p.meta ?? {},
    }));
    const { error: iErr } = await supabase.from('predictions').insert(rows);
    if (iErr) {
      console.error('saveSection insert error:', iErr);
      return { error: 'No se pudo guardar tu pronóstico.' };
    }
  }

  return { savedAt: new Date().toISOString() };
}

async function requireAdmin() {
  const { user, profile } = await requireUser();
  if (!profile || profile.role !== 'admin') {
    return { error: 'Solo admin.' as const };
  }
  return { user, profile };
}

const eventIdSchema = z.object({ event_id: z.number().int().min(1).max(4) });

export async function openEvent(input: z.infer<typeof eventIdSchema>) {
  const parsed = eventIdSchema.safeParse(input);
  if (!parsed.success) return { error: 'event_id inválido.' };
  const guard = await requireAdmin();
  if ('error' in guard) return { error: guard.error };
  const supabase = createSupabaseServerClient();
  const { data: cur } = await supabase
    .from('events').select('status').eq('id', parsed.data.event_id).single();
  if (!cur) return { error: 'Evento no encontrado.' };
  if (cur.status !== 'draft') return { error: `No se puede abrir desde status ${cur.status}.` };

  const { error } = await supabase
    .from('events')
    .update({ status: 'open', opens_at: new Date().toISOString() })
    .eq('id', parsed.data.event_id);
  if (error) {
    console.error('openEvent error:', error);
    return { error: 'No se pudo abrir el evento.' };
  }

  await supabase.from('admin_audit_log').insert({
    actor_user_id: guard.user.id,
    action: 'open_event',
    target_table: 'events',
    target_id: String(parsed.data.event_id),
    before_data: { status: 'draft' },
    after_data: { status: 'open' },
  });

  revalidatePath(`/eventos/${parsed.data.event_id}`);
  return { ok: true as const };
}

export async function lockEvent(input: z.infer<typeof eventIdSchema>) {
  const parsed = eventIdSchema.safeParse(input);
  if (!parsed.success) return { error: 'event_id inválido.' };
  const guard = await requireAdmin();
  if ('error' in guard) return { error: guard.error };
  const supabase = createSupabaseServerClient();
  const { data: cur } = await supabase
    .from('events').select('status').eq('id', parsed.data.event_id).single();
  if (!cur) return { error: 'Evento no encontrado.' };
  if (cur.status !== 'open') return { error: `No se puede cerrar desde status ${cur.status}.` };

  const { error } = await supabase
    .from('events')
    .update({ status: 'locked', closes_at: new Date().toISOString() })
    .eq('id', parsed.data.event_id);
  if (error) {
    console.error('lockEvent error:', error);
    return { error: 'No se pudo cerrar el evento.' };
  }

  await supabase.from('admin_audit_log').insert({
    actor_user_id: guard.user.id,
    action: 'lock_event',
    target_table: 'events',
    target_id: String(parsed.data.event_id),
    before_data: { status: 'open' },
    after_data: { status: 'locked' },
  });

  revalidatePath(`/eventos/${parsed.data.event_id}`);
  return { ok: true as const };
}
