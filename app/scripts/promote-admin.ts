/**
 * Promueve a un usuario a rol 'admin' en la tabla profiles.
 *
 * Uso:
 *   npx tsx scripts/promote-admin.ts gicornou@gmail.com
 *
 * Requiere en .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';

loadEnv({ path: resolve(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
  process.exit(1);
}

const email = process.argv[2];
if (!email) {
  console.error('❌ Uso: npx tsx scripts/promote-admin.ts <email>');
  process.exit(1);
}

async function main() {
  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  // 1. Buscar user_id en auth.users
  const { data: usersPage, error: listErr } = await supabase.auth.admin.listUsers();
  if (listErr) {
    console.error('❌ Error listando usuarios:', listErr);
    process.exit(1);
  }
  const user = usersPage.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) {
    console.error(`❌ No existe usuario con email ${email} en auth.users.`);
    process.exit(1);
  }
  console.log(`→ Usuario encontrado: ${user.email} (${user.id})`);

  // 2. Upsert profile (por si el trigger handle_new_user no corrió)
  const fallbackName =
    (user.user_metadata?.display_name as string | undefined) ??
    user.email?.split('@')[0] ??
    'admin';

  const { data, error } = await supabase
    .from('profiles')
    .upsert(
      { id: user.id, display_name: fallbackName, role: 'admin' },
      { onConflict: 'id' },
    )
    .select('id, display_name, role')
    .single();

  if (error) {
    console.error('❌ Error actualizando profile:', error);
    process.exit(1);
  }

  console.log(`✓ ${data.display_name ?? data.id} ahora es ${data.role}`);
}

main().catch((err) => {
  console.error('❌', err);
  process.exit(1);
});
