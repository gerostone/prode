/**
 * Lista los partidos eliminatorios que devuelve Football-Data.org para el Mundial.
 * Útil para mapear `matches.external_id` desde /admin/sync.
 *
 * Uso:
 *   npm run db:list-fd-matches
 *
 * Requiere en .env.local:
 *   FOOTBALL_DATA_API_KEY
 */

import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';

loadEnv({ path: resolve(process.cwd(), '.env.local') });

const FD_API_KEY = process.env.FOOTBALL_DATA_API_KEY;
if (!FD_API_KEY) {
  console.error('❌ Falta FOOTBALL_DATA_API_KEY en .env.local');
  process.exit(1);
}

const STAGE_MAP: Record<string, string> = {
  ROUND_OF_32: 'r32',
  LAST_16: 'r16',
  QUARTER_FINALS: 'qf',
  SEMI_FINALS: 'sf',
  FINAL: 'final',
};

interface FDMatch {
  id: number;
  utcDate: string;
  status: string;
  stage: string;
  homeTeam: { tla: string | null; name?: string };
  awayTeam: { tla: string | null; name?: string };
}

async function main() {
  console.log('→ Trayendo matches del Mundial desde Football-Data.org...\n');
  const res = await fetch('https://api.football-data.org/v4/competitions/WC/matches', {
    headers: { 'X-Auth-Token': FD_API_KEY! },
  });
  if (!res.ok) {
    console.error(`❌ FD ${res.status}: ${await res.text()}`);
    process.exit(1);
  }
  const data = (await res.json()) as { matches: FDMatch[] };
  const elim = data.matches.filter((m) => m.stage in STAGE_MAP);

  if (elim.length === 0) {
    console.log('FD no devolvió partidos eliminatorios todavía.');
    return;
  }

  // Sort por stage (r32→final) y luego por fecha
  const STAGE_ORDER = ['ROUND_OF_32', 'LAST_16', 'QUARTER_FINALS', 'SEMI_FINALS', 'FINAL'];
  elim.sort((a, b) => {
    const sa = STAGE_ORDER.indexOf(a.stage);
    const sb = STAGE_ORDER.indexOf(b.stage);
    if (sa !== sb) return sa - sb;
    return a.utcDate.localeCompare(b.utcDate);
  });

  console.log(`Total: ${elim.length} partidos eliminatorios\n`);
  console.log('FD id       | stage          | date (UTC)        | home vs away');
  console.log('------------|----------------|-------------------|---------------------------');
  for (const m of elim) {
    const date = m.utcDate.slice(0, 16).replace('T', ' ');
    const home = m.homeTeam.tla ?? '???';
    const away = m.awayTeam.tla ?? '???';
    const stage = m.stage.padEnd(14);
    console.log(`${String(m.id).padEnd(11)} | ${stage} | ${date} | ${home} vs ${away}`);
  }

  // Sugerir mapping al bracket local
  console.log('\nMapeo sugerido (verificá contra la estructura oficial del bracket FIFA 2026):');
  const localOrder = [
    'R16-01','R16-02','R16-03','R16-04','R16-05','R16-06','R16-07','R16-08',
    'QF-01','QF-02','QF-03','QF-04',
    'SF-01','SF-02',
    'FINAL',
  ];
  const byStage: Record<string, FDMatch[]> = {};
  for (const m of elim) {
    (byStage[m.stage] ??= []).push(m);
  }
  const stageToLocals: Record<string, string[]> = {
    LAST_16: ['R16-01','R16-02','R16-03','R16-04','R16-05','R16-06','R16-07','R16-08'],
    QUARTER_FINALS: ['QF-01','QF-02','QF-03','QF-04'],
    SEMI_FINALS: ['SF-01','SF-02'],
    FINAL: ['FINAL'],
    ROUND_OF_32: ['R32-01','R32-02','R32-03','R32-04','R32-05','R32-06','R32-07','R32-08','R32-09','R32-10','R32-11','R32-12','R32-13','R32-14','R32-15','R32-16'],
  };
  for (const stage of STAGE_ORDER) {
    const fdMatches = byStage[stage] ?? [];
    const localSlots = stageToLocals[stage] ?? [];
    if (fdMatches.length === 0) continue;
    for (let i = 0; i < fdMatches.length && i < localSlots.length; i++) {
      const m = fdMatches[i];
      const home = m.homeTeam.tla ?? '???';
      const away = m.awayTeam.tla ?? '???';
      console.log(`  ${localSlots[i].padEnd(8)} ← FD ${m.id}  (${home} vs ${away})`);
    }
  }
  console.log('\n⚠ Ojo: el orden de FD no necesariamente coincide con el bracket oficial.');
  console.log('   Verificá contra la estructura FIFA antes de pegar en /admin/sync.');
}

main().catch((err) => {
  console.error('❌', err);
  process.exit(1);
});
