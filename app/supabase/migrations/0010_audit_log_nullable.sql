-- =================================================================
-- Prode Mundial 2026 — admin_audit_log.actor_user_id nullable
-- Migration 0010
-- =================================================================
-- Permite audit log entries sin usuario (system/cron operations).
-- Re-correr es idempotente: drop not null sobre una columna ya nullable
-- es no-op (no falla).
-- =================================================================

alter table admin_audit_log
  alter column actor_user_id drop not null;
