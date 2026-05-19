import { createClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { requireUser } from '@/lib/auth';
import type { Profile } from '@/lib/database.types';
import { UsersEditor, type UserRow } from './users-editor';

export default async function AdminUsersPage() {
  const { user } = await requireUser();

  // profiles via cookies-based client (RLS allows admin)
  const supabase = createSupabaseServerClient();
  const profilesRes = await supabase.from('profiles').select('*').order('created_at', { ascending: true });
  const profiles = (profilesRes.data ?? []) as Profile[];

  // auth.users via admin client
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { data: usersPage } = await adminClient.auth.admin.listUsers();
  const emailById = new Map((usersPage?.users ?? []).map((u) => [u.id, u.email ?? '']));

  const rows: UserRow[] = profiles.map((p) => ({
    id: p.id,
    display_name: p.display_name,
    avatar_url: p.avatar_url,
    email: emailById.get(p.id) ?? '—',
    role: p.role,
    created_at: p.created_at,
  }));

  return <UsersEditor users={rows} currentUserId={user.id} />;
}
