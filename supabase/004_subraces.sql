-- ============================================================
-- D&D CHARACTER MANAGER
-- 004 - 5e.tools subraces
--
-- Adds a first-class subraces catalogue linked to races.
-- Run once after 003_5etools_content_model.sql.
-- ============================================================

create table if not exists public.subraces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  source text not null,
  is_homebrew boolean not null default false,
  owner_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  race_id uuid not null references public.races(id) on delete cascade,

  edition text not null default '2014',
  content_key text,
  source_code text,
  page integer,
  race_name text,
  race_source_code text,
  raw_data jsonb not null default '{}'::jsonb,

  constraint subraces_edition_check
    check (edition in ('2014', '2024', 'custom'))
);

drop index if exists public.subraces_content_key_uidx;
create unique index if not exists subraces_content_key_uidx
  on public.subraces (content_key);

create index if not exists subraces_edition_source_idx
  on public.subraces (edition, source_code);

create index if not exists subraces_race_id_idx
  on public.subraces (race_id);

create index if not exists subraces_raw_data_gin_idx
  on public.subraces using gin (raw_data);

alter table public.subraces enable row level security;

drop policy if exists "Authenticated users can view subraces" on public.subraces;
create policy "Authenticated users can view subraces"
on public.subraces
for select
to authenticated
using (true);

grant select on public.subraces to authenticated;
