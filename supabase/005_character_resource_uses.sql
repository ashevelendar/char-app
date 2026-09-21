-- ============================================================
-- D&D CHARACTER MANAGER
-- 005 - Persist limited combat/resource uses
-- ============================================================

alter table public.characters
  add column if not exists resource_uses jsonb not null default '{}'::jsonb;
