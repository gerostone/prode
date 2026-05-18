-- =================================================================
-- Prode Mundial 2026 — Carga manual de resultados
-- Migration 0008
-- =================================================================

-- 1) Nueva columna teams.group_position (1=ganador, 2=segundo, 3=tercero, 4=cuarto)
alter table teams
  add column group_position smallint check (group_position between 1 and 4);

-- 2) Nueva columna players.is_top_scorer
alter table players
  add column is_top_scorer boolean not null default false;
create index players_top_scorer_idx
  on players(is_top_scorer)
  where is_top_scorer = true;

-- 3) Reemplazar fn_score_event con la versión que arregla group_winner y agrega top_scorer
create or replace function fn_score_event(p_event_id smallint)
returns table (
  user_id uuid,
  points int,
  correct_count int
)
language plpgsql
security definer set search_path = public
as $$
declare
  v_is_caller_privileged boolean;
begin
  v_is_caller_privileged := is_admin_or_scorer();
  if not v_is_caller_privileged then
    raise exception 'Solo admin o scorer puede recalcular puntajes';
  end if;

  -- 1) Resetear awarded_points e is_correct
  update predictions
    set awarded_points = 0, is_correct = null
  where event_id = p_event_id;

  -- 2.a) champion / finalist
  update predictions p
    set is_correct = (
      select case
        when p.kind = 'champion'  then t.eliminated_at_stage = 'champion'
        when p.kind = 'finalist'  then t.eliminated_at_stage in ('final','champion')
        else false
      end
      from teams t where t.code = p.team_code
    ),
    awarded_points = ec.points_per_correct
  from event_categories ec
  where ec.event_id = p.event_id
    and ec.kind = p.kind
    and p.kind in ('champion','finalist')
    and p.team_code is not null
    and exists (
      select 1 from teams t
      where t.code = p.team_code
        and (
          (p.kind = 'champion' and t.eliminated_at_stage = 'champion')
          or (p.kind = 'finalist' and t.eliminated_at_stage in ('final','champion'))
        )
    );

  -- 2.b) semifinalist
  update predictions p
    set is_correct = true, awarded_points = ec.points_per_correct
  from event_categories ec
  where ec.event_id = p.event_id
    and ec.kind = p.kind
    and p.kind = 'semifinalist'
    and exists (
      select 1 from teams t
      where t.code = p.team_code
        and t.eliminated_at_stage in ('sf','final','champion')
    );

  -- 2.c) playoff_team
  update predictions p
    set is_correct = true, awarded_points = ec.points_per_correct
  from event_categories ec
  where ec.event_id = p.event_id
    and ec.kind = p.kind
    and p.kind = 'playoff_team'
    and exists (
      select 1 from teams t
      where t.code = p.team_code
        and t.eliminated_at_stage is distinct from 'group'
        and t.eliminated_at_stage is not null
    );

  -- 2.d) group_winner (habilitado: team es group_position=1 del grupo apuntado en meta)
  update predictions p
    set is_correct = true, awarded_points = ec.points_per_correct
  from event_categories ec, teams t
  where ec.event_id = p.event_id
    and ec.kind = p.kind
    and p.kind = 'group_winner'
    and t.code = p.team_code
    and t.group_code = (p.meta->>'group_code')
    and t.group_position = 1;

  -- 2.e) top_scorer (nuevo)
  update predictions p
    set is_correct = true, awarded_points = ec.points_per_correct
  from event_categories ec, players pl
  where ec.event_id = p.event_id
    and ec.kind = p.kind
    and p.kind = 'top_scorer'
    and pl.id = p.player_id
    and pl.is_top_scorer = true;

  -- 2.f) *_winner (r32/r16/qf)
  update predictions p
    set is_correct = true, awarded_points = ec.points_per_correct
  from event_categories ec, matches m
  where ec.event_id = p.event_id
    and ec.kind = p.kind
    and p.kind in ('r32_winner','r16_winner','qf_winner')
    and m.id = p.match_id
    and m.winner_team_code is not null
    and m.winner_team_code = p.team_code;

  -- 2.g) *_outcome (r32/r16/qf)
  update predictions p
    set is_correct = true, awarded_points = ec.points_per_correct
  from event_categories ec, matches m
  where ec.event_id = p.event_id
    and ec.kind = p.kind
    and p.kind in ('r32_outcome','r16_outcome','qf_outcome')
    and m.id = p.match_id
    and m.outcome_pre_penalties is not null
    and m.outcome_pre_penalties = p.outcome;

  -- 3) Marcar incorrectos
  update predictions
    set is_correct = false
  where event_id = p_event_id and is_correct is null;

  -- 4) Refrescar tabla scores
  delete from scores where event_id = p_event_id;
  insert into scores (user_id, event_id, points, correct_count, updated_at)
  select p.user_id, p.event_id,
         coalesce(sum(p.awarded_points), 0),
         count(*) filter (where p.is_correct = true),
         now()
  from predictions p
  where p.event_id = p_event_id
  group by p.user_id, p.event_id;

  -- 5) Si todas las predicciones tienen is_correct definido, marcar evento como scored
  if not exists (
    select 1 from predictions where event_id = p_event_id and is_correct is null
  ) then
    update events set status = 'scored' where id = p_event_id and status = 'locked';
  end if;

  -- 6) Retornar
  return query
    select s.user_id, s.points, s.correct_count
    from scores s
    where s.event_id = p_event_id
    order by s.points desc;
end;
$$;

revoke all on function fn_score_event(smallint) from public;
grant execute on function fn_score_event(smallint) to authenticated;
