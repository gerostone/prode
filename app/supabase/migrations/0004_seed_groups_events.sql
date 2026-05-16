-- =================================================================
-- Prode Mundial 2026 — Seed: grupos, eventos y categorías de puntaje
-- Migration 0004
-- =================================================================

-- ----------------------------------------------------------------
-- 12 grupos del Mundial 2026 (A..L)
-- ----------------------------------------------------------------
insert into groups (code, display_name) values
  ('A', 'Grupo A'),
  ('B', 'Grupo B'),
  ('C', 'Grupo C'),
  ('D', 'Grupo D'),
  ('E', 'Grupo E'),
  ('F', 'Grupo F'),
  ('G', 'Grupo G'),
  ('H', 'Grupo H'),
  ('I', 'Grupo I'),
  ('J', 'Grupo J'),
  ('K', 'Grupo K'),
  ('L', 'Grupo L')
on conflict (code) do nothing;

-- ----------------------------------------------------------------
-- 4 eventos de votación
-- closes_at queda en NULL — se setea desde la app cuando se conoce
-- el kickoff del primer partido de la ronda correspondiente.
-- ----------------------------------------------------------------
insert into events (id, name, description, max_points, status) values
  (1,
   'Pronóstico inicial',
   'Antes del kickoff del Mundial: campeón, finalista, semifinalistas, 32 equipos a playoffs y 12 ganadores de grupo.',
   1350,
   'draft'),
  (2,
   'Llaves de 32avos',
   'Antes del Round of 32. Pronosticar los 16 ganadores y el resultado L/E/V de cada partido.',
   160,
   'draft'),
  (3,
   'Llaves de octavos',
   'Antes del Round of 16. Pronosticar los 8 ganadores y el resultado L/E/V de cada partido.',
   160,
   'draft'),
  (4,
   'Llaves de cuartos',
   'Antes de Cuartos de Final. Pronosticar los 4 ganadores y el resultado L/E/V de cada partido.',
   120,
   'draft')
on conflict (id) do nothing;

-- ----------------------------------------------------------------
-- Categorías de puntaje por evento
-- ----------------------------------------------------------------
-- Evento 1: 400 + 150 + 4×75 + 32×10 + 12×15 = 1350
insert into event_categories (event_id, kind, required_count, points_per_correct, display_order) values
  (1, 'group_winner',  12, 15,  1),
  (1, 'playoff_team', 32, 10,  2),
  (1, 'semifinalist',  4, 75,  3),
  (1, 'finalist',      1, 150, 4),
  (1, 'champion',      1, 400, 5)
on conflict (event_id, kind) do update
  set required_count    = excluded.required_count,
      points_per_correct = excluded.points_per_correct,
      display_order      = excluded.display_order;

-- Evento 2: 16×8 + 16×2 = 160
insert into event_categories (event_id, kind, required_count, points_per_correct, display_order) values
  (2, 'r32_winner',  16, 8, 1),
  (2, 'r32_outcome', 16, 2, 2)
on conflict (event_id, kind) do update
  set required_count    = excluded.required_count,
      points_per_correct = excluded.points_per_correct,
      display_order      = excluded.display_order;

-- Evento 3: 8×15 + 8×5 = 160
insert into event_categories (event_id, kind, required_count, points_per_correct, display_order) values
  (3, 'r16_winner',  8, 15, 1),
  (3, 'r16_outcome', 8, 5,  2)
on conflict (event_id, kind) do update
  set required_count    = excluded.required_count,
      points_per_correct = excluded.points_per_correct,
      display_order      = excluded.display_order;

-- Evento 4: 4×20 + 4×10 = 120
insert into event_categories (event_id, kind, required_count, points_per_correct, display_order) values
  (4, 'qf_winner',  4, 20, 1),
  (4, 'qf_outcome', 4, 10, 2)
on conflict (event_id, kind) do update
  set required_count    = excluded.required_count,
      points_per_correct = excluded.points_per_correct,
      display_order      = excluded.display_order;

-- ----------------------------------------------------------------
-- Verificación: que todos los eventos sumen lo declarado
-- ----------------------------------------------------------------
do $$
declare
  v_event_id smallint;
  v_max int;
  v_sum int;
begin
  for v_event_id, v_max in
    select id, max_points from events order by id
  loop
    select coalesce(sum(required_count * points_per_correct), 0)
      into v_sum
    from event_categories where event_id = v_event_id;

    if v_sum <> v_max then
      raise exception
        'Evento % declara max_points=% pero las categorías suman %',
        v_event_id, v_max, v_sum;
    end if;
  end loop;

  raise notice 'OK: cada evento suma exactamente lo declarado.';
end;
$$;
