/**
 * Setea la contraseña de un usuario existente vía Supabase Admin API.
 * Útil para usuarios que se registraron con magic link y no tienen password.
 *
 * Uso:
 *   npx tsx scripts/set-password.ts <email> <password>
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

const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error('❌ Uso: npx tsx scripts/set-password.ts <email> <password>');
  process.exit(1);
}
if (password.length < 8) {
  console.error('❌ La contraseña debe tener al menos 8 caracteres.');
  process.exit(1);
}

async function main() {
  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

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

  const { error } = await supabase.auth.admin.updateUserById(user.id, { password });
  if (error) {
    console.error('❌ Error seteando password:', error);
    process.exit(1);
  }

  console.log(`✓ Password actualizada para ${email}`);
}

main().catch((err) => {
  console.error('❌', err);
  process.exit(1);
});
