-- 013 - User Homebrew Content

create table if not exists public.homebrew_content (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  content_type text not null check (content_type in ('spell','feature','feat','item','race','subrace','class','subclass','background','other')),
  name text not null,
  description text not null default '',
  source text not null default 'Homebrew',
  edition text not null default 'custom' check (edition in ('2014','2024','custom')),
  class_name text, subclass_name text, race_name text, background_name text,
  required_level integer check (required_level is null or required_level between 1 and 20),
  feature_types jsonb not null default '[]'::jsonb,
  prerequisites jsonb not null default '{}'::jsonb,
  data jsonb not null default '{}'::jsonb,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists homebrew_content_owner_idx on public.homebrew_content (owner_id);
create index if not exists homebrew_content_owner_type_idx on public.homebrew_content (owner_id, content_type);
create index if not exists homebrew_content_data_gin_idx on public.homebrew_content using gin (data);
create index if not exists homebrew_content_prerequisites_gin_idx on public.homebrew_content using gin (prerequisites);

drop trigger if exists set_homebrew_content_updated_at on public.homebrew_content;
create trigger set_homebrew_content_updated_at before update on public.homebrew_content for each row execute function public.set_updated_at();

alter table public.homebrew_content enable row level security;
drop policy if exists "Users can view own homebrew content" on public.homebrew_content;
create policy "Users can view own homebrew content" on public.homebrew_content for select to authenticated using (owner_id = auth.uid() or is_published = true);
drop policy if exists "Users can insert own homebrew content" on public.homebrew_content;
create policy "Users can insert own homebrew content" on public.homebrew_content for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists "Users can update own homebrew content" on public.homebrew_content;
create policy "Users can update own homebrew content" on public.homebrew_content for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "Users can delete own homebrew content" on public.homebrew_content;
create policy "Users can delete own homebrew content" on public.homebrew_content for delete to authenticated using (owner_id = auth.uid());
grant select, insert, update, delete on public.homebrew_content to authenticated;

create table if not exists public.character_homebrew (
  character_id uuid not null references public.characters(id) on delete cascade,
  homebrew_content_id uuid not null references public.homebrew_content(id) on delete cascade,
  dm_granted boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  primary key (character_id, homebrew_content_id)
);
create index if not exists character_homebrew_content_idx on public.character_homebrew (homebrew_content_id);
alter table public.character_homebrew enable row level security;
drop policy if exists "Users can view own character homebrew" on public.character_homebrew;
create policy "Users can view own character homebrew" on public.character_homebrew for select to authenticated using (exists (select 1 from public.characters c where c.id = character_homebrew.character_id and c.user_id = auth.uid()));
drop policy if exists "Users can insert own character homebrew" on public.character_homebrew;
create policy "Users can insert own character homebrew" on public.character_homebrew for insert to authenticated with check (exists (select 1 from public.characters c where c.id = character_homebrew.character_id and c.user_id = auth.uid()) and exists (select 1 from public.homebrew_content h where h.id = character_homebrew.homebrew_content_id and (h.owner_id = auth.uid() or h.is_published = true)));
drop policy if exists "Users can delete own character homebrew" on public.character_homebrew;
create policy "Users can delete own character homebrew" on public.character_homebrew for delete to authenticated using (exists (select 1 from public.characters c where c.id = character_homebrew.character_id and c.user_id = auth.uid()));
grant select, insert, delete on public.character_homebrew to authenticated;

-- END 013