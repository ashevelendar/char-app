-- ============================================================
-- D&D CHARACTER MANAGER
-- 009 - Repair catalogue Data API access and core equipment
--
-- The browser uses supabase-js, so catalogue tables need both:
--   1) a Postgres grant for the authenticated role
--   2) an RLS SELECT policy when RLS is enabled
--
-- This migration is safe to re-run.
-- ============================================================

grant usage on schema public to authenticated;

-- Keep the character row compatible with the current browser client even
-- when the older feature/resource migrations have not been run yet.
alter table if exists public.characters
  add column if not exists feats jsonb not null default '[]'::jsonb,
  add column if not exists resource_uses jsonb not null default '{}'::jsonb;

-- Make the item columns required by the current app available even if
-- the 5e.tools content-model migration was not applied yet.
alter table if exists public.items
  alter column weight type text using weight::text,
  alter column value type text using value::text;

alter table if exists public.items
  add column if not exists edition text not null default '2014',
  add column if not exists content_key text,
  add column if not exists source_code text,
  add column if not exists page integer,
  add column if not exists raw_data jsonb not null default '{}'::jsonb;

-- Shared catalogue tables: authenticated users can read system rows
-- and their own custom rows. The application itself also filters these
-- tables to owner_id IS NULL for the shared catalogue.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'classes',
    'races',
    'subclasses',
    'backgrounds',
    'spells',
    'features',
    'items',
    'optional_features',
    'feats'
  ] loop
    if to_regclass('public.' || table_name) is not null then
      execute format('grant select on public.%I to authenticated', table_name);
      execute format('alter table public.%I enable row level security', table_name);
      execute format('drop policy if exists "Catalogue read access" on public.%I', table_name);
      execute format(
        'create policy "Catalogue read access" on public.%I for select to authenticated using (owner_id is null or owner_id = (select auth.uid()))',
        table_name
      );
    end if;
  end loop;
end $$;

-- Shared relationship/catalogue tables do not have owner_id.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'spell_classes',
    'spell_subclasses',
    'spell_races',
    'class_features',
    'subclass_features',
    'race_features',
    'background_features'
  ] loop
    if to_regclass('public.' || table_name) is not null then
      execute format('grant select on public.%I to authenticated', table_name);
      execute format('alter table public.%I enable row level security', table_name);
      execute format('drop policy if exists "Catalogue relationship read access" on public.%I', table_name);
      execute format(
        'create policy "Catalogue relationship read access" on public.%I for select to authenticated using (true)',
        table_name
      );
    end if;
  end loop;
end $$;

-- Ensure the six core equipment entries exist. Imported 5e.tools rows are
-- not overwritten by this; these are only the built-in records the app
-- uses for its basic equipment/AC/attack examples.
insert into public.items
  (id,name,category,rarity,description,weight,value,requires_attunement,minimum_level,source,is_homebrew,owner_id,raw_data)
values
  ('9d2b4cc5-05bc-5897-9168-35d81dc69565','Longsword','Weapon','Common','A well-used longsword kept for emergencies and close combat.','3 lb','15 gp',false,null,'Campaign Ledger demo catalogue',false,null,
   '{"dmg1":"1d8","dmg2":"1d10","dmgType":"slashing","property":["Versatile"],"weaponCategory":"Martial","weapon":true,"range":"5 ft."}'::jsonb),
  ('245d80c7-9b08-5482-b000-b391b37052da','Studded Leather','Armour','Common','Light armour reinforced with small metal studs.','13 lb','45 gp',false,null,'Campaign Ledger demo catalogue',false,null,
   '{"ac":12,"armorCategory":"Light"}'::jsonb),
  ('8fd8642f-68bd-5d94-982c-aa644fc0fe78','Quarterstaff','Weapon','Common','A simple wooden staff used as a walking stick or weapon.','4 lb','0.2 gp',false,null,'Campaign Ledger demo catalogue',false,null,
   '{"dmg1":"1d6","dmg2":"1d8","dmgType":"bludgeoning","property":["Versatile"],"weaponCategory":"Simple","weapon":true,"range":"5 ft."}'::jsonb),
  ('810eac80-e2a7-5194-8e55-bbf565554362','Dagger','Weapon','Common','A small, light blade suitable for close combat or throwing.','1 lb','2 gp',false,null,'Campaign Ledger demo catalogue',false,null,
   '{"dmg1":"1d4","dmgType":"piercing","property":["Finesse","Light","Thrown"],"weaponCategory":"Simple","weapon":true,"range":"20/60 ft."}'::jsonb),
  ('edcb29ab-c777-547e-aa36-c36694c5e281','Shield','Armour','Common','A sturdy shield carried on one arm for protection.','6 lb','10 gp',false,null,'Campaign Ledger demo catalogue',false,null,
   '{"ac":2,"armorCategory":"Shield"}'::jsonb),
  ('e9580265-402d-50aa-bbd6-ec9a56ff53da','Cloak of Protection','Wondrous Item','Uncommon','A magical cloak that improves the wearer''s general defenses.','—','500 gp',true,null,'Campaign Ledger demo catalogue',false,null,
   '{"bonusAc":1}'::jsonb)
on conflict (id) do update set
  name=excluded.name,
  category=excluded.category,
  rarity=excluded.rarity,
  description=excluded.description,
  weight=excluded.weight,
  value=excluded.value,
  requires_attunement=excluded.requires_attunement,
  minimum_level=excluded.minimum_level,
  raw_data=excluded.raw_data;

-- Verify the core item table is explicitly exposed to the authenticated
-- Data API role. Supabase now requires explicit grants for newly exposed
-- public-schema tables on affected projects.
grant select on public.items to authenticated;
