"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Badge, PageHeader, SectionCard } from "../../../../components/AppShell";
import AbilityScoreBuilder, { applyAbilityBonuses, type AbilityScoreMethod } from "../../../../components/AbilityScoreBuilder";
import { useCharacters } from "../../../../context/CharacterContext";
import type { AbilityKey, AbilityScores, Character, Currency, InventoryEntry, SpellEntry } from "../../../../lib/types";
import { getAbilityScoreImprovementLevelsUpTo, getCantripsKnown, getClassDefinition, getExpectedHitDice, getExpectedMaxHp, getMaxSpellLevel, getNewAbilityScoreImprovementLevels, getPreparedSpellCount, getProficiencyBonus, getSpellsKnown, getWizardSpellbookProgression, isFeatAvailable, isSpellNormallyAvailable } from "../../../../lib/rules";

type OptionalChoiceEntry = { title: string; featureTypes: string[]; count: number; level: number };

function getOptionalChoiceGroups(classEntries: OptionalChoiceEntry[], subclassEntries: OptionalChoiceEntry[], level: number) {
  const consolidate = (entries: OptionalChoiceEntry[]) => {
    const groups = new Map<string, { id: string; title: string; count: number; featureTypes: string[] }>();
    for (const entry of entries.filter((item) => item.level <= level && item.count > 0)) {
      const key = entry.title + "::" + entry.featureTypes.join("|");
      const current = groups.get(key);
      if (current) current.count = Math.max(current.count, entry.count);
      else groups.set(key, { id: key, title: entry.title, count: entry.count, featureTypes: entry.featureTypes });
    }
    return groups;
  };

  const classGroups = consolidate(classEntries);
  const subclassGroups = consolidate(subclassEntries);
  const merged = new Map<string, { id: string; title: string; count: number; featureTypes: string[] }>();
  for (const group of [...classGroups.values(), ...subclassGroups.values()]) {
    const current = merged.get(group.id);
    if (current) current.count += group.count;
    else merged.set(group.id, { ...group });
  }
  return [...merged.values()];
}


const abilityKeys: AbilityKey[] = ["str", "dex", "con", "int", "wis", "cha"];
const abilityLabels: Record<AbilityKey, string> = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" };

export default function EditCharacterPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const {
    characters,
    updateCharacter,
    catalogue,
    raceRules,
    backgroundRules,
    featureCatalogue,
    featCatalogue,
    classRules,
    subclassOptionalFeatureProgression,
    optionalFeatureCatalogue,
    itemCatalogue,
    spellCatalogue,
  } = useCharacters();
  const character = characters.find((entry) => entry.id === params.id);

  if (!character) {
    return <div className="mx-auto max-w-5xl px-4 py-12"><SectionCard title="Character not found"><Link href="/characters" className="text-amber-400">Back to Characters</Link></SectionCard></div>;
  }

  return (
    <CharacterEditor
      character={character}
      catalogue={catalogue}
      raceRules={raceRules}
      backgroundRules={backgroundRules}
      featureCatalogue={featureCatalogue}
      featCatalogue={featCatalogue}
      classRules={classRules}
      subclassOptionalFeatureProgression={subclassOptionalFeatureProgression}
      optionalFeatureCatalogue={optionalFeatureCatalogue}
      itemCatalogue={itemCatalogue}
      spellCatalogue={spellCatalogue}
      onSave={async (patch) => { await updateCharacter(character.id, patch); router.push(`/characters/${character.id}`); }}
    />
  );
}

