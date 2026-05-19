# Plan de pruebas — Fase 7 Pulido pre-Mundial

Fecha: 2026-05-19
Fase slug: fase-7-pulido
Spec: docs/superpowers/specs/2026-05-19-fase-7-pulido.md
Plan: docs/superpowers/plans/2026-05-19-fase-7-pulido.md

## Qué se prueba

Cierre operacional pre-kickoff del Mundial 2026 cubriendo cuatro frentes verificables end-to-end:

- Auto-set de `events.closes_at` desde `min(matches.scheduled_at)` por stage (R32→E2, R16→E3, QF→E4) ejecutado al final del cron `/api/cron/sync-matches`.
- Auto-lock de eventos `open` cuyo `closes_at` ya pasó, con audit log `actor_user_id = null`.
- Migration 0010 dejando `admin_audit_log.actor_user_id` como nullable para soportar inserts system-triggered.
- Header siempre visible y wrappeable en mobile (sin hamburger).
- Card "Próximo cierre" en `/dashboard` con tiempo restante calculado server-side.

## Qué NO se prueba

Heredado del spec (sección Out of scope):
- Pantalla `/yo` (mis predicciones + breakdown) — post-Mundial.
- `/comparar/[userId]` (ver predicciones ajenas) — post-Mundial.
- Email / push notifications cuando un evento cierra.
- Hamburger menu (el spec eligió `flex-wrap`, no menú).
- Re-revisión completa de copy.
- Performance audit.

Excluido de este plan E2E además:
- Lógica interna de `syncFromFD` (Fase 4 ya la cubre).
- Trigger real del cron de Vercel en producción (es infra externa, se verifica manualmente desde el dashboard de Vercel — ver sección Testing Manual).
- Estilos finos del card (color, fuente exacta) — verificamos texto y presencia, no pixel-perfection.

## Escenarios por sección

### [s4-migration-0010] Sección 4 — Migration 0010 `admin_audit_log.actor_user_id` nullable

#### AC 1 — La columna `actor_user_id` acepta `NULL` después de aplicar la migration
- Precondición: Supabase local levantado con migrations 0001..0010 aplicadas (incluye seeds 0004 grupos/eventos y 0005 admin). Sesión: irrelevante (la verificación corre a nivel DB via service role).
- Escenario: Dado el schema con migration 0010 aplicada, cuando un cliente con `SUPABASE_SERVICE_ROLE_KEY` inserta `{ actor_user_id: null, action: 'auto_lock_event', target_table: 'events', target_id: '1', before_data: { status: 'open' }, after_data: { status: 'locked', triggered_by: 'cron' } }` en `admin_audit_log`, entonces el insert retorna `error: null` y el row queda persistido con `actor_user_id IS NULL` y `action = 'auto_lock_event'`.
- Tipo: happy path
- Automatizable con Playwright: sí
- Datos de prueba: ninguno externo — el insert mismo genera la fila. Limpieza: `delete from admin_audit_log where action = 'auto_lock_event' and target_id = '1'` post-test para no contaminar otros escenarios.
- Nota de implementación Playwright: usar `request.newContext()` para hacer un POST directo al endpoint REST de Supabase (`<SUPABASE_URL>/rest/v1/admin_audit_log`) con header `apikey` + `Authorization: Bearer <service_role_key>` y `Prefer: return=representation`. El test no necesita UI — verifica el contrato de schema. Si la migration está mal el insert vuelve con `error.code = '23502'` (not null violation) y el test falla.

#### AC 2 — La migration es idempotente (re-correrla no falla)
- Precondición: la columna `actor_user_id` ya está marcada nullable (migration 0010 aplicada al menos una vez).
- Escenario: Dado el schema actual, cuando se ejecuta `ALTER TABLE admin_audit_log ALTER COLUMN actor_user_id DROP NOT NULL` por segunda vez via `psql` o RPC SQL, entonces el statement retorna sin error (Postgres trata DROP NOT NULL sobre columna ya nullable como no-op).
- Tipo: edge case
- Automatizable con Playwright: no
- Pasos manuales:
  1. Abrir el SQL Editor de Supabase logueado como admin.
  2. Pegar `alter table admin_audit_log alter column actor_user_id drop not null;`.
  3. Click Run.
  4. Verificar que la respuesta es "Success. No rows returned" sin warning de error.
