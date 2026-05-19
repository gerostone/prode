/**
 * Spec E2E — Fase 7 Pulido pre-Mundial
 *
 * Plan: app/tests/e2e/plans/fase-7-pulido-test-plan.md
 * Cubre: migration 0010, cron auto-set closes_at, cron auto-lock, header mobile,
 * card Próximo cierre en /dashboard, riesgo precisión cron 1x/día.
 *
 * Estado DB requerido (ver sección "Estado de DB requerido" del plan):
 *  - Migrations 0001..0010 aplicadas.
 *  - Seeds 0004, 0005, 0009 activos.
 *  - Usuario admin: gicornou@gmail.com (seed 0005, password tomado de env ADMIN_TEST_PASSWORD).
 *  - Usuario player: player-test@example.com (creado por el test si no existe,
 *    password tomado de env PLAYER_TEST_PASSWORD — fallback "Player123!").
 *  - .env.local del proyecto provee NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *    CRON_SECRET. webServer (npm run dev) los inyecta al server.
 *
 * Convención de cleanup: cada test que muta `events`, `matches` o `admin_audit_log`
 * restaura estado original en `afterEach`. Bracket_slots usan prefijo *-TEST-*.
 */

import { test, expect, request as pwRequest, type APIRequestContext } from "@playwright/test";

// ---------------------------------------------------------------------------
// Helpers de entorno y Supabase REST (no son POM — son utilitarios mínimos
// para no repetir headers en cada test).
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const CRON_SECRET = process.env.CRON_SECRET ?? "";
const PLAYER_EMAIL = "player-test@example.com";
const PLAYER_PASSWORD = process.env.PLAYER_TEST_PASSWORD ?? "Player123!";
const ADMIN_EMAIL = "gicornou@gmail.com";
const ADMIN_PASSWORD = process.env.ADMIN_TEST_PASSWORD ?? "";

function serviceHeaders() {
  return {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
}

/**
 * Ejecuta SQL arbitrario via la RPC `exec_sql` si existe; si no, usa updates
 * granulares a través del REST de PostgREST. Mantenemos los snippets de SQL
 * literales del plan en strings y los traducimos a operaciones REST.
 */
async function dbUpdateEvent(
  api: APIRequestContext,
  id: number,
  patch: Record<string, unknown>,
) {
  const r = await api.patch(`${SUPABASE_URL}/rest/v1/events?id=eq.${id}`, {
    headers: serviceHeaders(),
    data: patch,
  });
  expect(r.ok(), `dbUpdateEvent(${id}) HTTP ${r.status()}`).toBeTruthy();
}

async function dbGetEvent(api: APIRequestContext, id: number) {
  const r = await api.get(
    `${SUPABASE_URL}/rest/v1/events?id=eq.${id}&select=id,name,status,closes_at`,
    { headers: serviceHeaders() },
  );
  expect(r.ok(), `dbGetEvent(${id}) HTTP ${r.status()}`).toBeTruthy();
  const rows = await r.json();
  return rows[0] as { id: number; name: string; status: string; closes_at: string | null };
}

async function dbUpsertMatch(
  api: APIRequestContext,
  row: { stage: string; bracket_slot: string; scheduled_at: string | null },
) {
  // Upsert por bracket_slot (unique).
  const r = await api.post(`${SUPABASE_URL}/rest/v1/matches`, {
    headers: { ...serviceHeaders(), Prefer: "resolution=merge-duplicates,return=representation" },
    data: row,
  });
  expect(r.ok(), `dbUpsertMatch(${row.bracket_slot}) HTTP ${r.status()} body=${await r.text()}`).toBeTruthy();
}

async function dbDeleteMatches(api: APIRequestContext, bracketSlotLike: string) {
  const r = await api.delete(
    `${SUPABASE_URL}/rest/v1/matches?bracket_slot=like.${encodeURIComponent(bracketSlotLike)}`,
    { headers: serviceHeaders() },
  );
  expect(r.ok(), `dbDeleteMatches HTTP ${r.status()}`).toBeTruthy();
}

async function dbDeleteAuditLog(api: APIRequestContext, targetId: string) {
  const r = await api.delete(
    `${SUPABASE_URL}/rest/v1/admin_audit_log?action=eq.auto_lock_event&target_id=eq.${targetId}`,
    { headers: serviceHeaders() },
  );
  expect(r.ok(), `dbDeleteAuditLog HTTP ${r.status()}`).toBeTruthy();
}

async function dbGetAuditLogs(api: APIRequestContext, targetId: string) {
  const r = await api.get(
    `${SUPABASE_URL}/rest/v1/admin_audit_log?action=eq.auto_lock_event&target_id=eq.${targetId}&select=*`,
    { headers: serviceHeaders() },
  );
  expect(r.ok(), `dbGetAuditLogs HTTP ${r.status()}`).toBeTruthy();
  return (await r.json()) as Array<{
    actor_user_id: string | null;
    action: string;
    target_table: string;
    target_id: string;
    before_data: { status: string };
    after_data: { status: string; triggered_by?: string };
    created_at: string;
  }>;
}

async function runCron(api: APIRequestContext, withAuth = true) {
  const headers: Record<string, string> = withAuth
    ? { Authorization: `Bearer ${CRON_SECRET}` }
    : {};
  return api.get("http://localhost:3000/api/cron/sync-matches", { headers });
}

/**
 * Asegura que existe el player de prueba. Usa la API Admin de Supabase Auth
 * (service_role) para no depender de signup público. Idempotente.
 */
async function ensurePlayerTestUser(api: APIRequestContext) {
  // Busca al usuario por email via Admin API.
  const list = await api.get(
    `${SUPABASE_URL}/auth/v1/admin/users?per_page=200`,
    { headers: serviceHeaders() },
  );
  expect(list.ok()).toBeTruthy();
  const body = (await list.json()) as { users?: Array<{ id: string; email: string }> };
  const existing = body.users?.find((u) => u.email === PLAYER_EMAIL);
  if (existing) return existing.id;

  const create = await api.post(`${SUPABASE_URL}/auth/v1/admin/users`, {
    headers: serviceHeaders(),
    data: { email: PLAYER_EMAIL, password: PLAYER_PASSWORD, email_confirm: true },
  });
  expect(create.ok(), `ensurePlayerTestUser HTTP ${create.status()} body=${await create.text()}`).toBeTruthy();
  const created = (await create.json()) as { id: string };
  return created.id;
}

/**
 * Login programático: navega a /login y completa el form. Devuelve cuando la
 * página post-login (header con nav) está visible — Next App Router setea la
 * cookie de Supabase via server action.
 */
async function loginViaForm(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/contrase/i).fill(password);
  await page.getByRole("button", { name: /entrar|ingresar|login/i }).click();
  await page.waitForURL(/\/dashboard/);
}

