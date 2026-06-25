# Reglamento + Gestión de usuarios

**Fecha:** 2026-05-19
**Estado:** Aprobada para implementación

## 1. Objetivo

Dos pantallas nuevas post-Fase 7:

- `/reglamento` — público a cualquier autenticado, muestra las reglas del Prode (hardcoded JSX desde el plan doc section 2).
- `/admin/users` — admin-only, lista usuarios con email + role editable + botón de reset password.

## 2. Out of scope

- Eliminar usuarios (riesgoso por FK CASCADE en predictions/scores).
- Invitar usuarios desde admin (siguen registrándose por sí mismos).
- Editar display_name de otros usuarios desde admin.
- Editar reglamento desde UI (cambia 0 veces durante el torneo).
- Versionado del reglamento.
- Tests automatizados nuevos.

## 3. Decisiones tomadas (con el usuario)

| Decisión | Elección |
|---|---|
| Reglamento source | Hardcoded en JSX |
| Operaciones admin/users | Listar + cambiar rol + reset password |
| Confirmación antes de cambiar role | Sí, `window.confirm()` |
| Self-demote prevention | Doble — UI bloquea + server action rechaza |
| Bundle | Una sola spec/plan para ambas features |

## 4. `/reglamento`

### Estructura

Server Component sin interactividad. Está bajo `(app)/` por lo que el middleware ya lo gatea para autenticados. Layout: una página scrolleable con Cards por sección, headings claros, prose styling.

### Contenido (extraído del plan doc section 2)

**Header:** "Reglamento del Prode Mundial 2026" + descripción breve ("Cómo se juega y se puntúa").

**Card 1 — Estructura general de puntos**

Tabla 4 filas (evento, cuándo, puntos):
- Evento 1 (Pronóstico inicial) · Antes del kickoff · 1350 pts
- Evento 2 (32avos) · Antes del Round of 32 · 160 pts
- Evento 3 (Octavos) · Antes del Round of 16 · 160 pts
- Evento 4 (Cuartos) · Antes de QF · 120 pts
- TOTAL · — · **1790 pts**

**Card 2 — Detalle del Evento 1 (1350 pts)**

Tabla (categoría, cantidad, pts c/u, subtotal):
- Campeón · 1 · 200 · 200
- Finalista · 1 · 150 · 150
- Semifinalistas · 4 · 75 · 300
- Goleador del torneo · 1 · 200 · 200
- Equipos que pasan a Playoffs (R32) · 32 · 10 · 320
- Ganadores de grupo · 12 · 15 · 180
- **Total** · — · — · **1350**

**Card 3 — Detalle de Eventos 2/3/4 (440 pts)**

Tres sub-tablas (una por evento). Cada una: ganador del partido + resultado L/E/V.

- Evento 2 (R32): 16 × 8 ganador + 16 × 2 resultado = 160
- Evento 3 (R16): 8 × 15 ganador + 8 × 5 resultado = 160
- Evento 4 (QF): 4 × 20 ganador + 4 × 10 resultado = 120

**Card 4 — Regla del "Empate"**

Texto explicativo:
> En las rondas eliminatorias, el resultado del partido se determina así:
> - Si se define en 90 minutos: **Local** o **Visitante** según el ganador.
> - Si se define en tiempo extra (120 minutos): **Local** o **Visitante** según el ganador.
> - Si llega empatado a penaltis: **Empate** (no importa quién gane los penaltis).
>
> En síntesis: "Empate" = "se definió por penaltis".

**Card 5 — Local y Visitante**

Texto:
> En las rondas eliminatorias se considera **Local** al equipo con mejor ranking FIFA al cierre del evento de pronóstico correspondiente.

**Card 6 — Cuándo cierra cada evento**

Tabla:
- Evento 1 · Cierra al kickoff del primer partido del Mundial (11 jun 2026)
- Evento 2 · Cierra al kickoff del primer partido del R32 (28 jun aprox)
- Evento 3 · Cierra al kickoff del primer partido del R16 (4 jul aprox)
- Evento 4 · Cierra al kickoff del primer partido de QF (10 jul aprox)

Footnote: el lock-out es automático via cron daily; admin puede cerrarlo manual si necesita precisión al minuto.

### Header link

Agregar `<Link href="/reglamento">Reglamento</Link>` entre "Leaderboard" y "Admin".

## 5. `/admin/users`

### Loader (`page.tsx`)

```tsx
// Server component. Carga profiles + emails de auth.users via Admin API.
import { createClient } from '@supabase/supabase-js';
import { requireUser } from '@/lib/auth';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

// Fetch en paralelo:
//   - profiles (id, display_name, avatar_url, role, created_at)
//   - auth.users via supabase.auth.admin.listUsers() → [{ id, email, created_at }]
// Join en memoria por id. Pasar al editor.
```

Shape de la fila que recibe el editor:
```ts
export type UserRow = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  email: string;
  role: 'player' | 'scorer' | 'admin';
  created_at: string;
};
```

### Editor (`users-editor.tsx`)

Client component. Tabla scroll-friendly:

```
[avatar] Nombre              email@ejemplo.com    [Role ▼]    [Reset password]   [chip]
```