- Motivo de no automatización: requiere ejecutar DDL contra la DB. Playwright no tiene canal estable para SQL Editor de Supabase (no es nuestra app) y exponer un endpoint propio que ejecute DDL arbitrario es un riesgo de seguridad mayor que el beneficio de cubrir un AC trivial.

### [s5-cron-auto-set] Sección 5 Fase A — Auto-set de `closes_at` desde matches

#### AC 3 — Evento 2 toma `closes_at = min(scheduled_at)` de matches con `stage = 'r32'`
- Precondición: Cron habilitado con `CRON_SECRET` configurado. Eventos 1-4 sembrados (seed 0004). Estado de DB previo: `update events set status = 'draft', closes_at = null where id = 2`. Sembrar dos matches R32 con scheduled_at conocidos: `insert into matches (stage, bracket_slot, scheduled_at) values ('r32', 'R32-TEST-A', '2026-06-15T18:00:00Z'), ('r32', 'R32-TEST-B', '2026-06-12T15:00:00Z') on conflict (bracket_slot) do update set scheduled_at = excluded.scheduled_at`.
- Escenario: Dado el estado anterior, cuando el test ejecuta `GET /api/cron/sync-matches` con `Authorization: Bearer <CRON_SECRET>`, entonces la respuesta es `200` con `body.ok === true` y al consultar `select closes_at from events where id = 2` el valor es exactamente `2026-06-12T15:00:00+00:00` (el mínimo entre los dos seed) y `events.id = 2 .status` sigue en `draft`.
- Tipo: happy path
- Automatizable con Playwright: sí
- Datos de prueba: matches sembrados con `bracket_slot` con prefijo `R32-TEST-*` para no chocar con seeds reales (0009). Limpieza post-test: `delete from matches where bracket_slot like 'R32-TEST-%'` y `update events set closes_at = null where id = 2`.
- Nota de implementación Playwright: el endpoint hace fetch real a Football-Data en `syncFromFD`. Para aislar el test del servicio externo:
  - Opción A (preferida): el test corre contra un dev server levantado con `FOOTBALL_DATA_API_KEY` apuntando a un valor que `syncFromFD` reconozca como "no-op" (chequear si la lib soporta dry-run, sino setear key inválida y aceptar que `syncResult` venga con `error` — la Fase A/B corre igual porque están dentro del `try` antes del `return`, lo que importa es que no rompa el `try`).
  - Opción B: si A no es viable, mockear FD via `playwright route('https://api.football-data.org/**')` interceptando network del server, lo cual no se puede porque el fetch sale del server, no del browser. En ese caso → opción A con tolerancia a error de sync. Documentar la intención: queremos verificar Fase A independiente de que Fase 0 de sync funcione.

#### AC 4 — Evento 3 (R16) y Evento 4 (QF) reciben el mismo tratamiento que Evento 2
- Precondición: misma base que AC 3. Estado: `update events set status = 'draft', closes_at = null where id in (3, 4)`. Sembrar `insert into matches (stage, bracket_slot, scheduled_at) values ('r16', 'R16-TEST-A', '2026-06-30T20:00:00Z'), ('qf', 'QF-TEST-A', '2026-07-05T16:00:00Z') on conflict (bracket_slot) do update set scheduled_at = excluded.scheduled_at`.
- Escenario: Dado el estado anterior, cuando se ejecuta `GET /api/cron/sync-matches` con auth válida, entonces `events.id = 3 .closes_at = '2026-06-30T20:00:00+00:00'` y `events.id = 4 .closes_at = '2026-07-05T16:00:00+00:00'`.
- Tipo: happy path
- Automatizable con Playwright: sí
- Datos de prueba: matches con prefijo `R16-TEST-*` y `QF-TEST-*`. Limpieza: `delete from matches where bracket_slot like 'R16-TEST-%' or bracket_slot like 'QF-TEST-%'` y `update events set closes_at = null where id in (3, 4)`.
- Nota de implementación Playwright: mismo enfoque que AC 3.

