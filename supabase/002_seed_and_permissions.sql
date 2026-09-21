-- Campaign Ledger content seed and permissions migration.
-- Run this ONCE after the initial schema (001_initial_schema.sql) has succeeded.

alter table public.profiles
  add column if not exists access_mode text not null default 'player';

do $$
begin
  alter table public.profiles
    add constraint profiles_access_mode_check
    check (access_mode in ('player', 'dm'));
exception
  when duplicate_object then null;
end $$;

alter table public.classes
  add column if not exists spellcasting_mode text,
  add column if not exists max_spell_level_by_character_level jsonb,
  add column if not exists subclass_unlock_level integer;

alter table public.spells
  add column if not exists required_character_level integer;

alter table public.items
  add column if not exists required_class_id uuid references public.classes(id) on delete set null;

create table if not exists public.spell_subclasses (
  spell_id uuid not null references public.spells(id) on delete cascade,
  subclass_id uuid not null references public.subclasses(id) on delete cascade,
  primary key (spell_id, subclass_id)
);

create table if not exists public.spell_races (
  spell_id uuid not null references public.spells(id) on delete cascade,
  race_id uuid not null references public.races(id) on delete cascade,
  primary key (spell_id, race_id)
);

create unique index if not exists character_items_character_item_idx
  on public.character_items(character_id, item_id);

create unique index if not exists character_overrides_unique_idx
  on public.character_overrides(character_id, content_type, content_id);

alter table public.spell_subclasses enable row level security;
alter table public.spell_races enable row level security;

drop policy if exists "Authenticated users can view spell subclasses" on public.spell_subclasses;
create policy "Authenticated users can view spell subclasses"
on public.spell_subclasses for select to authenticated using (true);

drop policy if exists "Authenticated users can view spell races" on public.spell_races;
create policy "Authenticated users can view spell races"
on public.spell_races for select to authenticated using (true);

grant usage on schema public to authenticated;

grant select on
  public.profiles,
  public.races,
  public.classes,
  public.subclasses,
  public.backgrounds,
  public.spells,
  public.spell_classes,
  public.spell_subclasses,
  public.spell_races,
  public.features,
  public.class_features,
  public.subclass_features,
  public.race_features,
  public.background_features,
  public.items
to authenticated;

grant select, insert, update, delete on
  public.characters,
  public.character_spells,
  public.character_features,
  public.character_items,
  public.character_overrides
to authenticated;

grant insert, update on public.profiles to authenticated;

-- The application uses upsert for character features and DM overrides.
drop policy if exists "Users can update own character features" on public.character_features;
create policy "Users can update own character features"
on public.character_features
for update
to authenticated
using (
  exists (
    select 1 from public.characters c
    where c.id = character_features.character_id
      and c.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.characters c
    where c.id = character_features.character_id
      and c.user_id = auth.uid()
  )
);

drop policy if exists "Users can update own character overrides" on public.character_overrides;
create policy "Users can update own character overrides"
on public.character_overrides
for update
to authenticated
using (
  exists (
    select 1 from public.characters c
    where c.id = character_overrides.character_id
      and c.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.characters c
    where c.id = character_overrides.character_id
      and c.user_id = auth.uid()
  )
);


-- System classes

insert into public.classes (id,name,description,hit_die,spellcasting_ability,spellcasting_mode,max_spell_level_by_character_level,subclass_unlock_level,source,is_homebrew,owner_id)
values ('b6f61cfe-c8ed-55a5-8c73-51ed3db9a238','Barbarian','Built-in class catalogue entry.',12,null,'none','[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]'::jsonb,3,'Campaign Ledger demo catalogue',false,null)
on conflict (id) do update set
  name=excluded.name,
  hit_die=excluded.hit_die,
  spellcasting_ability=excluded.spellcasting_ability,
  spellcasting_mode=excluded.spellcasting_mode,
  max_spell_level_by_character_level=excluded.max_spell_level_by_character_level,
  subclass_unlock_level=excluded.subclass_unlock_level;

insert into public.classes (id,name,description,hit_die,spellcasting_ability,spellcasting_mode,max_spell_level_by_character_level,subclass_unlock_level,source,is_homebrew,owner_id)
values ('6f52ffa0-2e1e-58dc-9385-ff9b248ff8be','Bard','Built-in class catalogue entry.',8,'Charisma','known','[0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,9,9]'::jsonb,3,'Campaign Ledger demo catalogue',false,null)
on conflict (id) do update set
  name=excluded.name,
  hit_die=excluded.hit_die,
  spellcasting_ability=excluded.spellcasting_ability,
  spellcasting_mode=excluded.spellcasting_mode,
  max_spell_level_by_character_level=excluded.max_spell_level_by_character_level,
  subclass_unlock_level=excluded.subclass_unlock_level;

insert into public.classes (id,name,description,hit_die,spellcasting_ability,spellcasting_mode,max_spell_level_by_character_level,subclass_unlock_level,source,is_homebrew,owner_id)
values ('2dc8b189-d526-5ad2-8bf1-1d10afca8793','Cleric','Built-in class catalogue entry.',8,'Wisdom','prepared','[0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,9,9]'::jsonb,1,'Campaign Ledger demo catalogue',false,null)
on conflict (id) do update set
  name=excluded.name,
  hit_die=excluded.hit_die,
  spellcasting_ability=excluded.spellcasting_ability,
  spellcasting_mode=excluded.spellcasting_mode,
  max_spell_level_by_character_level=excluded.max_spell_level_by_character_level,
  subclass_unlock_level=excluded.subclass_unlock_level;

insert into public.classes (id,name,description,hit_die,spellcasting_ability,spellcasting_mode,max_spell_level_by_character_level,subclass_unlock_level,source,is_homebrew,owner_id)
values ('ae9d9f91-849f-57f4-852f-c24b8fdc9b3e','Druid','Built-in class catalogue entry.',8,'Wisdom','prepared','[0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,9,9]'::jsonb,2,'Campaign Ledger demo catalogue',false,null)
on conflict (id) do update set
  name=excluded.name,
  hit_die=excluded.hit_die,
  spellcasting_ability=excluded.spellcasting_ability,
  spellcasting_mode=excluded.spellcasting_mode,
  max_spell_level_by_character_level=excluded.max_spell_level_by_character_level,
  subclass_unlock_level=excluded.subclass_unlock_level;

insert into public.classes (id,name,description,hit_die,spellcasting_ability,spellcasting_mode,max_spell_level_by_character_level,subclass_unlock_level,source,is_homebrew,owner_id)
values ('16f09c0f-e695-5897-b672-a5c752f7f1ab','Fighter','Built-in class catalogue entry.',10,null,'none','[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]'::jsonb,3,'Campaign Ledger demo catalogue',false,null)
on conflict (id) do update set
  name=excluded.name,
  hit_die=excluded.hit_die,
  spellcasting_ability=excluded.spellcasting_ability,
  spellcasting_mode=excluded.spellcasting_mode,
  max_spell_level_by_character_level=excluded.max_spell_level_by_character_level,
  subclass_unlock_level=excluded.subclass_unlock_level;

insert into public.classes (id,name,description,hit_die,spellcasting_ability,spellcasting_mode,max_spell_level_by_character_level,subclass_unlock_level,source,is_homebrew,owner_id)
values ('9695cd10-b97e-5aa5-99f9-88675df70d99','Monk','Built-in class catalogue entry.',8,null,'none','[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]'::jsonb,3,'Campaign Ledger demo catalogue',false,null)
on conflict (id) do update set
  name=excluded.name,
  hit_die=excluded.hit_die,
  spellcasting_ability=excluded.spellcasting_ability,
  spellcasting_mode=excluded.spellcasting_mode,
  max_spell_level_by_character_level=excluded.max_spell_level_by_character_level,
  subclass_unlock_level=excluded.subclass_unlock_level;

insert into public.classes (id,name,description,hit_die,spellcasting_ability,spellcasting_mode,max_spell_level_by_character_level,subclass_unlock_level,source,is_homebrew,owner_id)
values ('a92a692d-8bdf-51a2-888f-b942e5a4d47f','Paladin','Built-in class catalogue entry.',10,'Charisma','prepared','[0,0,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5]'::jsonb,3,'Campaign Ledger demo catalogue',false,null)
on conflict (id) do update set
  name=excluded.name,
  hit_die=excluded.hit_die,
  spellcasting_ability=excluded.spellcasting_ability,
  spellcasting_mode=excluded.spellcasting_mode,
  max_spell_level_by_character_level=excluded.max_spell_level_by_character_level,
  subclass_unlock_level=excluded.subclass_unlock_level;

