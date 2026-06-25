# Reglamento + Gestión de usuarios Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir `/reglamento` (server component estático con las reglas) y `/admin/users` (admin lista usuarios con email + cambia role + envía reset password).

**Architecture:** Reglamento es un único Server Component con contenido hardcoded en JSX (6 Cards). `/admin/users` usa el patrón habitual (server page carga datos, client editor con autosave + confirmaciones, server actions). `auth.users` (que tiene el email) se accede via `supabase.auth.admin.listUsers()` con service-role key.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind, Zod, Supabase Admin API.

**Spec:** `docs/superpowers/specs/2026-05-19-reglamento-y-users.md`

---

## File Structure Overview

| Archivo | Responsabilidad |
|---|---|
| `app/src/app/(app)/reglamento/page.tsx` | **NEW** — contenido estático del reglamento |
| `app/src/components/app-header.tsx` | **MODIFY** — agregar link "Reglamento" |
| `app/src/app/(app)/admin/users/actions.ts` | **NEW** — server actions: `updateUserRole`, `sendPasswordReset` |
| `app/src/app/(app)/admin/users/page.tsx` | **NEW** — server: carga profiles + emails via Admin API |
| `app/src/app/(app)/admin/users/users-editor.tsx` | **NEW** — client: tabla + confirm + autosave |
| `app/src/app/(app)/admin/page.tsx` | **MODIFY** — 6ta card "Usuarios" |

---

## Task 1: `/reglamento` + link en header

**Files:**
- Create: `app/src/app/(app)/reglamento/page.tsx`
- Modify: `app/src/components/app-header.tsx`

- [ ] **Step 1: Crear `page.tsx`**