#### AC 5 — Evento 1 nunca recibe `closes_at` desde el cron (no tiene matches asociados)
- Precondición: `update events set status = 'open', closes_at = '2026-06-10T20:00:00Z' where id = 1`. Sembrar match irrelevante en R32 con scheduled_at distinto: `insert into matches (stage, bracket_slot, scheduled_at) values ('r32', 'R32-TEST-Z', '2026-06-12T00:00:00Z') on conflict (bracket_slot) do update set scheduled_at = excluded.scheduled_at`.
- Escenario: Dado el estado anterior, cuando se ejecuta el cron, entonces `events.id = 1 .closes_at` sigue siendo exactamente `2026-06-10T20:00:00+00:00` (el código solo itera `stageByEvent = { 2, 3, 4 }`, nunca toca el id 1).
- Tipo: edge case (negativo — verificamos que NO ocurra el cambio)
- Automatizable con Playwright: sí
- Datos de prueba: ver precondición. Limpieza: `delete from matches where bracket_slot = 'R32-TEST-Z'` y `update events set closes_at = null where id = 1`.
- Nota de implementación Playwright: este test demuestra que el dev no extendió accidentalmente el `stageByEvent` a Evento 1.

#### AC 6 — El cron no sobreescribe `closes_at` de eventos en `locked` ni `scored`
- Precondición: `update events set status = 'locked', closes_at = '2026-06-01T00:00:00Z' where id = 2`. Sembrar `insert into matches (stage, bracket_slot, scheduled_at) values ('r32', 'R32-TEST-LOCK', '2026-06-15T18:00:00Z') on conflict (bracket_slot) do update set scheduled_at = excluded.scheduled_at`.
- Escenario: Dado el estado anterior, cuando se ejecuta el cron con auth válida, entonces `events.id = 2 .closes_at` sigue siendo `2026-06-01T00:00:00+00:00` (el filtro `.in('status', ['draft', 'open'])` excluye locked y scored).
- Tipo: edge case
- Automatizable con Playwright: sí
- Datos de prueba: ver precondición. Limpieza: `delete from matches where bracket_slot = 'R32-TEST-LOCK'` y `update events set status = 'draft', closes_at = null where id = 2`.

#### AC 7 — Si no hay matches con `scheduled_at` para un stage, el `closes_at` del evento queda intacto
- Precondición: `update events set status = 'draft', closes_at = '2026-06-08T12:00:00Z' where id = 3`. Asegurar `delete from matches where stage = 'r16' and scheduled_at is not null` (snapshot — restaurar en cleanup si hubiera datos reales).
- Escenario: Dado el estado anterior, cuando se ejecuta el cron, entonces `events.id = 3 .closes_at` sigue siendo `2026-06-08T12:00:00+00:00` (la query `.maybeSingle()` retorna `data = null` y el `if (minScheduled?.scheduled_at)` no entra).
- Tipo: edge case
- Automatizable con Playwright: sí
- Datos de prueba: requiere setup previo de bracket vacío. Antes del test: snapshot de matches R16, vaciarlos, correr el AC, restaurar. Alternativa más simple: usar la stage `qf` (Evento 4) que está vacía por default en el seed actual y solo asegurar `closes_at` previo conocido.

### [s5-cron-auto-lock] Sección 5 Fase B — Auto-lock de eventos vencidos

#### AC 8 — Un evento `open` con `closes_at` en el pasado se mueve a `locked` y queda en `lockedEventIds`
- Precondición: cron habilitado. `update events set status = 'open', closes_at = (now() - interval '1 hour')::text where id = 1`. No hay matches que afecten al evento 1 (Fase A no lo toca).
- Escenario: Dado el estado anterior, cuando se ejecuta `GET /api/cron/sync-matches` con auth válida, entonces la respuesta `200` trae `body.lockedEventIds` como array que incluye el número `1` y la query `select status from events where id = 1` devuelve `'locked'`.
- Tipo: happy path
- Automatizable con Playwright: sí
- Datos de prueba: ver precondición. Limpieza: `update events set status = 'draft', closes_at = null where id = 1` + `delete from admin_audit_log where action = 'auto_lock_event' and target_id = '1'`.
- Nota de implementación Playwright: aserción exacta sobre `expect(body.lockedEventIds).toContain(1)` y `expect(body.lockedEventIds).toHaveLength(>=1)`. No usar assertions genéricas tipo `expect(body.lockedEventIds).toBeDefined()` — esas pasarían aún si el array viniera vacío.