insert into public.classes (id,name,description,hit_die,spellcasting_ability,spellcasting_mode,max_spell_level_by_character_level,subclass_unlock_level,source,is_homebrew,owner_id)
values ('73f8ce18-af41-5236-9498-eb7a9755edd9','Ranger','Built-in class catalogue entry.',10,'Wisdom','known','[0,0,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5]'::jsonb,3,'Campaign Ledger demo catalogue',false,null)
on conflict (id) do update set
  name=excluded.name,
  hit_die=excluded.hit_die,
  spellcasting_ability=excluded.spellcasting_ability,
  spellcasting_mode=excluded.spellcasting_mode,
  max_spell_level_by_character_level=excluded.max_spell_level_by_character_level,
  subclass_unlock_level=excluded.subclass_unlock_level;

insert into public.classes (id,name,description,hit_die,spellcasting_ability,spellcasting_mode,max_spell_level_by_character_level,subclass_unlock_level,source,is_homebrew,owner_id)
values ('c56f5d26-4046-5754-811a-4df8ae0faf2e','Rogue','Built-in class catalogue entry.',8,null,'none','[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]'::jsonb,3,'Campaign Ledger demo catalogue',false,null)
on conflict (id) do update set
  name=excluded.name,
  hit_die=excluded.hit_die,
  spellcasting_ability=excluded.spellcasting_ability,
  spellcasting_mode=excluded.spellcasting_mode,
  max_spell_level_by_character_level=excluded.max_spell_level_by_character_level,
  subclass_unlock_level=excluded.subclass_unlock_level;

insert into public.classes (id,name,description,hit_die,spellcasting_ability,spellcasting_mode,max_spell_level_by_character_level,subclass_unlock_level,source,is_homebrew,owner_id)
values ('dfa877c6-baf0-525c-9480-828dda0c5ec6','Sorcerer','Built-in class catalogue entry.',6,'Charisma','known','[0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,9,9]'::jsonb,1,'Campaign Ledger demo catalogue',false,null)
on conflict (id) do update set
  name=excluded.name,
  hit_die=excluded.hit_die,
  spellcasting_ability=excluded.spellcasting_ability,
  spellcasting_mode=excluded.spellcasting_mode,
  max_spell_level_by_character_level=excluded.max_spell_level_by_character_level,
  subclass_unlock_level=excluded.subclass_unlock_level;

insert into public.classes (id,name,description,hit_die,spellcasting_ability,spellcasting_mode,max_spell_level_by_character_level,subclass_unlock_level,source,is_homebrew,owner_id)
values ('c7e57396-fafd-5e6e-861f-7f54a5ecdd7b','Warlock','Built-in class catalogue entry.',8,'Charisma','known','[0,1,1,2,2,3,3,4,4,5,5,5,5,5,5,5,5,5,5,5,5]'::jsonb,1,'Campaign Ledger demo catalogue',false,null)
on conflict (id) do update set
  name=excluded.name,
  hit_die=excluded.hit_die,
  spellcasting_ability=excluded.spellcasting_ability,
  spellcasting_mode=excluded.spellcasting_mode,
  max_spell_level_by_character_level=excluded.max_spell_level_by_character_level,
  subclass_unlock_level=excluded.subclass_unlock_level;

insert into public.classes (id,name,description,hit_die,spellcasting_ability,spellcasting_mode,max_spell_level_by_character_level,subclass_unlock_level,source,is_homebrew,owner_id)
values ('7db56f03-da85-50a3-bffe-b85fabef2cad','Wizard','Built-in class catalogue entry.',6,'Intelligence','prepared','[0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,9,9]'::jsonb,2,'Campaign Ledger demo catalogue',false,null)
on conflict (id) do update set
  name=excluded.name,
  hit_die=excluded.hit_die,
  spellcasting_ability=excluded.spellcasting_ability,
  spellcasting_mode=excluded.spellcasting_mode,
  max_spell_level_by_character_level=excluded.max_spell_level_by_character_level,
  subclass_unlock_level=excluded.subclass_unlock_level;

insert into public.classes (id,name,description,hit_die,spellcasting_ability,spellcasting_mode,max_spell_level_by_character_level,subclass_unlock_level,source,is_homebrew,owner_id)
values ('59034c12-ebf0-5101-9d9d-1766c3bb91fc','Artificer','Built-in class catalogue entry.',8,'Intelligence','prepared','[0,0,1,1,2,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5]'::jsonb,3,'Campaign Ledger demo catalogue',false,null)
on conflict (id) do update set
  name=excluded.name,
  hit_die=excluded.hit_die,
  spellcasting_ability=excluded.spellcasting_ability,
  spellcasting_mode=excluded.spellcasting_mode,
  max_spell_level_by_character_level=excluded.max_spell_level_by_character_level,
  subclass_unlock_level=excluded.subclass_unlock_level;

-- System races

insert into public.races (id,name,description,source,is_homebrew,owner_id)
values ('683c68a5-f9c5-5671-8ad1-546502dbc4a5','Human','Built-in race catalogue entry.','Campaign Ledger demo catalogue',false,null)
on conflict (id) do update set name=excluded.name, description=excluded.description;

insert into public.races (id,name,description,source,is_homebrew,owner_id)
values ('6da553db-9816-5c8e-9d38-873951864525','Elf','Built-in race catalogue entry.','Campaign Ledger demo catalogue',false,null)
on conflict (id) do update set name=excluded.name, description=excluded.description;

insert into public.races (id,name,description,source,is_homebrew,owner_id)
values ('acbdd814-f702-58f5-a254-755fdf7d77d4','Dwarf','Built-in race catalogue entry.','Campaign Ledger demo catalogue',false,null)
on conflict (id) do update set name=excluded.name, description=excluded.description;

insert into public.races (id,name,description,source,is_homebrew,owner_id)
values ('6124120d-be18-57d4-b6b0-81fc9be16a35','Lizardfolk','Built-in race catalogue entry.','Campaign Ledger demo catalogue',false,null)
on conflict (id) do update set name=excluded.name, description=excluded.description;

insert into public.races (id,name,description,source,is_homebrew,owner_id)
values ('112e6a14-9c1f-590b-b86d-f6d9ff6f08ef','Skarn','Built-in race catalogue entry.','Campaign Ledger demo catalogue',false,null)
on conflict (id) do update set name=excluded.name, description=excluded.description;

insert into public.races (id,name,description,source,is_homebrew,owner_id)
values ('8a268c70-5d85-512d-a41d-b0201abe7b35','Duskling','Built-in race catalogue entry.','Campaign Ledger demo catalogue',false,null)
on conflict (id) do update set name=excluded.name, description=excluded.description;

insert into public.races (id,name,description,source,is_homebrew,owner_id)
values ('3a5b7149-5cf5-5fd5-8e67-d461d6f03d10','Half-Elf','Built-in race catalogue entry.','Campaign Ledger demo catalogue',false,null)
on conflict (id) do update set name=excluded.name, description=excluded.description;

insert into public.races (id,name,description,source,is_homebrew,owner_id)
values ('1885d4ff-ac48-5bac-b579-3ee46b7adc1a','Tiefling','Built-in race catalogue entry.','Campaign Ledger demo catalogue',false,null)
on conflict (id) do update set name=excluded.name, description=excluded.description;

-- System subclasses

insert into public.subclasses (id,class_id,name,description,source,is_homebrew,owner_id)
values ('1a18c91f-eeb1-5f7c-8edf-c57aec3a1a2f','ae9d9f91-849f-57f4-852f-c24b8fdc9b3e','Circle of Dragons','Built-in subclass catalogue entry.','Campaign Ledger demo catalogue',false,null)
on conflict (id) do update set class_id=excluded.class_id,name=excluded.name,description=excluded.description;

insert into public.subclasses (id,class_id,name,description,source,is_homebrew,owner_id)
values ('c0a258b3-859e-50fe-b09d-27138b3bff9c','ae9d9f91-849f-57f4-852f-c24b8fdc9b3e','Circle of the Land','Built-in subclass catalogue entry.','Campaign Ledger demo catalogue',false,null)
on conflict (id) do update set class_id=excluded.class_id,name=excluded.name,description=excluded.description;

insert into public.subclasses (id,class_id,name,description,source,is_homebrew,owner_id)
values ('14d22fc1-7640-5f0a-bfe0-04a819d7b333','ae9d9f91-849f-57f4-852f-c24b8fdc9b3e','Circle of the Moon','Built-in subclass catalogue entry.','Campaign Ledger demo catalogue',false,null)
on conflict (id) do update set class_id=excluded.class_id,name=excluded.name,description=excluded.description;