// Skips condicionales si faltan envs (evita falsos negativos en CI sin secretos).
const HAS_SUPABASE = SUPABASE_URL && SUPABASE_SERVICE_KEY && SUPABASE_ANON_KEY;
const HAS_CRON = HAS_SUPABASE && CRON_SECRET;
const HAS_ADMIN_PASSWORD = !!ADMIN_PASSWORD;

// ===========================================================================
// [s4-migration-0010] Sección 4 — Migration 0010 actor_user_id nullable
// ===========================================================================
test.describe("[s4-migration-0010] Migration 0010 — admin_audit_log.actor_user_id nullable", () => {
  test.skip(!HAS_SUPABASE, "Faltan envs de Supabase para este describe");

  let api: APIRequestContext;

  test.beforeEach(async () => {
    api = await pwRequest.newContext();
    // Pre-cleanup por si quedó del run anterior.
    await dbDeleteAuditLog(api, "1");
  });

  test.afterEach(async () => {
    await dbDeleteAuditLog(api, "1");
    await api.dispose();
  });

  test("Given migration 0010 aplicada, When inserto audit log con actor_user_id=null via service role, Then persiste con actor_user_id IS NULL y action='auto_lock_event'", async () => {
    // Verifica el contrato de schema directamente — no necesita UI.
    // Si la migration está mal el insert vuelve con error 23502 (not null violation).
    const insert = await api.post(`${SUPABASE_URL}/rest/v1/admin_audit_log`, {
      headers: serviceHeaders(),
      data: {
        actor_user_id: null,
        action: "auto_lock_event",
        target_table: "events",
        target_id: "1",
        before_data: { status: "open" },
        after_data: { status: "locked", triggered_by: "cron" },
      },
    });
    expect(insert.status(), `insert body=${await insert.text()}`).toBe(201);

    const rows = await dbGetAuditLogs(api, "1");
    expect(rows).toHaveLength(1);
    expect(rows[0].actor_user_id).toBeNull();
    expect(rows[0].action).toBe("auto_lock_event");
  });
});

