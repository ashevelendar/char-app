-- ============================================================
-- D&D CHARACTER MANAGER
-- 005 - Make subrace content keys parent-aware
--
-- A subrace name is not globally unique within a source.
-- Example: ERLW has "Variant; Mark of Finding" for both Human
-- and Half-Orc. The parent race must therefore be part of identity.
-- Run after 004_subraces.sql. Safe for an empty or populated table.
-- ============================================================

drop index if exists public.subraces_content_key_uidx;

update public.subraces
set content_key = concat(
  edition, ':subrace:', lower(coalesce(source_code, source)), ':',
  lower(regexp_replace(regexp_replace(coalesce(race_source_code, 'PHB') || '-' || coalesce(race_name, ''), '[^a-zA-Z0-9]+', '-', 'g'), '(^-|-$)', '', 'g')), '-',
  lower(regexp_replace(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'), '(^-|-$)', '', 'g'))
);

create unique index if not exists subraces_content_key_uidx
  on public.subraces (content_key);
