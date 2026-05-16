/**
 * Asigna `group_code` a los 48 teams.
 *
 * Uso:
 *   npx tsx scripts/assign-groups.ts          # intenta FD API
 *   npx tsx scripts/assign-groups.ts --mock   # asigna aleatorio balanceado
 */

import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';

loadEnv({ path: resolve(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FD_API_KEY = process.env.FOOTBALL_DATA_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Faltan envs de Supabase en .env.local');
  process.exit(1);
}

const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'] as const;

async function fetchFromFD(): Promise<Map<string, string> | null> {
  if (!FD_API_KEY) return null;
  const res = await fetch('https://api.football-data.org/v4/competitions/WC/standings', {
    headers: { 'X-Auth-Token': FD_API_KEY },
  });
  if (!res.ok) {
    console.warn(`FD respondió ${res.status} — no se pudo obtener standings.`);
    return null;
  }
  const data = (await res.json()) as {
    standings: { group: string | null; table: { team: { tla: string } }[] }[];
  };
  const map = new Map<string, string>();
  for (const s of data.standings) {
    if (!s.group) continue;
    // s.group viene como "GROUP_A", "GROUP_B", ...
    const letter = s.group.replace(/^GROUP_/, '');
    if (!(GROUPS as readonly string[]).includes(letter)) continue;
    for (const row of s.table) {
      map.set(row.team.tla, letter);
    }
  }
  return map.size === 48 ? map : null;
}

function mockAssignment(codes: string[]): Map<string, string> {
  // Shuffle codes y asignar 4 por grupo
  const shuffled = [...codes].sort(() => Math.random() - 0.5);
  const map = new Map<string, string>();
  shuffled.forEach((code, i) => {
    map.set(code, GROUPS[Math.floor(i / 4)]);
  });
  return map;
}

async function main() {
  const useMock = process.argv.includes('--mock');

  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  const { data: teams, error } = await supabase.from('teams').select('code, name');
  if (error || !teams) {
    console.error('❌ Error leyendo teams:', error);
    process.exit(1);
  }
  if (teams.length !== 48) {
    console.warn(`⚠ Hay ${teams.length} teams (esperaba 48). Continúo igual.`);
  }

  let map: Map<string, string> | null = null;
  if (!useMock) {
    console.log('→ Intentando obtener grupos desde Football-Data.org...');
    map = await fetchFromFD();
    if (!map) {
      console.error('❌ FD no devolvió los 12 grupos completos.');
      console.error('   Probá de nuevo más tarde o usá --mock para asignación aleatoria de testing.');
      process.exit(1);
    }
    console.log(`✓ FD devolvió ${map.size} asignaciones.`);
  } else {
    console.log('→ Asignando grupos al azar (--mock).');
    map = mockAssignment(teams.map((t) => t.code));
  }

  // Update por grupo
  const updates = Array.from(map.entries()).map(([code, group_code]) =>
    supabase.from('teams').update({ group_code }).eq('code', code),
  );
  const results = await Promise.all(updates);
  const failed = results.filter((r) => r.error);
  if (failed.length > 0) {
    console.error(`❌ ${failed.length} updates fallaron. Primer error:`, failed[0].error);
    process.exit(1);
  }

  // Resumen
  for (const g of GROUPS) {
    const inGroup = Array.from(map.entries())
      .filter(([, gc]) => gc === g)
      .map(([code]) => code);
    console.log(`Grupo ${g}: ${inGroup.join(', ')}`);
  }
  console.log('✓ Listo.');
}

main().catch((err) => {
  console.error('❌', err);
  process.exit(1);
});