- Avatar: si `avatar_url` existe `<img>`, sino inicial.
- Role select: 3 opciones (player / scorer / admin). Disabled si `row.id === currentUserId`.
- Reset password button: `<Button size="sm" variant="outline">Reset password</Button>`. Tras click, muestra estado pending → "✓ Enviado" o error.
- SaveChip (mismo patrón) para el role.

**Confirmación antes de cambiar role:**
```ts
function handleRoleChange(userId: string, newRole: UserRole) {
  if (!window.confirm(`Confirmás cambiar el rol a ${newRole}?`)) return;
  // optimistic update + scheduleSave
}
```

Sin debounce — change immediate (no autosave debounced, porque cada cambio es deliberate y requiere confirm).

### Server actions (`actions.ts`)

```ts
'use server';

const updateUserRoleSchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(['player', 'scorer', 'admin']),
});

export async function updateUserRole(input) {
  const parsed = updateUserRoleSchema.safeParse(input);
  if (!parsed.success) return { error: 'Payload inválido.' };

  const { user } = await requireRole(['admin']);

  // Self-demote prevention (server-side check)
  if (parsed.data.user_id === user.id && parsed.data.role !== 'admin') {
    return { error: 'No podés cambiar tu propio rol.' };
  }

  const supabase = createSupabaseServerClient();
  const { data: before } = await supabase
    .from('profiles').select('role').eq('id', parsed.data.user_id).single();

  const { error } = await supabase
    .from('profiles').update({ role: parsed.data.role })
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

const resetSchema = z.object({ user_id: z.string().uuid() });

export async function sendPasswordReset(input) {
  const parsed = resetSchema.safeParse(input);
  if (!parsed.success) return { error: 'Payload inválido.' };

  const { user } = await requireRole(['admin']);

  // Lookup email via admin client
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data: target } = await supabaseAdmin.auth.admin.getUserById(parsed.data.user_id);
  const email = target?.user?.email;
  if (!email) return { error: 'Usuario sin email.' };

  // Send reset email
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? '';
  const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/callback?next=/reset-password`,
  });

  if (error) {
    console.error('sendPasswordReset error:', error);
    if (error.message?.toLowerCase().includes('rate limit')) {
      return { error: 'Rate limit del provider. Esperá un rato (~1 hora).' };
    }
    return { error: 'No se pudo enviar el reset.' };
  }

  await supabaseAdmin.from('admin_audit_log').insert({
    actor_user_id: user.id,
    action: 'send_password_reset',
    target_table: 'auth.users',
    target_id: parsed.data.user_id,
    after_data: { email },
  });

  return { ok: true as const };
}
```

## 6. Admin index — 6ta card

`/admin/page.tsx` suma una 6ta card:

```tsx
<Link href={"/admin/users" as Route} ...>
  <Card>
    <CardHeader>
      <CardTitle>Usuarios</CardTitle>
      <UserCog className="h-4 w-4 text-muted-foreground" />
    </CardHeader>
    <CardDescription>
      {usersCount} registrados
    </CardDescription>
  </Card>
</Link>
```

Query del count: agregar al `Promise.all` `supabase.from('profiles').select('id', { count: 'exact', head: true })`.

## 7. Estructura de archivos

```
app/src/app/(app)/reglamento/page.tsx                NEW
app/src/app/(app)/admin/users/page.tsx               NEW
app/src/app/(app)/admin/users/users-editor.tsx       NEW
app/src/app/(app)/admin/users/actions.ts             NEW
app/src/app/(app)/admin/page.tsx                     MODIFY (6ta card)
app/src/components/app-header.tsx                    MODIFY (link Reglamento)
```

Cero migration. Cero schema change.

## 8. Riesgos / supuestos

- **Rate limit del reset password:** Supabase free tier limita emails (~3/hora). Si el admin trigger muchos seguidos, los últimos fallan. Mensaje al admin pidiendo esperar.
- **`auth.admin.listUsers()` paginación:** por defecto trae 50 users. Como hay <30, está OK. Si crece >50, agregar paginación.
- **Self-demote protection:** doble check (UI + server). UI evita el click accidental; server es la fuente de verdad.
- **`profiles_admin_all` RLS policy** ya permite admin UPDATE a profiles, incluyendo el suyo. La protección self-demote es app-level, no DB.

## 9. Verificación post-implementación

- [ ] `/reglamento` carga para player/admin, redirige a /login para anónimos.
- [ ] Link "Reglamento" aparece en el header.
- [ ] Las 6 cards del reglamento muestran info correcta (1790 pts total, detalle por evento incluyendo goleador 200 pts).
- [ ] `/admin/users` muestra todos los usuarios con email + role + botón reset.
- [ ] Cambiar role de otro usuario → confirm dialog → autosave → audit log entry.
- [ ] Intentar cambiar mi propio rol → dropdown disabled (UI). Si bypaseo con devtools, server action devuelve "No podés cambiar tu propio rol."
- [ ] Click "Reset password" en otro usuario → email recibido. Si rate limit, mensaje claro.
- [ ] `/admin` index muestra 6ta card "Usuarios" con contador.
- [ ] tests + typecheck + lint verde.
