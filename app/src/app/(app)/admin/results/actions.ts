'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase-server';

// Carga manual del resultado de un partido de bracket.
// El scoring sólo lee winner_team_code (ganador) y outcome_pre_penalties
// (resultado en 90'/120'); went_to_penalties se deriva del outcome.
const setSchema = z.object({
  match_id: z.number().int().positive(),
  outcome: z.enum(['home', 'draw', 'away']),
  winner_team_code: z.string().min(1),
});

export async function setMatchResult(input: z.infer<typeof setSchema>) {
  const parsed = setSchema.safeParse(input);
  if (!parsed.success) return { error: 'Payload inválido.' };
  const { match_id, outcome, winner_team_code } = parsed.data;

  const { user } = await requireRole(['admin']);
  const supabase = createSupabaseServerClient();

  const { data: match, error: mErr } = await supabase
    .from('matches')
    .select(
      'home_team_code, away_team_code, winner_team_code, outcome_pre_penalties, went_to_penalties',
    )
    .eq('id', match_id)
    .single();
  if (mErr || !match) return { error: 'Match no encontrado.' };
  if (!match.home_team_code || !match.away_team_code) {
    return { error: 'El partido todavía no tiene los dos equipos.' };
  }

  // Coherencia ganador ↔ resultado.
  if (winner_team_code !== match.home_team_code && winner_team_code !== match.away_team_code) {
    return { error: 'El ganador no es ninguno de los dos equipos del partido.' };
  }
  if (outcome === 'home' && winner_team_code !== match.home_team_code) {
    return { error: 'Resultado "gana local" pero el ganador no es el equipo local.' };
  }
  if (outcome === 'away' && winner_team_code !== match.away_team_code) {
    return { error: 'Resultado "gana visitante" pero el ganador no es el visitante.' };
  }

  const before = {
    winner_team_code: match.winner_team_code,
    outcome_pre_penalties: match.outcome_pre_penalties,
    went_to_penalties: match.went_to_penalties,
  };
  const patch = {
    winner_team_code,
    outcome_pre_penalties: outcome,
    went_to_penalties: outcome === 'draw',
  };

  const { error: uErr } = await supabase.from('matches').update(patch).eq('id', match_id);
  if (uErr) {
    console.error('setMatchResult update error:', uErr);
    return { error: 'No se pudo guardar el resultado.' };
  }

  // Propaga el ganador al slot hijo (sólo llena si está vacío).
  const { error: pErr } = await supabase.rpc('fn_propagate_winner' as never, {
    p_match_id: match_id,
  });
  if (pErr) console.error('fn_propagate_winner error:', pErr);

  await supabase.from('admin_audit_log').insert({
    actor_user_id: user.id,
    action: 'set_match_result',
    target_table: 'matches',
    target_id: String(match_id),
    before_data: before,
    after_data: patch,
  });

  revalidatePath('/admin/results');
  revalidatePath('/admin/matches');
  return { savedAt: new Date().toISOString(), propagated: !pErr };
}

// Limpia el resultado (no des-propaga el slot hijo: si ya se llenó, corregilo a mano).
const clearSchema = z.object({ match_id: z.number().int().positive() });

export async function clearMatchResult(input: z.infer<typeof clearSchema>) {
  const parsed = clearSchema.safeParse(input);
  if (!parsed.success) return { error: 'Payload inválido.' };

  const { user } = await requireRole(['admin']);
  const supabase = createSupabaseServerClient();

  const { data: before } = await supabase
    .from('matches')
    .select('winner_team_code, outcome_pre_penalties, went_to_penalties')
    .eq('id', parsed.data.match_id)
    .single();

  const { error } = await supabase
    .from('matches')
    .update({ winner_team_code: null, outcome_pre_penalties: null, went_to_penalties: false })
    .eq('id', parsed.data.match_id);
  if (error) {
    console.error('clearMatchResult error:', error);
    return { error: 'No se pudo limpiar el resultado.' };
  }

  await supabase.from('admin_audit_log').insert({
    actor_user_id: user.id,
    action: 'clear_match_result',
    target_table: 'matches',
    target_id: String(parsed.data.match_id),
    before_data: before ?? {},
    after_data: {},
  });

  revalidatePath('/admin/results');
  revalidatePath('/admin/matches');
  return { savedAt: new Date().toISOString() };
}
