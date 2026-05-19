'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { requireRole } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase-server';

const ROLES = ['player', 'scorer', 'admin'] as const;

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

// ---------- updateUserRole ----------

const updateUserRoleSchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(ROLES),
});

export async function updateUserRole(input: z.infer<typeof updateUserRoleSchema>) {
  const parsed = updateUserRoleSchema.safeParse(input);
  if (!parsed.success) return { error: 'Payload inválido.' };

  const { user } = await requireRole(['admin']);

  // Self-demote prevention
  if (parsed.data.user_id === user.id && parsed.data.role !== 'admin') {
    return { error: 'No podés cambiar tu propio rol.' };
  }

  const supabase = createSupabaseServerClient();

  const { data: before } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', parsed.data.user_id)
    .single();

  const { error } = await supabase
    .from('profiles')
    .update({ role: parsed.data.role })
    .eq('id', parsed.data.user_id);
  if (error) {
    console.error('updateUserRole error:', error);
    return { error: 'No se pudo cambiar el rol.' };
  }

  await supabase.from('admin_audit_log').insert({
    actor_user_id: user.id,
    action: 'update_user_role',
    target_table: 'profiles',
    target_id: parsed.data.user_id,
    before_data: before ?? {},
    after_data: { role: parsed.data.role },
  });

  revalidatePath('/admin/users');
  return { savedAt: new Date().toISOString() };
}

// ---------- sendPasswordReset ----------

const resetSchema = z.object({ user_id: z.string().uuid() });

export async function sendPasswordReset(input: z.infer<typeof resetSchema>) {
  const parsed = resetSchema.safeParse(input);
  if (!parsed.success) return { error: 'Payload inválido.' };

  const { user } = await requireRole(['admin']);
  const admin = adminClient();

  // Lookup email
  const { data: target, error: gErr } = await admin.auth.admin.getUserById(parsed.data.user_id);
  if (gErr || !target?.user?.email) {
    console.error('sendPasswordReset getUserById error:', gErr);
    return { error: 'Usuario sin email.' };
  }
  const email = target.user.email;

  // Send reset email
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? '';
  const { error } = await admin.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/callback?next=/reset-password`,
  });
  if (error) {
    console.error('sendPasswordReset error:', error);
    if (error.message?.toLowerCase().includes('rate limit')) {
      return { error: 'Rate limit del provider. Esperá un rato (~1 hora).' };
    }
    return { error: 'No se pudo enviar el reset.' };
  }

  const supabase = createSupabaseServerClient();
  await supabase.from('admin_audit_log').insert({
    actor_user_id: user.id,
    action: 'send_password_reset',
    target_table: 'auth.users',
    target_id: parsed.data.user_id,
    after_data: { email },
  });

  return { ok: true as const };
}
