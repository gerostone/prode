-- =================================================================
-- Prode Mundial 2026 — Bracket seed + sync infrastructure
-- Migration 0009
-- =================================================================

-- 1) external_id en matches para mapeo con Football-Data.org
alter table matches
  add column external_id text unique;

-- 2) scheduled_at en matches_staging (sync stagea cambios de calendario también)
alter table matches_staging
  add column scheduled_at timestamptz;

-- 3) Pre-seed 31 matches con bracket pairing consecutivo
insert into matches (stage, bracket_slot, parent_slot_home, parent_slot_away) values
  ('r32', 'R32-01', null, null),
  ('r32', 'R32-02', null, null),
  ('r32', 'R32-03', null, null),
  ('r32', 'R32-04', null, null),
  ('r32', 'R32-05', null, null),
  ('r32', 'R32-06', null, null),
  ('r32', 'R32-07', null, null),
  ('r32', 'R32-08', null, null),
  ('r32', 'R32-09', null, null),
  ('r32', 'R32-10', null, null),
  ('r32', 'R32-11', null, null),
  ('r32', 'R32-12', null, null),
  ('r32', 'R32-13', null, null),
  ('r32', 'R32-14', null, null),
  ('r32', 'R32-15', null, null),
  ('r32', 'R32-16', null, null),
  ('r16', 'R16-01', 'R32-01', 'R32-02'),
  ('r16', 'R16-02', 'R32-03', 'R32-04'),
  ('r16', 'R16-03', 'R32-05', 'R32-06'),
  ('r16', 'R16-04', 'R32-07', 'R32-08'),
  ('r16', 'R16-05', 'R32-09', 'R32-10'),
  ('r16', 'R16-06', 'R32-11', 'R32-12'),
  ('r16', 'R16-07', 'R32-13', 'R32-14'),
  ('r16', 'R16-08', 'R32-15', 'R32-16'),
  ('qf',  'QF-01',  'R16-01', 'R16-02'),
  ('qf',  'QF-02',  'R16-03', 'R16-04'),
  ('qf',  'QF-03',  'R16-05', 'R16-06'),
  ('qf',  'QF-04',  'R16-07', 'R16-08'),
  ('sf',  'SF-01',  'QF-01',  'QF-02'),
  ('sf',  'SF-02',  'QF-03',  'QF-04'),
  ('final','FINAL', 'SF-01',  'SF-02')
on conflict (bracket_slot) do nothing;

-- 4) fn_propagate_winner: cuando un match tiene winner, completa el child match
create or replace function fn_propagate_winner(p_match_id int)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_slot text;
  v_winner text;
begin
  select bracket_slot, winner_team_code into v_slot, v_winner
  from matches where id = p_match_id;
  if v_winner is null or v_slot is null then return; end if;

  update matches
    set home_team_code = v_winner
    where parent_slot_home = v_slot and home_team_code is null;

  update matches
    set away_team_code = v_winner
    where parent_slot_away = v_slot and away_team_code is null;
end;
$$;

revoke all on function fn_propagate_winner(int) from public;
grant execute on function fn_propagate_winner(int) to authenticated;