insert into public.subclasses (id,class_id,name,description,source,is_homebrew,owner_id)
values ('ae9769d7-4995-5ffa-b036-b9f9a9d82604','ae9d9f91-849f-57f4-852f-c24b8fdc9b3e','Circle of Spores','Built-in subclass catalogue entry.','Campaign Ledger demo catalogue',false,null)
on conflict (id) do update set class_id=excluded.class_id,name=excluded.name,description=excluded.description;

insert into public.subclasses (id,class_id,name,description,source,is_homebrew,owner_id)
values ('f1cd007f-2bf4-5a95-9e1f-53595a41746c','c7e57396-fafd-5e6e-861f-7f54a5ecdd7b','The Fiend','Built-in subclass catalogue entry.','Campaign Ledger demo catalogue',false,null)
on conflict (id) do update set class_id=excluded.class_id,name=excluded.name,description=excluded.description;

insert into public.subclasses (id,class_id,name,description,source,is_homebrew,owner_id)
values ('3b19019d-d684-5785-8c7e-1ac21acad668','c7e57396-fafd-5e6e-861f-7f54a5ecdd7b','The Great Old One','Built-in subclass catalogue entry.','Campaign Ledger demo catalogue',false,null)
on conflict (id) do update set class_id=excluded.class_id,name=excluded.name,description=excluded.description;

insert into public.subclasses (id,class_id,name,description,source,is_homebrew,owner_id)
values ('bb9585c4-cd5a-5feb-9ed8-8b6137edced6','c7e57396-fafd-5e6e-861f-7f54a5ecdd7b','Hexblade','Built-in subclass catalogue entry.','Campaign Ledger demo catalogue',false,null)
on conflict (id) do update set class_id=excluded.class_id,name=excluded.name,description=excluded.description;

insert into public.subclasses (id,class_id,name,description,source,is_homebrew,owner_id)
values ('f779bc0f-2580-537d-a0a8-810408093f7a','7db56f03-da85-50a3-bffe-b85fabef2cad','School of Evocation','Built-in subclass catalogue entry.','Campaign Ledger demo catalogue',false,null)
on conflict (id) do update set class_id=excluded.class_id,name=excluded.name,description=excluded.description;

insert into public.subclasses (id,class_id,name,description,source,is_homebrew,owner_id)
values ('a4d11cf8-3380-5e45-9f0d-fb81c2e17442','7db56f03-da85-50a3-bffe-b85fabef2cad','School of Abjuration','Built-in subclass catalogue entry.','Campaign Ledger demo catalogue',false,null)
on conflict (id) do update set class_id=excluded.class_id,name=excluded.name,description=excluded.description;

insert into public.subclasses (id,class_id,name,description,source,is_homebrew,owner_id)
values ('4ed7c720-76b6-562d-8110-338dafd8ef41','b6f61cfe-c8ed-55a5-8c73-51ed3db9a238','Path of the Berserker','Built-in subclass catalogue entry.','Campaign Ledger demo catalogue',false,null)
on conflict (id) do update set class_id=excluded.class_id,name=excluded.name,description=excluded.description;

insert into public.subclasses (id,class_id,name,description,source,is_homebrew,owner_id)
values ('be2c5e22-523e-54b8-8456-64d0fd2f5749','6f52ffa0-2e1e-58dc-9385-ff9b248ff8be','College of Lore','Built-in subclass catalogue entry.','Campaign Ledger demo catalogue',false,null)
on conflict (id) do update set class_id=excluded.class_id,name=excluded.name,description=excluded.description;

insert into public.subclasses (id,class_id,name,description,source,is_homebrew,owner_id)
values ('ba702654-b379-5c2b-8995-c051ecd2f81c','a92a692d-8bdf-51a2-888f-b942e5a4d47f','Oath of Devotion','Built-in subclass catalogue entry.','Campaign Ledger demo catalogue',false,null)
on conflict (id) do update set class_id=excluded.class_id,name=excluded.name,description=excluded.description;

-- System backgrounds

insert into public.backgrounds (id,name,description,source,is_homebrew,owner_id)
values ('d336b5b2-7b1d-5923-a7b4-c93fe44c33a5','Acolyte','Built-in background catalogue entry.','Campaign Ledger demo catalogue',false,null)
on conflict (id) do update set name=excluded.name,description=excluded.description;

insert into public.backgrounds (id,name,description,source,is_homebrew,owner_id)
values ('130492a8-e33c-58f6-a48f-74d1cabf77a0','Criminal','Built-in background catalogue entry.','Campaign Ledger demo catalogue',false,null)
on conflict (id) do update set name=excluded.name,description=excluded.description;

insert into public.backgrounds (id,name,description,source,is_homebrew,owner_id)
values ('6e25975e-0570-5931-806a-6f25626c293b','Folk Hero','Built-in background catalogue entry.','Campaign Ledger demo catalogue',false,null)
on conflict (id) do update set name=excluded.name,description=excluded.description;

insert into public.backgrounds (id,name,description,source,is_homebrew,owner_id)
values ('cbc8392d-09c7-5aa8-9b93-ccc54b2fa994','Hermit','Built-in background catalogue entry.','Campaign Ledger demo catalogue',false,null)
on conflict (id) do update set name=excluded.name,description=excluded.description;

insert into public.backgrounds (id,name,description,source,is_homebrew,owner_id)
values ('d06ece8a-ce69-570c-a35c-013e6cf0ed53','Noble','Built-in background catalogue entry.','Campaign Ledger demo catalogue',false,null)
on conflict (id) do update set name=excluded.name,description=excluded.description;

insert into public.backgrounds (id,name,description,source,is_homebrew,owner_id)
values ('69e43f5b-1ddb-59bf-b0c1-382e4fd9852b','Sage','Built-in background catalogue entry.','Campaign Ledger demo catalogue',false,null)
on conflict (id) do update set name=excluded.name,description=excluded.description;

insert into public.backgrounds (id,name,description,source,is_homebrew,owner_id)
values ('74342211-0838-5dc6-b001-ce9bc70aa20e','Soldier','Built-in background catalogue entry.','Campaign Ledger demo catalogue',false,null)
on conflict (id) do update set name=excluded.name,description=excluded.description;

insert into public.backgrounds (id,name,description,source,is_homebrew,owner_id)
values ('0b2a4b02-0f4a-5743-a9ab-0e38783d7c1a','Swamp Warden','Built-in background catalogue entry.','Campaign Ledger demo catalogue',false,null)
on conflict (id) do update set name=excluded.name,description=excluded.description;

-- System spells

insert into public.spells (id,name,level,school,casting_time,range,duration,components,description,higher_levels,concentration,ritual,source,is_homebrew,owner_id,required_character_level)
values ('1fb3ac47-566b-57d6-9197-622e29290219','Guidance',0,'Divination','1 action','Touch','Concentration, up to 1 minute',null,'You touch one willing creature. Once before the spell ends, the target can add a d4 to one ability check of its choice.',null,false,false,'Campaign Ledger demo catalogue',false,null,null)
on conflict (id) do update set
  name=excluded.name,level=excluded.level,school=excluded.school,casting_time=excluded.casting_time,
  range=excluded.range,duration=excluded.duration,description=excluded.description,higher_levels=excluded.higher_levels,
  required_character_level=excluded.required_character_level;

insert into public.spells (id,name,level,school,casting_time,range,duration,components,description,higher_levels,concentration,ritual,source,is_homebrew,owner_id,required_character_level)
values ('e6b5fe22-5bc9-5a9b-a0f1-cd9b6984b669','Produce Flame',0,'Conjuration','1 action','Self','10 minutes',null,'A flickering flame appears in your hand. You can hold it for light or hurl it at a creature using the spell''s normal attack rules.',null,false,false,'Campaign Ledger demo catalogue',false,null,null)
on conflict (id) do update set
  name=excluded.name,level=excluded.level,school=excluded.school,casting_time=excluded.casting_time,
  range=excluded.range,duration=excluded.duration,description=excluded.description,higher_levels=excluded.higher_levels,
  required_character_level=excluded.required_character_level;