#### AC 9 — Por cada evento auto-lockeado se inserta un row en `admin_audit_log` con `actor_user_id = null` y `triggered_by = 'cron'`
- Precondición: misma que AC 8 — un evento `open` con `closes_at` vencido. Pre-cleanup: `delete from admin_audit_log where action = 'auto_lock_event' and target_id = '1'`.
- Escenario: Dado el estado anterior, cuando se ejecuta el cron, entonces existe exactamente un row en `admin_audit_log` que matchea `action = 'auto_lock_event' AND target_table = 'events' AND target_id = '1' AND actor_user_id IS NULL AND before_data->>'status' = 'open' AND after_data->>'status' = 'locked' AND after_data->>'triggered_by' = 'cron'`.
- Tipo: happy path
- Automatizable con Playwright: sí
- Datos de prueba: ver precondición. Limpieza igual que AC 8.
- Nota de implementación Playwright: el assertion lee via REST de Supabase con service role (consulta directa contra `/rest/v1/admin_audit_log?action=eq.auto_lock_event&target_id=eq.1`). Verifica cada campo del JSON. Si AC 1 (migration) está roto, el insert revienta antes de llegar al row y este test falla con `count = 0`.

#### AC 10 — Un evento `open` con `closes_at` en el futuro NO se lockea
- Precondición: `update events set status = 'open', closes_at = (now() + interval '7 days')::text where id = 1`.
- Escenario: Dado el estado anterior, cuando se ejecuta el cron, entonces `body.lockedEventIds` NO incluye `1`, `select status from events where id = 1` sigue siendo `'open'`, y `select count(*) from admin_audit_log where action = 'auto_lock_event' and target_id = '1' and created_at > <inicio_del_test>` es `0`.
- Tipo: edge case
- Automatizable con Playwright: sí
- Datos de prueba: ver precondición. Limpieza: `update events set status = 'draft', closes_at = null where id = 1`.

#### AC 11 — Eventos en `draft`, `locked` o `scored` con `closes_at` vencido NO se lockean
- Precondición: `update events set status = 'draft', closes_at = (now() - interval '1 hour')::text where id = 2; update events set status = 'locked', closes_at = (now() - interval '1 hour')::text where id = 3; update events set status = 'scored', closes_at = (now() - interval '1 hour')::text where id = 4`.
- Escenario: Dado el estado anterior, cuando se ejecuta el cron, entonces `body.lockedEventIds` NO incluye 2, 3 ni 4, y `select id, status from events where id in (2, 3, 4)` devuelve respectivamente `(2, draft), (3, locked), (4, scored)` sin cambios.
- Tipo: edge case
- Automatizable con Playwright: sí
- Datos de prueba: ver precondición. Limpieza: `update events set status = 'draft', closes_at = null where id in (2, 3, 4)`. Nota: el filtro `.eq('status', 'open')` en la query Y el `.eq('status', 'open')` en el update lo garantizan — verificamos los dos niveles.

#### AC 12 — El cron sin header `Authorization: Bearer <CRON_SECRET>` rechaza con 401
- Precondición: cron desplegado con `CRON_SECRET` configurado en envs.
- Escenario: Dado el estado anterior, cuando se ejecuta `GET /api/cron/sync-matches` sin header `Authorization`, entonces la respuesta es `401` con `body.error === 'Unauthorized'` y `select count(*) from admin_audit_log where action = 'auto_lock_event' and created_at > <inicio_del_test>` es `0`.
- Tipo: error
- Automatizable con Playwright: sí
- Datos de prueba: ninguno especial. Aún si hay eventos vencidos sembrados, el handler debe abortar antes de tocar la DB.
- Nota de implementación Playwright: aserción extra es validar que la DB no fue tocada — un test trivial que solo chequee status 401 dejaría pasar un bug donde el handler hace el trabajo y luego retorna 401. Por eso pre-sembrar un evento `open` vencido y verificar al final que sigue `open`.

#### AC 13 — Si todos los eventos `open` tienen `closes_at = NULL`, `lockedEventIds` es `[]`
- Precondición: `update events set status = 'open', closes_at = null where id in (1, 2)`. El resto en su estado default.
- Escenario: Dado el estado anterior, cuando se ejecuta el cron con auth válida, entonces `body.lockedEventIds` es exactamente `[]` (la query Fase B filtra `.not('closes_at', 'is', null)` y ningún row entra al loop).
- Tipo: edge case
- Automatizable con Playwright: sí
- Datos de prueba: ver precondición. Limpieza: `update events set status = 'draft' where id in (1, 2)`.

