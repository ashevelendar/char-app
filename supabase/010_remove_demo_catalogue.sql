-- ============================================================
-- D&D CHARACTER MANAGER
-- 010 - Remove the original Campaign Ledger demo catalogue
--
-- DESTRUCTIVE: removes only catalogue rows created by the old demo
-- seed, identified by source = 'Campaign Ledger demo catalogue'.
--
-- It does NOT delete 5e.tools imported rows, DM/homebrew rows, or
-- user-owned catalogue rows.
--
-- It also removes character links to those demo catalogue records.
-- Characters themselves are NOT deleted.
--
-- Run this after you are ready to replace the demo catalogue with
-- the 5e.tools imports.
-- ============================================================

begin;

-- Snapshot the demo IDs so all relationship cleanup uses the same set.
create temporary table demo_classes on commit drop as
  select id from public.classes
  where source = 'Campaign Ledger demo catalogue'
    and owner_id is null
    and is_homebrew = false;

create temporary table demo_races on commit drop as
  select id from public.races
  where source = 'Campaign Ledger demo catalogue'
    and owner_id is null
    and is_homebrew = false;

create temporary table demo_subclasses on commit drop as
  select id from public.subclasses
  where source = 'Campaign Ledger demo catalogue'
    and owner_id is null
    and is_homebrew = false;

create temporary table demo_backgrounds on commit drop as
  select id from public.backgrounds
  where source = 'Campaign Ledger demo catalogue'
    and owner_id is null
    and is_homebrew = false;

create temporary table demo_spells on commit drop as
  select id from public.spells
  where source = 'Campaign Ledger demo catalogue'
    and owner_id is null
    and is_homebrew = false;

create temporary table demo_features on commit drop as
  select id from public.features
  where source = 'Campaign Ledger demo catalogue'
    and owner_id is null
    and is_homebrew = false;

create temporary table demo_items on commit drop as
  select id from public.items
  where source = 'Campaign Ledger demo catalogue'
    and owner_id is null
    and is_homebrew = false;

-- Remove character links to demo catalogue content.
delete from public.character_items ci
using demo_items d
where ci.item_id = d.id;

delete from public.character_spells cs
using demo_spells d
where cs.spell_id = d.id;

delete from public.character_features cf
using demo_features d
where cf.feature_id = d.id;

delete from public.character_overrides co
using demo_items d
where co.content_type = 'item'
  and co.content_id = d.id::text;

delete from public.character_overrides co
using demo_spells d
where co.content_type = 'spell'
  and co.content_id = d.id::text;

delete from public.character_overrides co
using demo_features d
where co.content_type = 'feature'
  and co.content_id = d.id::text;

-- Characters are retained, but their references to deleted demo
-- class/race/subclass/background records must be cleared.
update public.characters c
set class_id = null
where c.class_id in (select id from demo_classes);

update public.characters c
set race_id = null
where c.race_id in (select id from demo_races);

update public.characters c
set subclass_id = null
where c.subclass_id in (select id from demo_subclasses);

update public.characters c
set background_id = null
where c.background_id in (select id from demo_backgrounds);

-- Remove demo spell relationships.
delete from public.spell_classes sc
using demo_spells d
where sc.spell_id = d.id;

delete from public.spell_subclasses ss
using demo_spells d
where ss.spell_id = d.id;

delete from public.spell_races sr
using demo_spells d
where sr.spell_id = d.id;

-- Remove demo feature relationships.
delete from public.class_features cf
using demo_features f
where cf.feature_id = f.id;

delete from public.class_features cf
using demo_classes c
where cf.class_id = c.id;

delete from public.subclass_features sf
using demo_features f
where sf.feature_id = f.id;

delete from public.subclass_features sf
using demo_subclasses s
where sf.subclass_id = s.id;

delete from public.race_features rf
using demo_features f
where rf.feature_id = f.id;

delete from public.race_features rf
using demo_races r
where rf.race_id = r.id;

delete from public.background_features bf
using demo_features f
where bf.feature_id = f.id;

delete from public.background_features bf
using demo_backgrounds b
where bf.background_id = b.id;

-- Remove any demo subraces if that optional table exists.
do $$
begin
  if to_regclass('public.subraces') is not null then
    delete from public.subraces sr
    where sr.race_id in (select id from demo_races);
  end if;
end $$;

-- Delete catalogue rows themselves.
delete from public.spells
where id in (select id from demo_spells);

delete from public.features
where id in (select id from demo_features);

delete from public.subclasses
where id in (select id from demo_subclasses);

delete from public.races
where id in (select id from demo_races);

delete from public.backgrounds
where id in (select id from demo_backgrounds);

delete from public.classes
where id in (select id from demo_classes);

delete from public.items
where id in (select id from demo_items);

commit;

-- Optional verification:
select 'classes' as catalogue, count(*) as remaining_demo_rows
from public.classes
where source = 'Campaign Ledger demo catalogue'
union all
select 'races', count(*)
from public.races
where source = 'Campaign Ledger demo catalogue'
union all
select 'subclasses', count(*)
from public.subclasses
where source = 'Campaign Ledger demo catalogue'
union all
select 'backgrounds', count(*)
from public.backgrounds
where source = 'Campaign Ledger demo catalogue'
union all
select 'spells', count(*)
from public.spells
where source = 'Campaign Ledger demo catalogue'
union all
select 'features', count(*)
from public.features
where source = 'Campaign Ledger demo catalogue'
union all
select 'items', count(*)
from public.items
where source = 'Campaign Ledger demo catalogue';
