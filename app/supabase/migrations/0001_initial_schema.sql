-- =================================================================
-- Prode Mundial 2026 — Schema inicial
-- Migration 0001
-- =================================================================
-- Crea todas las tablas core del Prode: perfiles, equipos, grupos,
-- eventos, predicciones, partidos, scoring y auditoría.
-- =================================================================

-- ----------------------------------------------------------------
-- Extensions
-- ----------------------------------------------------------------
create extension if not exists "uuid-ossp";

-- ----------------------------------------------------------------
-- Tipos enumerados
-- ----------------------------------------------------------------
create type user_role as enum ('player', 'scorer', 'admin');

create type event_status as enum ('draft', 'open', 'locked', 'scored');

create type stage as enum ('r32', 'r16', 'qf', 'sf', 'final');

create type prediction_kind as enum (
  'champion',
  'finalist',
  'semifinalist',
  'playoff_team',
  'group_winner',
  'r32_winner',
  'r32_outcome',
  'r16_winner',
  'r16_outcome',
  'qf_winner',
  'qf_outcome'
);

create type match_outcome as enum ('home', 'draw', 'away');

create type staging_status as enum ('pending', 'approved', 'rejected');

-- ----------------------------------------------------------------
-- profiles  (extiende auth.users)
-- ----------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url text,
  role user_role not null default 'player',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_role_idx on profiles(role);

-- ----------------------------------------------------------------
-- groups  (los 12 grupos del Mundial: A..L)
-- ----------------------------------------------------------------
create table groups (
  code text primary key check (code ~ '^[A-L]$'),
  display_name text not null
);

-- ----------------------------------------------------------------
-- teams  (las 48 selecciones clasificadas)
-- ----------------------------------------------------------------
create table teams (
  code text primary key,           -- ISO de 3 letras: "ARG", "BRA", ...
  name text not null,
  flag_url text,
  crest_url text,                  -- escudo / crest de Football-Data.org
  fifa_ranking int,                -- ranking al momento del sorteo
  group_code text references groups(code) on delete set null,
  external_id int,                 -- id en Football-Data.org para mapear datos
  eliminated_at_stage text         -- group | r32 | r16 | qf | sf | final | champion
);

create index teams_group_idx on teams(group_code);
create index teams_ranking_idx on teams(fifa_ranking);

-- ----------------------------------------------------------------
-- events  (los 4 eventos de votación)
-- ----------------------------------------------------------------
create table events (
  id smallint primary key check (id between 1 and 4),
  name text not null,
  description text,
  opens_at timestamptz,
  closes_at timestamptz,
  max_points int not null,
  status event_status not null default 'draft',
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------
-- event_categories  (qué se vota en cada evento y cuánto puntúa)
-- ----------------------------------------------------------------
create table event_categories (
  id serial primary key,
  event_id smallint not null references events(id) on delete cascade,
  kind prediction_kind not null,
  required_count int not null,
  points_per_correct int not null,
  display_order int not null default 0,
  unique(event_id, kind)
);

-- ----------------------------------------------------------------
-- matches  (partidos eliminatorios — 31 en total, 28 pronosticables)
-- ----------------------------------------------------------------
create table matches (
  id serial primary key,
  stage stage not null,
  bracket_slot text not null unique,        -- "R32-01" .. "R32-16", "R16-01" .. "FINAL"
  home_team_code text references teams(code),
  away_team_code text references teams(code),
  scheduled_at timestamptz,

  -- resultado del tiempo reglamentario / suplementario
  home_score_90 int,
  away_score_90 int,
  home_score_120 int,
  away_score_120 int,
  went_to_penalties boolean not null default false,
  winner_team_code text references teams(code),     -- incluye penales

  -- derivado: home | draw | away (pre-penales)
  outcome_pre_penalties match_outcome,

  -- llave: de qué slot viene cada equipo
  parent_slot_home text,
  parent_slot_away text,

  -- bloqueo de edición
  locked boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index matches_stage_idx on matches(stage);
create index matches_scheduled_idx on matches(scheduled_at);

-- ----------------------------------------------------------------
-- predictions  (genérica, polimórfica por kind)
-- ----------------------------------------------------------------
create table predictions (
  id bigserial primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  event_id smallint not null references events(id),
  kind prediction_kind not null,

  team_code text references teams(code),
  match_id int references matches(id) on delete cascade,
  outcome match_outcome,
  meta jsonb not null default '{}'::jsonb,

  -- scoring (lo setea fn_score_event)
  is_correct boolean,
  awarded_points int not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index predictions_user_event_idx on predictions(user_id, event_id);
create index predictions_kind_idx on predictions(kind);
create index predictions_match_idx on predictions(match_id);

-- Para group_winner: máximo una predicción por grupo por usuario.
create unique index predictions_group_winner_uq
  on predictions(user_id, event_id, ((meta->>'group_code')))
  where kind = 'group_winner';

-- Para champion/finalist: máximo una predicción por kind por usuario.
create unique index predictions_singular_uq
  on predictions(user_id, event_id, kind)
  where kind in ('champion', 'finalist');

-- Para match-based (winner/outcome): máximo una predicción por match+kind por usuario.
create unique index predictions_match_kind_uq
  on predictions(user_id, event_id, kind, match_id)
  where match_id is not null;

-- ----------------------------------------------------------------
-- scores  (caché materializado para leaderboard rápido)
-- ----------------------------------------------------------------
create table scores (
  user_id uuid not null references profiles(id) on delete cascade,
  event_id smallint not null references events(id),
  points int not null default 0,
  correct_count int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, event_id)
);

-- ----------------------------------------------------------------
-- matches_staging  (resultados traídos por la API, pendientes de aprobar)
-- ----------------------------------------------------------------
create table matches_staging (
  id serial primary key,
  match_id int not null references matches(id) on delete cascade,
  source text not null,                  -- 'football-data.org' | 'manual'
  external_match_id text,                -- id del partido en la API
  home_score_90 int,
  away_score_90 int,
  home_score_120 int,
  away_score_120 int,
  went_to_penalties boolean,
  winner_team_code text references teams(code),
  status staging_status not null default 'pending',
  fetched_at timestamptz not null default now(),
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  notes text
);

create index matches_staging_status_idx on matches_staging(status);
create index matches_staging_match_idx on matches_staging(match_id);

-- ----------------------------------------------------------------
-- admin_audit_log  (toda acción de admin/scorer queda registrada)
-- ----------------------------------------------------------------
create table admin_audit_log (
  id bigserial primary key,
  actor_user_id uuid not null references profiles(id),
  action text not null,                  -- 'approve_result' | 'edit_match' | 'open_event' | ...
  target_table text,
  target_id text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create index admin_audit_actor_idx on admin_audit_log(actor_user_id);
create index admin_audit_created_idx on admin_audit_log(created_at desc);

-- ----------------------------------------------------------------
-- Triggers de updated_at
-- ----------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on profiles
  for each row execute function set_updated_at();

create trigger matches_set_updated_at
  before update on matches
  for each row execute function set_updated_at();

create trigger predictions_set_updated_at
  before update on predictions
  for each row execute function set_updated_at();
