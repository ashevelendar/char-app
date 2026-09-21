-- ============================================================
-- D&D CHARACTER MANAGER
-- 004 - Persist selected feats on characters
-- ============================================================

alter table public.characters
  add column if not exists feats jsonb not null default '[]'::jsonb;


grant select on public.feats to authenticated;

alter table public.feats enable row level security;

drop policy if exists "Authenticated users can read feats" on public.feats;
create policy "Authenticated users can read feats"
on public.feats
for select
to authenticated
using (owner_id is null or owner_id = auth.uid());
