"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge, PageHeader, SectionCard, StatTile } from "../../../components/AppShell";
import { useCharacters } from "../../../context/CharacterContext";
import { features, items, spells } from "../../../lib/data";
import { getAvailableFeatures, getAvailableItems, getAvailableSpells, getCantripsKnown, getFeatureRestrictionReason, getItemRestrictionReason, getMaxSpellLevel, getPreparedSpellCount, getSpellcastingMode, getSpellRestrictionReason, getSpellsKnown, getSpellcastingSummary, hasOverride, isFeatureNormallyAvailable, isItemNormallyAvailable, isSpellNormallyAvailable } from "../../../lib/rules";
import type { AbilityKey, Feature, Item, Spell } from "../../../lib/types";

const labels: Record<AbilityKey, string> = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" };
function abilityModifier(score: number) {
  const value = Math.floor((score - 10) / 2);
  return value >= 0 ? `+${value}` : String(value);
}
type Tab = "overview" | "combat" | "skills" | "spells" | "inventory" | "features" | "notes";
const tabs: { id: Tab; label: string }[] = [{ id: "overview", label: "Overview" }, { id: "combat", label: "Combat" }, { id: "skills", label: "Skills" }, { id: "spells", label: "Spells" }, { id: "inventory", label: "Inventory" }, { id: "features", label: "Features" }, { id: "notes", label: "Notes" }];