function CharacterEditor({
  character,
  catalogue,
  raceRules,
  backgroundRules,
  featureCatalogue,
  featCatalogue,
  classRules,
  subclassOptionalFeatureProgression,
  optionalFeatureCatalogue,
  itemCatalogue,
  spellCatalogue,
  onSave,
}: {
  character: Character;
  catalogue: ReturnType<typeof useCharacters>["catalogue"];
  raceRules: ReturnType<typeof useCharacters>["raceRules"];
  backgroundRules: ReturnType<typeof useCharacters>["backgroundRules"];
  featureCatalogue: ReturnType<typeof useCharacters>["featureCatalogue"];
  featCatalogue: ReturnType<typeof useCharacters>["featCatalogue"];
  classRules: ReturnType<typeof useCharacters>["classRules"];
  subclassOptionalFeatureProgression: ReturnType<typeof useCharacters>["subclassOptionalFeatureProgression"];
  optionalFeatureCatalogue: ReturnType<typeof useCharacters>["optionalFeatureCatalogue"];
  itemCatalogue: ReturnType<typeof useCharacters>["itemCatalogue"];
  spellCatalogue: ReturnType<typeof useCharacters>["spellCatalogue"];
  onSave: (patch: Partial<Character>) => void | Promise<void>;
}) {
  const [form, setForm] = useState({
    name: character.name,
    race: character.race,
    subrace: character.subrace,
    className: character.className,
    subclass: character.subclass,
    level: character.level,
    background: character.background,
    alignment: character.alignment,
    playerName: character.playerName,
    hp: character.hp,
    maxHp: character.maxHp,
    tempHp: character.tempHp,
    ac: character.ac,
    speed: character.speed,
    hitDice: character.hitDice,
    proficiencyBonus: character.proficiencyBonus,
    notes: character.notes,
  });

  const [baseAbilities, setBaseAbilities] = useState<AbilityScores>(() => ({
    str: Math.max(1, character.abilities.str - (raceRules[character.race]?.abilityBonuses.str ?? 0) - (catalogue.subraces.find((entry) => entry.name === character.subrace && entry.parentRace === character.race)?.abilityBonuses.str ?? 0)),
    dex: Math.max(1, character.abilities.dex - (raceRules[character.race]?.abilityBonuses.dex ?? 0) - (catalogue.subraces.find((entry) => entry.name === character.subrace && entry.parentRace === character.race)?.abilityBonuses.dex ?? 0)),
    con: Math.max(1, character.abilities.con - (raceRules[character.race]?.abilityBonuses.con ?? 0) - (catalogue.subraces.find((entry) => entry.name === character.subrace && entry.parentRace === character.race)?.abilityBonuses.con ?? 0)),
    int: Math.max(1, character.abilities.int - (raceRules[character.race]?.abilityBonuses.int ?? 0) - (catalogue.subraces.find((entry) => entry.name === character.subrace && entry.parentRace === character.race)?.abilityBonuses.int ?? 0)),
    wis: Math.max(1, character.abilities.wis - (raceRules[character.race]?.abilityBonuses.wis ?? 0) - (catalogue.subraces.find((entry) => entry.name === character.subrace && entry.parentRace === character.race)?.abilityBonuses.wis ?? 0)),
    cha: Math.max(1, character.abilities.cha - (raceRules[character.race]?.abilityBonuses.cha ?? 0) - (catalogue.subraces.find((entry) => entry.name === character.subrace && entry.parentRace === character.race)?.abilityBonuses.cha ?? 0)),
  }));
  const [abilities, setAbilities] = useState<AbilityScores>(character.abilities);
  const [abilityMethod, setAbilityMethod] = useState<AbilityScoreMethod>("manual");
  const [skills, setSkills] = useState<string[]>(character.skills);
  const [tools, setTools] = useState<string[]>(character.tools);
  const [languages, setLanguages] = useState<string[]>(character.languages);
  const [asiChoices, setAsiChoices] = useState<string[]>(character.feats ?? []);
  const [asiAbilityChoices, setAsiAbilityChoices] = useState<Array<{ mode: "two" | "one"; first?: AbilityKey; second?: AbilityKey }>>([]);
  const [expertiseSelections, setExpertiseSelections] = useState<string[]>(() => {
    const match = character.notes.match(/^Expertise:\s*(.+)$/m);
    return match?.[1]?.split(",").map((value) => value.trim()).filter(Boolean) ?? [];
  });
  const [magicalSecretSelections, setMagicalSecretSelections] = useState<string[]>([]);
  const [selectedSpells, setSelectedSpells] = useState<SpellEntry[]>(character.spells ?? []);
  const [optionalFeatures, setOptionalFeatures] = useState<string[]>(character.optionalFeatures ?? []);
  const [classSkillSelections, setClassSkillSelections] = useState<string[]>([]);
  const [backgroundSkillSelections, setBackgroundSkillSelections] = useState<string[]>([]);
  const [backgroundToolSelections, setBackgroundToolSelections] = useState<string[]>([]);
  const [backgroundLanguageSelections, setBackgroundLanguageSelections] = useState<string[]>([]);
  const [classLanguageSelections, setClassLanguageSelections] = useState<string[]>([]);
  const [raceLanguageSelections, setRaceLanguageSelections] = useState<string[]>([]);
  const [equipmentSelections, setEquipmentSelections] = useState<InventoryEntry[]>(character.inventory);
  const [startingEquipmentSelections, setStartingEquipmentSelections] = useState<Record<string, number>>({});
  const [startingItemChoices, setStartingItemChoices] = useState<Record<string, string>>({});
  const [equipmentSearch, setEquipmentSearch] = useState("");
  const [equipmentMode, setEquipmentMode] = useState<"equipment" | "gold">("equipment");
  const [currency, setCurrency] = useState<Currency>(character.currency ?? { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 });
  const [step, setStep] = useState<BuilderStep>("class");

  const subclassUnlockLevel = getClassDefinition(form.className, classRules)?.subclassUnlockLevel ?? 1;
  const subclassOptions = catalogue.subclasses.filter((entry) => entry.className === form.className && form.level >= subclassUnlockLevel);
  const selectedSubclass = subclassOptions.find((entry) => entry.name === form.subclass);
  const selectedSubrace = catalogue.subraces.find((entry) => entry.name === form.subrace && entry.parentRace === form.race);
  const selectedBackgroundRules = backgroundRules[form.background];
  const selectedClassRules = classRules[form.className];

  useEffect(() => {
    const nextMaxHp = getExpectedMaxHp(form.className, form.level, abilities.con, classRules);
    const nextHitDice = getExpectedHitDice(form.className, form.level, classRules);
    const nextProficiencyBonus = getProficiencyBonus(form.level);
    setForm((current) => {
      if (current.maxHp === nextMaxHp && current.hitDice === nextHitDice && current.proficiencyBonus === nextProficiencyBonus) return current;
      const hpDelta = nextMaxHp - current.maxHp;
      return { ...current, maxHp: nextMaxHp, hp: Math.max(0, Math.min(nextMaxHp, current.hp + hpDelta)), hitDice: nextHitDice, proficiencyBonus: nextProficiencyBonus };
    });
  }, [form.className, form.level, abilities.con]);

  useEffect(() => {
    const classChoices = selectedClassRules?.skills.choices ?? [];
    const classOptions = new Set(classChoices.flatMap((choice) => choice.options));
    const classSelected = character.skills.filter((skill) => classOptions.has(skill)).slice(0, classChoices.reduce((sum, choice) => sum + choice.count, 0));
    setClassSkillSelections(classSelected);
    setClassLanguageSelections(character.languages.filter((language) => (selectedClassRules?.languages.choices ?? []).some((choice) => choice.options.includes(language))));
    setBackgroundSkillSelections([]);
    setBackgroundToolSelections([]);
    setBackgroundLanguageSelections(character.languages.filter((language) => (selectedBackgroundRules?.languageChoices ?? []).some((choice) => choice.options.includes(language))));
    setRaceLanguageSelections(character.languages.filter((language) => (raceRules[character.race]?.languages.choices ?? []).some((choice) => choice.options.includes(language))));
  }, [form.className, character.skills, selectedClassRules]);

  useEffect(() => {
    if (!catalogue.classes.length) return;
    setForm((current) => {
      const className = catalogue.classes.includes(current.className) ? current.className : catalogue.classes[0];
      const race = catalogue.races.includes(current.race) ? current.race : catalogue.races[0] ?? "";
      const background = catalogue.backgrounds.includes(current.background) ? current.background : catalogue.backgrounds[0] ?? "";
      const unlockLevel = getClassDefinition(className, classRules)?.subclassUnlockLevel ?? 1;
      const options = catalogue.subclasses.filter((entry) => entry.className === className && current.level >= unlockLevel);
      const subclass = options.some((entry) => entry.name === current.subclass) ? current.subclass : options[0]?.name ?? "";
      const subraces = catalogue.subraces.filter((entry) => entry.parentRace === race);
      const subrace = subraces.some((entry) => entry.name === current.subrace) ? current.subrace : "";
      return { ...current, className, race, background, subclass, subrace };
    });
  }, [catalogue]);

  const selectedSkills = useMemo(() => [...new Set([
    ...(selectedClassRules?.skills.fixed ?? []),
    ...classSkillSelections.filter(Boolean),
    ...(selectedBackgroundRules?.skills ?? []),
    ...backgroundSkillSelections.filter(Boolean),
  ])], [selectedClassRules, classSkillSelections, selectedBackgroundRules, backgroundSkillSelections]);

  const selectedTools = useMemo(() => [...new Set([
    ...(selectedClassRules?.tools.fixed ?? []),
    ...(selectedBackgroundRules?.tools ?? []),
    ...backgroundToolSelections.filter(Boolean),
  ])], [selectedClassRules, selectedBackgroundRules, backgroundToolSelections]);

  const selectedLanguages = useMemo(() => [...new Set([
    ...(raceRules[form.race]?.languages.fixed ?? []),
    ...raceLanguageSelections.filter(Boolean),
    ...(selectedClassRules?.languages.fixed ?? []),
    ...classLanguageSelections.filter(Boolean),
    ...(selectedBackgroundRules?.languages ?? []),
    ...backgroundLanguageSelections.filter(Boolean),
  ])], [selectedClassRules, selectedBackgroundRules, backgroundLanguageSelections]);

  const optionalChoiceGroups = useMemo(
    () => getOptionalChoiceGroups(
      selectedClassRules?.optionalFeatureProgression ?? [],
      subclassOptionalFeatureProgression[form.subclass] ?? [],
      form.level,
    ),
    [selectedClassRules, subclassOptionalFeatureProgression, form.subclass, form.level],
  );

  const asiLevels = getNewAbilityScoreImprovementLevels(character.className, character.level, form.level, classRules);
  const allAsiLevels = getAbilityScoreImprovementLevelsUpTo(form.className, form.level, classRules);
  const newAsiLevels = getNewAbilityScoreImprovementLevels(character.className, character.level, form.level, classRules);

  const progressionAbilities = useMemo(() => {
    const next = { ...abilities };
    newAsiLevels.forEach((_, index) => {
      const choice = asiAbilityChoices[index];
      if (!choice?.first) return;
      if (choice.mode === "two") {
        next[choice.first] = Math.min(20, next[choice.first] + 2);
      } else if (choice.second && choice.second !== choice.first) {
        next[choice.first] = Math.min(20, next[choice.first] + 1);
        next[choice.second] = Math.min(20, next[choice.second] + 1);
      }
    });
    return next;
  }, [abilities, newAsiLevels, asiAbilityChoices]);

  const expertiseLevels = useMemo(
    () => featureCatalogue
      .filter((feature) => feature.name.toLowerCase() === "expertise" && feature.className === form.className && feature.requiredLevel <= form.level)
      .sort((a, b) => a.requiredLevel - b.requiredLevel)
      .map((feature) => feature.requiredLevel),
    [featureCatalogue, form.className, form.level],
  );

  const magicalSecretFeatures = useMemo(
    () => featureCatalogue
      .filter((feature) => feature.name.toLowerCase().includes("magical secrets") && feature.className === form.className && feature.requiredLevel <= form.level)
      .sort((a, b) => a.requiredLevel - b.requiredLevel),
    [featureCatalogue, form.className, form.level],
  );

  const spellCharacter = useMemo(() => ({
    ...character,
    level: form.level,
    abilities: progressionAbilities,
    race: form.race,
    subrace: form.subrace,
    className: form.className,
    subclass: form.subclass,
    background: form.background,
    feats: asiChoices.filter(Boolean),
    skills: selectedSkills,
    tools: selectedTools,
    languages: selectedLanguages,
  }), [character, form.level, progressionAbilities, form.race, form.subrace, form.className, form.subclass, form.background, asiChoices, selectedSkills, selectedTools, selectedLanguages]);

  const availableSpells = useMemo(
    () => spellCatalogue.filter((spell) => isSpellNormallyAvailable(spellCharacter, spell)),
    [spellCatalogue, spellCharacter],
  );
  const magicalSecretSpellOptions = useMemo(() => {
    const maxLevel = getMaxSpellLevel(spellCharacter, classRules);
    return spellCatalogue.filter((spell) => spell.level <= maxLevel);
  }, [spellCatalogue, spellCharacter]);

  const cantripsKnown = getCantripsKnown(form.className, form.level, classRules);
  const spellsKnown = getSpellsKnown(form.className, form.level, classRules);
  const preparedSpellLimit = getPreparedSpellCount(spellCharacter, classRules);
  const wizardSpellbookLimit = form.className === "Wizard" ? getWizardSpellbookProgression(form.level) : null;
  const knownSpellLimit = form.className === "Wizard" ? wizardSpellbookLimit : spellsKnown ?? preparedSpellLimit;
  const magicalSecretCount = magicalSecretFeatures.length * 2;
  const normalSpellLimit = form.className === "Wizard" ? wizardSpellbookLimit : knownSpellLimit === null ? null : Math.max(0, knownSpellLimit - magicalSecretCount);

  const effectiveSelectedSpells = selectedSpells;

  useEffect(() => {
    setAsiChoices((current) => {
      const next = allAsiLevels.map((_, index) => current[index] ?? "");
      return current.length === next.length && current.every((value, index) => value === next[index]) ? current : next;
    });
  }, [allAsiLevels]);

  useEffect(() => {
    setAsiChoices((current) => {
      const prerequisiteCharacter = {
        level: form.level,
        abilities,
        race: form.race,
        subrace: form.subrace,
        className: form.className,
        background: form.background,
        feats: current.filter(Boolean),
        skills: selectedSkills,
        tools: selectedTools,
        languages: selectedLanguages,
      };
      const next = current.slice(0, allAsiLevels.length).map((featId) => {
        if (!featId) return "";
        const feat = featCatalogue.find((entry) => entry.id === featId);
        return feat && isFeatAvailable(prerequisiteCharacter, feat) ? featId : "";
      });
      return current.every((value, index) => value === next[index]) && current.length === next.length ? current : next;
    });
  }, [allAsiLevels, form.level, abilities, form.race, form.subrace, form.className, form.background, selectedSkills, selectedTools, selectedLanguages, featCatalogue]);



  function selectRace(race: string, subrace = "") {
    const subraceRules = catalogue.subraces.find((entry) => entry.name === subrace && entry.parentRace === race);
    setForm((current) => ({ ...current, race, subrace }));
    setRaceLanguageSelections([]);
    setAbilities(applyAbilityBonuses(applyAbilityBonuses(baseAbilities, raceRules[race]?.abilityBonuses ?? {}), subraceRules?.abilityBonuses ?? {}));
  }

  function setSubrace(value: string) {
    const subraceRules = catalogue.subraces.find((entry) => entry.name === value && entry.parentRace === form.race);
    setForm((current) => ({ ...current, subrace: value }));
    setAbilities(applyAbilityBonuses(applyAbilityBonuses(baseAbilities, raceRules[form.race]?.abilityBonuses ?? {}), subraceRules?.abilityBonuses ?? {}));
  }

  function equipmentChoiceOptions(choiceType: string) {
    const type = choiceType.toLowerCase();
    return itemCatalogue.filter((item) => {
      if (type === "weaponmartial") return Boolean(item.isWeapon && item.weaponCategory?.toLowerCase().includes("martial"));
      if (type === "weaponsimple") return Boolean(item.isWeapon && item.weaponCategory?.toLowerCase().includes("simple"));
      if (type === "armorlight") return Boolean(item.isArmor && item.armorCategory?.toLowerCase().includes("light"));
      if (type === "armormedium") return Boolean(item.isArmor && item.armorCategory?.toLowerCase().includes("medium"));
      if (type === "armorheavy") return Boolean(item.isArmor && item.armorCategory?.toLowerCase().includes("heavy"));
      if (type === "instrumentmusical") return item.name.toLowerCase().includes("instrument");
      return true;
    });
  }

  function applyStartingEquipment(
    groupId: string,
    optionIndex: number,
    option: { items: Array<{ name: string; quantity: number; choiceType?: string; special?: boolean }> },
    choiceOverrides: Record<string, string> = {},
  ) {
    const marker = `starting:${groupId}:`;
    setEquipmentSelections((current) => {
      const withoutGroup = current.filter((entry) => !entry.notes?.startsWith(marker));
      const additions = option.items.flatMap((entry, entryIndex) => {
        const choiceKey = `${groupId}:${optionIndex}:${entryIndex}`;
        const choiceId = choiceOverrides[choiceKey] ?? startingItemChoices[choiceKey];
        const chosen = entry.choiceType ? itemCatalogue.find((item) => item.id === choiceId) : undefined;
        if (entry.choiceType && !chosen) return [];
        if (entry.special) return [];
        const item = chosen ?? itemCatalogue.find((candidate) => {
          const normalized = entry.name.toLowerCase().replace(/^(a|an|one)\s+/i, "").replace(/[.,]/g, "").trim();
          const name = candidate.name.toLowerCase().replace(/[.,]/g, "").trim();
          return name === normalized || name.includes(normalized) || normalized.includes(name);
        });
        return item ? [{ itemId: item.id, quantity: Math.max(1, entry.quantity), equipped: false, notes: marker + optionIndex }] : [];
      });
      const merged = [...withoutGroup];
      for (const addition of additions) {
        const existing = merged.find((entry) => entry.itemId === addition.itemId);
        if (existing) existing.quantity += addition.quantity;
        else merged.push(addition);
      }
      return merged;
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const unlockedFeatureIds = featureCatalogue
      .filter((feature) => feature.requiredLevel <= form.level && feature.className === form.className && (!feature.subclassName || feature.subclassName === form.subclass))
      .map((feature) => feature.id);

    onSave({
      ...form,
      skills: selectedSkills,
      tools: selectedTools,
      languages: selectedLanguages,
      inventory: equipmentMode === "equipment" ? equipmentSelections : [],
      currency,
      abilities: progressionAbilities,
      feats: asiChoices.filter(Boolean),
      spells: [
        ...effectiveSelectedSpells,
        ...magicalSecretSelections
          .filter(Boolean)
          .filter((id) => !selectedSpells.some((entry) => entry.spellId === id))
          .map((spellId) => ({ spellId, prepared: true })),
      ],
      optionalFeatures,
      features: Array.from(new Set([...(character.features ?? []), ...unlockedFeatureIds])),
      notes: [
        form.notes,
        expertiseSelections.filter(Boolean).length ? "Expertise: " + expertiseSelections.filter(Boolean).join(", ") : "",
      ].filter(Boolean).join("\n\n"),
    });
  }

  return (
    <div className="min-h-[calc(100vh-120px)] bg-stone-950">
      <BuilderStepNav step={step} onStepChange={setStep} />

      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <PageHeader
          eyebrow={`Character Editor • ${STEP_META[step].number} of ${BUILDER_STEPS.length}`}
          title={`Edit ${character.name}`}
          description={STEP_META[step].description}
          actions={<Link href={`/characters/${character.id}`} className="rounded-xl border border-stone-700 px-4 py-2.5 text-sm text-stone-300 hover:bg-stone-800">Cancel</Link>}
        />

        <form onSubmit={submit} className="space-y-5">
          {step === "class" && (
            <>
              <SectionCard title="Character identity" description="Change the character's class, subclass and player identity.">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Character name" value={form.name} onChange={(value) => setForm((current) => ({ ...current, name: value }))} required />
                  <Field label="Player name" value={form.playerName} onChange={(value) => setForm((current) => ({ ...current, playerName: value }))} />
                  <NumberField label="Level" value={form.level} min={1} max={20} onChange={(value) => setForm((current) => ({ ...current, level: value }))} />
                  <SelectField label="Class" value={form.className} options={catalogue.classes} onChange={(value) => {
                    const next = catalogue.subclasses.filter((entry) => entry.className === value);
                    setForm((current) => ({ ...current, className: value, subclass: next[0]?.name ?? "" }));
                    setClassSkillSelections([]);
                    setClassLanguageSelections([]);
                  }} />
                  <SelectField label="Subclass" value={form.subclass} options={subclassOptions.map((entry) => entry.name)} onChange={(value) => setForm((current) => ({ ...current, subclass: value }))} />
                </div>
              </SectionCard>
              {selectedSubclass && <InfoBox title={selectedSubclass.name} badge={selectedSubclass.source} text={selectedSubclass.description || "No subclass description is available."} />}
              <SectionCard title="Class proficiencies">
                {selectedClassRules && <>
                  {selectedClassRules.savingThrows.length > 0 && <p className="text-sm text-stone-300"><b>Saving Throws:</b> {selectedClassRules.savingThrows.join(", ")}</p>}
                  {selectedClassRules.skills.fixed.length > 0 && <p className="mt-2 text-sm text-stone-300"><b>Fixed Skills:</b> {selectedClassRules.skills.fixed.join(", ")}</p>}
                  <ChoiceGroup title="Choose class skills" choices={selectedClassRules.skills.choices} value={classSkillSelections} onChange={setClassSkillSelections} />
                  <ChoiceGroup title="Choose class languages" choices={selectedClassRules.languages.choices} value={classLanguageSelections} onChange={setClassLanguageSelections} />
                </>}
              </SectionCard>
              <SectionCard title="Class Features" description="All class and subclass features unlocked by the selected level are shown here.">
                <div className="space-y-3">
                  {featureCatalogue
                    .filter((feature) => feature.requiredLevel <= form.level && feature.className === form.className && (!feature.subclassName || feature.subclassName === form.subclass))
                    .filter((feature) => !/gain a feature from your|gain a feature from the|optional feature/i.test(feature.description))
                    .map((feature) => (
                      <article key={feature.id} className="rounded-xl border border-stone-800 bg-stone-950/60 p-4">
                        <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{feature.name}</h3><Badge>Level {feature.requiredLevel}</Badge><Badge tone={feature.sourceType === "subclass" ? "warn" : "neutral"}>{feature.sourceType === "subclass" ? "Subclass" : "Class"}</Badge></div>
                        <p className="mt-2 whitespace-pre-line text-sm leading-6 text-stone-400">{feature.description}</p>
                      </article>
                    ))}
                </div>
              </SectionCard>

              <SectionCard title="Class Options" description="All optional features available at the character's current level are selectable here, including options gained at earlier levels.">
                {optionalChoiceGroups.length ? optionalChoiceGroups.map((group) => <OptionalFeatureGroup key={group.id} title={group.title} count={group.count} featureTypes={group.featureTypes} catalogue={optionalFeatureCatalogue} selected={optionalFeatures} onChange={setOptionalFeatures} />) : <p className="text-sm text-stone-500">No selectable class options were found for this level.</p>}
              </SectionCard>
              {(cantripsKnown > 0 || knownSpellLimit !== null) && (
                <SpellSelectionSection
                  className={form.className}
                  level={form.level}
                  availableSpells={availableSpells}
                  cantripsKnown={cantripsKnown}
                  spellLimit={normalSpellLimit}
                  selectedSpells={effectiveSelectedSpells}
                  onChange={setSelectedSpells}
                />
              )}
              {expertiseLevels.length > 0 && (
                <ExpertiseSelectionSection levels={expertiseLevels} selected={expertiseSelections} onChange={setExpertiseSelections} skills={selectedSkills} />
              )}
              {magicalSecretFeatures.length > 0 && (
                <MagicalSecretsSection
                  features={magicalSecretFeatures}
                  spells={magicalSecretSpellOptions}
                  excluded={effectiveSelectedSpells.map((entry) => entry.spellId)}
                  selected={magicalSecretSelections}
                  onChange={setMagicalSecretSelections}
                />
              )}
              {newAsiLevels.length > 0 && (
                <AsiSelectionSection
                  levels={newAsiLevels}
                  choices={[]}
                  onChoicesChange={() => undefined}
                  abilityChoices={asiAbilityChoices}
                  onAbilityChoicesChange={setAsiAbilityChoices}
                  availableFeats={[]}
                  featCatalogue={[]}
                />
              )}
            </>
          )}

          {step === "background" && (
            <>
              <SectionCard title="Background" description="Choose the background and all proficiency choices it grants.">
                <SelectField label="Background" value={form.background} options={catalogue.backgrounds} onChange={(value) => {
                  setForm((current) => ({ ...current, background: value }));
                  setBackgroundSkillSelections([]);
                  setBackgroundToolSelections([]);
                  setBackgroundLanguageSelections([]);
                }} />
                {selectedBackgroundRules?.description && <p className="mt-5 whitespace-pre-line text-sm leading-7 text-stone-400">{selectedBackgroundRules.description}</p>}
              </SectionCard>
              {selectedBackgroundRules && <SectionCard title="Background benefits">
                {selectedBackgroundRules.skills.length > 0 && <p className="text-sm text-stone-300"><b>Fixed skills:</b> {selectedBackgroundRules.skills.join(", ")}</p>}
                <ChoiceGroup title="Skill choices" choices={selectedBackgroundRules.skillChoices} value={backgroundSkillSelections} onChange={setBackgroundSkillSelections} exclude={[...(selectedClassRules?.skills.fixed ?? []), ...classSkillSelections]} />
                {selectedBackgroundRules.tools.length > 0 && <p className="mt-4 text-sm text-stone-300"><b>Fixed tools:</b> {selectedBackgroundRules.tools.join(", ")}</p>}
                <ChoiceGroup title="Tool choices" choices={selectedBackgroundRules.toolChoices} value={backgroundToolSelections} onChange={setBackgroundToolSelections} />
                {selectedBackgroundRules.languages.length > 0 && <p className="mt-4 text-sm text-stone-300"><b>Fixed languages:</b> {selectedBackgroundRules.languages.join(", ")}</p>}
                <ChoiceGroup title="Language choices" choices={selectedBackgroundRules.languageChoices} value={backgroundLanguageSelections} onChange={setBackgroundLanguageSelections} />
                {selectedBackgroundRules.featureName && <div className="mt-5 rounded-2xl border border-amber-900/50 bg-amber-950/20 p-5"><div className="text-xs font-semibold uppercase tracking-wider text-amber-500">Background Feature</div><h3 className="mt-1 text-lg font-semibold text-amber-300">{selectedBackgroundRules.featureName}</h3><p className="mt-3 whitespace-pre-line text-sm leading-7 text-stone-300">{selectedBackgroundRules.featureDescription}</p></div>}
              </SectionCard>}
            </>
          )}

          {step === "species" && (
            <>
              <SectionCard title="Species" description="Change the race or subrace and review the associated traits.">
                <RacePicker races={catalogue.races} subraces={catalogue.subraces} selectedRace={form.race} selectedSubrace={form.subrace} onSelect={selectRace} />
              </SectionCard>
              {raceRules[form.race] && <InfoBox title={form.race} badge={raceRules[form.race].source} text={raceRules[form.race].description || "No species description is available."} />}
              {selectedSubrace && <InfoBox title={selectedSubrace.name} badge={selectedSubrace.source} text={selectedSubrace.description || "No subrace description is available."} />}
              <SectionCard title="Species traits">
                <ChoiceGroup title="Choose species languages" choices={raceRules[form.race]?.languages.choices ?? []} value={raceLanguageSelections} onChange={setRaceLanguageSelections} />
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <ProficiencySummary title="Languages" values={selectedLanguages} />
                  <ProficiencySummary title="Ability bonuses" values={Object.entries(selectedSubrace?.abilityBonuses ?? raceRules[form.race]?.abilityBonuses ?? {}).map(([key, value]) => `${key.toUpperCase()} ${value >= 0 ? "+" : ""}${value}`)} />
                </div>
              </SectionCard>
            </>
          )}

          {step === "abilities" && (
            <>
              <SectionCard title="Ability scores" description="Adjust the character's base scores. Race and subrace bonuses are applied automatically.">
                <AbilityScoreBuilder
                  baseScores={baseAbilities}
                  onBaseScoresChange={(next) => {
                    setBaseAbilities(next);
                    setAbilities(applyAbilityBonuses(applyAbilityBonuses(next, raceRules[form.race]?.abilityBonuses ?? {}), selectedSubrace?.abilityBonuses ?? {}));
                  }}
                  raceBonuses={{ ...(raceRules[form.race]?.abilityBonuses ?? {}), ...(selectedSubrace?.abilityBonuses ?? {}) }}
                  raceLabel={[form.race, form.subrace].filter(Boolean).join(" / ")}
                  method={abilityMethod}
                  onMethodChange={setAbilityMethod}
                />
              </SectionCard>
              <SectionCard title="Proficiency summary">
                <div className="grid gap-4 sm:grid-cols-2">
                  <ProficiencySummary title="Skills" values={selectedSkills} />
                  <ProficiencySummary title="Tools" values={selectedTools} />
                  <ProficiencySummary title="Languages" values={selectedLanguages} />
                  <ProficiencySummary title="Saving Throws" values={selectedClassRules?.savingThrows ?? []} />
                </div>
              </SectionCard>
            </>
          )}

          {step === "equipment" && (
            <>
              <SectionCard title="Starting Equipment" description="Use the same starting-equipment choices available in the builder.">
                <div className="mb-5 flex items-center justify-center gap-1 rounded-xl border border-stone-800 bg-stone-950/70 p-1">
                  <button type="button" onClick={() => setEquipmentMode("equipment")} className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold ${equipmentMode === "equipment" ? "bg-stone-100 text-stone-950" : "text-stone-500 hover:text-stone-300"}`}>Equipment</button>
                  <button type="button" onClick={() => setEquipmentMode("gold")} className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold ${equipmentMode === "gold" ? "bg-stone-100 text-stone-950" : "text-stone-500 hover:text-stone-300"}`}>Gold</button>
                </div>
                {equipmentMode === "gold" && <div className="mb-5 grid gap-3 sm:grid-cols-5">{(["cp","sp","ep","gp","pp"] as const).map((coin) => <NumberField key={coin} label={coin.toUpperCase()} value={currency[coin]} min={0} onChange={(value) => setCurrency((current) => ({ ...current, [coin]: value }))} />)}</div>}
                {equipmentMode === "equipment" && <div className="space-y-4">
                  {[
                    ...(selectedClassRules?.startingEquipment ?? []).map((group, index) => ({ ...group, id: `class-${index}`, heading: "Class equipment" })),
                    ...(selectedBackgroundRules?.startingEquipment ?? []).map((group, index) => ({ ...group, id: `background-${index}`, heading: "Background equipment" })),
                  ].map((group) => (
                    <div key={group.id} className="rounded-2xl border border-stone-800 bg-stone-950/60 p-5">
                      <div className="mb-3 flex flex-wrap items-center gap-2"><h3 className="font-semibold">{group.heading}</h3><Badge>{group.label}</Badge></div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {group.options.map((option, optionIndex) => {
                          const selected = startingEquipmentSelections[group.id] === optionIndex;
                          return <div key={optionIndex} className={`rounded-xl border p-4 transition ${selected ? "border-amber-500 bg-amber-950/30" : "border-stone-800 bg-stone-950/50 hover:border-stone-600"}`}>
                            <button type="button" onClick={() => {
                              setStartingEquipmentSelections((current) => ({ ...current, [group.id]: optionIndex }));
                              applyStartingEquipment(group.id, optionIndex, option);
                            }} className="flex w-full items-start gap-3 text-left">
                              <span className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 ${selected ? "border-amber-400 bg-amber-400" : "border-stone-600"}`} />
                              <span className="font-semibold">{option.label}</span>
                            </button>
                            <div className="mt-3 space-y-2 pl-7">
                              {option.items.map((entry, entryIndex) => {
                                if (!entry.choiceType) return <p key={entryIndex} className="text-xs leading-5 text-stone-500">{entry.quantity > 1 ? entry.quantity + "× " : ""}{entry.special ? "Other possession: " : ""}{entry.name}</p>;
                                const choiceKey = `${group.id}:${optionIndex}:${entryIndex}`;
                                const choiceItems = equipmentChoiceOptions(entry.choiceType);
                                return <label key={entryIndex} className="block text-xs text-stone-400">
                                  {entry.name}
                                  <select value={startingItemChoices[choiceKey] ?? ""} onChange={(event) => {
                                    const value = event.target.value;
                                    setStartingItemChoices((current) => ({ ...current, [choiceKey]: value }));
                                    if (selected) applyStartingEquipment(group.id, optionIndex, option, { [choiceKey]: value });
                                  }} className="mt-1 w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-100">
                                    <option value="">Choose...</option>
                                    {choiceItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                                  </select>
                                </label>;
                              })}
                            </div>
                          </div>;
                        })}
                      </div>
                    </div>
                  ))}
                  {!((selectedClassRules?.startingEquipment?.length ?? 0) + (selectedBackgroundRules?.startingEquipment?.length ?? 0)) && <p className="text-sm text-stone-500">No parsed starting-equipment bundles were found.</p>}
                </div>}
              </SectionCard>

              {equipmentMode === "equipment" && <SectionCard title={`Current Inventory (${equipmentSelections.length})`} description="Manage the inventory that will be saved with this character.">
                <div className="space-y-2">
                  {equipmentSelections.length === 0 ? <p className="text-sm text-stone-500">Nothing carried.</p> : equipmentSelections.map((entry) => {
                    const item = itemCatalogue.find((candidate) => candidate.id === entry.itemId);
                    return item ? <div key={entry.itemId} className="flex flex-col gap-3 rounded-xl border border-stone-800 bg-stone-950/60 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div><div className="font-semibold">{item.name}</div><div className="text-xs text-stone-500">{item.category}</div></div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button type="button" onClick={() => setEquipmentSelections((current) => current.map((candidate) => candidate.itemId === entry.itemId ? { ...candidate, quantity: Math.max(1, candidate.quantity - 1) } : candidate))} className="rounded-lg border border-stone-700 px-2 py-1">−</button>
                        <span className="w-8 text-center text-sm">{entry.quantity}</span>
                        <button type="button" onClick={() => setEquipmentSelections((current) => current.map((candidate) => candidate.itemId === entry.itemId ? { ...candidate, quantity: candidate.quantity + 1 } : candidate))} className="rounded-lg border border-stone-700 px-2 py-1">+</button>
                        <label className="flex items-center gap-2 text-sm text-stone-300"><input type="checkbox" checked={entry.equipped} onChange={(event) => setEquipmentSelections((current) => current.map((candidate) => candidate.itemId === entry.itemId ? { ...candidate, equipped: event.target.checked } : candidate))} /> Equip</label>
                        <button type="button" onClick={() => setEquipmentSelections((current) => current.filter((candidate) => candidate.itemId !== entry.itemId))} className="rounded-lg border border-red-900/60 px-2 py-1 text-red-400">Remove</button>
                      </div>
                    </div> : null;
                  })}
                </div>
              </SectionCard>}

              <SectionCard title="Add Items" description="Search the imported 2014 catalogue and add anything else.">
                <div className="mb-4 flex gap-3"><input value={equipmentSearch} onChange={(event) => setEquipmentSearch(event.target.value)} placeholder="Search equipment..." className="flex-1 rounded-xl border border-stone-700 bg-stone-950 px-4 py-2.5 text-sm text-stone-100 outline-none focus:border-amber-400" /><Badge>{itemCatalogue.length} items</Badge></div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {itemCatalogue.filter((item) => `${item.name} ${item.category}`.toLowerCase().includes(equipmentSearch.toLowerCase())).slice(0, 40).map((item) => <div key={item.id} className="flex items-center justify-between rounded-xl border border-stone-800 bg-stone-950/60 p-3"><div><div className="font-medium">{item.name}</div><div className="text-xs text-stone-600">{item.category}</div></div><button type="button" onClick={() => setEquipmentSelections((current) => current.some((entry) => entry.itemId === item.id) ? current : [...current, { itemId: item.id, quantity: 1, equipped: false }])} className="rounded-lg border border-stone-700 px-3 py-1.5 text-sm">Add</button></div>)}
                </div>
              </SectionCard>
              <SectionCard title="Currency" description="Currency is saved with the character.">
                <div className="grid gap-3 sm:grid-cols-5">{(["cp","sp","ep","gp","pp"] as const).map((coin) => <NumberField key={coin} label={coin.toUpperCase()} value={currency[coin]} min={0} onChange={(value) => setCurrency((current) => ({ ...current, [coin]: value }))} />)}</div>
              </SectionCard>

            </>
          )}

          {step === "whats-next" && (
            <>
              <SectionCard title="Final details">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <NumberField label="Level" value={form.level} onChange={(value) => setForm((current) => ({ ...current, level: value }))} min={1} max={20} />
                  <Field label="Alignment" value={form.alignment} onChange={(value) => setForm((current) => ({ ...current, alignment: value }))} />
                  <NumberField label="Speed" value={form.speed} onChange={(value) => setForm((current) => ({ ...current, speed: value }))} min={0} />
                  <NumberField label="Current HP" value={form.hp} onChange={(value) => setForm((current) => ({ ...current, hp: value }))} min={0} />
                  <NumberField label="Maximum HP" value={form.maxHp} onChange={() => undefined} min={1} />
                  <NumberField label="Temporary HP" value={form.tempHp} onChange={(value) => setForm((current) => ({ ...current, tempHp: value }))} min={0} />
                  <NumberField label="Armor Class" value={form.ac} onChange={() => undefined} min={0} />
                  <Field label="Hit Dice" value={form.hitDice} onChange={() => undefined} />
                  <NumberField label="Proficiency Bonus" value={form.proficiencyBonus} onChange={() => undefined} min={0} />
                </div>
              </SectionCard>

              <SectionCard title="Level Progression">
                <div className="space-y-4">
                  {featureCatalogue.filter((feature) => feature.requiredLevel > character.level && feature.requiredLevel <= form.level && feature.className === form.className && (!feature.subclassName || feature.subclassName === form.subclass)).filter((feature) => !/gain a feature from your|gain a feature from the/i.test(feature.description)).map((feature) => <article key={feature.id} className="rounded-xl border border-stone-800 bg-stone-950/60 p-4"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{feature.name}</h3><Badge>Level {feature.requiredLevel}</Badge><Badge tone="warn">{feature.sourceType === "subclass" ? "Subclass" : "Class"}</Badge></div><p className="mt-3 whitespace-pre-line text-sm leading-6 text-stone-400">{feature.description}</p></article>)}
                  {asiLevels.length > 0 && <div className="rounded-xl border border-amber-900/60 bg-amber-950/20 p-4"><h3 className="font-semibold text-amber-300">Ability Score Improvement / Feat</h3><p className="mt-2 text-sm text-stone-400">ASI levels reached: {asiLevels.join(", ")}.</p></div>}
                </div>
              </SectionCard>

              {allAsiLevels.length > 0 && (
                <SectionCard title="Ability Score Improvements / Feats" description="Existing feat choices are preserved. When you level up, any newly reached ASI levels can be allocated above in Class.">
                  <div className="space-y-4">
                    {allAsiLevels.map((asiLevel, index) => {
                      const selectedFeatId = asiChoices[index] ?? "";
                      const choices = featCatalogue
                        .filter((feat) => !asiChoices.includes(feat.id) || feat.id === selectedFeatId)
                        .filter((feat) => isFeatAvailable({
                          level: form.level,
                          abilities: progressionAbilities,
                          race: form.race,
                          subrace: form.subrace,
                          className: form.className,
                          background: form.background,
                          feats: asiChoices.filter(Boolean),
                          skills: selectedSkills,
                          tools: selectedTools,
                          languages: selectedLanguages,
                        }, feat));
                      const selectedFeat = featCatalogue.find((feat) => feat.id === selectedFeatId);
                      return (
                        <div key={asiLevel} className="rounded-2xl border border-stone-800 bg-stone-950/60 p-5">
                          <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">Level {asiLevel}</h3><Badge>ASI / Feat</Badge></div>
                          <select value={selectedFeatId} onChange={(event) => setAsiChoices((current) => {
                            const next = [...current];
                            next[index] = event.target.value;
                            return next;
                          })} className="mt-3 w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-sm text-stone-100">
                            <option value="">Ability Score Improvement</option>
                            {choices.map((feat) => <option key={feat.id} value={feat.id}>{feat.name}</option>)}
                          </select>
                          {selectedFeat && <article className="mt-4 rounded-xl border border-amber-900/60 bg-amber-950/20 p-4"><div className="flex items-center gap-2"><h3 className="font-semibold text-amber-300">{selectedFeat.name}</h3>{selectedFeat.source && <Badge>{selectedFeat.source}</Badge>}</div><p className="mt-2 whitespace-pre-line text-sm leading-6 text-stone-300">{selectedFeat.description}</p></article>}
                        </div>
                      );
                    })}
                  </div>
                </SectionCard>
              )}

              <SectionCard title="Review">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <ProficiencySummary title="Character" values={[form.name || "Unnamed", form.className, form.subclass, form.race, form.subrace, form.background].filter(Boolean)} />
                  <ProficiencySummary title="Abilities" values={Object.entries(abilities).map(([key, value]) => `${key.toUpperCase()} ${value}`)} />
                  <ProficiencySummary title="Skills" values={selectedSkills} />
                  <ProficiencySummary title="Languages" values={selectedLanguages} />
                  <ProficiencySummary title="Equipment" values={equipmentMode === "equipment" ? equipmentSelections.map((entry) => itemCatalogue.find((item) => item.id === entry.itemId)?.name ?? entry.itemId) : []} />
                  <ProficiencySummary title="Currency" values={Object.entries(currency).map(([coin, value]) => `${coin.toUpperCase()} ${value}`)} />
                </div>
              </SectionCard>

              <SectionCard title="Notes">
                <textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} rows={8} className="w-full rounded-xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm leading-6 text-stone-100 outline-none focus:border-amber-400" />
              </SectionCard>

              <div className="flex justify-end"><button type="submit" className="rounded-xl bg-stone-100 px-6 py-3 text-sm font-semibold text-stone-950 hover:bg-amber-300">Save Character</button></div>
            </>
          )}

          <BuilderFooter step={step} onStepChange={setStep} />
        </form>
      </div>
    </div>
  );
}

type BuilderStep = "class" | "background" | "species" | "abilities" | "equipment" | "whats-next";
const BUILDER_STEPS: BuilderStep[] = ["class", "background", "species", "abilities", "equipment", "whats-next"];
const STEP_META: Record<BuilderStep, { number: number; title: string; description: string }> = {
  class: { number: 1, title: "Class", description: "Choose the class, subclass and all level-appropriate class options." },
  background: { number: 2, title: "Background", description: "Choose the background and its proficiency choices." },
  species: { number: 3, title: "Species", description: "Choose race, subrace and species traits." },
  abilities: { number: 4, title: "Abilities", description: "Adjust ability scores and review derived proficiencies." },
  equipment: { number: 5, title: "Equipment", description: "Manage starting equipment and the character's inventory." },
  "whats-next": { number: 6, title: "What's Next", description: "Finish the character, review everything and save." },
};

function BuilderStepNav({ step, onStepChange }: { step: BuilderStep; onStepChange: (step: BuilderStep) => void }) {
  return <div className="border-b border-stone-800 bg-stone-950/95"><div className="mx-auto max-w-5xl overflow-x-auto px-4 sm:px-6 lg:px-8"><nav className="flex min-w-max items-stretch gap-1">{BUILDER_STEPS.map((entry) => { const active = entry === step; return <button key={entry} type="button" onClick={() => onStepChange(entry)} className={`relative px-4 py-4 text-left ${active ? "text-stone-100" : "text-stone-500 hover:text-stone-300"}`}><span className="mr-2 text-[10px] font-bold text-stone-600">{STEP_META[entry].number}.</span><span className="text-xs font-semibold uppercase tracking-wider">{STEP_META[entry].title}</span>{active && <span className="absolute inset-x-2 bottom-0 h-0.5 bg-amber-400" />}</button>; })}</nav></div></div>;
}

function BuilderFooter({ step, onStepChange }: { step: BuilderStep; onStepChange: (step: BuilderStep) => void }) {
  const index = BUILDER_STEPS.indexOf(step);
  const previous = index > 0 ? BUILDER_STEPS[index - 1] : null;
  const next = index < BUILDER_STEPS.length - 1 ? BUILDER_STEPS[index + 1] : null;
  return <div className="sticky bottom-0 z-20 -mx-4 mt-8 border-t border-stone-800 bg-stone-950/95 px-4 py-4 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"><div className="mx-auto flex max-w-5xl items-center justify-between gap-3"><button type="button" disabled={!previous} onClick={() => previous && onStepChange(previous)} className="rounded-xl border border-stone-700 px-5 py-2.5 text-sm font-semibold text-stone-300 hover:bg-stone-900 disabled:opacity-30">Back</button><div className="text-xs text-stone-600">{index + 1} / {BUILDER_STEPS.length}</div>{next ? <button type="button" onClick={() => onStepChange(next)} className="rounded-xl bg-stone-100 px-5 py-2.5 text-sm font-semibold text-stone-950 hover:bg-amber-300">Next: {STEP_META[next].title}</button> : <button type="submit" className="rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-semibold text-stone-950 hover:bg-amber-300">Save Character</button>}</div></div>;
}

function RacePicker({ races, subraces, selectedRace, selectedSubrace, onSelect }: { races: string[]; subraces: Array<{ name: string; parentRace: string }>; selectedRace: string; selectedSubrace: string; onSelect: (race: string, subrace?: string) => void }) {
  const [expanded, setExpanded] = useState(selectedRace);
  return <div>
    <div className="text-xs font-semibold uppercase tracking-wider text-stone-500">Race</div>
    <div className="mt-2 space-y-2">
      {races.map((race) => {
        const children = subraces.filter((entry) => entry.parentRace === race);
        const open = expanded === race;
        const selected = selectedRace === race && !selectedSubrace;
        return <div key={race} className="rounded-xl border border-stone-800 bg-stone-950/60 overflow-hidden">
          <button type="button" onClick={() => { setExpanded(open ? "" : race); onSelect(race); }} className={`flex w-full items-center justify-between px-4 py-3 text-left ${selected ? "bg-stone-800 text-stone-100" : "text-stone-300"}`}>
            <span className="font-semibold">{race}</span>
            {children.length > 0 && <span className="text-xs text-stone-500">{children.length} subrace{children.length === 1 ? "" : "s"} {open ? "▴" : "▾"}</span>}
          </button>
          {open && children.length > 0 && <div className="border-t border-stone-800 p-2">
            {children.map((entry) => <button key={entry.name} type="button" onClick={() => { setExpanded(race); onSelect(race, entry.name); }} className={`block w-full rounded-lg px-4 py-2 text-left text-sm ${selectedSubrace === entry.name ? "bg-amber-500/10 text-amber-300" : "text-stone-400 hover:bg-stone-900 hover:text-stone-200"}`}>{entry.name}</button>)}
          </div>}
        </div>;
      })}
    </div>
  </div>;
}

function ChoiceGroup({ title, choices, value, onChange, exclude = [] }: { title: string; choices: Array<{ count: number; options: string[] }>; value: string[]; onChange: (value: string[]) => void; exclude?: string[] }) {
  if (!choices.length) return null;
  let offset = 0;
  return <div className="mt-4 space-y-3"><h4 className="text-sm font-semibold text-stone-200">{title}</h4>{choices.flatMap((choice) => Array.from({ length: choice.count }, () => {
    const slot = offset++;
    const options = choice.options.filter((option) => (!exclude.includes(option) || value[slot] === option) && !value.some((selected, index) => index !== slot && selected === option));
    return <select key={`${title}-${slot}`} value={value[slot] ?? ""} onChange={(event) => { const next = [...value]; next[slot] = event.target.value; onChange(next); }} className="w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-sm text-stone-100"><option value="">Choose an option...</option>{options.map((option) => <option key={option}>{option}</option>)}</select>;
  }))}</div>;
}

function OptionalFeatureGroup({ title, count, featureTypes, catalogue, selected, onChange }: { title: string; count: number; featureTypes: string[]; catalogue: Array<{ id: string; name: string; description: string; featureTypes: string[]; source: string }>; selected: string[]; onChange: (value: string[]) => void }) {
  const options = catalogue.filter((entry) => entry.featureTypes.some((type) => featureTypes.includes(type)));
  const slots = Array.from({ length: count }, (_, index) => selected.filter((id) => options.some((option) => option.id === id))[index] ?? "");
  return <div className="mt-4 rounded-2xl border border-stone-800 bg-stone-950/60 p-5"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{title}</h3><Badge>{count} choice{count === 1 ? "" : "s"}</Badge></div>{slots.map((slot, index) => <select key={index} value={slot} onChange={(event) => { const groupIds = selected.filter((id) => options.some((option) => option.id === id)); const nextGroupIds = [...groupIds]; if (event.target.value) nextGroupIds[index] = event.target.value; else nextGroupIds.splice(index, 1); const otherIds = selected.filter((id) => !options.some((option) => option.id === id)); onChange([...otherIds, ...nextGroupIds.filter(Boolean)]); }} className="mt-3 w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-sm text-stone-100"><option value="">Choose an option...</option>{options.filter((option) => !selected.includes(option.id) || option.id === slot).map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select>)}{slots.map((slot) => { const feature = options.find((option) => option.id === slot); return feature ? <article key={feature.id} className="mt-3 rounded-xl border border-amber-900/50 bg-amber-950/20 p-4"><div className="font-semibold text-amber-300">{feature.name}</div><p className="mt-2 whitespace-pre-line text-sm leading-6 text-stone-300">{feature.description}</p></article> : null; })}{!options.length && <p className="mt-3 text-sm text-stone-500">No imported options match this choice group.</p>}</div>;
}

function ProficiencySummary({ title, values }: { title: string; values: string[] }) { return <div className="rounded-xl border border-stone-800 bg-stone-950/60 p-4"><h4 className="text-xs font-semibold uppercase tracking-wider text-stone-500">{title}</h4><p className="mt-2 text-sm text-stone-200">{values.length ? values.join(", ") : "None"}</p></div>; }
function InfoBox({ title, badge, text }: { title: string; badge?: string; text: string }) { return <div className="mt-5 rounded-2xl border border-stone-800 bg-stone-950/60 p-5"><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-semibold">{title}</h3>{badge && <Badge>{badge}</Badge>}</div><p className="mt-3 whitespace-pre-line text-sm leading-7 text-stone-400">{text}</p></div>; }
function Field({ label, value, onChange, required = false }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) { return <label><span className="text-xs font-semibold uppercase tracking-wider text-stone-500">{label}</span><input required={required} value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-sm outline-none focus:border-amber-400" /></label>; }
function NumberField({ label, value, onChange, min, max }: { label: string; value: number; onChange: (value: number) => void; min?: number; max?: number }) { return <label><span className="text-xs font-semibold uppercase tracking-wider text-stone-500">{label}</span><input type="number" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-2 w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-sm outline-none focus:border-amber-400" /></label>; }
function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) { return <label><span className="text-xs font-semibold uppercase tracking-wider text-stone-500">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-sm outline-none focus:border-amber-400">{options.length ? options.map((option) => <option key={option}>{option}</option>) : <option value="">None</option>}</select></label>; }
function AsiSelectionSection({ levels, abilityChoices, onAbilityChoicesChange }: {
  levels: number[];
  choices: string[];
  onChoicesChange: (value: string[]) => void;
  abilityChoices: Array<{ mode: "two" | "one"; first?: AbilityKey; second?: AbilityKey }>;
  onAbilityChoicesChange: (value: Array<{ mode: "two" | "one"; first?: AbilityKey; second?: AbilityKey }>) => void;
  availableFeats: Array<{ id: string; name: string; description: string; source: string }>;
  featCatalogue: Array<{ id: string; name: string; description: string; source: string }>;
}) {
  const abilityNames: Array<[AbilityKey, string]> = [["str","Strength"],["dex","Dexterity"],["con","Constitution"],["int","Intelligence"],["wis","Wisdom"],["cha","Charisma"]];
  return <SectionCard title="New Ability Score Improvements" description="These ASIs were reached by increasing this character's level. Choose +2 to one ability, or +1 to two different abilities. Scores cannot exceed 20.">
    <div className="space-y-5">
      {levels.map((level, index) => {
        const choice = abilityChoices[index];
        const mode = choice?.mode ?? "two";
        const first = choice?.first ?? "";
        const second = choice?.second ?? "";
        return <div key={level} className="rounded-2xl border border-stone-800 bg-stone-950/60 p-5">
          <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">Level {level}</h3><Badge>ASI</Badge></div>
          <select value={mode} onChange={(event) => {
            const next = [...abilityChoices];
            next[index] = { mode: event.target.value as "two" | "one", first: choice?.first, second: choice?.second };
            onAbilityChoicesChange(next);
          }} className="mt-3 w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-sm">
            <option value="two">+2 to one ability score</option>
            <option value="one">+1 to two different ability scores</option>
          </select>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <select value={first} onChange={(event) => {
              const next = [...abilityChoices];
              next[index] = { mode, first: event.target.value ? event.target.value as AbilityKey : undefined, second: choice?.second };
              onAbilityChoicesChange(next);
            }} className="rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-sm">
              <option value="">Choose an ability...</option>
              {abilityNames.map(([key, name]) => <option key={key} value={key}>{name}</option>)}
            </select>
            {mode === "one" && <select value={second} onChange={(event) => {
              const next = [...abilityChoices];
              next[index] = { mode, first: choice?.first, second: event.target.value ? event.target.value as AbilityKey : undefined };
              onAbilityChoicesChange(next);
            }} className="rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-sm">
              <option value="">Choose an ability...</option>
              {abilityNames.filter(([key]) => key !== choice?.first).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
            </select>}
          </div>
        </div>;
      })}
    </div>
  </SectionCard>;
}

function ExpertiseSelectionSection({ levels, selected, onChange, skills }: { levels: number[]; selected: string[]; onChange: (value: string[]) => void; skills: string[] }) {
  let offset = 0;
  return <SectionCard title="Expertise" description="Choose the skill proficiencies that gain Expertise. Existing expertise stored in notes is loaded when possible.">
    <div className="space-y-4">
      {levels.map((level) => {
        const slots = [0, 1].map(() => offset++);
        return <div key={level} className="rounded-xl border border-stone-800 p-4">
          <div className="mb-3 font-semibold">Level {level} Expertise</div>
          <div className="grid gap-3 sm:grid-cols-2">
            {slots.map((slot) => <select key={slot} value={selected[slot] ?? ""} onChange={(event) => {
              const next = [...selected]; next[slot] = event.target.value; onChange(next);
            }} className="rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-sm">
              <option value="">Choose a skill...</option>
              {skills.filter((skill) => !selected.some((value, index) => index !== slot && value === skill)).map((skill) => <option key={skill}>{skill}</option>)}
            </select>)}
          </div>
        </div>;
      })}
    </div>
  </SectionCard>;
}

function MagicalSecretsSection({ features, spells, excluded, selected, onChange }: { features: Array<{ id: string; name: string; requiredLevel: number }>; spells: Array<{ id: string; name: string; level: number; description: string }>; excluded: string[]; selected: string[]; onChange: (value: string[]) => void }) {
  let offset = 0;
  return <SectionCard title="Magical Secrets" description="Choose two spells for each Magical Secrets feature. The choices are added to the character's spell list when saved.">
    <div className="space-y-4">
      {features.map((feature) => {
        const slots = [0, 1].map(() => offset++);
        return <div key={feature.id} className="rounded-xl border border-stone-800 p-4">
          <div className="mb-3 font-semibold">Level {feature.requiredLevel} · {feature.name}</div>
          <div className="grid gap-3 sm:grid-cols-2">
            {slots.map((slot) => <select key={slot} value={selected[slot] ?? ""} onChange={(event) => {
              const next = [...selected]; next[slot] = event.target.value; onChange(next);
            }} className="rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-sm">
              <option value="">Choose a spell...</option>
              {spells.filter((spell) => !excluded.includes(spell.id) && !selected.some((value, index) => index !== slot && value === spell.id)).map((spell) => <option key={spell.id} value={spell.id}>{spell.name} (Level {spell.level})</option>)}
            </select>)}
          </div>
        </div>;
      })}
    </div>
  </SectionCard>;
}

function SpellSelectionSection({ className, level, availableSpells, cantripsKnown, spellLimit, selectedSpells, onChange }: { className: string; level: number; availableSpells: Array<{ id: string; name: string; level: number; school: string; description: string }>; cantripsKnown: number; spellLimit: number | null; selectedSpells: SpellEntry[]; onChange: (value: SpellEntry[]) => void }) {
  if (!cantripsKnown && spellLimit === null) return null;
  const selectedCantrips = selectedSpells.filter((entry) => availableSpells.find((spell) => spell.id === entry.spellId)?.level === 0);
  const selectedLeveled = selectedSpells.filter((entry) => {
    const spell = availableSpells.find((candidate) => candidate.id === entry.spellId);
    return Boolean(spell && spell.level > 0);
  });
  const isWizard = className === "Wizard";
  const label = isWizard ? "Spellbook" : spellLimit === null ? "Prepared spells" : "Spells known";
  const remainingCantrips = Math.max(0, cantripsKnown - selectedCantrips.length);
  const remainingLeveled = spellLimit === null ? 0 : Math.max(0, spellLimit - selectedLeveled.length);
  function toggle(spellId: string) {
    if (selectedSpells.some((entry) => entry.spellId === spellId)) {
      onChange(selectedSpells.filter((entry) => entry.spellId !== spellId));
      return;
    }
    const spell = availableSpells.find((entry) => entry.id === spellId);
    if (!spell) return;
    const count = spell.level === 0 ? selectedCantrips.length : selectedLeveled.length;
    const limit = spell.level === 0 ? cantripsKnown : spellLimit;
    if (limit !== null && count >= limit) return;
    onChange([...selectedSpells, { spellId, prepared: spell.level === 0 || !isWizard }]);
  }
  return <SectionCard title="Spells" description={isWizard ? "Edit the spells in the Wizard spellbook." : "Edit the character's known or prepared spells."}>
    <div className="grid gap-5 lg:grid-cols-2">
      <SpellPicker title={"Cantrips (" + selectedCantrips.length + "/" + cantripsKnown + ")"} spells={availableSpells.filter((spell) => spell.level === 0)} selected={selectedSpells} remaining={remainingCantrips} onToggle={toggle} />
      {spellLimit !== null && <SpellPicker title={label + " (" + selectedLeveled.length + "/" + spellLimit + ")"} spells={availableSpells.filter((spell) => spell.level > 0)} selected={selectedSpells} remaining={remainingLeveled} onToggle={toggle} />}
    </div>
  </SectionCard>;
}

function SpellPicker({ title, spells, selected, remaining, onToggle }: { title: string; spells: Array<{ id: string; name: string; level: number; school: string; description: string }>; selected: SpellEntry[]; remaining: number; onToggle: (id: string) => void }) {
  return <div className="rounded-2xl border border-stone-800 bg-stone-950/60 p-4">
    <div className="flex items-center justify-between gap-3"><h3 className="font-semibold">{title}</h3>{remaining > 0 && <Badge>{remaining} remaining</Badge>}</div>
    <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">
      {spells.map((spell) => {
        const checked = selected.some((entry) => entry.spellId === spell.id);
        return <label key={spell.id} className="block cursor-pointer rounded-xl border border-stone-800 p-3 hover:bg-stone-900"><div className="flex items-start gap-3"><input type="checkbox" checked={checked} onChange={() => onToggle(spell.id)} disabled={!checked && remaining <= 0} className="mt-1" /><div><div className="font-medium">{spell.name} <span className="text-xs text-stone-500">Level {spell.level}</span></div><p className="mt-1 text-xs leading-5 text-stone-500">{spell.description}</p></div></div></label>;
      })}
    </div>
  </div>;
}
