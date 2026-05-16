// Helpers de autenticación + role-check para Server Components y Server Actions.
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import type { Profile, UserRole } from '@/lib/database.types';

export async function getUserAndProfile() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { user: null, profile: null };

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single<Profile>();

  return { user, profile };
}

export async function requireUser() {
  const { user, profile } = await getUserAndProfile();
  if (!user) redirect('/login');
  return { user, profile };
}

export async function requireRole(allowed: UserRole[]) {
  const { user, profile } = await requireUser();
  if (!profile || !allowed.includes(profile.role)) {
    redirect('/dashboard'); // sin permisos → vuelta al inicio
  }
  return { user, profile };
}
