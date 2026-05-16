-- =================================================================
-- Prode Mundial 2026 — Funciones de dominio
-- Migration 0003
-- =================================================================
-- compute_outcome:  deriva outcome_pre_penalties de los scores
-- fn_lock_event:    cierra un evento (status = 'locked')
-- fn_score_event:   recalcula awarded_points y scores para un evento.
--                   Idempotente: se puede correr N veces sin efectos colaterales.
-- =================================================================

-- ----------------------------------------------------------------
-- compute_outcome (trigger): mantiene outcome_pre_penalties en sincronía
-- ----------------------------------------------------------------
create or replace function compute_match_outcome()
returns trigger
language plpgsql
as $$
begin
  if new.went_to_penalties then
    new.outcome_pre_penalties = 'draw'::match_outcome;
  elsif new.home_score_120 is not null and new.away_score_120 is not null then
    new.outcome_pre_penalties = case
      when new.home_score_120 > new.away_score_120 then 'home'::match_outcome
      when new.home_score_120 < new.away_score_120 then 'away'::match_outcome
      else null  -- empate sin ir a penales: caso anómalo, deja que el admin revise
    end;
  elsif new.home_score_90 is not null and new.away_score_90 is not null then
    new.outcome_pre_penalties = case
      when new.home_score_90 > new.away_score_90 then 'home'::match_outcome
      when new.home_score_90 < new.away_score_90 then 'away'::match_outcome
      else null  -- 90' empatado sin alargue cargado: incompleto
    end;
  else
    new.outcome_pre_penalties = null;
  end if;

  return new;
end;
$$;

drop trigger if exists matches_compute_outcome on matches;
create trigger matches_compute_outcome
  before insert or update on matches
  for each row execute function compute_match_outcome();

-- ----------------------------------------------------------------
-- fn_lock_event: cerrar un evento (idempotente)
-- Solo admin puede invocarla manualmente.
-- El cron usa SUPABASE_SERVICE_ROLE_KEY (bypassea RLS y este check).
-- ----------------------------------------------------------------
create or replace function fn_lock_event(p_event_id smallint)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Solo admin puede cerrar eventos manualmente';
  end if;

  update events
    set status = 'locked'
  where id = p_event_id
    and status = 'open';
end;
$$;

revoke all on function fn_lock_event(smallint) from public;
grant execute on function fn_lock_event(smallint) to authenticated;

-- ----------------------------------------------------------------
-- fn_score_event: recalcula puntajes de un evento (idempotente)
-- ----------------------------------------------------------------
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

  -- 1) Resetear awarded_points e is_correct para todas las predicciones del evento
  update predictions
    set awarded_points = 0,
        is_correct = null
  where event_id = p_event_id;

  -- 2) Para cada categoría del evento, calcular aciertos según su lógica
  -- ------------------------------------------------------------------
  -- 2.a) champion / finalist  (singular)
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

  -- 2.b) semifinalist / playoff_team / group_winner  (set-based)
  -- semifinalist: el team avanzó al menos a semis
  update predictions p
    set is_correct = true,
        awarded_points = ec.points_per_correct
  from event_categories ec
  where ec.event_id = p.event_id
    and ec.kind = p.kind
    and p.kind = 'semifinalist'
    and exists (
      select 1 from teams t
      where t.code = p.team_code
        and t.eliminated_at_stage in ('sf','final','champion')
    );

  -- playoff_team: el team avanzó al menos a r32 (clasificó a playoffs)
  update predictions p
    set is_correct = true,
        awarded_points = ec.points_per_correct
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
  -- ojo: arriba 'is distinct from group' + 'is not null' ⇒ team avanzó más allá de fase de grupos.
  -- Si el campo eliminated_at_stage NO se setea hasta el final del torneo, este check no servirá
  -- en tiempo real. Para uso correcto: setear eliminated_at_stage = 'group' a los 16 que NO clasifican,
  -- y dejar NULL a los que clasifican y todavía siguen vivos en mata-mata.
  -- Convención usada en el resto del sistema: eliminated_at_stage = NULL ⇒ aún vivo.

  -- Mejor versión: usar una vista que defina "teams_in_playoffs"
  -- Por ahora, marcamos correcto si el equipo NO está eliminado en 'group'.
  -- Esto requiere setear eliminated_at_stage = 'group' para los que no pasan.

  -- group_winner: el team pertenece al grupo indicado y fue su ganador.
  -- Asumimos que el admin actualiza teams.group_code y un campo group_position
  -- (1 = ganador, 2 = segundo, etc.) en otra migration futura.
  -- Por ahora, definimos correcto cuando team_code pertenece al grupo correcto.
  -- TODO Fase 5: incluir validación de "fue el primero".
  update predictions p
    set is_correct = true,
        awarded_points = ec.points_per_correct
  from event_categories ec, teams t
  where ec.event_id = p.event_id
    and ec.kind = p.kind
    and p.kind = 'group_winner'
    and t.code = p.team_code
    and t.group_code = (p.meta->>'group_code')
    -- Cuando se cargue group_position en teams, reemplazar por: and t.group_position = 1
    and false;  -- desactivado temporalmente hasta tener group_position

  -- 2.c) winners y outcomes de cada ronda
  -- *_winner: predicción team_code coincide con matches.winner_team_code
  update predictions p
    set is_correct = true,
        awarded_points = ec.points_per_correct
  from event_categories ec, matches m
  where ec.event_id = p.event_id
    and ec.kind = p.kind
    and p.kind in ('r32_winner','r16_winner','qf_winner')
    and m.id = p.match_id
    and m.winner_team_code is not null
    and m.winner_team_code = p.team_code;

  -- *_outcome: predicción outcome coincide con matches.outcome_pre_penalties
  update predictions p
    set is_correct = true,
        awarded_points = ec.points_per_correct
  from event_categories ec, matches m
  where ec.event_id = p.event_id
    and ec.kind = p.kind
    and p.kind in ('r32_outcome','r16_outcome','qf_outcome')
    and m.id = p.match_id
    and m.outcome_pre_penalties is not null
    and m.outcome_pre_penalties = p.outcome;

  -- 3) Marcar incorrectos a los demás (para distinguir is_correct = false de NULL)
  update predictions
    set is_correct = false
  where event_id = p_event_id
    and is_correct is null;

  -- 4) Actualizar tabla scores (resumen por user+event)
  delete from scores where event_id = p_event_id;
  insert into scores (user_id, event_id, points, correct_count, updated_at)
  select p.user_id,
         p.event_id,
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

  -- 6) Retornar el resumen
  return query
    select s.user_id, s.points, s.correct_count
    from scores s
    where s.event_id = p_event_id
    order by s.points desc;
end;
$$;

revoke all on function fn_score_event(smallint) from public;
grant execute on function fn_score_event(smallint) to authenticated;

-- ----------------------------------------------------------------
-- v_leaderboard: vista de leaderboard global
-- ----------------------------------------------------------------
create or replace view v_leaderboard as
select
  p.id as user_id,
  p.display_name,
  p.avatar_url,
  coalesce(sum(s.points), 0)::int as total_points,
  coalesce(sum(s.correct_count), 0)::int as total_correct
from profiles p
left join scores s on s.user_id = p.id
where p.role = 'player' or p.role = 'admin' or p.role = 'scorer'
group by p.id, p.display_name, p.avatar_url
order by total_points desc, p.display_name asc;

-- Permitir lectura del view a authenticated
grant select on v_leaderboard to authenticated;