Create `app/src/app/(app)/reglamento/page.tsx`:
```tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function ReglamentoPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Reglamento</h1>
        <p className="text-muted-foreground">Cómo se juega y se puntúa el Prode Mundial 2026.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Estructura general de puntos</CardTitle>
          <CardDescription>4 eventos de votación, 1790 puntos en total.</CardDescription>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2">Evento</th>
                <th className="py-2">Cuándo</th>
                <th className="py-2 text-right">Puntos</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr>
                <td className="py-2 font-medium">Evento 1 — Pronóstico inicial</td>
                <td className="py-2">Antes del kickoff del Mundial</td>
                <td className="py-2 text-right tabular-nums">1350</td>
              </tr>
              <tr>
                <td className="py-2 font-medium">Evento 2 — 32avos</td>
                <td className="py-2">Antes del Round of 32</td>
                <td className="py-2 text-right tabular-nums">160</td>
              </tr>
              <tr>
                <td className="py-2 font-medium">Evento 3 — Octavos</td>
                <td className="py-2">Antes del Round of 16</td>
                <td className="py-2 text-right tabular-nums">160</td>
              </tr>
              <tr>
                <td className="py-2 font-medium">Evento 4 — Cuartos</td>
                <td className="py-2">Antes de Cuartos de Final</td>
                <td className="py-2 text-right tabular-nums">120</td>
              </tr>
              <tr>
                <td className="py-2 font-bold">TOTAL</td>
                <td className="py-2">—</td>
                <td className="py-2 text-right font-bold tabular-nums">1790</td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Evento 1 — Pronóstico inicial (1350 pts)</CardTitle>
          <CardDescription>Se carga antes del kickoff del Mundial (11 jun).</CardDescription>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2">Categoría</th>
                <th className="py-2 text-right">Cantidad</th>
                <th className="py-2 text-right">Pts c/u</th>
                <th className="py-2 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr>
                <td className="py-2">Campeón</td>
                <td className="py-2 text-right tabular-nums">1</td>
                <td className="py-2 text-right tabular-nums">200</td>
                <td className="py-2 text-right tabular-nums">200</td>
              </tr>
              <tr>
                <td className="py-2">Finalista</td>
                <td className="py-2 text-right tabular-nums">1</td>
                <td className="py-2 text-right tabular-nums">150</td>
                <td className="py-2 text-right tabular-nums">150</td>
              </tr>
              <tr>
                <td className="py-2">Semifinalistas</td>
                <td className="py-2 text-right tabular-nums">4</td>
                <td className="py-2 text-right tabular-nums">75</td>
                <td className="py-2 text-right tabular-nums">300</td>
              </tr>
              <tr>
                <td className="py-2">Goleador del torneo</td>
                <td className="py-2 text-right tabular-nums">1</td>
                <td className="py-2 text-right tabular-nums">200</td>
                <td className="py-2 text-right tabular-nums">200</td>
              </tr>
              <tr>
                <td className="py-2">Equipos a Playoffs (Round of 32)</td>
                <td className="py-2 text-right tabular-nums">32</td>
                <td className="py-2 text-right tabular-nums">10</td>
                <td className="py-2 text-right tabular-nums">320</td>
              </tr>
              <tr>
                <td className="py-2">Ganadores de grupo</td>
                <td className="py-2 text-right tabular-nums">12</td>
                <td className="py-2 text-right tabular-nums">15</td>
                <td className="py-2 text-right tabular-nums">180</td>
              </tr>
              <tr>
                <td className="py-2 font-bold">Total Evento 1</td>
                <td className="py-2 text-right">—</td>
                <td className="py-2 text-right">—</td>
                <td className="py-2 text-right font-bold tabular-nums">1350</td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Eventos 2 / 3 / 4 — Brackets (440 pts)</CardTitle>
          <CardDescription>Antes de cada ronda eliminatoria, predecís ganador + resultado L/E/V por partido.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div>
            <div className="font-medium">Evento 2 — Antes de R32 (160 pts)</div>
            <div className="text-muted-foreground">16 × 8 pts (ganador) + 16 × 2 pts (resultado L/E/V)</div>
          </div>
          <div>
            <div className="font-medium">Evento 3 — Antes de R16 (160 pts)</div>
            <div className="text-muted-foreground">8 × 15 pts (ganador) + 8 × 5 pts (resultado L/E/V)</div>
          </div>
          <div>
            <div className="font-medium">Evento 4 — Antes de QF (120 pts)</div>
            <div className="text-muted-foreground">4 × 20 pts (ganador) + 4 × 10 pts (resultado L/E/V)</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Regla del &quot;Empate&quot;</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>En las rondas eliminatorias, el resultado del partido se determina así:</p>
          <ul className="list-disc space-y-1 pl-6">
            <li>Si se define en <strong>90 minutos</strong>: <strong>Local</strong> o <strong>Visitante</strong> según el ganador.</li>
            <li>Si se define en <strong>tiempo extra (120 minutos)</strong>: <strong>Local</strong> o <strong>Visitante</strong> según el ganador.</li>
            <li>Si llega empatado a <strong>penaltis</strong>: <strong>Empate</strong> (no importa quién gane los penaltis).</li>
          </ul>
          <p className="text-muted-foreground">
            En síntesis: &quot;Empate&quot; = &quot;se definió por penaltis&quot;.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Local y Visitante</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <p>
            En las rondas eliminatorias se considera <strong>Local</strong> al equipo con mejor ranking
            FIFA al cierre del evento de pronóstico correspondiente.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cuándo cierra cada evento</CardTitle>
          <CardDescription>Lock-out automático via cron diario; admin puede cerrar manual si necesita precisión al minuto.</CardDescription>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2">Evento</th>
                <th className="py-2">Cierra al kickoff de</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr>
                <td className="py-2 font-medium">Evento 1</td>
                <td className="py-2">Primer partido del Mundial (11 jun 2026)</td>
              </tr>
              <tr>
                <td className="py-2 font-medium">Evento 2</td>
                <td className="py-2">Primer partido del Round of 32 (28 jun aprox)</td>
              </tr>
              <tr>
                <td className="py-2 font-medium">Evento 3</td>
                <td className="py-2">Primer partido del Round of 16 (4 jul aprox)</td>
              </tr>
              <tr>
                <td className="py-2 font-medium">Evento 4</td>
                <td className="py-2">Primer partido de Cuartos de Final (10 jul aprox)</td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Agregar link "Reglamento" en `app-header.tsx`**

En `app/src/components/app-header.tsx`, encontrar el `<nav>` con los Links. Agregar `<Link href="/reglamento">Reglamento</Link>` entre "Leaderboard" y el conditional "Admin":

```tsx
        <nav className="flex flex-wrap gap-2 text-xs sm:gap-4 sm:text-sm">
          <Link href="/dashboard" className="text-muted-foreground hover:text-foreground">
            Dashboard
          </Link>
          <Link href="/eventos/1" className="text-muted-foreground hover:text-foreground">
            Evento 1
          </Link>
          <Link href={"/leaderboard" as Route} className="text-muted-foreground hover:text-foreground">
            Leaderboard
          </Link>
          <Link href={"/reglamento" as Route} className="text-muted-foreground hover:text-foreground">
            Reglamento
          </Link>
          {role === 'admin' && (
            <Link href={"/admin" as Route} className="text-muted-foreground hover:text-foreground">
              Admin
            </Link>
          )}
        </nav>
