-- ============================================================
-- D&D CHARACTER MANAGER
-- 008 - Character Optional Features
-- ============================================================
--
-- Purpose:
--   Link a character to the optional features they have selected.
--   This is a many-to-many relationship because a character can have
--   multiple optional features and the same catalogue feature can be
--   selected by many characters.
--
-- Examples:
--   Warlock -> Agonizing Blast
--   Fighter -> Archery
--   Battle Master -> Precision Attack
--
-- The catalogue remains in optional_features. This table stores only
-- the character's selection/grant.
-- ============================================================

create table if not exists public.character_optional_features (
  character_id uuid not null
    references public.characters(id)
    on delete cascade,

  optional_feature_id uuid not null
    references public.optional_features(id)
    on delete cascade,

  dm_granted boolean not null default false,
  source text not null default 'Normal',
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (character_id, optional_feature_id)
);

-- The primary key covers character_id for the character-scoped
-- RLS policies and normal character lookups.
create index if not exists character_optional_features_feature_idx
  on public.character_optional_features (optional_feature_id);

-- Keep updated_at consistent with the existing character/catalogue tables.
drop trigger if exists set_character_optional_features_updated_at
  on public.character_optional_features;

create trigger set_character_optional_features_updated_at
before update on public.character_optional_features
for each row
execute function public.set_updated_at();

-- RLS
alter table public.character_optional_features enable row level security;

-- Only the owner of the character can see its selected optional features.
drop policy if exists "Users can view own character optional features"
  on public.character_optional_features;

create policy "Users can view own character optional features"
on public.character_optional_features
for select
to authenticated
using (
  exists (
    select 1
    from public.characters c
    where c.id = character_optional_features.character_id
      and c.user_id = auth.uid()
  )
);

-- Only the owner of the character can add an optional feature selection.
drop policy if exists "Users can insert own character optional features"
  on public.character_optional_features;

create policy "Users can insert own character optional features"
on public.character_optional_features
for insert
to authenticated
with check (
  exists (
    select 1
    from public.characters c
    where c.id = character_optional_features.character_id
      and c.user_id = auth.uid()
  )
);

-- Only the owner can change a selection/grant.
drop policy if exists "Users can update own character optional features"
  on public.character_optional_features;

create policy "Users can update own character optional features"
on public.character_optional_features
for update
to authenticated
using (
  exists (
    select 1
    from public.characters c
    where c.id = character_optional_features.character_id
      and c.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.characters c
    where c.id = character_optional_features.character_id
      and c.user_id = auth.uid()
  )
);

-- Only the owner can remove a selection.
drop policy if exists "Users can delete own character optional features"
  on public.character_optional_features;

create policy "Users can delete own character optional features"
on public.character_optional_features
for delete
to authenticated
using (
  exists (
    select 1
    from public.characters c
    where c.id = character_optional_features.character_id
      and c.user_id = auth.uid()
  )
);

-- Explicit Data API permissions for the signed-in app.
grant select, insert, update, delete
on public.character_optional_features
to authenticated;

-- ============================================================
-- END 008
-- ============================================================
