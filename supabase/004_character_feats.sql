-- ============================================================
-- D&D CHARACTER MANAGER
-- 004 - Persist selected feats on characters
-- ============================================================

alter table public.characters
  add column if not exists feats jsonb not null default '[]'::jsonb;

