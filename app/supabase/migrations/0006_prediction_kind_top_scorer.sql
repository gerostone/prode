-- =================================================================
-- Prode Mundial 2026 — Agregar 'top_scorer' al enum prediction_kind
-- Migration 0006 (debe correrse aislada — ALTER TYPE no admite transacción)
-- =================================================================
alter type prediction_kind add value if not exists 'top_scorer';
