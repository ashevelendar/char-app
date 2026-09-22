-- 012 - Character currency
alter table public.characters
  add column if not exists currency jsonb not null default '{"cp":0,"sp":0,"ep":0,"gp":0,"pp":0}'::jsonb;