insert into public.spells (id,name,level,school,casting_time,range,duration,components,description,higher_levels,concentration,ritual,source,is_homebrew,owner_id,required_character_level)
values ('90581634-d95e-511c-a0a4-b8ae6194a592','Eldritch Blast',0,'Evocation','1 action','120 feet','Instantaneous',null,'A beam of crackling energy streaks toward a creature within range.',null,false,false,'Campaign Ledger demo catalogue',false,null,null)
on conflict (id) do update set
  name=excluded.name,level=excluded.level,school=excluded.school,casting_time=excluded.casting_time,
  range=excluded.range,duration=excluded.duration,description=excluded.description,higher_levels=excluded.higher_levels,
  required_character_level=excluded.required_character_level;

insert into public.spells (id,name,level,school,casting_time,range,duration,components,description,higher_levels,concentration,ritual,source,is_homebrew,owner_id,required_character_level)
values ('39f953c8-e698-5897-bd05-e77c814d135e','Minor Illusion',0,'Illusion','1 action','30 feet','1 minute',null,'You create a sound or an image of an object within range that lasts for the duration.',null,false,false,'Campaign Ledger demo catalogue',false,null,null)
on conflict (id) do update set
  name=excluded.name,level=excluded.level,school=excluded.school,casting_time=excluded.casting_time,
  range=excluded.range,duration=excluded.duration,description=excluded.description,higher_levels=excluded.higher_levels,
  required_character_level=excluded.required_character_level;

insert into public.spells (id,name,level,school,casting_time,range,duration,components,description,higher_levels,concentration,ritual,source,is_homebrew,owner_id,required_character_level)
values ('fe6699de-f5b0-5f92-a7ef-2404907b0aef','Cure Wounds',1,'Evocation','1 action','Touch','Instantaneous',null,'A creature you touch regains hit points. The spell has no effect on constructs or undead.','Healing increases when cast with a spell slot of 2nd level or higher.',false,false,'Campaign Ledger demo catalogue',false,null,null)
on conflict (id) do update set
  name=excluded.name,level=excluded.level,school=excluded.school,casting_time=excluded.casting_time,
  range=excluded.range,duration=excluded.duration,description=excluded.description,higher_levels=excluded.higher_levels,
  required_character_level=excluded.required_character_level;

insert into public.spells (id,name,level,school,casting_time,range,duration,components,description,higher_levels,concentration,ritual,source,is_homebrew,owner_id,required_character_level)
values ('d6b131e2-80f7-50c5-8e9e-71422803876f','Entangle',1,'Conjuration','1 action','90 feet','Concentration, up to 1 minute',null,'Grasping weeds and vines sprout from the ground in a 20-foot square and can restrict movement.',null,false,false,'Campaign Ledger demo catalogue',false,null,null)
on conflict (id) do update set
  name=excluded.name,level=excluded.level,school=excluded.school,casting_time=excluded.casting_time,
  range=excluded.range,duration=excluded.duration,description=excluded.description,higher_levels=excluded.higher_levels,
  required_character_level=excluded.required_character_level;

insert into public.spells (id,name,level,school,casting_time,range,duration,components,description,higher_levels,concentration,ritual,source,is_homebrew,owner_id,required_character_level)
values ('7ae7c64c-f322-5c67-b9a1-e8d57c6a0e58','Hex',1,'Enchantment','1 bonus action','90 feet','Concentration, up to 1 hour',null,'You place a curse on a creature that lets you deal extra damage and impose disadvantage on one chosen ability.',null,false,false,'Campaign Ledger demo catalogue',false,null,null)
on conflict (id) do update set
  name=excluded.name,level=excluded.level,school=excluded.school,casting_time=excluded.casting_time,
  range=excluded.range,duration=excluded.duration,description=excluded.description,higher_levels=excluded.higher_levels,
  required_character_level=excluded.required_character_level;

insert into public.spells (id,name,level,school,casting_time,range,duration,components,description,higher_levels,concentration,ritual,source,is_homebrew,owner_id,required_character_level)
values ('b165d4de-f28d-5c27-80cd-02ef849031d5','Armor of Agathys',1,'Abjuration','1 action','Self','1 hour',null,'Protective frost surrounds you, granting temporary hit points and harming creatures that hit you while those temporary hit points remain.','Both temporary hit points and damage increase with higher-level slots.',false,false,'Campaign Ledger demo catalogue',false,null,null)
on conflict (id) do update set
  name=excluded.name,level=excluded.level,school=excluded.school,casting_time=excluded.casting_time,
  range=excluded.range,duration=excluded.duration,description=excluded.description,higher_levels=excluded.higher_levels,
  required_character_level=excluded.required_character_level;

insert into public.spells (id,name,level,school,casting_time,range,duration,components,description,higher_levels,concentration,ritual,source,is_homebrew,owner_id,required_character_level)
values ('a08747d8-932c-5cef-9805-e77d256fcaa2','Shield',1,'Abjuration','1 reaction','Self','1 round',null,'An invisible barrier of magical force appears and protects you until the start of your next turn.',null,false,false,'Campaign Ledger demo catalogue',false,null,null)
on conflict (id) do update set
  name=excluded.name,level=excluded.level,school=excluded.school,casting_time=excluded.casting_time,
  range=excluded.range,duration=excluded.duration,description=excluded.description,higher_levels=excluded.higher_levels,
  required_character_level=excluded.required_character_level;

insert into public.spells (id,name,level,school,casting_time,range,duration,components,description,higher_levels,concentration,ritual,source,is_homebrew,owner_id,required_character_level)
values ('7d3a5910-23ed-5ed6-8720-10556074d7e7','Misty Step',2,'Conjuration','1 bonus action','Self','Instantaneous',null,'Briefly surrounded by silvery mist, you teleport up to 30 feet to an unoccupied space you can see.',null,false,false,'Campaign Ledger demo catalogue',false,null,null)
on conflict (id) do update set
  name=excluded.name,level=excluded.level,school=excluded.school,casting_time=excluded.casting_time,
  range=excluded.range,duration=excluded.duration,description=excluded.description,higher_levels=excluded.higher_levels,
  required_character_level=excluded.required_character_level;

insert into public.spells (id,name,level,school,casting_time,range,duration,components,description,higher_levels,concentration,ritual,source,is_homebrew,owner_id,required_character_level)
values ('30881c29-12a1-59ea-bf9c-3b31bc12068b','Moonbeam',2,'Evocation','1 action','120 feet','Concentration, up to 1 minute',null,'A silvery beam of pale light shines down in a cylinder and affects creatures that enter or start their turn there.','The damaging effect increases with higher-level slots.',false,false,'Campaign Ledger demo catalogue',false,null,null)
on conflict (id) do update set
  name=excluded.name,level=excluded.level,school=excluded.school,casting_time=excluded.casting_time,
  range=excluded.range,duration=excluded.duration,description=excluded.description,higher_levels=excluded.higher_levels,
  required_character_level=excluded.required_character_level;

insert into public.spells (id,name,level,school,casting_time,range,duration,components,description,higher_levels,concentration,ritual,source,is_homebrew,owner_id,required_character_level)
values ('3be8a9b8-0c37-55d2-8aa0-fae44110301f','Dragon''s Breath',2,'Transmutation','1 bonus action','Touch','Concentration, up to 1 minute',null,'You imbue a willing creature with the ability to exhale destructive energy.','Damage increases with a higher-level slot.',false,false,'Campaign Ledger demo catalogue',false,null,null)
on conflict (id) do update set
  name=excluded.name,level=excluded.level,school=excluded.school,casting_time=excluded.casting_time,
  range=excluded.range,duration=excluded.duration,description=excluded.description,higher_levels=excluded.higher_levels,
  required_character_level=excluded.required_character_level;

insert into public.spells (id,name,level,school,casting_time,range,duration,components,description,higher_levels,concentration,ritual,source,is_homebrew,owner_id,required_character_level)
values ('38dad8b8-8c75-50d4-96c1-a4f71d0e481a','Call Lightning',3,'Conjuration','1 action','120 feet','Concentration, up to 10 minutes',null,'A storm cloud appears above you and can call down bolts of lightning into an area you can see.','Damage increases with a higher-level slot.',false,false,'Campaign Ledger demo catalogue',false,null,null)
on conflict (id) do update set
  name=excluded.name,level=excluded.level,school=excluded.school,casting_time=excluded.casting_time,
  range=excluded.range,duration=excluded.duration,description=excluded.description,higher_levels=excluded.higher_levels,
  required_character_level=excluded.required_character_level;

insert into public.spells (id,name,level,school,casting_time,range,duration,components,description,higher_levels,concentration,ritual,source,is_homebrew,owner_id,required_character_level)
values ('83214930-e3a6-545d-81d4-9607297a247a','Counterspell',3,'Abjuration','1 reaction','60 feet','Instantaneous',null,'You attempt to interrupt a creature in the process of casting a spell.',null,false,false,'Campaign Ledger demo catalogue',false,null,null)
on conflict (id) do update set
  name=excluded.name,level=excluded.level,school=excluded.school,casting_time=excluded.casting_time,
  range=excluded.range,duration=excluded.duration,description=excluded.description,higher_levels=excluded.higher_levels,
  required_character_level=excluded.required_character_level;

