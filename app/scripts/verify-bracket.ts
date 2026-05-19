/**
 * Imprime el árbol del bracket local para comparar contra el bracket FIFA oficial.
 *
 * Uso:
 *   npm run db:verify-bracket
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
  console.error('❌ Faltan envs en .env.local');
  process.exit(1);
}

interface MatchRow {
  bracket_slot: string;
  stage: string;
  parent_slot_home: string | null;
  parent_slot_away: string | null;
}

async function main() {
  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase
    .from('matches')
    .select('bracket_slot, stage, parent_slot_home, parent_slot_away');
  if (error) {
    console.error('❌ Error leyendo matches:', error);
    process.exit(1);
  }
  const matches = (data ?? []) as MatchRow[];
  const bySlot = new Map(matches.map((m) => [m.bracket_slot, m]));

  function printTree(slot: string, depth: number): void {
    const m = bySlot.get(slot);
    if (!m) {
      console.log(`${'  '.repeat(depth)}- ${slot} (no encontrado)`);
      return;
    }
    const parents =
      m.parent_slot_home || m.parent_slot_away
        ? ` ← winner(${m.parent_slot_home ?? '—'}) + winner(${m.parent_slot_away ?? '—'})`
        : '';
    console.log(`${'  '.repeat(depth)}- ${slot}${parents}`);
    if (m.parent_slot_home) printTree(m.parent_slot_home, depth + 1);
    if (m.parent_slot_away) printTree(m.parent_slot_away, depth + 1);
  }

  console.log('=== Árbol del bracket (raíz: FINAL) ===\n');
  printTree('FINAL', 0);

  console.log('\n=== SQL para regenerar parent_slot (si necesitás corregir) ===\n');
  for (const m of matches) {
    if (m.parent_slot_home || m.parent_slot_away) {
      console.log(
        `update matches set parent_slot_home=${m.parent_slot_home ? `'${m.parent_slot_home}'` : 'null'}, parent_slot_away=${m.parent_slot_away ? `'${m.parent_slot_away}'` : 'null'} where bracket_slot='${m.bracket_slot}';`,
      );
    }
  }
  console.log(
    '\n⚠ Compará el árbol arriba contra https://www.fifa.com/fifaplus/en/tournaments/mens/worldcup/canadamexicousa2026/scores-fixtures',
  );
}

main().catch((err) => {
  console.error('❌', err);
  process.exit(1);
});
