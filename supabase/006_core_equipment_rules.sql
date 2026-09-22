-- ============================================================
-- D&D CHARACTER MANAGER
-- 006 - Ensure core equipment rules are present
-- ============================================================

-- These are the built-in demo equipment records used by the app.
-- This migration is intentionally limited to the core equipment entries
-- so it does not overwrite a full imported 5e.tools item catalogue.

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