### [s6-header-mobile] Sección 6 — Mobile-friendly header

#### AC 14 — En viewport mobile (375x667) el `<nav>` del header es visible y contiene los 3 links base (Dashboard, Evento 1, Leaderboard)
- Precondición: usuario player logueado en `/dashboard` (sesión sembrada via seed 0005 admin o player creado para tests). Viewport configurado en 375x667 (iPhone SE) via `test.use({ viewport: { width: 375, height: 667 } })`.
- Escenario: Dado el viewport mobile, cuando la página carga, entonces:
  - El `<nav>` dentro de `<header>` tiene `display: flex` (no `display: none`) — verificado con `expect(page.locator('header nav')).toBeVisible()`.
  - Los tres links están presentes con `href` exactos: `/dashboard` con texto `"Dashboard"`, `/eventos/1` con texto `"Evento 1"`, `/leaderboard` con texto `"Leaderboard"` — verificado con `expect(page.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/dashboard')` (idem los otros dos).
- Tipo: happy path
- Automatizable con Playwright: sí
- Datos de prueba: sesión de player. Si no hay player en seeds, crear uno: `insert into auth.users (email) values ('player-test@example.com')` + `insert into profiles (id, display_name, role) select id, 'Player Test', 'player' from auth.users where email = 'player-test@example.com'`. Login programático via `supabase.auth.signInWithPassword` o usar storageState fixture.
- Nota de implementación Playwright: la verificación de "visible" debe usar `toBeVisible()` que Playwright resuelve mirando `display`, `visibility`, `opacity` y `boundingBox`. El bug típico que queremos cazar (`hidden sm:flex` antiguo) hace `display: none` en mobile → `toBeVisible()` falla. Si el dev arregla con `sm:flex` invertido aún tendríamos `display: none`. Si arregla bien con `flex flex-wrap` el test pasa.

#### AC 15 — El link `Admin` aparece en el nav solo cuando el usuario logueado tiene `role = 'admin'`
- Precondición: dos sesiones independientes — una de admin (`admin@prode.local` del seed 0005), una de player (creado en AC 14 o seed propio).
- Escenario:
  - Dado sesión de player, cuando carga `/dashboard` con viewport 375x667, entonces `page.locator('header nav a[href="/admin"]')` tiene `count = 0`.
  - Dado sesión de admin, cuando carga `/dashboard` con viewport 375x667, entonces `page.locator('header nav a[href="/admin"]')` tiene `count = 1`, el link es `toBeVisible()` y `toHaveText('Admin')`.
- Tipo: happy path + edge case (gating por rol)
- Automatizable con Playwright: sí
- Datos de prueba: usuarios admin y player. Limpieza: ninguna (no se muta DB).

#### AC 16 — En viewport mobile el header NO tiene scroll horizontal (los links wrappean en 2 filas si hace falta)
- Precondición: usuario admin logueado (los 4 links + email + botón Salir = caso peor de ancho). Viewport 375x667.
- Escenario: Dado el viewport mobile y sesión de admin, cuando la página carga, entonces:
  - `await page.evaluate(() => document.documentElement.scrollWidth)` es `≤ 375` (sin overflow horizontal en el body).
  - El header (`page.locator('header')`) tiene `boundingBox().width <= 375`.
  - El nav (`page.locator('header nav')`) tiene `flexWrap: 'wrap'` — verificado con `await page.locator('header nav').evaluate(el => getComputedStyle(el).flexWrap)` igual a `'wrap'`.
- Tipo: happy path
- Automatizable con Playwright: sí
- Datos de prueba: sesión admin. Limpieza: ninguna.
- Nota de implementación Playwright: el assertion sobre `flex-wrap: wrap` es el proxy directo del cambio Tailwind del spec. Si el dev olvida `flex-wrap` y deja `flex` solo, podría no haber overflow visible en 375px y los assertions de boundingBox pasarían — pero el assertion de computed style atrapa el regression. Es el único test que verifica la decisión técnica explícita del spec.

