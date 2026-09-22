-- 015 - Atomic character bundle persistence

create or replace function public.save_character_bundle(
  p_character_id uuid,
  p_character jsonb,
  p_spells jsonb default '[]'::jsonb,
  p_features jsonb default '[]'::jsonb,
  p_items jsonb default '[]'::jsonb,
  p_optional_features jsonb default '[]'::jsonb,
  p_homebrew jsonb default '[]'::jsonb,
  p_progression_history jsonb default '[]'::jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_character public.characters;
begin
  select *
  into v_character
  from public.characters
  where id = p_character_id
    and user_id = (select auth.uid())
  for update;

  if not found then
    raise exception 'Character not found or access denied';
  end if;

  v_character := jsonb_populate_record(v_character, p_character);

  update public.characters
  set
    name = v_character.name,
    race_id = v_character.race_id,
    subrace_id = v_character.subrace_id,
    class_id = v_character.class_id,
    subclass_id = v_character.subclass_id,
    background_id = v_character.background_id,
    level = v_character.level,
    alignment = v_character.alignment,
    player_name = v_character.player_name,
    current_hp = v_character.current_hp,
    max_hp = v_character.max_hp,
    temporary_hp = v_character.temporary_hp,
    armor_class = v_character.armor_class,
    speed = v_character.speed,
    hit_dice = v_character.hit_dice,
    proficiency_bonus = v_character.proficiency_bonus,
    strength = v_character.strength,
    dexterity = v_character.dexterity,
    constitution = v_character.constitution,
    intelligence = v_character.intelligence,
    wisdom = v_character.wisdom,
    charisma = v_character.charisma,
    saving_throws = v_character.saving_throws,
    skills = v_character.skills,
    tools = v_character.tools,
    languages = v_character.languages,
    notes = v_character.notes,
    feats = v_character.feats,
    resource_uses = v_character.resource_uses,
    currency = v_character.currency
  where id = p_character_id
    and user_id = (select auth.uid());

  delete from public.character_spells where character_id = p_character_id;
  insert into public.character_spells (character_id, spell_id, prepared, dm_granted, source)
  select
    p_character_id,
    row_data.spell_id,
    row_data.prepared,
    row_data.dm_granted,
    row_data.source
  from jsonb_to_recordset(p_spells) as row_data(
    spell_id uuid,
    prepared boolean,
    dm_granted boolean,
    source text
  );

  delete from public.character_features where character_id = p_character_id;
  insert into public.character_features (character_id, feature_id, dm_granted, source)
  select
    p_character_id,
    row_data.feature_id,
    row_data.dm_granted,
    row_data.source
  from jsonb_to_recordset(p_features) as row_data(
    feature_id uuid,
    dm_granted boolean,
    source text
  );

  delete from public.character_items where character_id = p_character_id;
  insert into public.character_items (character_id, item_id, quantity, equipped, dm_granted)
  select
    p_character_id,
    row_data.item_id,
    row_data.quantity,
    row_data.equipped,
    row_data.dm_granted
  from jsonb_to_recordset(p_items) as row_data(
    item_id uuid,
    quantity integer,
    equipped boolean,
    dm_granted boolean
  );

  delete from public.character_optional_features where character_id = p_character_id;
  insert into public.character_optional_features (character_id, optional_feature_id, dm_granted, source)
  select
    p_character_id,
    row_data.optional_feature_id,
    row_data.dm_granted,
    row_data.source
  from jsonb_to_recordset(p_optional_features) as row_data(
    optional_feature_id uuid,
    dm_granted boolean,
    source text
  );

  delete from public.character_homebrew where character_id = p_character_id;
  insert into public.character_homebrew (character_id, homebrew_content_id, dm_granted)
  select
    p_character_id,
    row_data.homebrew_content_id,
    row_data.dm_granted
  from jsonb_to_recordset(p_homebrew) as row_data(
    homebrew_content_id uuid,
    dm_granted boolean
  );

  delete from public.character_progression_history where character_id = p_character_id;
  insert into public.character_progression_history (character_id, kind, level, data)
  select
    p_character_id,
    row_data.kind,
    row_data.level,
    row_data.data
  from jsonb_to_recordset(p_progression_history) as row_data(
    kind text,
    level integer,
    data jsonb
  );
end;
$$;

revoke execute on function public.save_character_bundle(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) from public;
revoke execute on function public.save_character_bundle(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) from anon;
grant execute on function public.save_character_bundle(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) to authenticated;

-- END 015