insert into public.spells (id,name,level,school,casting_time,range,duration,components,description,higher_levels,concentration,ritual,source,is_homebrew,owner_id,required_character_level)
values ('038c5692-82b6-51e2-b5aa-14d7c49e697b','Fireball',3,'Evocation','1 action','150 feet','Instantaneous',null,'A bright streak flashes from your pointing finger to a point you choose, then blossoms into a fiery explosion.','Damage increases with a higher-level slot.',false,false,'Campaign Ledger demo catalogue',false,null,null)
on conflict (id) do update set
  name=excluded.name,level=excluded.level,school=excluded.school,casting_time=excluded.casting_time,
  range=excluded.range,duration=excluded.duration,description=excluded.description,higher_levels=excluded.higher_levels,
  required_character_level=excluded.required_character_level;

insert into public.spells (id,name,level,school,casting_time,range,duration,components,description,higher_levels,concentration,ritual,source,is_homebrew,owner_id,required_character_level)
values ('a52fe048-cce3-5d15-bf54-20d665efb4c7','Polymorph',4,'Transmutation','1 action','60 feet','Concentration, up to 1 hour',null,'You transform a creature you can see into a new form for the duration, subject to the spell''s restrictions.',null,false,false,'Campaign Ledger demo catalogue',false,null,null)
on conflict (id) do update set
  name=excluded.name,level=excluded.level,school=excluded.school,casting_time=excluded.casting_time,
  range=excluded.range,duration=excluded.duration,description=excluded.description,higher_levels=excluded.higher_levels,
  required_character_level=excluded.required_character_level;

insert into public.spells (id,name,level,school,casting_time,range,duration,components,description,higher_levels,concentration,ritual,source,is_homebrew,owner_id,required_character_level)
values ('39087f76-1858-5d1e-88de-18eec7f1f767','Flame Strike',5,'Evocation','1 action','60 feet','Instantaneous',null,'A vertical column of divine fire roars downward in an area you choose.','Damage increases with a higher-level slot.',false,false,'Campaign Ledger demo catalogue',false,null,null)
on conflict (id) do update set
  name=excluded.name,level=excluded.level,school=excluded.school,casting_time=excluded.casting_time,
  range=excluded.range,duration=excluded.duration,description=excluded.description,higher_levels=excluded.higher_levels,
  required_character_level=excluded.required_character_level;

insert into public.spells (id,name,level,school,casting_time,range,duration,components,description,higher_levels,concentration,ritual,source,is_homebrew,owner_id,required_character_level)
values ('cb9401c2-4a4d-5c86-b30b-fa9dccea690b','Wish',9,'Conjuration','1 action','Self','Instantaneous',null,'Wish is a reality-altering spell capable of reproducing the effects of other spells and achieving broader effects at the DM''s discretion.',null,false,false,'Campaign Ledger demo catalogue',false,null,null)
on conflict (id) do update set
  name=excluded.name,level=excluded.level,school=excluded.school,casting_time=excluded.casting_time,
  range=excluded.range,duration=excluded.duration,description=excluded.description,higher_levels=excluded.higher_levels,
  required_character_level=excluded.required_character_level;

-- Spell class relationships

insert into public.spell_classes (spell_id,class_id) values ('1fb3ac47-566b-57d6-9197-622e29290219','2dc8b189-d526-5ad2-8bf1-1d10afca8793') on conflict do nothing;

insert into public.spell_classes (spell_id,class_id) values ('1fb3ac47-566b-57d6-9197-622e29290219','ae9d9f91-849f-57f4-852f-c24b8fdc9b3e') on conflict do nothing;

insert into public.spell_classes (spell_id,class_id) values ('1fb3ac47-566b-57d6-9197-622e29290219','59034c12-ebf0-5101-9d9d-1766c3bb91fc') on conflict do nothing;

insert into public.spell_classes (spell_id,class_id) values ('e6b5fe22-5bc9-5a9b-a0f1-cd9b6984b669','ae9d9f91-849f-57f4-852f-c24b8fdc9b3e') on conflict do nothing;

insert into public.spell_classes (spell_id,class_id) values ('90581634-d95e-511c-a0a4-b8ae6194a592','c7e57396-fafd-5e6e-861f-7f54a5ecdd7b') on conflict do nothing;

insert into public.spell_classes (spell_id,class_id) values ('39f953c8-e698-5897-bd05-e77c814d135e','6f52ffa0-2e1e-58dc-9385-ff9b248ff8be') on conflict do nothing;

insert into public.spell_classes (spell_id,class_id) values ('39f953c8-e698-5897-bd05-e77c814d135e','dfa877c6-baf0-525c-9480-828dda0c5ec6') on conflict do nothing;

insert into public.spell_classes (spell_id,class_id) values ('39f953c8-e698-5897-bd05-e77c814d135e','c7e57396-fafd-5e6e-861f-7f54a5ecdd7b') on conflict do nothing;

insert into public.spell_classes (spell_id,class_id) values ('39f953c8-e698-5897-bd05-e77c814d135e','7db56f03-da85-50a3-bffe-b85fabef2cad') on conflict do nothing;

insert into public.spell_classes (spell_id,class_id) values ('fe6699de-f5b0-5f92-a7ef-2404907b0aef','6f52ffa0-2e1e-58dc-9385-ff9b248ff8be') on conflict do nothing;

insert into public.spell_classes (spell_id,class_id) values ('fe6699de-f5b0-5f92-a7ef-2404907b0aef','2dc8b189-d526-5ad2-8bf1-1d10afca8793') on conflict do nothing;

insert into public.spell_classes (spell_id,class_id) values ('fe6699de-f5b0-5f92-a7ef-2404907b0aef','ae9d9f91-849f-57f4-852f-c24b8fdc9b3e') on conflict do nothing;

insert into public.spell_classes (spell_id,class_id) values ('fe6699de-f5b0-5f92-a7ef-2404907b0aef','a92a692d-8bdf-51a2-888f-b942e5a4d47f') on conflict do nothing;

insert into public.spell_classes (spell_id,class_id) values ('fe6699de-f5b0-5f92-a7ef-2404907b0aef','73f8ce18-af41-5236-9498-eb7a9755edd9') on conflict do nothing;

insert into public.spell_classes (spell_id,class_id) values ('fe6699de-f5b0-5f92-a7ef-2404907b0aef','59034c12-ebf0-5101-9d9d-1766c3bb91fc') on conflict do nothing;

insert into public.spell_classes (spell_id,class_id) values ('d6b131e2-80f7-50c5-8e9e-71422803876f','ae9d9f91-849f-57f4-852f-c24b8fdc9b3e') on conflict do nothing;

insert into public.spell_classes (spell_id,class_id) values ('7ae7c64c-f322-5c67-b9a1-e8d57c6a0e58','c7e57396-fafd-5e6e-861f-7f54a5ecdd7b') on conflict do nothing;

insert into public.spell_classes (spell_id,class_id) values ('b165d4de-f28d-5c27-80cd-02ef849031d5','c7e57396-fafd-5e6e-861f-7f54a5ecdd7b') on conflict do nothing;

insert into public.spell_classes (spell_id,class_id) values ('a08747d8-932c-5cef-9805-e77d256fcaa2','dfa877c6-baf0-525c-9480-828dda0c5ec6') on conflict do nothing;

insert into public.spell_classes (spell_id,class_id) values ('a08747d8-932c-5cef-9805-e77d256fcaa2','7db56f03-da85-50a3-bffe-b85fabef2cad') on conflict do nothing;

insert into public.spell_classes (spell_id,class_id) values ('7d3a5910-23ed-5ed6-8720-10556074d7e7','dfa877c6-baf0-525c-9480-828dda0c5ec6') on conflict do nothing;

insert into public.spell_classes (spell_id,class_id) values ('7d3a5910-23ed-5ed6-8720-10556074d7e7','c7e57396-fafd-5e6e-861f-7f54a5ecdd7b') on conflict do nothing;

insert into public.spell_classes (spell_id,class_id) values ('7d3a5910-23ed-5ed6-8720-10556074d7e7','7db56f03-da85-50a3-bffe-b85fabef2cad') on conflict do nothing;