// ===========================================================================
// [s5-cron-auto-set] Sección 5 Fase A — Auto-set closes_at desde matches
// ===========================================================================
test.describe("[s5-cron-auto-set] Cron Fase A — Auto-set events.closes_at desde min(matches.scheduled_at)", () => {
  test.skip(!HAS_CRON, "Faltan envs de Supabase / CRON_SECRET");

  let api: APIRequestContext;

  test.beforeEach(async () => {
    api = await pwRequest.newContext();
  });

  test.afterEach(async () => {
    await api.dispose();
  });

  test("Given evento 2 en draft sin closes_at y matches R32-TEST sembrados, When corre el cron, Then events.id=2 .closes_at toma el mínimo scheduled_at", async () => {
    // Setup específico del AC 3.
    await dbUpdateEvent(api, 2, { status: "draft", closes_at: null });
    await dbUpsertMatch(api, { stage: "r32", bracket_slot: "R32-TEST-A", scheduled_at: "2026-06-15T18:00:00Z" });
    await dbUpsertMatch(api, { stage: "r32", bracket_slot: "R32-TEST-B", scheduled_at: "2026-06-12T15:00:00Z" });

    try {
      const res = await runCron(api);
      // El sync FD interno puede fallar (no estamos mockeando) y devolver 500.
      // Lo aceptamos: la Fase A está dentro del try, y si syncFromFD tira,
      // el cron vuelve 500 sin hacer Fase A → este test fallaría correctamente.
      expect(res.status(), `cron status=${res.status()} body=${await res.text()}`).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);

      const ev = await dbGetEvent(api, 2);
      // Postgres normaliza timestamps con offset — comparamos con Date para tolerar formato.
      expect(new Date(ev.closes_at!).toISOString()).toBe("2026-06-12T15:00:00.000Z");
      expect(ev.status).toBe("draft");
    } finally {
      await dbDeleteMatches(api, "R32-TEST-%");
      await dbUpdateEvent(api, 2, { closes_at: null });
    }
  });

  test("Given eventos 3 (R16) y 4 (QF) en draft sin closes_at, When corre el cron, Then ambos toman el min(scheduled_at) de su stage", async () => {
    await dbUpdateEvent(api, 3, { status: "draft", closes_at: null });
    await dbUpdateEvent(api, 4, { status: "draft", closes_at: null });
    await dbUpsertMatch(api, { stage: "r16", bracket_slot: "R16-TEST-A", scheduled_at: "2026-06-30T20:00:00Z" });
    await dbUpsertMatch(api, { stage: "qf", bracket_slot: "QF-TEST-A", scheduled_at: "2026-07-05T16:00:00Z" });

    try {
      const res = await runCron(api);
      expect(res.status()).toBe(200);

      const ev3 = await dbGetEvent(api, 3);
      const ev4 = await dbGetEvent(api, 4);
      expect(new Date(ev3.closes_at!).toISOString()).toBe("2026-06-30T20:00:00.000Z");
      expect(new Date(ev4.closes_at!).toISOString()).toBe("2026-07-05T16:00:00.000Z");
    } finally {
      await dbDeleteMatches(api, "R16-TEST-%");
      await dbDeleteMatches(api, "QF-TEST-%");
      await dbUpdateEvent(api, 3, { closes_at: null });
      await dbUpdateEvent(api, 4, { closes_at: null });
    }
  });

  test("Given evento 1 en open con closes_at fijo y match R32 sembrado, When corre el cron, Then evento 1 NO recibe closes_at del cron (stageByEvent no lo incluye)", async () => {
    await dbUpdateEvent(api, 1, { status: "open", closes_at: "2026-06-10T20:00:00Z" });
    await dbUpsertMatch(api, { stage: "r32", bracket_slot: "R32-TEST-Z", scheduled_at: "2026-06-12T00:00:00Z" });

    try {
      const res = await runCron(api);
      expect(res.status()).toBe(200);

      const ev = await dbGetEvent(api, 1);
      expect(new Date(ev.closes_at!).toISOString()).toBe("2026-06-10T20:00:00.000Z");
    } finally {
      await dbDeleteMatches(api, "R32-TEST-Z");
      await dbUpdateEvent(api, 1, { status: "draft", closes_at: null });
    }
  });

  test("Given evento 2 en locked con closes_at conocido y match R32 sembrado, When corre el cron, Then events.id=2 .closes_at NO se sobreescribe (filtro .in('status', ['draft','open']) excluye locked)", async () => {
    await dbUpdateEvent(api, 2, { status: "locked", closes_at: "2026-06-01T00:00:00Z" });
    await dbUpsertMatch(api, { stage: "r32", bracket_slot: "R32-TEST-LOCK", scheduled_at: "2026-06-15T18:00:00Z" });

    try {
      const res = await runCron(api);
      expect(res.status()).toBe(200);

      const ev = await dbGetEvent(api, 2);
      expect(new Date(ev.closes_at!).toISOString()).toBe("2026-06-01T00:00:00.000Z");
    } finally {
      await dbDeleteMatches(api, "R32-TEST-LOCK");
      await dbUpdateEvent(api, 2, { status: "draft", closes_at: null });
    }
  });

  test("Given evento 4 (QF) en draft con closes_at fijo y stage QF sin matches con scheduled_at, When corre el cron, Then events.id=4 .closes_at queda intacto", async () => {
    // Usamos stage QF (Evento 4) que en el seed 0009 puede no tener scheduled_at todavía
    // según el plan. Snapshot defensivo: nullear scheduled_at de QF para garantizarlo.
    const snapshotResp = await api.get(
      `${SUPABASE_URL}/rest/v1/matches?stage=eq.qf&select=bracket_slot,scheduled_at&scheduled_at=not.is.null`,
      { headers: serviceHeaders() },
    );
    const snapshot = (await snapshotResp.json()) as Array<{ bracket_slot: string; scheduled_at: string }>;
    // Nullear todos los QF temporalmente.
    await api.patch(`${SUPABASE_URL}/rest/v1/matches?stage=eq.qf`, {
      headers: serviceHeaders(),
      data: { scheduled_at: null },
    });
    await dbUpdateEvent(api, 4, { status: "draft", closes_at: "2026-06-08T12:00:00Z" });

    try {
      const res = await runCron(api);
      expect(res.status()).toBe(200);

      const ev = await dbGetEvent(api, 4);
      expect(new Date(ev.closes_at!).toISOString()).toBe("2026-06-08T12:00:00.000Z");
    } finally {
      // Restaurar snapshot QF.
      for (const row of snapshot) {
        await api.patch(
          `${SUPABASE_URL}/rest/v1/matches?bracket_slot=eq.${encodeURIComponent(row.bracket_slot)}`,
          { headers: serviceHeaders(), data: { scheduled_at: row.scheduled_at } },
        );
      }
      await dbUpdateEvent(api, 4, { closes_at: null });
    }
  });
});