#### AC 17 — En viewport desktop (1280x720) el email del usuario es visible al lado del botón "Salir"
- Precondición: usuario logueado con email conocido (ej. `player-test@example.com`). Viewport 1280x720.
- Escenario: Dado el viewport desktop y sesión válida, cuando carga `/dashboard`, entonces el `<span>` con clase `hidden sm:inline` que contiene el email es visible: `expect(page.locator('header span', { hasText: 'player-test@example.com' })).toBeVisible()`.
- Tipo: happy path (control para verificar que el cambio del nav no rompió el desktop)
- Automatizable con Playwright: sí
- Datos de prueba: sesión con email conocido.

#### AC 18 — En viewport mobile (375x667) el email del usuario está oculto (`display: none` por `hidden sm:inline`)
- Precondición: usuario logueado con email conocido. Viewport 375x667.
- Escenario: Dado el viewport mobile y sesión válida, cuando carga `/dashboard`, entonces `expect(page.locator('header span', { hasText: 'player-test@example.com' })).toBeHidden()` (el span sigue en DOM pero `display: none` por Tailwind).
- Tipo: edge case (verifica que el cambio en el nav no afectó otras reglas responsive del header)
- Automatizable con Playwright: sí
- Datos de prueba: igual a AC 17.

### [s7-dashboard-card] Sección 7 — Card "Próximo cierre" en dashboard

#### AC 19 — Cuando hay un evento `open` con `closes_at` futuro, la card "Próximo cierre" se renderiza con el nombre del evento y el tiempo restante
- Precondición: sesión de player. Setup DB: `update events set status = 'draft', closes_at = null where id in (1, 2, 3, 4)` (limpiar), luego `update events set status = 'open', closes_at = (now() + interval '2 days 3 hours')::text, name = 'Evento 1 — Mundial' where id = 1`.
- Escenario: Dado el estado anterior, cuando el usuario navega a `/dashboard`, entonces:
  - Existe un elemento `<div class="text-xl font-bold">` cuyo texto exacto es `"Evento 1 — Mundial"` y que está dentro de una `Card` que contiene un `<h3>`/`CardTitle` con texto `"Próximo cierre"`.
  - Existe un `<p class="text-xs text-muted-foreground">` siblings dentro de la misma card cuyo texto matchea el regex `/^cierra en (\d+d \d+h|\d+h \d+m)$/` y el valor numérico es coherente con `closes_at` (con tolerancia ±2 min para diferencia entre `Date.now()` del server y el test). Para el seed `+2 days 3 hours`, el texto esperado es exactamente `"cierra en 2d 3h"` (truncado a horas, sin minutos).
- Tipo: happy path
- Automatizable con Playwright: sí
- Datos de prueba: ver precondición. Limpieza: `update events set status = 'draft', closes_at = null, name = 'Evento 1' where id = 1`.
- Nota de implementación Playwright: dado que `formatTimeRemaining` se ejecuta server-side (es un Server Component), el texto renderizado depende del `Date.now()` del proceso Next.js, no del browser. Para minimizar flakiness, setear `closes_at` con offset grande (días, no minutos) y matchear con regex la unidad de tiempo. Recomiendo localizadores accesibles: `page.locator('div').filter({ hasText: 'Próximo cierre' }).locator('..')` o aún mejor solicitar al implementer agregar `data-testid="dashboard-next-close-card"` siguiendo la convención TDD: `dashboard-screen` (contenedor), `dashboard-next-close-card` (Card), `dashboard-next-close-title` (CardTitle), `dashboard-next-close-event-name` (`<div>` con nombre), `dashboard-next-close-time-remaining` (`<p>` con tiempo).

#### AC 20 — Cuando hay múltiples eventos `open` con `closes_at` futuro, la card muestra el de menor `closes_at`
- Precondición: sesión de player. Setup DB: `update events set status = 'open', closes_at = (now() + interval '5 days')::text, name = 'Evento Lejano' where id = 1; update events set status = 'open', closes_at = (now() + interval '1 day')::text, name = 'Evento Cercano' where id = 2`.
- Escenario: Dado el estado anterior, cuando el usuario navega a `/dashboard`, entonces el `<div class="text-xl font-bold">` dentro de la card "Próximo cierre" tiene texto exacto `"Evento Cercano"` (el `.order('closes_at', { ascending: true }).limit(1)` selecciona el más cercano).
- Tipo: edge case
- Automatizable con Playwright: sí
- Datos de prueba: ver precondición. Limpieza: `update events set status = 'draft', closes_at = null, name = case id when 1 then 'Evento 1' when 2 then 'Evento 2' end where id in (1, 2)`.