insert into public.spell_classes (spell_id,class_id) values ('30881c29-12a1-59ea-bf9c-3b31bc12068b','ae9d9f91-849f-57f4-852f-c24b8fdc9b3e') on conflict do nothing;

insert into public.spell_classes (spell_id,class_id) values ('3be8a9b8-0c37-55d2-8aa0-fae44110301f','dfa877c6-baf0-525c-9480-828dda0c5ec6') on conflict do nothing;

insert into public.spell_classes (spell_id,class_id) values ('3be8a9b8-0c37-55d2-8aa0-fae44110301f','7db56f03-da85-50a3-bffe-b85fabef2cad') on conflict do nothing;

insert into public.spell_classes (spell_id,class_id) values ('38dad8b8-8c75-50d4-96c1-a4f71d0e481a','ae9d9f91-849f-57f4-852f-c24b8fdc9b3e') on conflict do nothing;

insert into public.spell_classes (spell_id,class_id) values ('83214930-e3a6-545d-81d4-9607297a247a','dfa877c6-baf0-525c-9480-828dda0c5ec6') on conflict do nothing;

insert into public.spell_classes (spell_id,class_id) values ('83214930-e3a6-545d-81d4-9607297a247a','c7e57396-fafd-5e6e-861f-7f54a5ecdd7b') on conflict do nothing;

insert into public.spell_classes (spell_id,class_id) values ('83214930-e3a6-545d-81d4-9607297a247a','7db56f03-da85-50a3-bffe-b85fabef2cad') on conflict do nothing;

insert into public.spell_classes (spell_id,class_id) values ('038c5692-82b6-51e2-b5aa-14d7c49e697b','dfa877c6-baf0-525c-9480-828dda0c5ec6') on conflict do nothing;

insert into public.spell_classes (spell_id,class_id) values ('038c5692-82b6-51e2-b5aa-14d7c49e697b','7db56f03-da85-50a3-bffe-b85fabef2cad') on conflict do nothing;

insert into public.spell_classes (spell_id,class_id) values ('038c5692-82b6-51e2-b5aa-14d7c49e697b','59034c12-ebf0-5101-9d9d-1766c3bb91fc') on conflict do nothing;

insert into public.spell_classes (spell_id,class_id) values ('a52fe048-cce3-5d15-bf54-20d665efb4c7','6f52ffa0-2e1e-58dc-9385-ff9b248ff8be') on conflict do nothing;

insert into public.spell_classes (spell_id,class_id) values ('a52fe048-cce3-5d15-bf54-20d665efb4c7','ae9d9f91-849f-57f4-852f-c24b8fdc9b3e') on conflict do nothing;

insert into public.spell_classes (spell_id,class_id) values ('a52fe048-cce3-5d15-bf54-20d665efb4c7','dfa877c6-baf0-525c-9480-828dda0c5ec6') on conflict do nothing;

insert into public.spell_classes (spell_id,class_id) values ('a52fe048-cce3-5d15-bf54-20d665efb4c7','7db56f03-da85-50a3-bffe-b85fabef2cad') on conflict do nothing;

insert into public.spell_classes (spell_id,class_id) values ('39087f76-1858-5d1e-88de-18eec7f1f767','2dc8b189-d526-5ad2-8bf1-1d10afca8793') on conflict do nothing;

insert into public.spell_classes (spell_id,class_id) values ('cb9401c2-4a4d-5c86-b30b-fa9dccea690b','dfa877c6-baf0-525c-9480-828dda0c5ec6') on conflict do nothing;

insert into public.spell_classes (spell_id,class_id) values ('cb9401c2-4a4d-5c86-b30b-fa9dccea690b','7db56f03-da85-50a3-bffe-b85fabef2cad') on conflict do nothing;

-- Spell subclass/race relationships

insert into public.spell_subclasses (spell_id,subclass_id) values ('3be8a9b8-0c37-55d2-8aa0-fae44110301f','1a18c91f-eeb1-5f7c-8edf-c57aec3a1a2f') on conflict do nothing;

-- System features

insert into public.features (id,name,description,source_type,source,required_level,is_homebrew,owner_id)
values ('ecc8a8ee-b09e-51b2-8020-bcdfb4c7c29c','Druidic','You know Druidic, the secret language of druids, and can leave hidden messages written in it.','class','Druid',1,false,null)
on conflict (id) do update set name=excluded.name,description=excluded.description,source_type=excluded.source_type,source=excluded.source,required_level=excluded.required_level;

insert into public.features (id,name,description,source_type,source,required_level,is_homebrew,owner_id)
values ('cd546928-8040-5729-a4b7-721994337ab4','Wild Shape','You can use druidic magic to assume the form of a beast according to your campaign''s rules.','class','Druid',2,false,null)
on conflict (id) do update set name=excluded.name,description=excluded.description,source_type=excluded.source_type,source=excluded.source,required_level=excluded.required_level;

insert into public.features (id,name,description,source_type,source,required_level,is_homebrew,owner_id)
values ('62733fc0-73c8-581b-b527-fbf59e0f6962','Dragon Affinity','You develop a supernatural connection to dragons. Choose a dragon ancestry that shapes later subclass features.','subclass','Circle of Dragons',2,false,null)
on conflict (id) do update set name=excluded.name,description=excluded.description,source_type=excluded.source_type,source=excluded.source,required_level=excluded.required_level;

insert into public.features (id,name,description,source_type,source,required_level,is_homebrew,owner_id)
values ('72b33bc5-843b-570e-8663-dac6d333bfd6','Draconic Speech','You can speak, read and write Draconic and communicate basic concepts with dragons.','subclass','Circle of Dragons',2,false,null)
on conflict (id) do update set name=excluded.name,description=excluded.description,source_type=excluded.source_type,source=excluded.source,required_level=excluded.required_level;

insert into public.features (id,name,description,source_type,source,required_level,is_homebrew,owner_id)
values ('7432d9e8-34b0-5aee-be4b-9721db6badcd','Dragon Form','You can temporarily assume a draconic form. The precise benefits depend on your Circle of Dragons rules.','subclass','Circle of Dragons',6,false,null)
on conflict (id) do update set name=excluded.name,description=excluded.description,source_type=excluded.source_type,source=excluded.source,required_level=excluded.required_level;

insert into public.features (id,name,description,source_type,source,required_level,is_homebrew,owner_id)
values ('426be539-d4a5-5bab-8ed0-d5e9b744b88d','Draconic Resilience','Your bond with draconic power strengthens, improving your resilience against threats associated with your chosen ancestry.','subclass','Circle of Dragons',10,false,null)
on conflict (id) do update set name=excluded.name,description=excluded.description,source_type=excluded.source_type,source=excluded.source,required_level=excluded.required_level;

insert into public.features (id,name,description,source_type,source,required_level,is_homebrew,owner_id)
values ('9b46628a-3dfd-58a8-bd80-e0ed4f50e312','Bite','Your fanged maw is a natural weapon suitable for close combat.','race','Lizardfolk',1,false,null)
on conflict (id) do update set name=excluded.name,description=excluded.description,source_type=excluded.source_type,source=excluded.source,required_level=excluded.required_level;

insert into public.features (id,name,description,source_type,source,required_level,is_homebrew,owner_id)
values ('5505bb53-61d8-59af-a46e-a4ed41ae0c0b','Hold Breath','You can hold your breath for an extended period, according to the rules used by your campaign.','race','Lizardfolk',1,false,null)
on conflict (id) do update set name=excluded.name,description=excluded.description,source_type=excluded.source_type,source=excluded.source,required_level=excluded.required_level;

insert into public.features (id,name,description,source_type,source,required_level,is_homebrew,owner_id)
values ('139606c5-8145-52a2-8bdd-7516ae3b2046','Pact Magic','Your pact grants you access to a limited set of magical resources represented by your class spellcasting.','class','Warlock',1,false,null)
on conflict (id) do update set name=excluded.name,description=excluded.description,source_type=excluded.source_type,source=excluded.source,required_level=excluded.required_level;

insert into public.features (id,name,description,source_type,source,required_level,is_homebrew,owner_id)
values ('72728cd5-245c-5a9f-9969-bf29bc52058c','Eldritch Invocations','You learn supernatural secrets that grant additional abilities.','class','Warlock',2,false,null)
on conflict (id) do update set name=excluded.name,description=excluded.description,source_type=excluded.source_type,source=excluded.source,required_level=excluded.required_level;

