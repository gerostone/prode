/**
 * Sync local de matches desde Football-Data.org.
 *
 * Uso:
 *   npm run db:sync-matches
 *
 * Requiere envs en .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   FOOTBALL_DATA_API_KEY
 */

import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { syncFromFD } from '../src/lib/sync-fd';

loadEnv({ path: resolve(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FD_API_KEY = process.env.FOOTBALL_DATA_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !FD_API_KEY) {
  console.error('❌ Faltan envs en .env.local');
  process.exit(1);
}

async function main() {
  console.log('→ Sincronizando matches desde Football-Data.org...');
  const result = await syncFromFD({
    fdApiKey: FD_API_KEY!,
    supabaseUrl: SUPABASE_URL!,
    supabaseServiceKey: SUPABASE_SERVICE_ROLE_KEY!,
  });
  console.log(`✓ Resultado: ${result.inserted} nuevos en staging, ${result.skipped} sin cambios, ${result.unmapped} sin external_id mapeado.`);
  if (result.errors.length > 0) {
    console.error(`⚠ ${result.errors.length} errores:`);
    for (const e of result.errors) {
      console.error(`  ${e.external_id}: ${e.message}`);
    }
  }
}

main().catch((err) => {
  console.error('❌', err);
  process.exit(1);
});