#### AC 21 — Cuando NO hay eventos `open` con `closes_at`, la card "Próximo cierre" NO se renderiza
- Precondición: sesión de player. Setup DB: `update events set status = 'draft', closes_at = null where id in (1, 2, 3, 4)` o `update events set closes_at = null where status = 'open'`.
- Escenario: Dado el estado anterior, cuando el usuario navega a `/dashboard`, entonces `page.locator('div').filter({ hasText: 'Próximo cierre' })` tiene `count = 0` (y por extensión las otras 4 cards sí están: `Próximo evento`, `Tu puntaje`, `Equipos cargados`, `Jugadores`).
- Tipo: edge case
- Automatizable con Playwright: sí
- Datos de prueba: ver precondición.
- Nota de implementación Playwright: dado que el spec define el comportamiento condicional con `{nextClose && (...)}`, este test es clave para verificar que el dev no renderiza una card vacía o con placeholder. Las 4 cards base deben seguir visibles — asegura que el grid no colapse.

#### AC 22 — Eventos en `draft` con `closes_at` futuro NO aparecen en "Próximo cierre"
- Precondición: sesión de player. Setup DB: `update events set status = 'draft', closes_at = (now() + interval '1 day')::text, name = 'Evento Draft' where id = 1; update events set status = 'open', closes_at = (now() + interval '3 days')::text, name = 'Evento Open' where id = 2`.
- Escenario: Dado el estado anterior, cuando el usuario navega a `/dashboard`, entonces la card "Próximo cierre" muestra `"Evento Open"` (no `"Evento Draft"`), porque el filtro `.eq('status', 'open')` excluye los draft.
- Tipo: edge case
- Automatizable con Playwright: sí
- Datos de prueba: ver precondición. Limpieza igual que AC 20.

#### AC 23 — La función `formatTimeRemaining` retorna `"cierra ahora"` cuando `closes_at <= Date.now()`
- Precondición: sesión de player. Setup DB: `update events set status = 'open', closes_at = (now() - interval '5 minutes')::text, name = 'Evento Vencido' where id = 1`. (Sí, este escenario representa el window entre que `closes_at` pasa y el próximo run del cron lo lockea — válido por spec, sección 9 "Riesgos / supuestos".)
- Escenario: Dado el estado anterior, cuando el usuario navega a `/dashboard`, entonces el `<p>` con tiempo restante dentro de la card "Próximo cierre" tiene texto exacto `"cierra ahora"`.
- Tipo: edge case
- Automatizable con Playwright: sí
- Datos de prueba: ver precondición. Limpieza: `update events set status = 'draft', closes_at = null, name = 'Evento 1' where id = 1`.

#### AC 24 — Cuando `closes_at` está dentro de las próximas 24h pero más de 1h, el formato es `"cierra en Xh Ym"` (sin días)
- Precondición: sesión de player. Setup DB: `update events set status = 'open', closes_at = (now() + interval '5 hours 30 minutes')::text, name = 'Evento Hoy' where id = 1`.
- Escenario: Dado el estado anterior, cuando el usuario navega a `/dashboard`, entonces el `<p>` de tiempo restante matchea el regex `/^cierra en [4-5]h \d{1,2}m$/` (tolerancia ±1h por latencia entre setup y render). En condiciones limpias, el valor más probable es `"cierra en 5h 29m"` o `"cierra en 5h 30m"`.
- Tipo: happy path (rama de formato sin días)
- Automatizable con Playwright: sí
- Datos de prueba: ver precondición. Limpieza igual que AC 23.
- Nota de implementación Playwright: este AC verifica la rama del `if (days >= 1)` que devuelve formato con `Xh Ym`. Si el dev introduce un bug que siempre formatea con días, el regex no matchea y el test falla.

### [s9-riesgo-precision-cron] Sección 9 — Riesgo conocido: precisión del cron 1x/día

#### AC 25 — Si un evento vence durante el día, el siguiente run del cron lo lockea (con delay ≤ 24h)
- Precondición: cron disparable on-demand (no podemos esperar 24h en un test). `update events set status = 'open', closes_at = (now() - interval '10 hours')::text where id = 4` (simula evento que venció hace 10h).
- Escenario: Dado el estado anterior, cuando se invoca `GET /api/cron/sync-matches` con auth válida, entonces inmediatamente `body.lockedEventIds` incluye `4`. (El test no verifica el delay real de 24h, eso es atributo del scheduler — verifica que cuando el cron corre, lockea todo lo vencido en una sola pasada.)
- Tipo: happy path (caso real esperado: cron descubre evento vencido y lo cierra)
- Automatizable con Playwright: sí
- Datos de prueba: ver precondición. Limpieza: `update events set status = 'draft', closes_at = null where id = 4` + cleanup audit log.