// ===========================================================================
// [s5-cron-auto-lock] Sección 5 Fase B — Auto-lock de eventos vencidos
// ===========================================================================
test.describe("[s5-cron-auto-lock] Cron Fase B — Auto-lock eventos open con closes_at vencido", () => {
  test.skip(!HAS_CRON, "Faltan envs de Supabase / CRON_SECRET");

  let api: APIRequestContext;

  test.beforeEach(async () => {
    api = await pwRequest.newContext();
    await dbDeleteAuditLog(api, "1");
  });

  test.afterEach(async () => {
    await dbDeleteAuditLog(api, "1");
    await api.dispose();
  });

  test("Given evento 1 en open con closes_at -1h, When corre el cron con auth, Then body.lockedEventIds incluye 1 y events.id=1 .status='locked'", async () => {
    const pastIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    await dbUpdateEvent(api, 1, { status: "open", closes_at: pastIso });

    try {
      const res = await runCron(api);
      expect(res.status(), `body=${await res.text()}`).toBe(200);
      const body = await res.json();
      expect(body.lockedEventIds).toContain(1);
      expect(Array.isArray(body.lockedEventIds)).toBe(true);
      expect(body.lockedEventIds.length).toBeGreaterThanOrEqual(1);

      const ev = await dbGetEvent(api, 1);
      expect(ev.status).toBe("locked");
    } finally {
      await dbUpdateEvent(api, 1, { status: "draft", closes_at: null });
    }
  });

  test("Given evento 1 auto-lockeado por el cron, When inspecciono admin_audit_log, Then existe exactamente 1 row con actor_user_id=null, action='auto_lock_event', before.status='open', after.status='locked', after.triggered_by='cron'", async () => {
    const pastIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    await dbUpdateEvent(api, 1, { status: "open", closes_at: pastIso });

    try {
      const res = await runCron(api);
      expect(res.status()).toBe(200);

      const rows = await dbGetAuditLogs(api, "1");
      expect(rows).toHaveLength(1);
      const row = rows[0];
      expect(row.actor_user_id).toBeNull();
      expect(row.action).toBe("auto_lock_event");
      expect(row.target_table).toBe("events");
      expect(row.target_id).toBe("1");
      expect(row.before_data.status).toBe("open");
      expect(row.after_data.status).toBe("locked");
      expect(row.after_data.triggered_by).toBe("cron");
    } finally {
      await dbUpdateEvent(api, 1, { status: "draft", closes_at: null });
    }
  });

  test("Given evento 1 en open con closes_at +7 días, When corre el cron, Then lockedEventIds NO incluye 1 y events.id=1 sigue en 'open' y no hay audit log", async () => {
    const futureIso = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await dbUpdateEvent(api, 1, { status: "open", closes_at: futureIso });
    const testStart = new Date().toISOString();

    try {
      const res = await runCron(api);
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.lockedEventIds).not.toContain(1);

      const ev = await dbGetEvent(api, 1);
      expect(ev.status).toBe("open");

      // Verificar que no se generó audit log para este target durante el test.
      const logs = await dbGetAuditLogs(api, "1");
      const inWindow = logs.filter((l) => l.created_at >= testStart);
      expect(inWindow).toHaveLength(0);
    } finally {
      await dbUpdateEvent(api, 1, { status: "draft", closes_at: null });
    }
  });

  test("Given eventos 2 (draft), 3 (locked), 4 (scored) todos con closes_at -1h, When corre el cron, Then ninguno cambia de status ni aparece en lockedEventIds", async () => {
    const pastIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    await dbUpdateEvent(api, 2, { status: "draft", closes_at: pastIso });
    await dbUpdateEvent(api, 3, { status: "locked", closes_at: pastIso });
    await dbUpdateEvent(api, 4, { status: "scored", closes_at: pastIso });

    try {
      const res = await runCron(api);
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.lockedEventIds).not.toContain(2);
      expect(body.lockedEventIds).not.toContain(3);
      expect(body.lockedEventIds).not.toContain(4);

      expect((await dbGetEvent(api, 2)).status).toBe("draft");
      expect((await dbGetEvent(api, 3)).status).toBe("locked");
      expect((await dbGetEvent(api, 4)).status).toBe("scored");
    } finally {
      await dbUpdateEvent(api, 2, { status: "draft", closes_at: null });
      await dbUpdateEvent(api, 3, { status: "draft", closes_at: null });
      await dbUpdateEvent(api, 4, { status: "draft", closes_at: null });
    }
  });

  test("Given evento 1 en open con closes_at vencido (sembrado para que SI fuera autorizado se lockearía), When llamo al cron SIN header Authorization, Then responde 401 con error='Unauthorized' y la DB queda intacta", async () => {
    const pastIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    await dbUpdateEvent(api, 1, { status: "open", closes_at: pastIso });
    const testStart = new Date().toISOString();

    try {
      const res = await runCron(api, false);
      expect(res.status()).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Unauthorized");

      // La DB no debe haber sido tocada: evento sigue open, sin audit log.
      const ev = await dbGetEvent(api, 1);
      expect(ev.status).toBe("open");
      const logs = await dbGetAuditLogs(api, "1");
      expect(logs.filter((l) => l.created_at >= testStart)).toHaveLength(0);
    } finally {
      await dbUpdateEvent(api, 1, { status: "draft", closes_at: null });
    }
  });

  test("Given eventos 1 y 2 en open con closes_at=NULL, When corre el cron, Then body.lockedEventIds es []", async () => {
    await dbUpdateEvent(api, 1, { status: "open", closes_at: null });
    await dbUpdateEvent(api, 2, { status: "open", closes_at: null });

    try {
      const res = await runCron(api);
      expect(res.status()).toBe(200);
      const body = await res.json();
      // Otros tests pueden correr en paralelo — verificamos que 1 y 2 no están,
      // ya que la query filtra .not('closes_at','is',null) → no entran al loop.
      expect(body.lockedEventIds).not.toContain(1);
      expect(body.lockedEventIds).not.toContain(2);
    } finally {
      await dbUpdateEvent(api, 1, { status: "draft" });
      await dbUpdateEvent(api, 2, { status: "draft" });
    }
  });
});

