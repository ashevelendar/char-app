-- ============================================================
-- 006: Feat catalogue
-- ============================================================
create table if not exists public.feats (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  prerequisite jsonb,
  ability jsonb,
  additional_spells jsonb,
  source text,
  source_code text,
  edition text not null default '2014',
  page integer,
  content_key text,
  raw_data jsonb,
  is_homebrew boolean not null default false,
  owner_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint feats_edition_check check (edition in ('2014', '2024', 'custom'))
);
create unique index if not exists feats_content_key_uidx on public.feats (content_key);
create index if not exists feats_edition_source_idx on public.feats (edition, source_code);
create index if not exists feats_edition_name_idx on public.feats (edition, name);