## Testing Manual

### [s4-migration-0010] AC 2 — La migration es idempotente (re-correrla no falla)
**Precondiciones:** acceso al SQL Editor de Supabase (cuenta admin del proyecto cloud o `psql` contra `supabase start` local).
**Pasos:**
1. Abrir SQL Editor.
2. Pegar `alter table admin_audit_log alter column actor_user_id drop not null;`.
3. Click Run.
4. Pegar y correr `select is_nullable from information_schema.columns where table_name = 'admin_audit_log' and column_name = 'actor_user_id';`.
**Resultado esperado:** el primer Run devuelve "Success. No rows returned"; el segundo devuelve `is_nullable = YES`. No aparece error en el panel.
**Motivo de no automatización:** ejecutar DDL arbitrario contra DB desde Playwright requiere exponer un endpoint propio (alto riesgo) o usar el SQL Editor de Supabase via UI (no es nuestra app, frágil). El AC es de bajo riesgo (Postgres garantiza la idempotencia por diseño de `DROP NOT NULL`).

## Entorno de prueba

Proyectos de Playwright: `chromium` (asunción).
Fuente: asunción — `app/playwright.config.ts` no existe todavía (modo TDD setup). Playwright se instalará durante el step de `prode-qa-implementer`. Web app desktop-first con responsive: corriendo en chromium cubre 99% del comportamiento.

`playwright_setup_pendiente: true`

## Rutas involucradas

- `/dashboard` — existe en `app/src/app/(app)/dashboard/page.tsx`. Server Component.
- `/login` — existe (asumido — usado por el header `handleLogout`).
- `/eventos/1` — existe (asumido — usado por el header como link).
- `/leaderboard` — existe en `app/src/app/(app)/leaderboard/`.
- `/admin` — existe en `app/src/app/(app)/admin/`.
- `/api/cron/sync-matches` — existe en `app/src/app/api/cron/sync-matches/route.ts`. Endpoint API protegido por `CRON_SECRET`.

## Estado de DB requerido

Cada escenario describe su estado de DB explícito en `Precondición`. Resumen de prerequisitos comunes:

- **Migrations aplicadas:** 0001..0010 (incluida la 0010 de esta fase).
- **Seeds activos:**
  - 0004 (`seed_groups_events`): grupos A-L y eventos 1-4 sembrados con `status = 'draft'` y `closes_at = null` por default.
  - 0005 (`seed_admin`): usuario admin `admin@prode.local` con `role = 'admin'`.
  - 0009 (`matches_seed`): 31 matches con bracket_slots `R32-01..R32-16`, `R16-01..R16-08`, `QF-01..QF-04`, `SF-01..SF-02`, `FINAL`.
- **Usuarios de prueba a sembrar antes del run de tests:**
  - Player de prueba: `player-test@example.com` con `role = 'player'`, password conocido. Persistido como fixture/storageState para reusar en escenarios de dashboard y header.
- **Convención de cleanup:** cada test que muta `events` o `matches` debe restaurar el estado original en `afterEach` para no contaminar el siguiente. Bracket_slots de test deben usar prefijo `*-TEST-*` para que `delete from matches where bracket_slot like '%-TEST-%'` limpie sin tocar seeds.
- **Audit log:** cleanup específico por `action = 'auto_lock_event'` y `target_id` antes/después de tests de Fase B + AC 9.

## Regresión

Comparar rutas de esta Fase contra planes previos en `app/tests/e2e/plans/`:

Ninguna regresión identificada — esta Fase no comparte rutas con fases ya cubiertas. La carpeta `app/tests/e2e/plans/` estaba vacía al momento de generar este plan (modo TDD setup, no hay tests E2E previos commiteados). Las Fases 3-6 también están pendientes de tests E2E.

Cuando otras fases agreguen tests sobre `/dashboard` o `/api/cron/sync-matches`, esta Fase entrará en su lista de regresión por compartir esas rutas.
