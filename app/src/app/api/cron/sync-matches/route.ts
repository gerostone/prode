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

    // Fase A — Auto-set closes_at para Eventos 2/3/4 desde matches.scheduled_at
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const stageByEvent: Record<number, string> = { 2: 'r32', 3: 'r16', 4: 'qf' };
    for (const [eventIdStr, stage] of Object.entries(stageByEvent)) {
      const eventId = Number(eventIdStr);
      const { data: minScheduled } = await supabase
        .from('matches')
        .select('scheduled_at')
        .eq('stage', stage)
        .not('scheduled_at', 'is', null)
        .order('scheduled_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (minScheduled?.scheduled_at) {
        await supabase
          .from('events')
          .update({ closes_at: minScheduled.scheduled_at })
          .eq('id', eventId)
          .in('status', ['draft', 'open']);
      }
    }

    // Fase B — Auto-lock de eventos vencidos
    const { data: openEvents } = await supabase
      .from('events')
      .select('id, closes_at')
      .eq('status', 'open')
      .not('closes_at', 'is', null);

    const now = new Date().toISOString();
    const lockedEventIds: number[] = [];

    for (const e of openEvents ?? []) {
      if (e.closes_at && e.closes_at <= now) {
        const { error: lErr } = await supabase
          .from('events')
          .update({ status: 'locked' })
          .eq('id', e.id)
          .eq('status', 'open');
        if (!lErr) {
          lockedEventIds.push(e.id);
          await supabase.from('admin_audit_log').insert({
            actor_user_id: null,
            action: 'auto_lock_event',
            target_table: 'events',
            target_id: String(e.id),
            before_data: { status: 'open' },
            after_data: { status: 'locked', triggered_by: 'cron' },
          });
        }
      }
    }

    return NextResponse.json({ ok: true, syncResult: result, lockedEventIds });
  } catch (err) {
    console.error('cron sync error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