export default function CharacterPage() {
  const params = useParams<{ id: string }>();
  const { characters, accessMode, addSpell, removeSpell, toggleSpellPrepared, addInventoryItem, removeInventoryItem, changeInventoryQuantity, toggleInventoryEquipped, addFeature, removeFeature, revokeOverride, updateCharacter, spellCatalogue, featureCatalogue, featCatalogue, itemCatalogue, raceRules, backgroundRules } = useCharacters();
  const [tab, setTab] = useState<Tab>("overview");
  const character = characters.find((entry) => entry.id === params.id);
  const [showRestricted, setShowRestricted] = useState(false);
  const [search, setSearch] = useState("");

  const librarySpells = spellCatalogue.length ? spellCatalogue : spells;
  const charSpells = useMemo(() => character ? character.spells.map((entry) => {
    const spell = librarySpells.find((candidate) => candidate.id === entry.spellId) ?? spells.find((candidate) => candidate.id === entry.spellId);
    return spell ? { spell, entry } : null;
  }).filter((x): x is { spell: Spell; entry: (typeof character.spells)[number] } => Boolean(x)) : [], [character, librarySpells]);
  const charFeatures = useMemo(() => character ? character.features.map((id) => featureCatalogue.find((feature) => feature.id === id) ?? features.find((feature) => feature.id === id)).filter((feature): feature is Feature => Boolean(feature)) : [], [character, featureCatalogue]);
  const charItems = useMemo(() => character ? character.inventory.map((entry) => { const item = libraryItems.find((candidate) => candidate.id === entry.itemId); return item ? { item, entry } : null; }).filter((x): x is { item: Item; entry: (typeof character.inventory)[number] } => Boolean(x)) : [], [character]);
  if (!character) return <div className="mx-auto max-w-5xl px-4 py-12"><SectionCard title="Character not found"><Link href="/characters" className="text-amber-400">Back to Characters</Link></SectionCard></div>;

  const accessibleSpells = getAvailableSpells(character, true, librarySpells);
  const accessibleFeatures = featureCatalogue.length ? featureCatalogue.filter((feature) => isFeatureNormallyAvailable(character, feature) || hasOverride(character, "feature", feature.id)) : getAvailableFeatures(character);
  const accessibleItems = getAvailableItems(character, true, libraryItems);
  const maxSpellLevel = getMaxSpellLevel(character);
  const castingMode = getSpellcastingMode(character);
  const spellSummary = getSpellcastingSummary(character);
  const knownLimit = getSpellsKnown(character.className, character.level);
  const preparedLimit = getPreparedSpellCount(character);
  const spellLevelForEntry = (entry: (typeof character.spells)[number]) => librarySpells.find((spell) => spell.id === entry.spellId)?.level ?? spells.find((spell) => spell.id === entry.spellId)?.level ?? 1;
  const addedCantrips = character.spells.filter((entry) => spellLevelForEntry(entry) === 0).length;
  const addedLevelledSpells = character.spells.filter((entry) => spellLevelForEntry(entry) > 0).length;
  const preparedLevelledSpells = charSpells.filter(({ entry, spell }) => entry.prepared && spell.level > 0).length;
  const raceInfo = raceRules[character.race];
  const backgroundInfo = backgroundRules[character.background];
  const libraryItems = itemCatalogue.length ? itemCatalogue : items;
  const strMod = abilityModifier(character.abilities.str);
  const proficientSkill = (name: string) => character.skills.some((skill) => skill.toLowerCase() === name.toLowerCase());
  const skillDefinitions: Array<[string, AbilityKey]> = [
    ["Acrobatics", "dex"], ["Animal Handling", "wis"], ["Arcana", "int"], ["Athletics", "str"],
    ["Deception", "cha"], ["History", "int"], ["Insight", "wis"], ["Intimidation", "cha"],
    ["Investigation", "int"], ["Medicine", "wis"], ["Nature", "int"], ["Perception", "wis"],
    ["Performance", "cha"], ["Persuasion", "cha"], ["Religion", "int"], ["Sleight of Hand", "dex"],
    ["Stealth", "dex"], ["Survival", "wis"],
  ];
  const equippedWeapons = character.inventory
    .filter((entry) => entry.equipped)
    .map((entry) => itemCatalogue.find((item) => item.id === entry.itemId) ?? items.find((item) => item.id === entry.itemId))
    .filter((item): item is Item => Boolean(item?.isWeapon));
  const combatFeatures = charFeatures.filter((feature) => feature.uses);
  const toggleResource = (feature: Feature) => {
    if (!feature.uses) return;
    const used = character.resourceUses[feature.id] ?? 0;
    const nextUsed = used >= feature.uses.max ? 0 : used + 1;
    void updateCharacter(character.id, { resourceUses: { ...character.resourceUses, [feature.id]: nextUsed } });
  };
  const attackAbility = (item: Item) => {
    const props = (item.weaponProperties ?? []).map((property) => property.toLowerCase());
    const category = item.category.toLowerCase();
    if (props.includes("finesse")) return Math.max(character.abilities.str, character.abilities.dex) === character.abilities.dex ? "dex" : "str";
    if (category.includes("ranged") || props.includes("ammunition")) return "dex";
    return "str";
  };
  const weaponAttack = (item: Item) => {
    const key = attackAbility(item) as AbilityKey;
    const mod = Math.floor((character.abilities[key] - 10) / 2);
    const proficient = true;
    return mod + (proficient ? character.proficiencyBonus : 0) + (item.magicBonus ?? 0);
  };
  const weaponDamage = (item: Item) => {
    const key = attackAbility(item) as AbilityKey;
    const mod = Math.floor((character.abilities[key] - 10) / 2) + (item.magicBonus ?? 0);
    return item.weaponDamage ? `${item.weaponDamage} ${mod >= 0 ? "+" : ""}${mod}` : "See item";
  };

  return <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8"><PageHeader eyebrow="Character Sheet" title={character.name} description={`${character.race} • ${character.className} • ${character.subclass || "No subclass"}`} actions={<div className="flex flex-wrap gap-2"><Link href="/characters" className="rounded-xl border border-stone-700 px-4 py-2.5 text-sm text-stone-300 hover:bg-stone-800">← Characters</Link><Link href={`/characters/${character.id}/edit`} className="rounded-xl bg-stone-100 px-4 py-2.5 text-sm font-semibold text-stone-950 hover:bg-amber-300">Edit Character</Link></div>} />
    <div className="mb-6 flex flex-wrap gap-2 rounded-xl border border-stone-800 bg-stone-900/70 p-1">{tabs.map((entry) => <button key={entry.id} onClick={() => setTab(entry.id)} className={`rounded-lg px-4 py-2.5 text-sm font-medium ${tab === entry.id ? "bg-stone-100 text-stone-950" : "text-stone-400 hover:bg-stone-800 hover:text-stone-100"}`}>{entry.label}</button>)}</div>

    {tab === "overview" && (
      <div className="space-y-6">
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatTile label="Level" value={character.level} />
          <StatTile label="Hit Points" value={`${character.hp}/${character.maxHp}`} />
          <StatTile label="Armor Class" value={character.ac} />
          <StatTile label="Speed" value={`${character.speed} ft`} />
          <StatTile label="Proficiency" value={`+${character.proficiencyBonus}`} />
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
          <SectionCard
            title="Ability scores"
            description="Final scores after racial increases, with the 2014 ability modifier shown for each score."
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {(Object.keys(character.abilities) as AbilityKey[]).map((key) => (
                <div key={key} className="rounded-xl border border-stone-800 bg-stone-950/60 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-stone-500">{labels[key]}</div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-3xl font-bold">{character.abilities[key]}</span>
                    <span className="text-lg font-semibold text-amber-300">{abilityModifier(character.abilities[key])}</span>
                  </div>
                  {(raceInfo?.abilityBonuses[key] ?? 0) !== 0 && (
                    <p className="mt-1 text-xs text-stone-600">
                      Race: {(raceInfo?.abilityBonuses[key] ?? 0) > 0 ? "+" : ""}{raceInfo?.abilityBonuses[key]}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard
            title="Access hierarchy"
            description="This is what the application uses when deciding what you can normally add."
          >
            <div className="space-y-3 text-sm">
              <Row label="Class" value={character.className} />
              <Row label="Subclass" value={character.subclass || "None"} />
              <Row label="Level" value={String(character.level)} />
              <Row label="Spellcasting" value={castingMode === "none" ? "None" : `${castingMode}, up to ${maxSpellLevel}th-level spells`} />
              <Row label="Accessible spells" value={`${accessibleSpells.length} of ${librarySpells.length} in 2014 catalogue`} />
              <Row
                label="Spell capacity"
                value={castingMode === "none"
                  ? "None"
                  : `${addedCantrips}/${getCantripsKnown(character.className, character.level)} cantrips${knownLimit !== null ? ` • ${addedLevelledSpells}/${knownLimit} known` : ""}${preparedLimit !== null ? ` • ${preparedLevelledSpells}/${preparedLimit} prepared` : ""}${spellSummary.wizardSpellbookProgression ? ` • ${addedLevelledSpells}/${spellSummary.wizardSpellbookProgression} baseline wizard spells` : ""}`}
              />
              <Row label="Accessible features" value={`${accessibleFeatures.length} of ${featureCatalogue.length || features.length} in imported catalogue`} />
              <Row label="Accessible items" value={`${accessibleItems.length} of ${items.length} in sample library`} />
              <Row label="DM overrides" value={String(character.accessOverrides.length)} />
            </div>

            {character.accessOverrides.length > 0 && (
              <div className="mt-5 border-t border-stone-800 pt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500">Recorded grants</h3>
                <div className="mt-3 space-y-2">
                  {character.accessOverrides.map((override) => (
                    <div
                      key={`${override.type}:${override.contentId}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-amber-900/50 bg-amber-950/20 p-3 text-sm"
                    >
                      <span className="text-stone-300">
                        {override.type}: <span className="text-stone-100">{override.contentId}</span>
                      </span>
                      {accessMode === "dm" && (
                        <button
                          onClick={() => revokeOverride(character.id, override.type, override.contentId)}
                          className="rounded-lg border border-stone-700 px-2.5 py-1.5 text-xs text-stone-400 hover:bg-stone-800"
                        >
                          Remove grant
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </SectionCard>

          {backgroundInfo && (
            <SectionCard
              title="Background"
              description="Mechanical benefits supplied by the selected 2014 background."
            >
              <div className="space-y-3">
                {backgroundInfo.skills.length > 0 && <Row label="Skills" value={backgroundInfo.skills.join(", ")} />}
                {backgroundInfo.languages.length > 0 && <Row label="Languages" value={backgroundInfo.languages.join(", ")} />}
                {backgroundInfo.tools.length > 0 && <Row label="Tools" value={backgroundInfo.tools.join(", ")} />}
                {backgroundInfo.featureName && (
                  <div className="rounded-xl border border-stone-800 bg-stone-950/60 p-4">
                    <h3 className="font-semibold text-amber-300">{backgroundInfo.featureName}</h3>
                    <p className="mt-2 whitespace-pre-line text-sm leading-6 text-stone-400">{backgroundInfo.featureDescription}</p>
                  </div>
                )}
              </div>
            </SectionCard>
          )}
        </section>
      </div>
    )}

    {tab === "combat" && (
      <div className="space-y-6">
        <SectionCard title="Attacks" description="Equipped weapons are calculated from your ability modifier, proficiency bonus and weapon magic bonus.">
          <div className="space-y-3">
            {equippedWeapons.map((weapon) => (
              <article key={weapon.id} className="rounded-2xl border border-stone-800 bg-stone-950/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div><h3 className="text-lg font-semibold">{weapon.name}</h3><p className="text-xs uppercase tracking-wider text-stone-600">{weapon.weaponDamageType || weapon.category}{weapon.weaponProperties?.length ? ` • ${weapon.weaponProperties.join(", ")}` : ""}</p></div>
                  <div className="rounded-xl border border-stone-700 px-4 py-2 text-lg font-bold">{weaponAttack(weapon) >= 0 ? "+" : ""}{weaponAttack(weapon)} to hit</div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div><div className="text-xs uppercase tracking-wider text-stone-600">Damage</div><div className="mt-1 text-xl font-semibold">{weaponDamage(weapon)}</div></div>
                  <div><div className="text-xs uppercase tracking-wider text-stone-600">Ability</div><div className="mt-1 text-sm">{attackAbility(weapon) === "dex" ? "Dexterity" : "Strength"}</div></div>
                  <div><div className="text-xs uppercase tracking-wider text-stone-600">Range</div><div className="mt-1 text-sm">{weapon.weaponRange || "5 ft."}</div></div>
                </div>
              </article>
            ))}
            <article className="rounded-2xl border border-stone-800 bg-stone-950/60 p-4"><div className="flex items-center justify-between"><h3 className="text-lg font-semibold">Unarmed Strike</h3><span className="rounded-xl border border-stone-700 px-4 py-2 font-bold">{strMod} to hit</span></div><p className="mt-2 text-sm text-stone-500">1 + Strength modifier bludgeoning damage.</p></article>
            {equippedWeapons.length === 0 && <p className="text-sm text-stone-500">Equip a weapon in Inventory and it will appear here with its attack bonus and damage dice.</p>}
          </div>
        </SectionCard>

        <SectionCard title="Combat Actions" description="The standard 2014 combat actions, plus your limited-use class and subclass features.">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {["Attack", "Dash", "Disengage", "Dodge", "Help", "Hide", "Ready", "Search", "Use an Object", "Grapple", "Shove", "Improvise"].map((action) => <div key={action} className="rounded-xl border border-stone-800 bg-stone-950/60 p-4 font-semibold">{action}</div>)}
          </div>
        </SectionCard>

        {combatFeatures.length > 0 && <SectionCard title="Limited-use abilities" description="Tap the boxes as you spend uses. Tapping the last box resets the ability for the next use cycle.">
          <div className="space-y-4">
            {combatFeatures.map((feature) => {
              const used = character.resourceUses[feature.id] ?? 0;
              const max = feature.uses!.max;
              return <article key={feature.id} className="rounded-2xl border border-stone-800 bg-stone-950/60 p-4"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{feature.name}</h3><Badge>{feature.uses!.recovery}</Badge></div><p className="mt-2 whitespace-pre-line text-sm leading-6 text-stone-400">{feature.description}</p><div className="mt-4 flex gap-2">{Array.from({ length: max }, (_, index) => <button type="button" key={index} onClick={() => toggleResource(feature)} className={`h-8 w-8 rounded-lg border ${index < used ? "border-red-700 bg-red-700" : "border-stone-600 bg-stone-900"}`} aria-label={`${feature.name} use ${index + 1}`}>{index < used ? "✓" : ""}</button>)}</div></article>;
            })}
          </div>
        </SectionCard>}
      </div>
    )}

    {tab === "spells" && <SectionCard title="Spellbook" description={castingMode === "none"
      ? "This class has no normal spellcasting."
      : addedCantrips + "/" + spellSummary.cantripsKnown + " cantrips"
        + (knownLimit !== null ? " • " + addedLevelledSpells + "/" + knownLimit + " spells known" : "")
        + (preparedLimit !== null ? " • " + preparedLevelledSpells + "/" + preparedLimit + " prepared" : "")
        + (spellSummary.wizardSpellbookProgression ? " • " + addedLevelledSpells + "/" + spellSummary.wizardSpellbookProgression + " baseline wizard spells" : "")
        + (spellSummary.slots.length ? " • " + spellSummary.slots.map((slot) => slot.count + "×" + slot.level + (slot.level === 1 ? "st" : slot.level === 2 ? "nd" : slot.level === 3 ? "rd" : "th")).join(", ") : "")
      } actions={<button onClick={() => { setTab("spells"); setShowRestricted(false); setSearch(""); }} className="rounded-xl bg-stone-100 px-4 py-2.5 text-sm font-semibold text-stone-950">Manage Spells</button>}>
      {castingMode !== "none" && <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {spellSummary.slots.map((slot) => <div key={slot.level} className="rounded-xl border border-stone-800 bg-stone-950/60 p-4"><div className="text-xs uppercase tracking-wider text-stone-500">Level {slot.level} slots</div><div className="mt-1 text-2xl font-bold">{slot.count}</div></div>)}
        {spellSummary.slots.length === 1 && character.className === "Warlock" && <div className="rounded-xl border border-stone-800 bg-stone-950/60 p-4"><div className="text-xs uppercase tracking-wider text-stone-500">Pact slot level</div><div className="mt-1 text-2xl font-bold">{spellSummary.slots[0].level}</div><div className="mt-1 text-xs text-stone-600">All pact slots use this level</div></div>}
      </div>}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search your spells or the 2014 library..." className="flex-1 rounded-xl border border-stone-800 bg-stone-950 px-4 py-3 text-sm outline-none focus:border-amber-400" /><label className="flex items-center gap-2 text-sm text-stone-400"><input type="checkbox" checked={showRestricted} onChange={(e) => setShowRestricted(e.target.checked)} /> Show restricted library entries</label></div>
      <div className="space-y-6">
        <div><h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-stone-500">Your Spells</h3>{charSpells.length === 0 ? <p className="text-sm text-stone-500">No spells added.</p> : <div className="space-y-3">{charSpells.map(({ spell, entry }) => <SpellCard key={spell.id} spell={spell} prepared={entry.prepared} showPrepare={castingMode === "prepared" && spell.level > 0} onToggle={() => toggleSpellPrepared(character.id, spell.id)} onRemove={() => removeSpell(character.id, spell.id)} dmGranted={hasOverride(character, "spell", spell.id)} />)}</div>}</div>
        <div><h3 className="mb-1 text-sm font-semibold uppercase tracking-wider text-stone-500">Add Spells</h3><p className="mb-3 text-xs text-stone-600">The app is using the imported 2014 spell catalogue. Known-spell classes use their class-table limits. Wizards can copy additional spells into their spellbook.</p>
          {(() => {
            const matching = librarySpells
              .filter((spell) => !character.spells.some((entry) => entry.spellId === spell.id))
              .filter((spell) => (spell.name + " " + spell.description).toLowerCase().includes(search.toLowerCase()))
              .filter((spell) => showRestricted || isSpellNormallyAvailable(character, spell) || hasOverride(character, "spell", spell.id));
            const visible = matching.slice(0, 120);
            return <><div className="mb-3 text-xs text-stone-600">Showing {visible.length} of {matching.length} matching spells{matching.length > 120 ? " • refine your search to see more" : ""}.</div><div className="grid gap-3 md:grid-cols-2">{visible.map((spell) => {
              const allowed = isSpellNormallyAvailable(character, spell) || hasOverride(character, "spell", spell.id);
              const capacityAvailable = spell.level === 0 ? addedCantrips < spellSummary.cantripsKnown : knownLimit === null || addedLevelledSpells < knownLimit;
              const overrideButton = !allowed && accessMode === "dm";
              const status = !allowed ? getSpellRestrictionReason(character, spell) : capacityAvailable ? "Available" : spell.level === 0 ? "Cantrip limit reached (" + spellSummary.cantripsKnown + ")" : "Spells known limit reached (" + knownLimit + ")";
              return <LibraryCard key={spell.id} title={spell.name} meta={(spell.level === 0 ? "Cantrip" : "Level " + spell.level) + " • " + spell.school + (spell.source ? " • " + spell.source : "")} description={spell.description} status={status} tone={allowed && capacityAvailable ? "good" : "warn"} actions={allowed ? <button disabled={!capacityAvailable} onClick={() => addSpell(character.id, spell.id, false)} className={capacityAvailable ? "rounded-xl border border-stone-700 px-3 py-2 text-sm" : "cursor-not-allowed rounded-xl border border-stone-800 px-3 py-2 text-sm text-stone-600"}>+ Add</button> : overrideButton ? <button onClick={() => addSpell(character.id, spell.id, false, true)} className="rounded-xl border border-amber-700 px-3 py-2 text-sm text-amber-300">DM Grant</button> : <span className="text-xs text-stone-600">Locked in Player Mode</span>} />;
            })}</div></>;
          })()}
        </div>
      </div>
    </SectionCard>}
    {tab === "skills" && (
      <SectionCard title="Skills" description="All 18 standard 2014 skills, with your ability modifier and proficiency bonus calculated automatically.">
        <div className="grid gap-2 lg:grid-cols-2">
          {skillDefinitions.map(([name, key]) => {
            const proficient = proficientSkill(name);
            const mod = Math.floor((character.abilities[key] - 10) / 2);
            const total = mod + (proficient ? character.proficiencyBonus : 0);
            return <div key={name} className="flex items-center justify-between rounded-xl border border-stone-800 bg-stone-950/60 p-4"><div className="flex items-center gap-3"><span className={`h-3 w-3 rounded-full border ${proficient ? "border-amber-300 bg-amber-300" : "border-stone-600"}`} /><div><div className="font-semibold">{name}</div><div className="text-xs uppercase tracking-wider text-stone-600">{key.toUpperCase()}</div></div></div><span className="rounded-lg border border-stone-700 px-3 py-1.5 font-semibold">{total >= 0 ? "+" : ""}{total}</span></div>;
          })}
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3"><StatTile label="Passive Perception" value={10 + Math.floor((character.abilities.wis - 10) / 2) + (proficientSkill("Perception") ? character.proficiencyBonus : 0)} /><StatTile label="Passive Insight" value={10 + Math.floor((character.abilities.wis - 10) / 2) + (proficientSkill("Insight") ? character.proficiencyBonus : 0)} /><StatTile label="Passive Investigation" value={10 + Math.floor((character.abilities.int - 10) / 2) + (proficientSkill("Investigation") ? character.proficiencyBonus : 0)} /></div>
      </SectionCard>
    )}

    {tab === "inventory" && <SectionCard title="Inventory" description={`${charItems.length} item types carried. Player Mode respects item restrictions; DM Mode can grant restricted content.`} actions={<button onClick={() => { setSearch(""); setShowRestricted(true); }} className="rounded-xl bg-stone-100 px-4 py-2.5 text-sm font-semibold text-stone-950">Find Equipment</button>}><div className="space-y-3">{charItems.length === 0 ? <p className="text-sm text-stone-500">Nothing carried yet.</p> : charItems.map(({ item, entry }) => <article key={item.id} className="rounded-2xl border border-stone-800 bg-stone-950/60 p-4"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{item.name}</h3><Badge>{item.rarity}</Badge>{entry.equipped && <Badge tone="good">Equipped</Badge>}{hasOverride(character, "item", item.id) && <Badge tone="warn">DM granted</Badge>}</div><p className="mt-1 text-xs uppercase tracking-wider text-stone-600">{item.category}</p><p className="mt-2 text-sm leading-6 text-stone-400">{item.description}</p></div><div className="flex flex-wrap items-center gap-2"><div className="flex items-center rounded-xl border border-stone-700"><button onClick={() => changeInventoryQuantity(character.id, item.id, -1)} className="px-3 py-2">−</button><span className="min-w-10 text-center text-sm">{entry.quantity}</span><button onClick={() => changeInventoryQuantity(character.id, item.id, 1)} className="px-3 py-2">+</button></div><button onClick={() => toggleInventoryEquipped(character.id, item.id)} className="rounded-xl border border-stone-700 px-3 py-2 text-sm">{entry.equipped ? "Unequip" : "Equip"}</button><button onClick={() => removeInventoryItem(character.id, item.id)} className="rounded-xl border border-red-950 px-3 py-2 text-sm text-red-400">Remove</button></div></div></article>)}</div><div className="mt-6"><h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-stone-500">Catalogue</h3><div className="mb-4 flex flex-col gap-3 sm:flex-row"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search equipment..." className="flex-1 rounded-xl border border-stone-800 bg-stone-950 px-4 py-3 text-sm outline-none focus:border-amber-400" /><label className="flex items-center gap-2 text-sm text-stone-400"><input type="checkbox" checked={showRestricted} onChange={(e) => setShowRestricted(e.target.checked)} /> Show restricted</label></div><div className="grid gap-3 md:grid-cols-2">{items.filter((item) => `${item.name} ${item.description} ${item.category}`.toLowerCase().includes(search.toLowerCase())).filter((item) => showRestricted || isItemNormallyAvailable(character, item) || hasOverride(character, "item", item.id)).map((item) => { const allowed = isItemNormallyAvailable(character, item) || hasOverride(character, "item", item.id); return <LibraryCard key={item.id} title={item.name} meta={`${item.rarity} • ${item.category}${item.requiresAttunement ? " • Attunement" : ""}`} description={item.description} status={allowed ? "Available" : getItemRestrictionReason(character, item)} tone={allowed ? "good" : "warn"} actions={allowed ? <button onClick={() => addInventoryItem(character.id, item.id)} className="rounded-xl bg-stone-100 px-3 py-2 text-sm font-semibold text-stone-950">+ Add</button> : accessMode === "dm" ? <button onClick={() => addInventoryItem(character.id, item.id, 1, true)} className="rounded-xl border border-amber-700 px-3 py-2 text-sm text-amber-300">DM Grant</button> : <span className="text-xs text-stone-600">Locked in Player Mode</span>} />; })}</div></div></SectionCard>}

    {tab === "features" && <SectionCard title="Features, Abilities & Feats" description="Selected features show their full descriptions. Feats also show what they do so you do not have to remember the rules text."><div className="space-y-6">
      {backgroundInfo?.featureName && <div><h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-stone-500">Background Feature</h3><article className="rounded-2xl border border-amber-900/50 bg-amber-950/20 p-4"><h3 className="font-semibold text-amber-300">{backgroundInfo.featureName}</h3><p className="mt-3 whitespace-pre-line text-sm leading-6 text-stone-300">{backgroundInfo.featureDescription}</p></article></div>}
      <div><h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-stone-500">Features</h3><div className="space-y-3">{charFeatures.map((feature) => <article key={feature.id} className="rounded-2xl border border-stone-800 bg-stone-950/60 p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{feature.name}</h3><Badge>Level {feature.requiredLevel}</Badge>{hasOverride(character, "feature", feature.id) && <Badge tone="warn">DM granted</Badge>}</div><p className="mt-1 text-xs uppercase tracking-wider text-stone-600">{feature.source}</p><p className="mt-3 whitespace-pre-line text-sm leading-6 text-stone-400">{feature.description}</p></div><button onClick={() => removeFeature(character.id, feature.id)} className="rounded-xl border border-red-950 px-3 py-2 text-sm text-red-400">Remove</button></div></article>)}</div></div>
      <div><h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-stone-500">Feats</h3>{character.feats.length ? <div className="space-y-3">{character.feats.map((id) => { const feat = featCatalogue.find((entry) => entry.id === id); return feat ? <article key={id} className="rounded-2xl border border-amber-900/50 bg-amber-950/20 p-4"><div className="flex items-center gap-2"><h3 className="font-semibold text-amber-300">{feat.name}</h3>{feat.source && <Badge>{feat.source}</Badge>}</div><p className="mt-3 whitespace-pre-line text-sm leading-6 text-stone-300">{feat.description}</p></article> : <div key={id} className="text-sm text-stone-600">Feat: {id}</div>; })}</div> : <p className="text-sm text-stone-500">No feats selected.</p>}</div>
      <div><h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-stone-500">Add Feature</h3>{(() => { const matching = accessibleFeatures.filter((feature) => !character.features.includes(feature.id) && (feature.name + " " + feature.description).toLowerCase().includes(search.toLowerCase())); const visible = matching.slice(0, 100); return <><div className="mb-3 text-xs text-stone-600">Showing {visible.length} of {matching.length} matching features.</div><div className="grid gap-3 md:grid-cols-2">{visible.map((feature) => <LibraryCard key={feature.id} title={feature.name} meta={"Level " + feature.requiredLevel + " • " + feature.sourceType + (feature.source ? " • " + feature.source : "")} description={feature.description} status="Available" tone="good" actions={<button onClick={() => addFeature(character.id, feature.id)} className="rounded-xl border border-stone-700 px-3 py-2 text-sm">+ Add</button>} />)}</div></>; })()}</div>
    </div></SectionCard>}
    {tab === "notes" && <SectionCard title="Character Notes" description="Free-form text. Stored with this character only."><textarea defaultValue={character.notes} onBlur={(e) => updateCharacter(character.id, { notes: e.target.value })} rows={18} className="w-full rounded-xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm leading-6 outline-none focus:border-amber-400" /><p className="mt-2 text-xs text-stone-600">Changes are saved when you leave the notes box.</p></SectionCard>}
  </div>;
}

function Row({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between gap-4 border-b border-stone-800 pb-2"><span className="text-stone-500">{label}</span><span className="text-right text-stone-200">{value}</span></div>; }
function LibraryCard({ title, meta, description, status, tone, actions }: { title: string; meta: string; description: string; status: string; tone: "good" | "warn"; actions: React.ReactNode }) { return <article className="rounded-2xl border border-stone-800 bg-stone-950/60 p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{title}</h3><p className="mt-1 text-xs uppercase tracking-wider text-stone-600">{meta}</p></div><Badge tone={tone}>{status}</Badge></div><p className="mt-3 text-sm leading-6 text-stone-400">{description}</p><div className="mt-4 flex justify-end">{actions}</div></article>; }
function SpellCard({ spell, prepared, showPrepare, onToggle, onRemove, dmGranted }: { spell: Spell; prepared: boolean; showPrepare: boolean; onToggle: () => void; onRemove: () => void; dmGranted: boolean }) { return <article className="rounded-2xl border border-stone-800 bg-stone-950/60 p-4"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{spell.name}</h3><Badge>{spell.level === 0 ? "Cantrip" : `Level ${spell.level}`}</Badge>{prepared && <Badge tone="good">Prepared</Badge>}{dmGranted && <Badge tone="warn">DM granted</Badge>}</div><p className="mt-2 text-sm leading-6 text-stone-400">{spell.description}</p><div className="mt-3 grid gap-2 text-xs text-stone-600 sm:grid-cols-3"><span>Casting: {spell.castingTime}</span><span>Range: {spell.range}</span><span>Duration: {spell.duration}</span></div>{spell.higherLevels && <p className="mt-3 text-xs leading-5 text-stone-600"><span className="font-semibold uppercase">At Higher Levels:</span> {spell.higherLevels}</p>}</div><div className="flex shrink-0 gap-2">{showPrepare && <button onClick={onToggle} className={`rounded-xl border px-3 py-2 text-sm ${prepared ? "border-emerald-900 text-emerald-400" : "border-stone-700 text-stone-300"}`}>{prepared ? "Unprepare" : "Prepare"}</button>}<button onClick={onRemove} className="rounded-xl border border-red-950 px-3 py-2 text-sm text-red-400">Remove</button></div></div></article>; }
