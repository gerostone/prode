'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { requireUser } from '@/lib/auth';
import { GROUP_CODES, SECTION_KINDS, type GroupCode } from '@/lib/event1-types';

const pickSchema = z
  .object({
    team_code: z.string().min(1).optional(),
    player_id: z.number().int().positive().optional(),
    meta: z
      .object({
        group_code: z.enum(GROUP_CODES as [GroupCode, ...GroupCode[]]).optional(),
      })
      .optional(),
  })
  .refine((p) => p.team_code !== undefined || p.player_id !== undefined, {
    message: 'pick debe tener team_code o player_id',
  });

const saveSectionSchema = z.object({
  kind: z.enum(SECTION_KINDS),
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
    .eq('id', 1)
    .single();
  if (eErr || !event) return { error: 'No se pudo cargar el evento.' };

  const isAdmin = profile.role === 'admin';
  if (event.status !== 'open' && !(event.status === 'draft' && isAdmin)) {
    return { error: 'El evento no está abierto.' };
  }

  // Validación per-kind: top_scorer requiere player_id; el resto requiere team_code.
  const needsPlayerId = parsed.data.kind === 'top_scorer';
  const wrong = parsed.data.picks.some((p) =>
    needsPlayerId ? !p.player_id : !p.team_code,
  );
  if (wrong) return { error: 'Pick no coincide con el kind de la sección.' };

  // Replace-by-kind: delete + insert
  const { error: dErr } = await supabase
    .from('predictions')
    .delete()
    .eq('user_id', user.id)
    .eq('event_id', 1)
    .eq('kind', parsed.data.kind);
  if (dErr) {
    console.error('saveSection delete error:', dErr);
    return { error: 'No se pudo guardar tu pronóstico.' };
  }

  if (parsed.data.picks.length > 0) {
    const rows = parsed.data.picks.map((p) => ({
      user_id: user.id,
      event_id: 1,
      kind: parsed.data.kind,
      team_code: p.team_code ?? null,
      player_id: p.player_id ?? null,
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

export async function openEvent() {
  const guard = await requireAdmin();
  if ('error' in guard) return { error: guard.error };
  const supabase = createSupabaseServerClient();
  const { data: cur } = await supabase.from('events').select('status').eq('id', 1).single();
  if (!cur) return { error: 'Evento no encontrado.' };
  if (cur.status !== 'draft') return { error: `No se puede abrir desde status ${cur.status}.` };

  const { error } = await supabase
    .from('events')
    .update({ status: 'open', opens_at: new Date().toISOString() })
    .eq('id', 1);
  if (error) {
    console.error('openEvent update error:', error);
    return { error: 'No se pudo abrir el evento.' };
  }

  await supabase.from('admin_audit_log').insert({
    actor_user_id: guard.user.id,
    action: 'open_event',
    target_table: 'events',
    target_id: '1',
    before_data: { status: 'draft' },
    after_data: { status: 'open' },
  });

  revalidatePath('/eventos/1');
  return { ok: true as const };
}

export async function lockEvent() {
  const guard = await requireAdmin();
  if ('error' in guard) return { error: guard.error };
  const supabase = createSupabaseServerClient();
  const { data: cur } = await supabase.from('events').select('status').eq('id', 1).single();
  if (!cur) return { error: 'Evento no encontrado.' };
  if (cur.status !== 'open') return { error: `No se puede cerrar desde status ${cur.status}.` };

  const { error } = await supabase
    .from('events')
    .update({ status: 'locked', closes_at: new Date().toISOString() })
    .eq('id', 1);
  if (error) {
    console.error('lockEvent update error:', error);
    return { error: 'No se pudo cerrar el evento.' };
  }

  await supabase.from('admin_audit_log').insert({
    actor_user_id: guard.user.id,
    action: 'lock_event',
    target_table: 'events',
    target_id: '1',
    before_data: { status: 'open' },
    after_data: { status: 'locked' },
  });

  revalidatePath('/eventos/1');
  return { ok: true as const };
}