// ===========================================================================
// [s6-header-mobile] Sección 6 — Mobile-friendly header
// ===========================================================================
test.describe("[s6-header-mobile] Header mobile — nav siempre visible y wrappeable", () => {
  test.skip(!HAS_SUPABASE, "Faltan envs de Supabase para crear usuario de prueba");

  let api: APIRequestContext;

  test.beforeEach(async () => {
    api = await pwRequest.newContext();
    await ensurePlayerTestUser(api);
  });

  test.afterEach(async () => {
    await api.dispose();
  });

  // Pantalla requiere sesión iniciada — beforeEach del bloque mobile hace login y navega.
  test.describe("Mobile viewport (375x667)", () => {
    test.use({ viewport: { width: 375, height: 667 } });

    test("Given viewport mobile y sesión de player, When carga /dashboard, Then el <nav> del header es visible con los 3 links base (Dashboard, Evento 1, Leaderboard)", async ({ page }) => {
      await loginViaForm(page, PLAYER_EMAIL, PLAYER_PASSWORD);

      const nav = page.locator("header nav");
      await expect(nav).toBeVisible();

      await expect(page.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/dashboard");
      await expect(page.getByRole("link", { name: "Evento 1" })).toHaveAttribute("href", "/eventos/1");
      await expect(page.getByRole("link", { name: "Leaderboard" })).toHaveAttribute("href", "/leaderboard");
    });

    test("Given viewport mobile y sesión de player (rol != admin), When carga /dashboard, Then el link 'Admin' NO aparece en el nav", async ({ page }) => {
      await loginViaForm(page, PLAYER_EMAIL, PLAYER_PASSWORD);
      await expect(page.locator('header nav a[href="/admin"]')).toHaveCount(0);
    });

    test("Given viewport mobile y sesión de admin, When carga /dashboard, Then el link 'Admin' aparece con count=1, visible y texto 'Admin'", async ({ page }) => {
      test.skip(!HAS_ADMIN_PASSWORD, "ADMIN_TEST_PASSWORD no definido en env");
      await loginViaForm(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      const adminLink = page.locator('header nav a[href="/admin"]');
      await expect(adminLink).toHaveCount(1);
      await expect(adminLink).toBeVisible();
      await expect(adminLink).toHaveText("Admin");
    });

    test("Given viewport mobile y sesión admin (caso peor de ancho), When carga /dashboard, Then no hay scroll horizontal, el header cabe en 375px y nav usa flex-wrap='wrap'", async ({ page }) => {
      test.skip(!HAS_ADMIN_PASSWORD, "ADMIN_TEST_PASSWORD no definido en env");
      await loginViaForm(page, ADMIN_EMAIL, ADMIN_PASSWORD);

      // scrollWidth del root no debe exceder el viewport — no hay overflow horizontal.
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth).toBeLessThanOrEqual(375);

      const headerBox = await page.locator("header").boundingBox();
      expect(headerBox?.width).toBeLessThanOrEqual(375);

      // Proxy directo del cambio Tailwind del spec — atrapa el regression si
      // el dev elimina flex-wrap aunque no haya overflow visible.
      const flexWrap = await page.locator("header nav").evaluate((el) => getComputedStyle(el).flexWrap);
      expect(flexWrap).toBe("wrap");
    });

    test("Given viewport mobile y sesión de player, When carga /dashboard, Then el <span> con el email del usuario está oculto (hidden sm:inline → display:none)", async ({ page }) => {
      await loginViaForm(page, PLAYER_EMAIL, PLAYER_PASSWORD);
      // El span existe en DOM pero está hidden vía Tailwind responsive.
      await expect(page.locator("header span", { hasText: PLAYER_EMAIL })).toBeHidden();
    });
  });

  test.describe("Desktop viewport (1280x720)", () => {
    test.use({ viewport: { width: 1280, height: 720 } });

    test("Given viewport desktop y sesión de player, When carga /dashboard, Then el <span> con el email del usuario es visible al lado del botón Salir", async ({ page }) => {
      await loginViaForm(page, PLAYER_EMAIL, PLAYER_PASSWORD);
      await expect(page.locator("header span", { hasText: PLAYER_EMAIL })).toBeVisible();
    });
  });
});

// ===========================================================================
// [s7-dashboard-card] Sección 7 — Card "Próximo cierre" en /dashboard
// ===========================================================================
test.describe('[s7-dashboard-card] Card "Próximo cierre" en /dashboard', () => {
  test.skip(!HAS_SUPABASE, "Faltan envs de Supabase para crear usuario de prueba");

  let api: APIRequestContext;

  test.beforeEach(async () => {
    api = await pwRequest.newContext();
    await ensurePlayerTestUser(api);
  });

  test.afterEach(async () => {
    await api.dispose();
  });

  test("Given evento 1 en open con closes_at = now + 2 días 3 horas y name='Evento 1 — Mundial', When player navega a /dashboard, Then la card 'Próximo cierre' muestra el nombre y tiempo 'cierra en 2d 3h'", async ({ page }) => {
    // Limpiar eventos 2,3,4 para garantizar que el "Próximo cierre" elige el 1.
    await dbUpdateEvent(api, 2, { status: "draft", closes_at: null });
    await dbUpdateEvent(api, 3, { status: "draft", closes_at: null });
    await dbUpdateEvent(api, 4, { status: "draft", closes_at: null });
    const closesAt = new Date(Date.now() + (2 * 24 + 3) * 60 * 60 * 1000).toISOString();
    await dbUpdateEvent(api, 1, { status: "open", closes_at: closesAt, name: "Evento 1 — Mundial" });

    try {
      await loginViaForm(page, PLAYER_EMAIL, PLAYER_PASSWORD);

      // Localizamos la card por su título único.
      const card = page.locator("div").filter({ hasText: /^Próximo cierre/ }).locator("..").filter({ has: page.getByText("Próximo cierre") });
      // El nombre del evento aparece en el div text-xl font-bold de la card.
      await expect(page.getByText("Evento 1 — Mundial", { exact: true })).toBeVisible();

      // Tiempo restante: con tolerancia de ±1h por jitter entre setup y server render.
      // Para offset +2d3h, el formato esperado es "cierra en 2d 3h" (o 2h por borde, o 1d 23h).
      const timeText = page.locator("p.text-xs.text-muted-foreground").filter({ hasText: /^cierra en (\d+d \d+h|\d+h \d+m)$/ });
      await expect(timeText.first()).toBeVisible();
      const actual = await timeText.first().textContent();
      expect(actual).toMatch(/^cierra en (1d 23h|2d [0-3]h)$/);
    } finally {
      await dbUpdateEvent(api, 1, { status: "draft", closes_at: null, name: "Evento 1" });
    }
  });

  test("Given evento 1 (open, closes_at +5d, name='Evento Lejano') y evento 2 (open, closes_at +1d, name='Evento Cercano'), When player navega a /dashboard, Then card 'Próximo cierre' muestra 'Evento Cercano' (menor closes_at)", async ({ page }) => {
    const farIso = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    const nearIso = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString();
    await dbUpdateEvent(api, 1, { status: "open", closes_at: farIso, name: "Evento Lejano" });
    await dbUpdateEvent(api, 2, { status: "open", closes_at: nearIso, name: "Evento Cercano" });
    await dbUpdateEvent(api, 3, { status: "draft", closes_at: null });
    await dbUpdateEvent(api, 4, { status: "draft", closes_at: null });

    try {
      await loginViaForm(page, PLAYER_EMAIL, PLAYER_PASSWORD);
      await expect(page.getByText("Evento Cercano", { exact: true })).toBeVisible();
      await expect(page.locator("div.text-xl.font-bold", { hasText: /^Evento Lejano$/ })).toHaveCount(0);
    } finally {
      await dbUpdateEvent(api, 1, { status: "draft", closes_at: null, name: "Evento 1" });
      await dbUpdateEvent(api, 2, { status: "draft", closes_at: null, name: "Evento 2" });
    }
  });

  test("Given no hay eventos open con closes_at, When player navega a /dashboard, Then la card 'Próximo cierre' NO se renderiza pero las 4 cards base sí (Próximo evento, Tu puntaje, Equipos cargados, Jugadores)", async ({ page }) => {
    await dbUpdateEvent(api, 1, { status: "draft", closes_at: null });
    await dbUpdateEvent(api, 2, { status: "draft", closes_at: null });
    await dbUpdateEvent(api, 3, { status: "draft", closes_at: null });
    await dbUpdateEvent(api, 4, { status: "draft", closes_at: null });

    try {
      await loginViaForm(page, PLAYER_EMAIL, PLAYER_PASSWORD);
      // Card "Próximo cierre" ausente.
      await expect(page.getByText("Próximo cierre", { exact: true })).toHaveCount(0);
      // Las 4 cards base presentes.
      await expect(page.getByText("Próximo evento", { exact: true })).toBeVisible();
      await expect(page.getByText("Tu puntaje", { exact: true })).toBeVisible();
      await expect(page.getByText("Equipos cargados", { exact: true })).toBeVisible();
      await expect(page.getByText("Jugadores", { exact: true })).toBeVisible();
    } finally {
      // No hay nada que restaurar — el estado de partida ya era draft/null.
    }
  });

  test("Given evento 1 en draft con closes_at +1d (name='Evento Draft') y evento 2 en open con closes_at +3d (name='Evento Open'), When player navega a /dashboard, Then la card 'Próximo cierre' muestra 'Evento Open' (filtro .eq('status','open') excluye draft)", async ({ page }) => {
    const ev1Iso = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString();
    const ev2Iso = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    await dbUpdateEvent(api, 1, { status: "draft", closes_at: ev1Iso, name: "Evento Draft" });
    await dbUpdateEvent(api, 2, { status: "open", closes_at: ev2Iso, name: "Evento Open" });
    await dbUpdateEvent(api, 3, { status: "draft", closes_at: null });
    await dbUpdateEvent(api, 4, { status: "draft", closes_at: null });

    try {
      await loginViaForm(page, PLAYER_EMAIL, PLAYER_PASSWORD);
      await expect(page.getByText("Evento Open", { exact: true })).toBeVisible();
      await expect(page.locator("div.text-xl.font-bold", { hasText: /^Evento Draft$/ })).toHaveCount(0);
    } finally {
      await dbUpdateEvent(api, 1, { status: "draft", closes_at: null, name: "Evento 1" });
      await dbUpdateEvent(api, 2, { status: "draft", closes_at: null, name: "Evento 2" });
    }
  });

  test("Given evento 1 en open con closes_at = now - 5min (name='Evento Vencido'), When player navega a /dashboard, Then la card 'Próximo cierre' muestra 'cierra ahora'", async ({ page }) => {
    const pastIso = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    await dbUpdateEvent(api, 1, { status: "open", closes_at: pastIso, name: "Evento Vencido" });
    await dbUpdateEvent(api, 2, { status: "draft", closes_at: null });
    await dbUpdateEvent(api, 3, { status: "draft", closes_at: null });
    await dbUpdateEvent(api, 4, { status: "draft", closes_at: null });

    try {
      await loginViaForm(page, PLAYER_EMAIL, PLAYER_PASSWORD);
      await expect(page.getByText("Evento Vencido", { exact: true })).toBeVisible();
      await expect(page.getByText("cierra ahora", { exact: true })).toBeVisible();
    } finally {
      await dbUpdateEvent(api, 1, { status: "draft", closes_at: null, name: "Evento 1" });
    }
  });

  test("Given evento 1 en open con closes_at = now + 5h 30m (name='Evento Hoy'), When player navega a /dashboard, Then la card 'Próximo cierre' muestra 'cierra en Xh Ym' con X en [4,5] (rama sin días)", async ({ page }) => {
    const closesAt = new Date(Date.now() + (5 * 60 + 30) * 60 * 1000).toISOString();
    await dbUpdateEvent(api, 1, { status: "open", closes_at: closesAt, name: "Evento Hoy" });
    await dbUpdateEvent(api, 2, { status: "draft", closes_at: null });
    await dbUpdateEvent(api, 3, { status: "draft", closes_at: null });
    await dbUpdateEvent(api, 4, { status: "draft", closes_at: null });

    try {
      await loginViaForm(page, PLAYER_EMAIL, PLAYER_PASSWORD);
      await expect(page.getByText("Evento Hoy", { exact: true })).toBeVisible();
      // Regex con tolerancia ±1h por latencia setup→render.
      const timeText = page.locator("p.text-xs.text-muted-foreground").filter({ hasText: /^cierra en [4-5]h \d{1,2}m$/ });
      await expect(timeText.first()).toBeVisible();
    } finally {
      await dbUpdateEvent(api, 1, { status: "draft", closes_at: null, name: "Evento 1" });
    }
  });
});

// ===========================================================================
// [s9-riesgo-precision-cron] Sección 9 — Riesgo precisión cron 1x/día
// ===========================================================================
test.describe("[s9-riesgo-precision-cron] Riesgo cron 1x/día — lockea en una sola pasada todo lo vencido", () => {
  test.skip(!HAS_CRON, "Faltan envs de Supabase / CRON_SECRET");

  let api: APIRequestContext;

  test.beforeEach(async () => {
    api = await pwRequest.newContext();
    await dbDeleteAuditLog(api, "4");
  });

  test.afterEach(async () => {
    await dbDeleteAuditLog(api, "4");
    await api.dispose();
  });

  test("Given evento 4 en open con closes_at = now - 10h (simula evento vencido hace 10h), When corre el cron una sola vez con auth válida, Then body.lockedEventIds incluye 4 inmediatamente", async () => {
    const pastIso = new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString();
    await dbUpdateEvent(api, 4, { status: "open", closes_at: pastIso });

    try {
      const res = await runCron(api);
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.lockedEventIds).toContain(4);

      const ev = await dbGetEvent(api, 4);
      expect(ev.status).toBe("locked");
    } finally {
      await dbUpdateEvent(api, 4, { status: "draft", closes_at: null });
    }
  });
});