insert into public.features (id,name,description,source_type,source,required_level,is_homebrew,owner_id)
values ('c5661df0-08d0-577b-9f68-173028548966','Pact Boon','Your patron grants you a boon that shapes your pact.','class','Warlock',3,false,null)
on conflict (id) do update set name=excluded.name,description=excluded.description,source_type=excluded.source_type,source=excluded.source,required_level=excluded.required_level;

insert into public.features (id,name,description,source_type,source,required_level,is_homebrew,owner_id)
values ('2196042c-a3fa-51ca-86ac-30a7e6993504','Mystic Arcanum','Your patron entrusts you with access to powerful arcanum beyond your normal pact magic.','class','Warlock',11,false,null)
on conflict (id) do update set name=excluded.name,description=excluded.description,source_type=excluded.source_type,source=excluded.source,required_level=excluded.required_level;

insert into public.features (id,name,description,source_type,source,required_level,is_homebrew,owner_id)
values ('43b87d93-b249-5e47-92f8-f7538403c039','Arcane Recovery','You can recover some spent magical resources after a period of study and rest.','class','Wizard',1,false,null)
on conflict (id) do update set name=excluded.name,description=excluded.description,source_type=excluded.source_type,source=excluded.source,required_level=excluded.required_level;

insert into public.features (id,name,description,source_type,source,required_level,is_homebrew,owner_id)
values ('c9261be1-1697-5390-9ee9-b7b9f7c87e3e','Arcane Tradition','You adopt a wizardly tradition that shapes your specialist features.','class','Wizard',2,false,null)
on conflict (id) do update set name=excluded.name,description=excluded.description,source_type=excluded.source_type,source=excluded.source,required_level=excluded.required_level;

insert into public.features (id,name,description,source_type,source,required_level,is_homebrew,owner_id)
values ('06eb6149-8959-508c-8dab-4e347a08298b','Spell Mastery','Your mastery of lesser spells allows unusually flexible use of selected spells.','class','Wizard',18,false,null)
on conflict (id) do update set name=excluded.name,description=excluded.description,source_type=excluded.source_type,source=excluded.source,required_level=excluded.required_level;

insert into public.features (id,name,description,source_type,source,required_level,is_homebrew,owner_id)
values ('66347857-e054-5684-907a-6d472dfb69e8','DM''s Boon','A campaign-specific feature granted directly by the DM.','homebrew','Campaign',1,false,null)
on conflict (id) do update set name=excluded.name,description=excluded.description,source_type=excluded.source_type,source=excluded.source,required_level=excluded.required_level;

-- Feature relationships

insert into public.class_features (class_id,feature_id,required_level) values ('ae9d9f91-849f-57f4-852f-c24b8fdc9b3e','ecc8a8ee-b09e-51b2-8020-bcdfb4c7c29c',1) on conflict (class_id,feature_id) do update set required_level=excluded.required_level;

insert into public.class_features (class_id,feature_id,required_level) values ('ae9d9f91-849f-57f4-852f-c24b8fdc9b3e','cd546928-8040-5729-a4b7-721994337ab4',2) on conflict (class_id,feature_id) do update set required_level=excluded.required_level;

insert into public.class_features (class_id,feature_id,required_level) values ('ae9d9f91-849f-57f4-852f-c24b8fdc9b3e','62733fc0-73c8-581b-b527-fbf59e0f6962',2) on conflict (class_id,feature_id) do update set required_level=excluded.required_level;

insert into public.subclass_features (subclass_id,feature_id,required_level) values ('1a18c91f-eeb1-5f7c-8edf-c57aec3a1a2f','62733fc0-73c8-581b-b527-fbf59e0f6962',2) on conflict (subclass_id,feature_id) do update set required_level=excluded.required_level;

insert into public.class_features (class_id,feature_id,required_level) values ('ae9d9f91-849f-57f4-852f-c24b8fdc9b3e','72b33bc5-843b-570e-8663-dac6d333bfd6',2) on conflict (class_id,feature_id) do update set required_level=excluded.required_level;

insert into public.subclass_features (subclass_id,feature_id,required_level) values ('1a18c91f-eeb1-5f7c-8edf-c57aec3a1a2f','72b33bc5-843b-570e-8663-dac6d333bfd6',2) on conflict (subclass_id,feature_id) do update set required_level=excluded.required_level;

insert into public.class_features (class_id,feature_id,required_level) values ('ae9d9f91-849f-57f4-852f-c24b8fdc9b3e','7432d9e8-34b0-5aee-be4b-9721db6badcd',6) on conflict (class_id,feature_id) do update set required_level=excluded.required_level;

insert into public.subclass_features (subclass_id,feature_id,required_level) values ('1a18c91f-eeb1-5f7c-8edf-c57aec3a1a2f','7432d9e8-34b0-5aee-be4b-9721db6badcd',6) on conflict (subclass_id,feature_id) do update set required_level=excluded.required_level;

insert into public.class_features (class_id,feature_id,required_level) values ('ae9d9f91-849f-57f4-852f-c24b8fdc9b3e','426be539-d4a5-5bab-8ed0-d5e9b744b88d',10) on conflict (class_id,feature_id) do update set required_level=excluded.required_level;

insert into public.subclass_features (subclass_id,feature_id,required_level) values ('1a18c91f-eeb1-5f7c-8edf-c57aec3a1a2f','426be539-d4a5-5bab-8ed0-d5e9b744b88d',10) on conflict (subclass_id,feature_id) do update set required_level=excluded.required_level;

insert into public.race_features (race_id,feature_id) values ('6124120d-be18-57d4-b6b0-81fc9be16a35','9b46628a-3dfd-58a8-bd80-e0ed4f50e312') on conflict do nothing;

insert into public.race_features (race_id,feature_id) values ('6124120d-be18-57d4-b6b0-81fc9be16a35','5505bb53-61d8-59af-a46e-a4ed41ae0c0b') on conflict do nothing;

insert into public.class_features (class_id,feature_id,required_level) values ('c7e57396-fafd-5e6e-861f-7f54a5ecdd7b','139606c5-8145-52a2-8bdd-7516ae3b2046',1) on conflict (class_id,feature_id) do update set required_level=excluded.required_level;

insert into public.class_features (class_id,feature_id,required_level) values ('c7e57396-fafd-5e6e-861f-7f54a5ecdd7b','72728cd5-245c-5a9f-9969-bf29bc52058c',2) on conflict (class_id,feature_id) do update set required_level=excluded.required_level;

insert into public.class_features (class_id,feature_id,required_level) values ('c7e57396-fafd-5e6e-861f-7f54a5ecdd7b','c5661df0-08d0-577b-9f68-173028548966',3) on conflict (class_id,feature_id) do update set required_level=excluded.required_level;

insert into public.class_features (class_id,feature_id,required_level) values ('c7e57396-fafd-5e6e-861f-7f54a5ecdd7b','2196042c-a3fa-51ca-86ac-30a7e6993504',11) on conflict (class_id,feature_id) do update set required_level=excluded.required_level;

insert into public.class_features (class_id,feature_id,required_level) values ('7db56f03-da85-50a3-bffe-b85fabef2cad','43b87d93-b249-5e47-92f8-f7538403c039',1) on conflict (class_id,feature_id) do update set required_level=excluded.required_level;

insert into public.class_features (class_id,feature_id,required_level) values ('7db56f03-da85-50a3-bffe-b85fabef2cad','c9261be1-1697-5390-9ee9-b7b9f7c87e3e',2) on conflict (class_id,feature_id) do update set required_level=excluded.required_level;

insert into public.class_features (class_id,feature_id,required_level) values ('7db56f03-da85-50a3-bffe-b85fabef2cad','06eb6149-8959-508c-8dab-4e347a08298b',18) on conflict (class_id,feature_id) do update set required_level=excluded.required_level;

-- System items

insert into public.items (id,name,category,rarity,description,weight,value,requires_attunement,minimum_level,source,is_homebrew,owner_id)
values ('9d2b4cc5-05bc-5897-9168-35d81dc69565','Longsword','Weapon','Common','A well-used longsword kept for emergencies and close combat.','3 lb','15 gp',false,null,'Campaign Ledger demo catalogue',false,null)
on conflict (id) do update set name=excluded.name,category=excluded.category,rarity=excluded.rarity,description=excluded.description,weight=excluded.weight,value=excluded.value,requires_attunement=excluded.requires_attunement,minimum_level=excluded.minimum_level;

insert into public.items (id,name,category,rarity,description,weight,value,requires_attunement,minimum_level,source,is_homebrew,owner_id)
values ('245d80c7-9b08-5482-b000-b391b37052da','Studded Leather','Armour','Common','Light armour reinforced with small metal studs.','13 lb','45 gp',false,null,'Campaign Ledger demo catalogue',false,null)
on conflict (id) do update set name=excluded.name,category=excluded.category,rarity=excluded.rarity,description=excluded.description,weight=excluded.weight,value=excluded.value,requires_attunement=excluded.requires_attunement,minimum_level=excluded.minimum_level;

