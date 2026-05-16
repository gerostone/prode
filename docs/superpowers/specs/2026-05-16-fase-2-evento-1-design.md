# Fase 2 — Pantalla del Evento 1 (Pronóstico inicial)

**Fecha:** 2026-05-16
**Estado:** Aprobada para implementación

## 1. Objetivo

Construir la pantalla `/eventos/1` donde cada jugador autenticado carga su pronóstico inicial del Mundial 2026 (1350 puntos, 5 categorías). Incluye autosave, validaciones cruzadas y toggle admin para abrir/cerrar el evento.

## 2. Out of scope

- Comparar pronósticos ajenos (`/comparar/[userId]`).
- Cron de Vercel para lock-out automático en `closes_at`.
- Editor admin avanzado (panel completo: queda para Fase 3).
- Realtime del leaderboard.
- Eventos 2/3/4 (Fase 5).

## 3. Decisiones tomadas (con el usuario)

| Decisión | Elección | Por qué |
|---|---|---|
| Orden de secciones | Progresivo (Grupo → Playoffs → Semis → Finalista → Campeón) | Aprovecha autocomplete (winners → playoffs). Coincide con el plan original. |
| Modelo draft/submitted | Sin distinción en DB; lo que esté al cerrarse, vale | Cero migration. "Enviar definitivo" es solo UX. |
| Seed de grupos | Script `assign-groups.ts` con datos reales del sorteo (fallback `--mock`) | Destraba testing real ya. |
| Cambio de status | Mini-toggle admin en la propia página del evento | Suficiente para Fase 2; el panel completo queda para Fase 3. |

## 4. Rutas y archivos

```
src/app/(app)/eventos/[id]/
  page.tsx                          Server Component. Carga evento + categorías + teams + predicciones del user.
  event-1-form.tsx                  Client Component raíz; estado + autosave.
  sections/
    group-winners.tsx               12 selects (A-L), 4 opciones c/u.
    playoff-teams.tsx               Grid 48 teams agrupados, 32 checkboxes.
    semifinalists.tsx               Picker con búsqueda, restringido a playoff_teams.
    finalist-and-champion.tsx       2 radios entre los 4 semifinalistas.
  actions.ts                        Server actions: saveSection, openEvent, lockEvent.

src/lib/event1-validation.ts        Reglas puras (client+server).
src/lib/predictions.ts              Loader: predicciones del user para un evento.

src/components/ui/checkbox.tsx      Nuevo primitive (Radix + Tailwind).
src/components/ui/label.tsx         Nuevo primitive.

scripts/assign-groups.ts            Upsert de group_code para los 48 teams.
```

## 5. Modelo de datos — sin cambios

Reutiliza `predictions` tal cual. Polimórfica por `kind`:

- `group_winner`: `team_code` + `meta.group_code`.
- `playoff_team`: `team_code`.
- `semifinalist`: `team_code`.
- `finalist`: `team_code`.
- `champion`: `team_code`.

Índices únicos existentes (ver migration 0001) ya garantizan no duplicados.

## 6. Validaciones (en `event1-validation.ts`)

| Categoría | Regla |
|---|---|
| `group_winner` | Exactamente 12 picks, uno por grupo A-L. Team debe pertenecer al grupo. |
| `playoff_team` | Exactamente 32 picks. **Debe incluir los 12 group_winners** (auto-marcados, no destildables). |
| `semifinalist` | Exactamente 4 picks. Cada uno debe estar en playoff_teams. |
| `finalist` | Exactamente 1 pick. Debe ser uno de los 4 semis. |
| `champion` | Exactamente 1 pick. Debe ser uno de los 4 semis. |

**Cascada:** si destildás un semi que era finalist/champion, se limpia el dependiente y se muestra warning inline. Si destildás de playoffs alguien que era semi, idem.

**Persistencia parcial:** el autosave guarda lo que haya (no exige completitud — pueden ser 5 winners de 12), pero sí valida **coherencia local** del payload: un `group_winner` de Grupo A debe ser un team del Grupo A; un `semifinalist` debe estar en playoff_teams ya guardados; etc. Payloads con coherencia rota se rechazan con error inline.

La validación de "completitud" es para mostrar el check verde y habilitar "Enviar definitivo" (que no cambia DB, solo muestra OK al usuario).

## 7. Autosave

- **Granularidad:** por sección. Cada cambio en `group-winners` dispara save solo de esa sección, no toca las otras.
- **Debounce:** 800ms desde el último cambio.
- **Server action:** `saveSection(kind, payload)`:
  1. Verifica `events.status='open'` o el caller es admin.
  2. Valida shape mínimo (no exige completitud, sí coherencia: e.g. en group_winners el team pertenece al grupo).
  3. Hace `delete from predictions where user_id=auth.uid() and event_id=1 and kind=$kind` + `insert` del payload nuevo. Strategy "replace por kind" para evitar diffing.
  4. Devuelve `{ savedAt: Date }`.
