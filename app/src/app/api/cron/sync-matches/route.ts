import { NextResponse } from 'next/server';
import { syncFromFD } from '@/lib/sync-fd';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // Vercel inyecta este header automáticamente para cron jobs autenticados con CRON_SECRET.
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json(
      { error: 'CRON_SECRET no configurado en el server.' },
      { status: 500 },
    );
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const fdApiKey = process.env.FOOTBALL_DATA_API_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!fdApiKey || !supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json(
      { error: 'Faltan envs (FD/Supabase) en el server.' },
      { status: 500 },
    );
  }

  try {
    const result = await syncFromFD({ fdApiKey, supabaseUrl, supabaseServiceKey });
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    console.error('cron sync error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