```

- [ ] **Step 3: Typecheck + lint**

```bash
cd /Users/Gero/Documents/Prode/Prode/app && npx tsc --noEmit && npm run lint
```
Expected: ambos limpios. Si lint chilla por las comillas escapadas (`&quot;`), ya las dejé escapadas en el contenido.

- [ ] **Step 4: Commit**

```bash
cd /Users/Gero/Documents/Prode/Prode && git add app/src/app/\(app\)/reglamento app/src/components/app-header.tsx && git commit -m "feat(reglamento): pantalla con las reglas del Prode + link en header"
```

---

## Task 2: Server actions `admin/users/actions.ts`

**Files:**
- Create: `app/src/app/(app)/admin/users/actions.ts`

- [ ] **Step 1: Crear el archivo**

Create `app/src/app/(app)/admin/users/actions.ts`:
```ts
'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { requireRole } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase-server';

const ROLES = ['player', 'scorer', 'admin'] as const;

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

// ---------- updateUserRole ----------

const updateUserRoleSchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(ROLES),
});

export async function updateUserRole(input: z.infer<typeof updateUserRoleSchema>) {
  const parsed = updateUserRoleSchema.safeParse(input);
  if (!parsed.success) return { error: 'Payload inválido.' };

  const { user } = await requireRole(['admin']);

  // Self-demote prevention
  if (parsed.data.user_id === user.id && parsed.data.role !== 'admin') {
    return { error: 'No podés cambiar tu propio rol.' };
  }

  const supabase = createSupabaseServerClient();

  const { data: before } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', parsed.data.user_id)
    .single();

  const { error } = await supabase
    .from('profiles')
    .update({ role: parsed.data.role })
    .eq('id', parsed.data.user_id);
  if (error) {
    console.error('updateUserRole error:', error);
    return { error: 'No se pudo cambiar el rol.' };
  }

  await supabase.from('admin_audit_log').insert({
    actor_user_id: user.id,
    action: 'update_user_role',
    target_table: 'profiles',
    target_id: parsed.data.user_id,
    before_data: before ?? {},
    after_data: { role: parsed.data.role },
  });

  revalidatePath('/admin/users');
  return { savedAt: new Date().toISOString() };
}

// ---------- sendPasswordReset ----------

const resetSchema = z.object({ user_id: z.string().uuid() });

