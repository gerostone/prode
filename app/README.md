# Prode Mundial 2026

Webapp privada de pronóstico deportivo para el Mundial 2026.
Stack: Next.js 14 (App Router) + TypeScript + Tailwind + shadcn/ui + Supabase + Vercel.

Para el contexto completo (reglamento, modelo de datos, fases) ver el documento `Prode-Mundial-2026-Plan.docx` en la carpeta raíz del proyecto.

---

## Estado actual


| Fase                                | Estado      |
| ----------------------------------- | ----------- |
| 0 — Setup y auth con magic link    | ✅ Completa |
| 1 — Modelo de datos, RLS y seeds   | ✅ Completa |
| 2 — Evento 1 (pronóstico inicial) | ⏳ Próxima |
| 3 — Admin + carga manual           | ⏳          |
| 4 — Sync con Football-Data.org     | ⏳          |
| 5 — Eventos 2/3/4 (brackets)       | ⏳          |
| 6 — Scoring + leaderboard          | ⏳          |
| 7 — Pulido                         | ⏳          |

## Setup inicial (una sola vez)

### 1. Instalar dependencias

```bash
cd app
npm install
```

### 2. Variables de entorno

```bash
cp .env.example .env.local
```

Editá `.env.local` con tus valores reales de Supabase y Football-Data.org. **Nunca** completés `.env.example` con valores reales — se commitea al repo.

### 3. Aplicar migrations a la DB

Tenés dos formas: vía Supabase CLI (recomendada) o pegando los SQL en el SQL Editor del dashboard.

#### Opción A — Supabase CLI

```bash
\# Instalar la CLI (una sola vez)
brew install supabase/tap/supabase

# Desde la carpeta app/:
supabase login
supabase link --project-ref tafirbqrgthobkhtqitq   # tu project ref
supabase db push                                    # aplica todas las migrations
```

#### Opción B — SQL Editor del dashboard de Supabase

Ir a [supabase.com/dashboard](https://supabase.com/dashboard) → tu proyecto → **SQL Editor** → **New query**. Pegar y ejecutar cada migration **en orden**:

1. `supabase/migrations/0001_initial_schema.sql`
2. `supabase/migrations/0002_triggers_and_rls.sql`
3. `supabase/migrations/0003_functions.sql`
4. `supabase/migrations/0004_seed_groups_events.sql`
5. `supabase/migrations/0005_seed_admin.sql`

La migration 0004 hace una verificación al final: si las cuentas de los eventos no cierran, falla con un mensaje claro. Si ves `OK: cada evento suma exactamente lo declarado.` en los logs, está perfecto.

### 4. Configurar Auth en Supabase

En el dashboard → **Authentication → URL Configuration**:

- **Site URL**: `http://localhost:3000`
- **Redirect URLs**: agregá `http://localhost:3000/auth/callback`

Cuando hagas deploy a Vercel, sumá también:

- Site URL: `https://tu-app.vercel.app`
- Redirect URL: `https://tu-app.vercel.app/auth/callback`

### 5. Cargar los 48 equipos desde Football-Data.org

```bash
npm run db:sync-teams
```

Esto baja los equipos del Mundial desde la API (plan free), los upserta en la tabla `teams` y te informa cuántos cargó. Después tenés que completar manualmente el `group_code` y `fifa_ranking` de cada equipo (lo haremos via UI de admin en Fase 3; por ahora se puede desde SQL Editor).

### 6. Correr en desarrollo

```bash
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000). Te redirige a `/login`. Ingresá `gicornou@gmail.com`, recibís el magic link, hacés click, y entrás al dashboard. Como sos admin, tu profile queda con `role = 'admin'` (lo configura la migration 0005 + el trigger).

## Comandos útiles

```bash
npm run dev              # development server
npm run build            # build de producción
npm run start            # correr el build localmente
npm run lint             # linter
npm run typecheck        # chequeo de tipos sin emit
npm run db:sync-teams    # bajar 48 equipos desde Football-Data.org
npm run db:generate-types  # regenerar src/lib/database.types.ts desde el schema (requiere CLI)
```

## Estructura del proyecto

```
app/
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── globals.css
│   │   ├── login/                  ← magic link
│   │   ├── auth/callback/          ← handler de auth
│   │   └── (app)/                  ← rutas protegidas
│   │       ├── layout.tsx
│   │       └── dashboard/
│   ├── components/
│   │   ├── app-header.tsx
│   │   └── ui/                     ← Button, Card, Input
│   ├── lib/
│   │   ├── env.ts                  ← validación de envs con Zod
│   │   ├── auth.ts                 ← getUserAndProfile, requireRole
│   │   ├── database.types.ts       ← tipos manuales del schema
│   │   ├── supabase-server.ts
│   │   ├── supabase-client.ts
│   │   ├── supabase-middleware.ts
│   │   └── utils.ts
│   └── middleware.ts
├── supabase/
│   └── migrations/
│       ├── 0001_initial_schema.sql      ← todas las tablas + índices
│       ├── 0002_triggers_and_rls.sql    ← trigger auth + RLS por rol
│       ├── 0003_functions.sql           ← compute_outcome, fn_lock_event, fn_score_event
│       ├── 0004_seed_groups_events.sql  ← 12 grupos + 4 eventos + categorías
│       └── 0005_seed_admin.sql          ← promueve a gicornou@gmail.com
├── scripts/
│   └── sync-teams.ts               ← bajada inicial de 48 equipos
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.mjs
├── components.json
├── .env.example
└── .gitignore
```

## Verificación rápida tras Fase 1

Después de aplicar las migrations y correr `db:sync-teams`, en SQL Editor:

```sql
-- ¿Cuántos equipos hay?
select count(*) from teams;        -- esperás 48 (o lo que devuelva la API)

-- ¿Cuántos grupos hay?
select count(*) from groups;       -- esperás 12

-- ¿Las categorías de los eventos cierran las cuentas?
select e.id, e.max_points,
       sum(ec.required_count * ec.points_per_correct) as suma
from events e
join event_categories ec on ec.event_id = e.id
group by e.id, e.max_points
order by e.id;
-- Esperás: 1=1350, 2=160, 3=160, 4=120

-- ¿Soy admin?
select role from profiles where id = auth.uid();
```

## Próxima fase

Una vez verificada la Fase 1, arrancamos **Fase 2**: pantalla del Evento 1 con las 5 secciones (campeón → finalista → 4 semifinalistas → 32 a playoffs → 12 ganadores de grupo), borrador autosalvado y validaciones cruzadas.