insert into public.items (id,name,category,rarity,description,weight,value,requires_attunement,minimum_level,source,is_homebrew,owner_id)
values ('e0861013-f897-54a0-bfd8-254f8eb4c1ac','Potion of Healing','Consumable','Common','A small vial of restorative magic used to recover from injuries.','0.5 lb','50 gp',false,null,'Campaign Ledger demo catalogue',false,null)
on conflict (id) do update set name=excluded.name,category=excluded.category,rarity=excluded.rarity,description=excluded.description,weight=excluded.weight,value=excluded.value,requires_attunement=excluded.requires_attunement,minimum_level=excluded.minimum_level;

insert into public.items (id,name,category,rarity,description,weight,value,requires_attunement,minimum_level,source,is_homebrew,owner_id)
values ('effa20a5-08f5-542f-89c6-83fa29302854','Dragon Scale Pendant','Wondrous Item','Uncommon','A mounted dragon scale worn as a reminder of a druidic bond with dragonkind.','—','Priceless',true,null,'Campaign Ledger demo catalogue',false,null)
on conflict (id) do update set name=excluded.name,category=excluded.category,rarity=excluded.rarity,description=excluded.description,weight=excluded.weight,value=excluded.value,requires_attunement=excluded.requires_attunement,minimum_level=excluded.minimum_level;

insert into public.items (id,name,category,rarity,description,weight,value,requires_attunement,minimum_level,source,is_homebrew,owner_id)
values ('878138bc-86c4-5fc4-8667-cf2a10232ee2','Backpack','Adventuring Gear','Common','A sturdy travel pack containing basic adventuring supplies.','5 lb','2 gp',false,null,'Campaign Ledger demo catalogue',false,null)
on conflict (id) do update set name=excluded.name,category=excluded.category,rarity=excluded.rarity,description=excluded.description,weight=excluded.weight,value=excluded.value,requires_attunement=excluded.requires_attunement,minimum_level=excluded.minimum_level;

insert into public.items (id,name,category,rarity,description,weight,value,requires_attunement,minimum_level,source,is_homebrew,owner_id)
values ('8fd8642f-68bd-5d94-982c-aa644fc0fe78','Quarterstaff','Weapon','Common','A simple wooden staff used as a walking stick or weapon.','4 lb','0.2 gp',false,null,'Campaign Ledger demo catalogue',false,null)
on conflict (id) do update set name=excluded.name,category=excluded.category,rarity=excluded.rarity,description=excluded.description,weight=excluded.weight,value=excluded.value,requires_attunement=excluded.requires_attunement,minimum_level=excluded.minimum_level;

insert into public.items (id,name,category,rarity,description,weight,value,requires_attunement,minimum_level,source,is_homebrew,owner_id)
values ('810eac80-e2a7-5194-8e55-bbf565554362','Dagger','Weapon','Common','A small, light blade suitable for close combat or throwing.','1 lb','2 gp',false,null,'Campaign Ledger demo catalogue',false,null)
on conflict (id) do update set name=excluded.name,category=excluded.category,rarity=excluded.rarity,description=excluded.description,weight=excluded.weight,value=excluded.value,requires_attunement=excluded.requires_attunement,minimum_level=excluded.minimum_level;

insert into public.items (id,name,category,rarity,description,weight,value,requires_attunement,minimum_level,source,is_homebrew,owner_id)
values ('edcb29ab-c777-547e-aa36-c36694c5e281','Shield','Armour','Common','A sturdy shield carried on one arm for protection.','6 lb','10 gp',false,null,'Campaign Ledger demo catalogue',false,null)
on conflict (id) do update set name=excluded.name,category=excluded.category,rarity=excluded.rarity,description=excluded.description,weight=excluded.weight,value=excluded.value,requires_attunement=excluded.requires_attunement,minimum_level=excluded.minimum_level;

insert into public.items (id,name,category,rarity,description,weight,value,requires_attunement,minimum_level,source,is_homebrew,owner_id)
values ('38634cba-d22d-5721-95ed-7f93bd5c0bef','Hemp Rope','Adventuring Gear','Common','A strong coil of hempen rope useful for climbing, tying and general adventuring.','10 lb','1 gp',false,null,'Campaign Ledger demo catalogue',false,null)
on conflict (id) do update set name=excluded.name,category=excluded.category,rarity=excluded.rarity,description=excluded.description,weight=excluded.weight,value=excluded.value,requires_attunement=excluded.requires_attunement,minimum_level=excluded.minimum_level;

insert into public.items (id,name,category,rarity,description,weight,value,requires_attunement,minimum_level,source,is_homebrew,owner_id)
values ('d8e8d1fa-3046-5772-b7b7-a5efe755ff47','Torch','Adventuring Gear','Common','A simple torch that provides light when lit.','1 lb','0.01 gp',false,null,'Campaign Ledger demo catalogue',false,null)
on conflict (id) do update set name=excluded.name,category=excluded.category,rarity=excluded.rarity,description=excluded.description,weight=excluded.weight,value=excluded.value,requires_attunement=excluded.requires_attunement,minimum_level=excluded.minimum_level;

insert into public.items (id,name,category,rarity,description,weight,value,requires_attunement,minimum_level,source,is_homebrew,owner_id)
values ('61f59ab0-0b60-58c5-806d-7dc12dfbaabe','Rations','Consumable','Common','Travel-ready food intended to keep an adventurer fed on the road.','2 lb','0.5 gp',false,null,'Campaign Ledger demo catalogue',false,null)
on conflict (id) do update set name=excluded.name,category=excluded.category,rarity=excluded.rarity,description=excluded.description,weight=excluded.weight,value=excluded.value,requires_attunement=excluded.requires_attunement,minimum_level=excluded.minimum_level;

insert into public.items (id,name,category,rarity,description,weight,value,requires_attunement,minimum_level,source,is_homebrew,owner_id)
values ('3231dc2d-4ef7-5e69-80f4-460c4d1b63b5','Waterskin','Adventuring Gear','Common','A leather container for carrying drinking water.','5 lb full','0.2 gp',false,null,'Campaign Ledger demo catalogue',false,null)
on conflict (id) do update set name=excluded.name,category=excluded.category,rarity=excluded.rarity,description=excluded.description,weight=excluded.weight,value=excluded.value,requires_attunement=excluded.requires_attunement,minimum_level=excluded.minimum_level;

insert into public.items (id,name,category,rarity,description,weight,value,requires_attunement,minimum_level,source,is_homebrew,owner_id)
values ('e9580265-402d-50aa-bbd6-ec9a56ff53da','Cloak of Protection','Wondrous Item','Uncommon','A magical cloak that improves the wearer''s general defenses.','—','500 gp',true,null,'Campaign Ledger demo catalogue',false,null)
on conflict (id) do update set name=excluded.name,category=excluded.category,rarity=excluded.rarity,description=excluded.description,weight=excluded.weight,value=excluded.value,requires_attunement=excluded.requires_attunement,minimum_level=excluded.minimum_level;

insert into public.items (id,name,category,rarity,description,weight,value,requires_attunement,minimum_level,source,is_homebrew,owner_id)
values ('1d8ed0ba-0274-58f1-b2e6-a9a9d8d375b0','Ring of Invisibility','Ring','Legendary','A legendary ring that can render its wearer invisible while its magic is active.',null,null,true,null,'Campaign Ledger demo catalogue',false,null)
on conflict (id) do update set name=excluded.name,category=excluded.category,rarity=excluded.rarity,description=excluded.description,weight=excluded.weight,value=excluded.value,requires_attunement=excluded.requires_attunement,minimum_level=excluded.minimum_level;

insert into public.items (id,name,category,rarity,description,weight,value,requires_attunement,minimum_level,source,is_homebrew,owner_id)
values ('9d1d9401-6126-5154-8e7d-b139496ffacc','Holy Avenger','Weapon','Legendary','A legendary weapon of extraordinary power. This demo catalogue treats it as DM-granted content.',null,null,true,null,'Campaign Ledger demo catalogue',false,null)
on conflict (id) do update set name=excluded.name,category=excluded.category,rarity=excluded.rarity,description=excluded.description,weight=excluded.weight,value=excluded.value,requires_attunement=excluded.requires_attunement,minimum_level=excluded.minimum_level;