- **UI por sección:** chip con estado `idle | dirty | saving | saved | error`. Optimistic UI (mostrar saved inmediatamente, revertir si error).

## 8. Status del evento y toggle admin

`page.tsx` lee `events.status` y `profile.role` en el server:

| Status | Player | Admin |
|---|---|---|
| `draft` | "El evento todavía no está abierto" (placeholder) | Form editable + barra superior con `[Abrir evento]` |
| `open` | Form editable | Form editable + `[Cerrar evento]` |
| `locked` | Read-only (sus picks finales) | Read-only + `[Reabrir]` (out of scope Fase 2 — solo `Cerrar` y `Abrir`) |
| `scored` | Read-only | Read-only |

`actions.ts`:

- `openEvent(eventId)`: requiere admin, `status='draft'` → `'open'`. Setea `opens_at = now()`. Inserta en `admin_audit_log`.
- `lockEvent(eventId)`: requiere admin, `status='open'` → `'locked'`. Setea `closes_at = now()`. Llama a `fn_lock_event(eventId)` si existe la función (ya está en migration 0003). Inserta en `admin_audit_log`.

## 9. Script `assign-groups.ts`

**Uso:** `npx tsx scripts/assign-groups.ts` (opcional `--mock`).

**Lógica:**
1. Intenta `GET https://api.football-data.org/v4/competitions/WC/standings` y mapea cada team a su grupo por la respuesta.
2. Si la API no devuelve grupos (caso plan free o pre-sorteo): si flag `--mock`, asigna aleatorio balanceado (12 grupos × 4). Sin `--mock`, error claro con instrucción.
3. Hace `UPDATE teams SET group_code=$grupo WHERE code=$tla` con service_role.
4. Imprime resumen `Grupo A: ARG, BRA, ... ✓`.

## 10. UI primitives nuevas

- `checkbox.tsx` — basado en `@radix-ui/react-checkbox` (estándar shadcn).
- `label.tsx` — basado en `@radix-ui/react-label` (asocia inputs).
- Picker con búsqueda (`SearchableTeamPicker`): componente custom, lista filtrable por `name` y `tla`. No usa Radix Combobox para mantener bundle chico.

Dependencias npm a sumar: `@radix-ui/react-checkbox`, `@radix-ui/react-label`.

## 11. Flujo de carga inicial en `page.tsx`

```
1. requireUser() → user + profile.
2. Si params.id !== '1' → 404 placeholder (otros eventos vienen en Fase 5).
3. fetch en paralelo:
   - event (events + event_categories join)
   - teams (los 48, con group_code)
   - userPredictions (de user × event_id=1, agrupadas por kind)
4. Render <Event1Form> con todo serializado, o placeholder si status='draft' y no admin.
```

## 12. Server actions — contratos

```ts
saveSection(input: {
  kind: 'group_winner' | 'playoff_team' | 'semifinalist' | 'finalist' | 'champion',
  picks: Array<{ team_code: string; meta?: { group_code?: string } }>
}): Promise<{ savedAt: string } | { error: string }>

openEvent(eventId: number): Promise<{ ok: true } | { error: string }>
lockEvent(eventId: number): Promise<{ ok: true } | { error: string }>
```

Validación con Zod en ambos lados. Errores devuelven mensaje en español traducido.

## 13. Riesgos / supuestos

- **Sorteo cargado en FD:** asumimos que el endpoint `/standings` ya tiene los 12 grupos para `WC` con composición. Si no, el script cae a `--mock` y la UX queda válida pero los grupos no reflejan la realidad.
- **`fn_lock_event` existe:** la migration 0003 la crea. Si por algún motivo no está aplicada, `lockEvent` cae a un simple `UPDATE`.
- **Carga en mobile:** 48 teams + 12 selects no es pesado, pero el grid de 48 con checkboxes y banderas debería testearse en pantalla chica.

## 14. Verificación post-implementación

- [ ] Player sin admin no puede ver form si status='draft'.
- [ ] Admin ve form en draft y puede abrir el evento.
- [ ] Cada sección autosalva en ~1s después del último cambio.
- [ ] Marcar los 12 winners auto-marca esos teams en playoffs (visualmente).
- [ ] No se permite destildar un winner en playoffs sin antes deselectarlo como winner.
- [ ] Validar 32/4/1/1 completos habilita el botón "Enviar definitivo" (que muestra check verde, sin mutación DB).
- [ ] Recargar la página recupera todo lo guardado.
- [ ] Abrir el evento en una pestaña + lockear en otra → la primera muestra error al próximo save.
- [ ] `script assign-groups.ts` cargó los 48 teams con su grupo correcto.
