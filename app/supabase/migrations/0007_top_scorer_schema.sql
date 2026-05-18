-- =================================================================
-- Prode Mundial 2026 — Top scorer + rebalanceo Campeón
-- Migration 0007
-- =================================================================

-- 1) Tabla players
create table players (
  id serial primary key,
  full_name text not null unique,
  team_code text not null references teams(code) on delete restrict,
  display_order int not null default 0,
  created_at timestamptz not null default now()
);
create index players_team_idx on players(team_code);

-- 2) Columna nueva en predictions
alter table predictions add column player_id int references players(id) on delete restrict;
create index predictions_player_idx on predictions(player_id);

-- 3) Rebalanceo scoring + nueva categoría
update event_categories
  set points_per_correct = 200
  where event_id = 1 and kind = 'champion';

insert into event_categories (event_id, kind, required_count, points_per_correct, display_order)
  values (1, 'top_scorer', 1, 200, 6)
  on conflict (event_id, kind) do update
    set required_count = excluded.required_count,
        points_per_correct = excluded.points_per_correct,
        display_order = excluded.display_order;

-- 4) Extender uniqueness para top_scorer
drop index if exists predictions_singular_uq;
create unique index predictions_singular_uq
  on predictions(user_id, event_id, kind)
  where kind in ('champion', 'finalist', 'top_scorer');

-- 5) RLS de players (patrón teams/groups)
alter table players enable row level security;

create policy "players_read_authenticated"
  on players for select to authenticated using (true);

create policy "players_admin_write"
  on players for all to authenticated
  using (is_admin()) with check (is_admin());

-- 6) Seed: 18 jugadores candidatos a goleador
insert into players (full_name, team_code, display_order) values
  ('Lionel Messi',          'ARG',  1),
  ('Julián Álvarez',        'ARG',  2),
  ('Vinícius Júnior',       'BRA',  3),
  ('Raphinha',              'BRA',  4),
  ('Neymar Jr.',            'BRA',  5),
  ('Luis Díaz',             'COL',  6),
  ('Lamine Yamal',          'ESP',  7),
  ('Harry Kane',            'ENG',  8),
  ('Kylian Mbappé',         'FRA',  9),
  ('Ousmane Dembélé',       'FRA', 10),
  ('Cristiano Ronaldo',     'POR', 11),
  ('Erling Haaland',        'NOR', 12),
  ('Alexander Sørloth',     'NOR', 13),
  ('Nick Woltemade',        'GER', 14),
  ('Jamal Musiala',         'GER', 15),
  ('Memphis Depay',         'NED', 16),
  ('Mohamed Salah',         'EGY', 17),
  ('Sadio Mané',            'SEN', 18)
on conflict (full_name) do nothing;

-- 7) Verificación: que el Evento 1 siga sumando 1350
do $$
declare v_sum int;
begin
  select sum(required_count * points_per_correct) into v_sum
  from event_categories where event_id = 1;
  if v_sum <> 1350 then
    raise exception 'Evento 1 ya no suma 1350: %', v_sum;
  end if;
  raise notice 'OK: Evento 1 suma 1350.';
end;
$$;
