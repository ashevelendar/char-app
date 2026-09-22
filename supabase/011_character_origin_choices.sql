-- 011 - Character origin/proficiency choices
alter table public.characters
  add column if not exists subrace_id uuid references public.subraces(id) on delete set null,
  add column if not exists tools jsonb not null default '[]'::jsonb;

create index if not exists characters_subrace_id_idx
  on public.characters (subrace_id);

grant select on public.subraces to authenticated;
