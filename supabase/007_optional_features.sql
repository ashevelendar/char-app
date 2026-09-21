-- ============================================================
-- D&D CHARACTER MANAGER
-- 007 - Optional Features
-- ============================================================

create table if not exists public.optional_features (
  id uuid primary key default gen_random_uuid(),

  name text not null,
  description text not null default '',

  feature_types jsonb not null default '[]'::jsonb,
  prerequisite jsonb,
  consumes jsonb,
  additional_spells jsonb,
  optional_feature_progression jsonb,

  is_class_feature_variant boolean not null default false,

  source text not null,
  source_code text not null,

  edition text not null default '2014',
  page integer,

  is_homebrew boolean not null default false,
  owner_id uuid,

  content_key text,

  raw_data jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint optional_features_edition_check
    check (edition in ('2014', '2024', 'custom'))
);

-- Stable 5e.tools identity
drop index if exists optional_features_content_key_uidx;

create unique index optional_features_content_key_uidx
  on public.optional_features (content_key);

-- Useful catalogue indexes
create index if not exists optional_features_edition_source_idx
  on public.optional_features (edition, source_code);

create index if not exists optional_features_feature_types_gin_idx
  on public.optional_features using gin (feature_types);

create index if not exists optional_features_raw_data_gin_idx
  on public.optional_features using gin (raw_data);

-- Keep updated_at consistent with the existing catalogue tables
drop trigger if exists set_optional_features_updated_at
  on public.optional_features;

create trigger set_optional_features_updated_at
before update on public.optional_features
for each row
execute function public.set_updated_at();

-- RLS
alter table public.optional_features enable row level security;

drop policy if exists "Authenticated users can read optional features"
  on public.optional_features;

create policy "Authenticated users can read optional features"
on public.optional_features
for select
to authenticated
using (true);

-- ============================================================
-- END 007
-- ============================================================
