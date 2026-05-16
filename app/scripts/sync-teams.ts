/**
 * Sync inicial de equipos clasificados al Mundial 2026.
 *
 * Llama a Football-Data.org (plan free, 10 req/min) y popula la tabla
 * `teams` de Supabase con:
 *   - code (TLA, 3 letras)
 *   - name
 *   - crest_url
 *   - external_id (id en Football-Data.org)
 *
 * NO popula group_code ni fifa_ranking todavía — esos los completa el
 * admin desde /admin/teams una vez confirmado el sorteo.
 *
 * Uso (desde la carpeta app/):
 *   npx tsx scripts/sync-teams.ts
 *
 * Requiere variables en .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   ← service_role, NO la anon key
 *   FOOTBALL_DATA_API_KEY
 */

import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';

loadEnv({ path: resolve(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FD_API_KEY = process.env.FOOTBALL_DATA_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !FD_API_KEY) {
  console.error('❌ Faltan variables en .env.local:');
  console.error('   NEXT_PUBLIC_SUPABASE_URL    →', SUPABASE_URL ? 'ok' : 'MISSING');
  console.error('   SUPABASE_SERVICE_ROLE_KEY   →', SUPABASE_SERVICE_ROLE_KEY ? 'ok' : 'MISSING');
  console.error('   FOOTBALL_DATA_API_KEY       →', FD_API_KEY ? 'ok' : 'MISSING');
  process.exit(1);
}

// El competition code para World Cup en Football-Data.org es 'WC'.
const FD_BASE = 'https://api.football-data.org/v4';
const COMPETITION_CODE = 'WC';

type FDTeam = {
  id: number;
  name: string;
  shortName: string | null;
  tla: string;        // Three Letter Abbreviation, p.ej. "ARG"
  crest: string;      // URL de la bandera/escudo
};

type FDTeamsResponse = {
  competition: { id: number; code: string; name: string };
  season: { id: number; startDate: string; endDate: string };
  teams: FDTeam[];
};

async function fetchTeams(): Promise<FDTeam[]> {
  const url = `${FD_BASE}/competitions/${COMPETITION_CODE}/teams`;
  console.log(`→ Trayendo equipos de ${url}`);

  const res = await fetch(url, {
    headers: { 'X-Auth-Token': FD_API_KEY! },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Football-Data devolvió ${res.status}: ${text}`);
  }

  const data = (await res.json()) as FDTeamsResponse;
  console.log(
    `✓ Recibidos ${data.teams.length} equipos de ${data.competition.name} (temporada ${data.season.startDate.slice(0, 4)})`,
  );
  return data.teams;
}

async function main() {
  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  const teams = await fetchTeams();

  // Upsert por tla (= code)
  const rows = teams.map((t) => ({
    code: t.tla,
    name: t.name,
    crest_url: t.crest,
    external_id: t.id,
  }));

  console.log(`→ Upsertando ${rows.length} equipos en Supabase…`);
  const { error, count } = await supabase
    .from('teams')
    .upsert(rows, { onConflict: 'code', count: 'exact' });

  if (error) {
    console.error('❌ Error upsertando teams:', error);
    process.exit(1);
  }

  console.log(`✓ Listo. Filas afectadas: ${count ?? rows.length}`);
  console.log('');
  console.log('Próximo paso: completar group_code y fifa_ranking desde');
  console.log('  /admin/teams  (UI que se construye en Fase 3)');
  console.log('o directamente en el SQL Editor de Supabase con UPDATEs puntuales.');
}

main().catch((err) => {
  console.error('❌', err);
  process.exit(1);
});
