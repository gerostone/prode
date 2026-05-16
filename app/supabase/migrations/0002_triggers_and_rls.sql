-- =================================================================
-- Prode Mundial 2026 — Triggers de auth + Row Level Security
-- Migration 0002
-- =================================================================

-- ----------------------------------------------------------------
-- Trigger: al crear un auth.user, crear automáticamente su profile
-- ----------------------------------------------------------------
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    'player'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ----------------------------------------------------------------
-- Helper: is_admin() / is_admin_or_scorer() / current_role()
-- ----------------------------------------------------------------
create or replace function current_user_role()
returns user_role
language sql
stable
security definer set search_path = public
as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function is_admin()
returns boolean
language sql
stable
as $$
  select current_user_role() = 'admin';
$$;

create or replace function is_admin_or_scorer()
returns boolean
language sql
stable
as $$
  select current_user_role() in ('admin', 'scorer');
$$;

-- ----------------------------------------------------------------
-- Habilitar RLS
-- ----------------------------------------------------------------
alter table profiles enable row level security;
alter table groups enable row level security;
alter table teams enable row level security;
alter table events enable row level security;
alter table event_categories enable row level security;
alter table matches enable row level security;
alter table predictions enable row level security;
alter table scores enable row level security;
alter table matches_staging enable row level security;
alter table admin_audit_log enable row level security;

-- ----------------------------------------------------------------
-- profiles
-- ----------------------------------------------------------------
create policy "profiles_select_all"
  on profiles for select to authenticated using (true);

create policy "profiles_update_self"
  on profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = (select role from profiles where id = auth.uid()));
-- Nota: el WITH CHECK impide que un usuario suba su propio role.

create policy "profiles_admin_all"
  on profiles for all to authenticated
  using (is_admin())
  with check (is_admin());

-- ----------------------------------------------------------------
-- groups / teams / events / event_categories  (lectura pública autenticada)
-- ----------------------------------------------------------------
create policy "groups_read"
  on groups for select to authenticated using (true);

create policy "groups_admin_write"
  on groups for all to authenticated using (is_admin()) with check (is_admin());

create policy "teams_read"
  on teams for select to authenticated using (true);

create policy "teams_admin_write"
  on teams for all to authenticated using (is_admin()) with check (is_admin());

create policy "events_read"
  on events for select to authenticated using (true);

create policy "events_admin_write"
  on events for all to authenticated using (is_admin()) with check (is_admin());

create policy "event_categories_read"
  on event_categories for select to authenticated using (true);

create policy "event_categories_admin_write"
  on event_categories for all to authenticated using (is_admin()) with check (is_admin());

-- ----------------------------------------------------------------
-- matches  (read autenticado; write admin/scorer)
-- ----------------------------------------------------------------
create policy "matches_read"
  on matches for select to authenticated using (true);

create policy "matches_scorer_write"
  on matches for all to authenticated
  using (is_admin_or_scorer())
  with check (is_admin_or_scorer());

-- ----------------------------------------------------------------
-- predictions
-- ----------------------------------------------------------------
-- SELECT propio en cualquier momento; ajeno solo si el evento ya está locked/scored.
create policy "predictions_select_own_or_post_lock"
  on predictions for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from events e
      where e.id = predictions.event_id
        and e.status in ('locked', 'scored')
    )
  );

-- INSERT/UPDATE/DELETE solo si soy el dueño Y el evento está open.
create policy "predictions_insert_own_while_open"
  on predictions for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from events e
      where e.id = predictions.event_id and e.status = 'open'
    )
  );

create policy "predictions_update_own_while_open"
  on predictions for update to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from events e
      where e.id = predictions.event_id and e.status = 'open'
    )
  )
  with check (user_id = auth.uid());

create policy "predictions_delete_own_while_open"
  on predictions for delete to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from events e
      where e.id = predictions.event_id and e.status = 'open'
    )
  );

-- Admin puede ver/editar siempre (para correcciones excepcionales).
create policy "predictions_admin_all"
  on predictions for all to authenticated
  using (is_admin())
  with check (is_admin());

-- ----------------------------------------------------------------
-- scores  (lectura para todos; escritura solo vía función SECURITY DEFINER)
-- ----------------------------------------------------------------
create policy "scores_read"
  on scores for select to authenticated using (true);

-- No definimos políticas de INSERT/UPDATE para usuarios — la función
-- fn_score_event con SECURITY DEFINER es la única vía de escritura.

-- ----------------------------------------------------------------
-- matches_staging  (admin/scorer ven y aprueban; nadie más toca)
-- ----------------------------------------------------------------
create policy "matches_staging_read"
  on matches_staging for select to authenticated
  using (is_admin_or_scorer());

create policy "matches_staging_write"
  on matches_staging for all to authenticated
  using (is_admin_or_scorer())
  with check (is_admin_or_scorer());

-- ----------------------------------------------------------------
-- admin_audit_log  (solo admin lee; las escrituras se hacen vía función)
-- ----------------------------------------------------------------
create policy "admin_audit_log_admin_read"
  on admin_audit_log for select to authenticated
  using (is_admin());

create policy "admin_audit_log_insert"
  on admin_audit_log for insert to authenticated
  with check (is_admin_or_scorer() and actor_user_id = auth.uid());