export async function sendPasswordReset(input: z.infer<typeof resetSchema>) {
  const parsed = resetSchema.safeParse(input);
  if (!parsed.success) return { error: 'Payload inválido.' };

  const { user } = await requireRole(['admin']);
  const admin = adminClient();

  // Lookup email
  const { data: target, error: gErr } = await admin.auth.admin.getUserById(parsed.data.user_id);
  if (gErr || !target?.user?.email) {
    console.error('sendPasswordReset getUserById error:', gErr);
    return { error: 'Usuario sin email.' };
  }
  const email = target.user.email;

  // Send reset email
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? '';
  const { error } = await admin.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/callback?next=/reset-password`,
  });
  if (error) {
    console.error('sendPasswordReset error:', error);
    if (error.message?.toLowerCase().includes('rate limit')) {
      return { error: 'Rate limit del provider. Esperá un rato (~1 hora).' };
    }
    return { error: 'No se pudo enviar el reset.' };
  }

  // Audit log (usamos cliente normal de supabase, no admin, igual escribe porque es service-role internamente vía RLS)
  const supabase = createSupabaseServerClient();
  await supabase.from('admin_audit_log').insert({
    actor_user_id: user.id,
    action: 'send_password_reset',
    target_table: 'auth.users',
    target_id: parsed.data.user_id,
    after_data: { email },
  });

  return { ok: true as const };
}
```

- [ ] **Step 2: Typecheck + lint**

```bash
cd /Users/Gero/Documents/Prode/Prode/app && npx tsc --noEmit && npm run lint
```
Expected: ambos limpios.

- [ ] **Step 3: Commit**

```bash
cd /Users/Gero/Documents/Prode/Prode && git add app/src/app/\(app\)/admin/users/actions.ts && git commit -m "feat(admin): server actions updateUserRole + sendPasswordReset"
```

---

## Task 3: Página `/admin/users` (server + editor client)

**Files:**
- Create: `app/src/app/(app)/admin/users/page.tsx`
- Create: `app/src/app/(app)/admin/users/users-editor.tsx`

- [ ] **Step 1: Crear `users-editor.tsx`**

Create `app/src/app/(app)/admin/users/users-editor.tsx`:
```tsx
'use client';

import { useState, useTransition } from 'react';
import type { UserRole } from '@/lib/database.types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { SaveChip, type SaveState } from '@/app/(app)/eventos/[id]/sections/save-chip';
import { updateUserRole, sendPasswordReset } from './actions';

export type UserRow = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  email: string;
  role: UserRole;
  created_at: string;
};

const ROLES: UserRole[] = ['player', 'scorer', 'admin'];

export function UsersEditor({
  users: initial,
  currentUserId,
}: {
  users: UserRow[];
  currentUserId: string;
}) {
  const [users, setUsers] = useState<UserRow[]>(initial);
  const [roleSaves, setRoleSaves] = useState<Record<string, SaveState>>({});
  const [resetStates, setResetStates] = useState<Record<string, 'idle' | 'sending' | 'sent' | 'error'>>({});
  const [errors, setErrors] = useState<Record<string, string | null>>({});

  async function changeRole(userId: string, newRole: UserRole) {
    if (!window.confirm(`Confirmás cambiar el rol a "${newRole}"?`)) return;
    setRoleSaves((s) => ({ ...s, [userId]: 'saving' }));
    setErrors((e) => ({ ...e, [userId]: null }));
    const res = await updateUserRole({ user_id: userId, role: newRole });
    if ('error' in res) {
      setRoleSaves((s) => ({ ...s, [userId]: 'error' }));
      setErrors((e) => ({ ...e, [userId]: res.error ?? null }));
    } else {
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)));
      setRoleSaves((s) => ({ ...s, [userId]: 'saved' }));
    }
  }

  async function resetPassword(userId: string) {
    setResetStates((s) => ({ ...s, [userId]: 'sending' }));
    setErrors((e) => ({ ...e, [userId]: null }));
    const res = await sendPasswordReset({ user_id: userId });
    if ('error' in res) {
      setResetStates((s) => ({ ...s, [userId]: 'error' }));
      setErrors((e) => ({ ...e, [userId]: res.error ?? null }));
    } else {
      setResetStates((s) => ({ ...s, [userId]: 'sent' }));
    }
  }

  return (
    <Card>
      <CardContent className="divide-y p-0">
        {users.map((u) => {
          const isSelf = u.id === currentUserId;
          const resetState = resetStates[u.id] ?? 'idle';
          return (
            <div key={u.id} className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-[auto_1fr_auto_auto_auto] sm:items-center">
              <div className="flex items-center gap-3">
                {u.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={u.avatar_url} alt={u.display_name} className="h-8 w-8 rounded-full" />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-medium uppercase">
                    {u.display_name.charAt(0)}
                  </div>
                )}
                <div className="text-sm">
                  <div className="font-medium">
                    {u.display_name}
                    {isSelf && <span className="ml-2 text-xs text-primary">(vos)</span>}
                  </div>
                  <div className="text-xs text-muted-foreground">{u.email}</div>
                </div>
              </div>
              <div className="hidden sm:block" />
              <div>
                <Label htmlFor={`role-${u.id}`} className="sr-only">Rol</Label>
                <select
                  id={`role-${u.id}`}
                  value={u.role}
                  onChange={(e) => changeRole(u.id, e.target.value as UserRole)}
                  disabled={isSelf}
                  title={isSelf ? 'No podés cambiar tu propio rol' : ''}
                  className="flex h-9 rounded-md border border-input bg-background px-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              <SaveChip state={roleSaves[u.id] ?? 'idle'} />
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={resetState === 'sending'}
                  onClick={() => resetPassword(u.id)}
                >
                  {resetState === 'sending'
                    ? 'Enviando...'
                    : resetState === 'sent'
                      ? '✓ Enviado'
                      : 'Reset password'}
                </Button>
              </div>
              {errors[u.id] && (
                <p className="col-span-full text-xs text-destructive">{errors[u.id]}</p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Crear `page.tsx`**

Create `app/src/app/(app)/admin/users/page.tsx`:
```tsx
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { requireUser } from '@/lib/auth';
import type { Profile } from '@/lib/database.types';
import { UsersEditor, type UserRow } from './users-editor';

export default async function AdminUsersPage() {
  const { user } = await requireUser();

  // profiles via cookies-based client (RLS allows admin)
  const supabase = createSupabaseServerClient();
  const profilesRes = await supabase.from('profiles').select('*').order('created_at', { ascending: true });
  const profiles = (profilesRes.data ?? []) as Profile[];

  // auth.users via admin client
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { data: usersPage } = await adminClient.auth.admin.listUsers();
  const emailById = new Map((usersPage?.users ?? []).map((u) => [u.id, u.email ?? '']));

  const rows: UserRow[] = profiles.map((p) => ({
    id: p.id,
    display_name: p.display_name,
    avatar_url: p.avatar_url,
    email: emailById.get(p.id) ?? '—',
    role: p.role,
    created_at: p.created_at,
  }));

  return <UsersEditor users={rows} currentUserId={user.id} />;
}
```

- [ ] **Step 3: Typecheck + lint**

```bash
cd /Users/Gero/Documents/Prode/Prode/app && npx tsc --noEmit && npm run lint
```
Expected: ambos limpios.

- [ ] **Step 4: Commit**

```bash
cd /Users/Gero/Documents/Prode/Prode && git add app/src/app/\(app\)/admin/users && git commit -m "feat(admin): /admin/users con tabla editable + confirm role + reset password"
```

---

## Task 4: 6ta card "Usuarios" en /admin index

**Files:**
- Modify: `app/src/app/(app)/admin/page.tsx`

- [ ] **Step 1: Agregar query usuarios al `Promise.all`**

En `app/src/app/(app)/admin/page.tsx`, encontrar el bloque `Promise.all` actual y sumar la query de profiles count.

Cambiar de algo como:
```tsx
  const [teamsRes, playersRes, eventsRes, stagingRes, matchesRes] = await Promise.all([
    supabase.from('teams').select('code, group_position, eliminated_at_stage'),
    supabase.from('players').select('id, is_top_scorer'),
    supabase.from('events').select('id, status').order('id'),
    supabase.from('matches_staging').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('matches').select('id, home_team_code, away_team_code'),
  ]);
```

A:
```tsx
  const [teamsRes, playersRes, eventsRes, stagingRes, matchesRes, profilesRes] = await Promise.all([
    supabase.from('teams').select('code, group_position, eliminated_at_stage'),
    supabase.from('players').select('id, is_top_scorer'),
    supabase.from('events').select('id, status').order('id'),
    supabase.from('matches_staging').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('matches').select('id, home_team_code, away_team_code'),
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
  ]);
```

- [ ] **Step 2: Calcular contador**

Después del bloque de `matchesFilled / matchesTotal` (o donde esté el último cálculo de stats), agregar:
```tsx
  const usersCount = profilesRes.count ?? 0;
```

- [ ] **Step 3: Agregar icono `UserCog` al import**

Encontrar el import de lucide:
```tsx
import { Shield, Users, BarChart3, RefreshCcw, Swords } from 'lucide-react';
```
Cambiar a:
```tsx
import { Shield, Users, BarChart3, RefreshCcw, Swords, UserCog } from 'lucide-react';
```

- [ ] **Step 4: Agregar la card "Usuarios"**

En el JSX, después del Link a `/admin/matches` y antes del Card "Volver al dashboard", insertar:
```tsx
      <Link href={"/admin/users" as Route} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg">
        <Card className="h-full transition-colors hover:bg-accent/40">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Usuarios</CardTitle>
              <UserCog className="h-4 w-4 text-muted-foreground" />
            </div>
            <CardDescription>
              {usersCount} registrados
            </CardDescription>
          </CardHeader>
        </Card>
      </Link>
```

- [ ] **Step 5: Typecheck + lint**

```bash
cd /Users/Gero/Documents/Prode/Prode/app && npx tsc --noEmit && npm run lint
```
Expected: ambos limpios.

- [ ] **Step 6: Commit**

```bash
cd /Users/Gero/Documents/Prode/Prode && git add app/src/app/\(app\)/admin/page.tsx && git commit -m "feat(admin): 6ta card 'Usuarios' en /admin index"
```

---

## Task 5: Verificación end-to-end + push

- [ ] **Step 1: Tests + typecheck + lint + build**

```bash
cd /Users/Gero/Documents/Prode/Prode/app && npm run test && npx tsc --noEmit && npm run lint && npm run build 2>&1 | tail -25
```
Expected:
- Tests: 22 verde (sin tests nuevos).
- Typecheck: exit 0.
- Lint: 0 warnings/errors.
- Build: rutas listadas incluyen `/reglamento` y `/admin/users`.

- [ ] **Step 2: Dev server + smoke manual**

```bash
cd /Users/Gero/Documents/Prode/Prode/app && npm run dev
```

Como admin (gicornou@gmail.com):

**A) Reglamento**
- Header tiene link "Reglamento" entre "Leaderboard" y "Admin".
- Click → `/reglamento` carga con las 6 cards (Estructura general, Evento 1, Eventos 2/3/4, Empate, Local/Visitante, Cuándo cierra).
- Los números check: 1790 total, Evento 1 = 1350 (con Campeón 200 + Goleador 200).

**B) Admin users**
- `/admin` muestra la 6ta card "Usuarios" con contador.
- Click → `/admin/users` muestra todos los usuarios con avatar, nombre, email, role select, botón "Reset password".
- Tu propia fila tiene "(vos)" inline y el dropdown disabled.
- Cambiar role de OTRO usuario → confirm dialog → ✓ Guardado.
- En SQL Editor: `select * from admin_audit_log where action='update_user_role' order by created_at desc limit 3;` → row con before/after.
- Click "Reset password" en otro usuario → "Enviando..." → "✓ Enviado" (si el provider tiene capacidad).
- Si rate-limited: mensaje claro "Rate limit del provider..."

**C) Player no-admin**
- Logueado como player (cambiar role en SQL temporalmente): `/admin/users` redirige a /dashboard.
- `/reglamento` accesible. Link en header.

**D) Anónimo**
- `/reglamento` redirige a /login (middleware).

- [ ] **Step 3: Push**

```bash
cd /Users/Gero/Documents/Prode/Prode && git push origin main
```

Vercel auto-deploya. Verificar en producción que las dos pantallas cargan.
