create table if not exists public.character_progression_history (
  character_id uuid not null references public.characters(id) on delete cascade,
  kind text not null check (kind in ('asi', 'expertise', 'magical-secrets')),
  level integer not null check (level between 1 and 20),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (character_id, kind, level)
);

alter table public.character_progression_history enable row level security;

drop policy if exists "Users can view own character progression history" on public.character_progression_history;
create policy "Users can view own character progression history"
  on public.character_progression_history
  for select
  using (
    exists (
      select 1
      from public.characters c
      where c.id = character_progression_history.character_id
        and c.user_id = auth.uid()
    )
  );

drop policy if exists "Users can insert own character progression history" on public.character_progression_history;
create policy "Users can insert own character progression history"
  on public.character_progression_history
  for insert
  with check (
    exists (
      select 1
      from public.characters c
      where c.id = character_progression_history.character_id
        and c.user_id = auth.uid()
    )
  );

drop policy if exists "Users can update own character progression history" on public.character_progression_history;
create policy "Users can update own character progression history"
  on public.character_progression_history
  for update
  using (
    exists (
      select 1
      from public.characters c
      where c.id = character_progression_history.character_id
        and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.characters c
      where c.id = character_progression_history.character_id
        and c.user_id = auth.uid()
    )
  );

drop policy if exists "Users can delete own character progression history" on public.character_progression_history;
create policy "Users can delete own character progression history"
  on public.character_progression_history
  for delete
  using (
    exists (
      select 1
      from public.characters c
      where c.id = character_progression_history.character_id
        and c.user_id = auth.uid()
    )
  );

create index if not exists character_progression_history_character_id_idx
  on public.character_progression_history(character_id);
