-- =================================================================
-- Prode Mundial 2026 — Seed: admin inicial
-- Migration 0005
-- =================================================================
-- Promueve a admin al usuario gicornou@gmail.com si ya existe.
-- Si todavía no se registró, se ejecuta cuando lo haga, vía trigger.
-- =================================================================

-- Si el usuario ya existe, lo promovemos
update profiles
  set role = 'admin',
      display_name = coalesce(nullif(display_name, ''), 'Gero')
where id in (
  select id from auth.users where email = 'gicornou@gmail.com'
);

-- Wrapping para futuros logins: cuando se cree el profile vía trigger,
-- si el email es el del admin, lo dejamos como admin desde el vamos.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_role user_role;
begin
  v_role := case
    when new.email = 'gicornou@gmail.com' then 'admin'::user_role
    else 'player'::user_role
  end;

  insert into public.profiles (id, display_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    v_role
  )
  on conflict (id) do update set role = excluded.role
  where excluded.role = 'admin'::user_role;  -- solo upgrade automático para admin

  return new;
end;
$$;
