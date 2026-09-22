"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, PageHeader, SectionCard } from "../../../components/AppShell";
import AbilityScoreBuilder, { applyAbilityBonuses, type AbilityScoreMethod } from "../../../components/AbilityScoreBuilder";
import { useCharacters } from "../../../context/CharacterContext";
import { defaultCharacter } from "../../../lib/data";
import type { AbilityKey, AbilityScores, Character, Currency, InventoryEntry, Item, SpellEntry } from "../../../lib/types";
import { getAbilityScoreImprovementLevelsUpTo, getCantripsKnown, getClassDefinition, getExpectedHitDice, getExpectedMaxHp, getMaxSpellLevel, getPreparedSpellCount, getProficiencyBonus, getSpellsKnown, getSpellbookProgression, isFeatAvailable, isSpellNormallyAvailable } from "../../../lib/rules";

const defaults: AbilityScores = { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 };
const abilityKeys: AbilityKey[] = ["str", "dex", "con", "int", "wis", "cha"];

type OptionalChoiceEntry = { title: string; featureTypes: string[]; count: number; level: number };

type RequirementKey = "identity" | "nameClass" | "background" | "race" | "abilities" | "subclass" | "classSkills" | "classLanguages" | "backgroundSkills" | "backgroundTools" | "backgroundLanguages" | "raceLanguages" | "asi" | "expertise" | "magicalSecrets" | "optionalFeatures" | "spells" | "equipment";

function isOrdinaryStartingItem(item: Item) {
  const rarity = item.rarity.trim().toLowerCase();
  const description = item.description.toLowerCase();
  if (rarity !== "none") return false;
  if (item.requiresAttunement || item.restricted || item.magicBonus) return false;
  if (/\b(?:magic|magical|cursed|attunement|requires attunement)\b/.test(description)) return false;
  return true;
}

function normalizeStartingItemName(value: string) {
  return value
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/^(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s*(?:x|×)?\s*/i, "")
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function startingItemNameVariants(value: string) {
  const normalized = normalizeStartingItemName(value);
  return new Set([
    normalized,
    normalized.replace(/s$/, ""),
    normalized.replace(/es$/, "e"),
    normalized.replace(/ies$/, "y"),
  ]);
}

function findOrdinaryStartingItem(items: Item[], entryName: string) {
  const wanted = startingItemNameVariants(entryName);
  return items.find((item) => {
    if (!isOrdinaryStartingItem(item)) return false;
    const candidate = startingItemNameVariants(item.name);
    return [...wanted].some((variant) => candidate.has(variant));
  });
}

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

export default function NewCharacterPage() {
  const router = useRouter();
  const {
    createCharacter,
    catalogue,
    raceRules,
    backgroundRules,
    classRules,
    subclassOptionalFeatureProgression,
    optionalFeatureCatalogue,
    featureCatalogue,
    featCatalogue,
    spellCatalogue,
    itemCatalogue,
  } = useCharacters();

  const [form, setForm] = useState({
    name: "",
    race: "",
    subrace: "",
    className: "",
    subclass: "",
    background: "",
    alignment: "Unaligned",
    playerName: "",
    level: 1,
    hp: 0,
    maxHp: 0,
    ac: 10,
    speed: 30,
    hitDice: "",
    proficiencyBonus: 2,
    abilities: defaults,
    notes: "",
    feats: [] as string[],
    skills: [] as string[],
    tools: [] as string[],
    languages: [] as string[],
    savingThrows: [] as AbilityKey[],
    optionalFeatures: [] as string[],
    currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 } as Currency,
  });

  const [baseAbilities, setBaseAbilities] = useState<AbilityScores>(defaults);
  const [abilityMethod, setAbilityMethod] = useState<AbilityScoreMethod>("standard");
  const [classSkillSelections, setClassSkillSelections] = useState<string[]>([]);
  const [backgroundSkillSelections, setBackgroundSkillSelections] = useState<string[]>([]);
  const [backgroundToolSelections, setBackgroundToolSelections] = useState<string[]>([]);
  const [backgroundLanguageSelections, setBackgroundLanguageSelections] = useState<string[]>([]);
  const [classLanguageSelections, setClassLanguageSelections] = useState<string[]>([]);
  const [raceLanguageSelections, setRaceLanguageSelections] = useState<string[]>([]);
  const [equipmentSelections, setEquipmentSelections] = useState<InventoryEntry[]>([]);
  const [startingEquipmentSelections, setStartingEquipmentSelections] = useState<Record<string, number>>({});
  const [startingItemChoices, setStartingItemChoices] = useState<Record<string, string>>({});
  const [asiChoices, setAsiChoices] = useState<string[]>([]);
  const [selectedSpells, setSelectedSpells] = useState<SpellEntry[]>([]);
  const [asiAbilityChoices, setAsiAbilityChoices] = useState<Array<{ mode: "two" | "one"; first?: AbilityKey; second?: AbilityKey }>>([]);
  const [expertiseSelections, setExpertiseSelections] = useState<string[]>([]);
  const [magicalSecretSelections, setMagicalSecretSelections] = useState<string[]>([]);
  const [equipmentSearch, setEquipmentSearch] = useState("");
  const [equipmentMode, setEquipmentMode] = useState<"equipment" | "gold">("equipment");
  const [step, setStep] = useState<BuilderStep>("class");
  const [creationError, setCreationError] = useState("");

  const subclassUnlockLevel = getClassDefinition(form.className, classRules)?.subclassUnlockLevel ?? 1;
  const subclassOptions = catalogue.subclasses.filter((entry) => entry.className === form.className && form.level >= subclassUnlockLevel);
  const selectedSubclass = subclassOptions.find((entry) => entry.name === form.subclass);
  const selectedRaceRules = raceRules[form.race];
  const selectedSubrace = catalogue.subraces.find((entry) => entry.name === form.subrace && entry.parentRace === form.race);
  const selectedBackgroundRules = backgroundRules[form.background];
  const selectedClassRules = classRules[form.className];

  const selectedSkills = useMemo(
    () => [...new Set([
      ...(selectedClassRules?.skills.fixed ?? []),
      ...classSkillSelections.filter(Boolean),
      ...(selectedBackgroundRules?.skills ?? []),
      ...backgroundSkillSelections.filter(Boolean),
    ])],
    [selectedClassRules, classSkillSelections, selectedBackgroundRules, backgroundSkillSelections],
  );

  const selectedTools = useMemo(
    () => [...new Set([
      ...(selectedClassRules?.tools.fixed ?? []),
      ...(selectedBackgroundRules?.tools ?? []),
      ...backgroundToolSelections.filter(Boolean),
    ])],
    [selectedClassRules, selectedBackgroundRules, backgroundToolSelections],
  );

  const selectedLanguages = useMemo(
    () => [...new Set([
      ...(selectedRaceRules?.languages.fixed ?? []),
      ...((selectedRaceRules?.languages.choices ?? []).length ? raceLanguageSelections : []),
      ...(selectedClassRules?.languages.fixed ?? []),
      ...classLanguageSelections.filter(Boolean),
      ...(selectedBackgroundRules?.languages ?? []),
      ...backgroundLanguageSelections.filter(Boolean),
    ])],
    [selectedRaceRules, selectedClassRules, selectedBackgroundRules, raceLanguageSelections, classLanguageSelections, backgroundLanguageSelections],
  );

  const optionalChoiceGroups = useMemo(
    () => getOptionalChoiceGroups(
      selectedClassRules?.optionalFeatureProgression ?? [],
      subclassOptionalFeatureProgression[form.subclass] ?? [],
      form.level,
    ),
    [selectedClassRules, subclassOptionalFeatureProgression, form.subclass, form.level],
  );

  const asiLevels = useMemo(
    () => getAbilityScoreImprovementLevelsUpTo(form.className, form.level, classRules),
    [form.className, form.level, classRules],
  );

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

  const baseAbilityScoresWithRace = useMemo(
    () => applyAbilityBonuses(
      applyAbilityBonuses(baseAbilities, raceRules[form.race]?.abilityBonuses ?? {}),
      selectedSubrace?.abilityBonuses ?? {},
    ),
    [baseAbilities, form.race, selectedSubrace, raceRules],
  );

  const asiBonusScores = useMemo(() => {
    const next = { ...baseAbilityScoresWithRace };
    asiLevels.forEach((_, index) => {
      if (asiChoices[index]) return;
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
  }, [baseAbilityScoresWithRace, asiLevels, asiChoices, asiAbilityChoices]);

  const featPrerequisiteCharacter = useMemo(() => ({
    level: form.level,
    abilities: form.abilities,
    race: form.race,
    subrace: form.subrace,
    className: form.className,
    background: form.background,
    feats: asiChoices.filter(Boolean),
    skills: selectedSkills,
    tools: selectedTools,
    languages: selectedLanguages,
  }), [form.level, form.abilities, form.race, form.subrace, form.className, form.background, asiChoices, selectedSkills, selectedTools, selectedLanguages]);

  const spellCharacter = useMemo(() => ({
    ...defaultCharacter,
    level: form.level,
    abilities: form.abilities,
    race: form.race,
    subrace: form.subrace,
    className: form.className,
    subclass: form.subclass,
    background: form.background,
    feats: asiChoices.filter(Boolean),
    skills: selectedSkills,
    tools: selectedTools,
    languages: selectedLanguages,
  } as Character), [form.level, form.abilities, form.race, form.subrace, form.className, form.subclass, form.background, asiChoices, selectedSkills, selectedTools, selectedLanguages]);

  const availableSpells = useMemo(() => spellCatalogue.filter((spell) => isSpellNormallyAvailable(spellCharacter, spell, classRules)), [spellCatalogue, spellCharacter]);
  const magicalSecretSpellOptions = useMemo(() => {
    const maxLevel = getMaxSpellLevel(spellCharacter, classRules);
    return spellCatalogue.filter((spell) => spell.level <= maxLevel);
  }, [spellCatalogue, spellCharacter, classRules]);

  const cantripsKnown = getCantripsKnown(form.className, form.level, classRules);
  const spellsKnown = getSpellsKnown(form.className, form.level, classRules);
  const preparedSpellLimit = getPreparedSpellCount(spellCharacter, classRules);
  const spellbookLimit = getSpellbookProgression(form.className, form.level, classRules);
  const knownSpellLimit = spellbookLimit ?? spellsKnown ?? preparedSpellLimit;
  const magicalSecretCount = featureCatalogue.filter((feature) => feature.name.toLowerCase().includes("magical secrets") && feature.className === form.className && feature.requiredLevel <= form.level).length * 2;
  const normalSpellLimit = spellbookLimit ?? (knownSpellLimit === null ? null : Math.max(0, knownSpellLimit - magicalSecretCount));

  const effectiveSelectedSpells = useMemo(() => {
    const valid = selectedSpells.filter((entry) => availableSpells.some((spell) => spell.id === entry.spellId));
    const cantrips = valid
      .filter((entry) => availableSpells.find((spell) => spell.id === entry.spellId)?.level === 0)
      .slice(0, cantripsKnown);
    const leveled = valid
      .filter((entry) => availableSpells.find((spell) => spell.id === entry.spellId)?.level !== 0)
      .slice(0, normalSpellLimit ?? 0);
    return [...cantrips, ...leveled];
  }, [selectedSpells, availableSpells, cantripsKnown, normalSpellLimit]);


  const availableFeats = useMemo(
    () => featCatalogue.filter((feat) => isFeatAvailable(featPrerequisiteCharacter, feat)),
    [featCatalogue, featPrerequisiteCharacter],
  );

  function selectRace(race: string, subrace = "") {
    const subraceRules = catalogue.subraces.find((entry) => entry.name === subrace && entry.parentRace === race);
    setRaceLanguageSelections([]);
    const speed = subraceRules?.speed ?? raceRules[race]?.speed ?? 30;
    setForm((current) => ({ ...current, race, subrace, speed, abilities: applyAbilityBonuses(applyAbilityBonuses(baseAbilities, raceRules[race]?.abilityBonuses ?? {}), subraceRules?.abilityBonuses ?? {}) }));
  }

  function setSubrace(value: string) {
    setForm((current) => ({
      ...current,
      subrace: value,
      speed: catalogue.subraces.find((entry) => entry.name === value && entry.parentRace === current.race)?.speed ?? raceRules[current.race]?.speed ?? 30,
      abilities: applyAbilityBonuses(
        applyAbilityBonuses(baseAbilities, raceRules[current.race]?.abilityBonuses ?? {}),
        catalogue.subraces.find((entry) => entry.name === value && entry.parentRace === current.race)?.abilityBonuses ?? {},
      ),
    }));
  }

  function setLevel(value: number) {
    const unlockLevel = getClassDefinition(form.className, classRules)?.subclassUnlockLevel ?? 1;
    const available = catalogue.subclasses.filter((entry) => entry.className === form.className && value >= unlockLevel);
    setForm((current) => ({
      ...current,
      level: value,
      subclass: value >= unlockLevel ? (current.subclass || available[0]?.name || "") : "",
    }));
  }

  function setBackground(value: string) {
    setBackgroundSkillSelections([]);
    setBackgroundToolSelections([]);
    setBackgroundLanguageSelections([]);
    setForm((current) => ({ ...current, background: value }));
  }

  function equipmentChoiceOptions(choiceType: string) {
    const type = choiceType.toLowerCase();
    return itemCatalogue.filter((item) => {
      if (!isOrdinaryStartingItem(item)) return false;
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
        const item = chosen && isOrdinaryStartingItem(chosen)
          ? chosen
          : findOrdinaryStartingItem(itemCatalogue, entry.name);
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

  const expectedMaxHp = getExpectedMaxHp(form.className, form.level, asiBonusScores.con, classRules);
  const expectedHitDice = getExpectedHitDice(form.className, form.level, classRules);
  const expectedProficiencyBonus = getProficiencyBonus(form.level);

  const requiredChoiceCount = (choices: Array<{ count: number }>) =>
    choices.reduce((sum, choice) => sum + Math.max(0, Number(choice.count) || 0), 0);

  const choiceSelectionsComplete = (choices: Array<{ count: number }>, selections: string[]) => {
    const required = requiredChoiceCount(choices);
    return selections.length >= required && selections.slice(0, required).every(Boolean);
  };

  const asiChoicesComplete = (() => {
    const next = { ...baseAbilityScoresWithRace };
    const selectedFeats = asiChoices.filter(Boolean);
    return new Set(selectedFeats).size === selectedFeats.length && asiLevels.every((_, index) => {
      if (asiChoices[index]) return availableFeats.some((feat) => feat.id === asiChoices[index]);
      const choice = asiAbilityChoices[index];
      if (!choice?.first) return false;
      if (choice.mode === "two") {
        if (next[choice.first] + 2 > 20) return false;
        next[choice.first] += 2;
        return true;
      }
      if (!choice.second || choice.first === choice.second) return false;
      if (next[choice.first] + 1 > 20 || next[choice.second] + 1 > 20) return false;
      next[choice.first] += 1;
      next[choice.second] += 1;
      return true;
    });
  })();

  const equipmentGroups = [
    ...(selectedClassRules?.startingEquipment ?? []).map((group, index) => ({ ...group, id: "class-" + index })),
    ...(selectedBackgroundRules?.startingEquipment ?? []).map((group, index) => ({ ...group, id: "background-" + index })),
  ];

  const equipmentChoicesComplete = equipmentMode === "gold"
    ? Object.values(form.currency).some((value) => Number(value) > 0)
    : equipmentGroups.every((group) => {
      const optionIndex = startingEquipmentSelections[group.id];
      const option = optionIndex === undefined ? undefined : group.options[optionIndex];
      if (!option) return false;
      return option.items.every((entry, entryIndex) =>
        !entry.choiceType || Boolean(startingItemChoices[group.id + ":" + optionIndex + ":" + entryIndex]),
      );
    });

  const creationRequirements = {
    identity: Boolean(form.name.trim() && form.race && form.className && form.background),
    nameClass: Boolean(form.name.trim() && form.className),
    background: Boolean(form.background),
    race: Boolean(form.race),
    abilities: Object.values(baseAbilities).every((score) => Number.isFinite(score) && score >= 1),
    subclass: subclassOptions.length === 0 || Boolean(form.subclass),
    classSkills: choiceSelectionsComplete(selectedClassRules?.skills.choices ?? [], classSkillSelections),
    classLanguages: choiceSelectionsComplete(selectedClassRules?.languages.choices ?? [], classLanguageSelections),
    backgroundSkills: choiceSelectionsComplete(selectedBackgroundRules?.skillChoices ?? [], backgroundSkillSelections),
    backgroundTools: choiceSelectionsComplete(selectedBackgroundRules?.toolChoices ?? [], backgroundToolSelections),
    backgroundLanguages: choiceSelectionsComplete(selectedBackgroundRules?.languageChoices ?? [], backgroundLanguageSelections),
    raceLanguages: choiceSelectionsComplete(selectedRaceRules?.languages.choices ?? [], raceLanguageSelections),
    asi: asiChoicesComplete,
    expertise: (() => {
      const required = expertiseLevels.length * 2;
      const selected = expertiseSelections.slice(0, required);
      return selected.length === required
        && selected.every((skill) => Boolean(skill) && selectedSkills.includes(skill))
        && new Set(selected).size === required;
    })(),
    magicalSecrets: (() => {
      const required = magicalSecretFeatures.length * 2;
      const selected = magicalSecretSelections.slice(0, required);
      const allowed = new Set(magicalSecretSpellOptions.map((spell) => spell.id));
      const normalSpellIds = new Set(effectiveSelectedSpells.map((entry) => entry.spellId));
      return selected.length === required
        && selected.every((spellId) => Boolean(spellId) && allowed.has(spellId) && !normalSpellIds.has(spellId))
        && new Set(selected).size === required;
    })(),
    optionalFeatures: optionalChoiceGroups.every((group) => {
      const count = form.optionalFeatures.filter((id) =>
        optionalFeatureCatalogue.some((option) =>
          option.id === id && option.featureTypes.some((type) => group.featureTypes.includes(type)),
        ),
      ).length;
      return count >= group.count;
    }),
    spells: (() => {
      const cantripCount = effectiveSelectedSpells.filter((entry) =>
        availableSpells.find((spell) => spell.id === entry.spellId)?.level === 0,
      ).length;
      const leveledCount = effectiveSelectedSpells.filter((entry) =>
        (availableSpells.find((spell) => spell.id === entry.spellId)?.level ?? 0) > 0,
      ).length;
      if (cantripCount !== cantripsKnown) return false;
      if (normalSpellLimit === null) return true;
      return spellsKnown !== null ? leveledCount === normalSpellLimit : leveledCount <= normalSpellLimit;
    })(),
    equipment: equipmentChoicesComplete,
  };

  const canCreate = Object.values(creationRequirements).every(Boolean);

  const requirementLabels: Record<RequirementKey, string> = {
    identity: "Character name, class, race and background",
    nameClass: "Character name and class",
    background: "Background",
    race: "Species",
    abilities: "Ability scores",
    subclass: "Subclass",
    classSkills: "Class skill choices",
    classLanguages: "Class language choices",
    backgroundSkills: "Background skill choices",
    backgroundTools: "Background tool choices",
    backgroundLanguages: "Background language choices",
    raceLanguages: "Species language choices",
    asi: "Ability Score Improvements / Feats",
    expertise: "Expertise choices",
    magicalSecrets: "Magical Secrets choices",
    optionalFeatures: "Optional class features",
    spells: "Required spells",
    equipment: "Starting equipment or starting gold",
  };

  const missingRequirements = (keys: RequirementKey[] = Object.keys(creationRequirements) as RequirementKey[]) =>
    keys.filter((key) => !creationRequirements[key]).map((key) => requirementLabels[key]);

  const stepRequirements: Record<BuilderStep, RequirementKey[]> = {
    class: ["nameClass", "subclass", "classSkills", "classLanguages", "asi", "expertise", "magicalSecrets", "optionalFeatures", "spells"],
    background: ["background", "backgroundSkills", "backgroundTools", "backgroundLanguages"],
    species: ["race", "raceLanguages"],
    abilities: ["abilities"],
    equipment: ["equipment"],
    "whats-next": Object.keys(creationRequirements) as RequirementKey[],
  };

  const currentStepMissing = missingRequirements(stepRequirements[step]);

  function goToStep(nextStep: BuilderStep) {
    if (nextStep === step) return;
    const currentIndex = BUILDER_STEPS.indexOf(step);
    const nextIndex = BUILDER_STEPS.indexOf(nextStep);
    if (nextIndex > currentIndex) {
      const missing = missingRequirements(stepRequirements[step]);
      if (missing.length) {
        setCreationError("Complete the current step before moving on: " + missing.join("; ") + ".");
        return;
      }
    }
    setCreationError("");
    setStep(nextStep);
  }

  function submit() {
    if (!canCreate) return;
    setCreationError("");
    const maxHp = expectedMaxHp;
    void createCharacter({
      ...form,
      abilities: asiBonusScores,
      savingThrows: selectedClassRules?.savingThrows ?? [],
      feats: asiChoices.filter(Boolean),
      skills: selectedSkills,
      tools: selectedTools,
      languages: selectedLanguages,
      spells: [
        ...effectiveSelectedSpells,
        ...magicalSecretSelections.filter(Boolean).filter((id) => !selectedSpells.some((entry) => entry.spellId === id)).map((spellId) => ({ spellId, prepared: true })),
      ],
      inventory: equipmentMode === "equipment" ? equipmentSelections : [],
      currency: form.currency,
      maxHp,
      hp: Math.max(0, Math.min(maxHp, form.hp || maxHp)),
      hitDice: getExpectedHitDice(form.className, form.level, classRules),
      proficiencyBonus: getProficiencyBonus(form.level),
      notes: [
        form.notes,
        expertiseSelections.filter(Boolean).length ? "Expertise: " + expertiseSelections.filter(Boolean).join(", ") : "",
      ].filter(Boolean).join("\n\n"),
    })
      .then((id) => router.push(`/characters/${id}`))
      .catch((error) => {
        console.error("Could not create character:", error);
        setCreationError(error instanceof Error ? error.message : "Could not create the character.");
      });
  }

  return (
    <div className="min-h-[calc(100vh-120px)] bg-stone-950">
      <BuilderStepNav step={step} onStepChange={goToStep} missingRequirements={currentStepMissing} />

      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <PageHeader
          eyebrow={`Character Builder • ${STEP_META[step].number} of ${BUILDER_STEPS.length}`}
          title={STEP_META[step].title}
          description={STEP_META[step].description}
          actions={<Link href="/characters" className="rounded-xl border border-stone-700 px-4 py-2.5 text-sm text-stone-300 hover:bg-stone-800">Cancel</Link>}
        />

        <div className="space-y-5">
          {step === "class" && (
            <>
              <SectionCard title="Character identity" description="Start with the class that defines what your character does.">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Character name" value={form.name} required onChange={(value) => setForm((current) => ({ ...current, name: value }))} />
                  <Field label="Player name" value={form.playerName} onChange={(value) => setForm((current) => ({ ...current, playerName: value }))} />
                  <NumberField label="Level" value={form.level} min={1} max={20} onChange={setLevel} />
                  <Select label="Class" value={form.className} options={catalogue.classes} onChange={(value) => {
                    const unlockLevel = getClassDefinition(value, classRules)?.subclassUnlockLevel ?? 1;
                    const next = catalogue.subclasses.filter((entry) => entry.className === value && form.level >= unlockLevel);
                    setClassSkillSelections([]);
                    setClassLanguageSelections([]);
                    setSelectedSpells([]);
                    setAsiChoices([]);
                    setAsiAbilityChoices([]);
                    setExpertiseSelections([]);
                    setMagicalSecretSelections([]);
                    setForm((current) => ({ ...current, className: value, subclass: next[0]?.name ?? "", feats: [] }));
                  }} />
                  <Select label="Subclass" value={form.subclass} options={subclassOptions.map((entry) => entry.name)} onChange={(value) => setForm((current) => ({ ...current, subclass: value }))} />
                </div>
              </SectionCard>

              {selectedSubclass && <InfoBox title={selectedSubclass.name} badge={selectedSubclass.source} text={selectedSubclass.description || "No subclass description is available for this entry."} />}

              <SectionCard title="Proficiencies" description="These are granted by your class. Choices are selected here rather than being typed manually.">
                {selectedClassRules && (
                  <div className="rounded-2xl border border-stone-800 bg-stone-950/60 p-5">
                    {selectedClassRules.savingThrows.length > 0 && <p className="text-sm text-stone-300"><b>Saving Throws:</b> {selectedClassRules.savingThrows.join(", ")}</p>}
                    {selectedClassRules.skills.fixed.length > 0 && <p className="mt-2 text-sm text-stone-300"><b>Fixed Skills:</b> {selectedClassRules.skills.fixed.join(", ")}</p>}
                    <ChoiceGroup title="Choose class skills" choices={selectedClassRules.skills.choices} value={classSkillSelections} onChange={setClassSkillSelections} />
                    {selectedClassRules.tools.fixed.length > 0 && <p className="mt-2 text-sm text-stone-300"><b>Tools:</b> {selectedClassRules.tools.fixed.join(", ")}</p>}
                    <ChoiceGroup title="Choose class languages" choices={selectedClassRules.languages.choices} value={classLanguageSelections} onChange={setClassLanguageSelections} />
                  </div>
                )}
              </SectionCard>

              <SectionCard title="Class Features" description="All class and subclass features unlocked by the selected level are shown here. They are granted automatically when the character is created.">
                <div className="space-y-3">
                  {featureCatalogue
                    .filter((feature) => feature.requiredLevel <= form.level && feature.className === form.className && (!feature.subclassName || feature.subclassName === form.subclass))
                    .filter((feature) => !/gain a feature from your|gain a feature from the|optional feature/i.test(feature.description))
                    .filter((feature) => !["ability score improvement", "expertise", "magical secrets"].includes(feature.name.toLowerCase()) && !feature.name.toLowerCase().includes("magical secrets"))
                    .map((feature) => (
                      <article key={feature.id} className="rounded-xl border border-stone-800 bg-stone-950/60 p-4">
                        <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{feature.name}</h3><Badge>Level {feature.requiredLevel}</Badge><Badge tone={feature.sourceType === "subclass" ? "warn" : "neutral"}>{feature.sourceType === "subclass" ? "Subclass" : "Class"}</Badge></div>
                        <p className="mt-2 whitespace-pre-line text-sm leading-6 text-stone-400">{feature.description}</p>
                      </article>
                    ))}
                </div>
              </SectionCard>

              {(cantripsKnown > 0 || knownSpellLimit !== null) && <SpellSelectionSection className={form.className} level={form.level} availableSpells={availableSpells} cantripsKnown={cantripsKnown} spellLimit={normalSpellLimit} spellbook={spellbookLimit !== null} selectedSpells={effectiveSelectedSpells} onChange={setSelectedSpells} />}

              {asiLevels.length > 0 && (
                <AsiSelectionSection levels={asiLevels} choices={asiChoices} onChoicesChange={setAsiChoices} abilityChoices={asiAbilityChoices} onAbilityChoicesChange={setAsiAbilityChoices} availableFeats={availableFeats} featCatalogue={featCatalogue} />
              )}

              {expertiseLevels.length > 0 && (
                <ExpertiseSelectionSection levels={expertiseLevels} selected={expertiseSelections} onChange={setExpertiseSelections} skills={selectedSkills} />
              )}

              {magicalSecretFeatures.length > 0 && (
                <MagicalSecretsSection features={magicalSecretFeatures} spells={magicalSecretSpellOptions} excluded={effectiveSelectedSpells.map((entry) => entry.spellId)} selected={magicalSecretSelections} onChange={setMagicalSecretSelections} />
              )}

              {optionalChoiceGroups.length > 0 && (
                <SectionCard title="Class options" description="Choose Fighting Styles and other optional class features available at this level.">
                  {optionalChoiceGroups.map((group) => (
                    <OptionalFeatureGroup key={group.id} title={group.title} count={group.count} featureTypes={group.featureTypes} catalogue={optionalFeatureCatalogue} selected={form.optionalFeatures} onChange={(next) => setForm((current) => ({ ...current, optionalFeatures: next }))} />
                  ))}
                </SectionCard>
              )}
            </>
          )}

          {step === "background" && (
            <>
              <SectionCard title="Choose a background" description="Your background gives you proficiencies, languages, tools and a background feature.">
                <Select label="Background" value={form.background} options={catalogue.backgrounds} onChange={setBackground} />
                {selectedBackgroundRules?.description && <p className="mt-5 whitespace-pre-line text-sm leading-7 text-stone-400">{selectedBackgroundRules.description}</p>}
              </SectionCard>

              {selectedBackgroundRules && (
                <SectionCard title="Background benefits">
                  {selectedBackgroundRules.skills.length > 0 && <p className="text-sm text-stone-300"><b>Fixed skills:</b> {selectedBackgroundRules.skills.join(", ")}</p>}
                  <ChoiceGroup title="Skill choices" choices={selectedBackgroundRules.skillChoices} value={backgroundSkillSelections} onChange={setBackgroundSkillSelections} exclude={[...(selectedClassRules?.skills.fixed ?? []), ...classSkillSelections]} />
                  {selectedBackgroundRules.tools.length > 0 && <p className="mt-4 text-sm text-stone-300"><b>Fixed tools:</b> {selectedBackgroundRules.tools.join(", ")}</p>}
                  <ChoiceGroup title="Tool choices" choices={selectedBackgroundRules.toolChoices} value={backgroundToolSelections} onChange={setBackgroundToolSelections} />
                  {selectedBackgroundRules.languages.length > 0 && <p className="mt-4 text-sm text-stone-300"><b>Fixed languages:</b> {selectedBackgroundRules.languages.join(", ")}</p>}
                  <ChoiceGroup title="Language choices" choices={selectedBackgroundRules.languageChoices} value={backgroundLanguageSelections} onChange={setBackgroundLanguageSelections} />
                  {selectedBackgroundRules.featureName && (
                    <div className="mt-5 rounded-2xl border border-amber-900/50 bg-amber-950/20 p-5">
                      <div className="text-xs font-semibold uppercase tracking-wider text-amber-500">Background Feature</div>
                      <h3 className="mt-1 text-lg font-semibold text-amber-300">{selectedBackgroundRules.featureName}</h3>
                      <p className="mt-3 whitespace-pre-line text-sm leading-7 text-stone-300">{selectedBackgroundRules.featureDescription}</p>
                    </div>
                  )}
                </SectionCard>
              )}
            </>
          )}

          {step === "species" && (
            <>
              <SectionCard title="Choose a species" description="Choose a race and, where available, expand it to choose its subrace.">
                <RacePicker races={catalogue.races} subraces={catalogue.subraces} selectedRace={form.race} selectedSubrace={form.subrace} onSelect={selectRace} />
              </SectionCard>

              {selectedRaceRules && <InfoBox title={form.race} badge={selectedRaceRules.source} text={selectedRaceRules.description || "No species description is available for this entry."} />}
              {selectedSubrace && <InfoBox title={selectedSubrace.name} badge={selectedSubrace.source} text={selectedSubrace.description || "No subrace description is available for this entry."} />}

              <SectionCard title="Species traits">
                <div className="grid gap-4 sm:grid-cols-2">
                  <ProficiencySummary title="Languages" values={selectedLanguages} />
                  <ChoiceGroup title="Choose species languages" choices={selectedRaceRules?.languages.choices ?? []} value={raceLanguageSelections} onChange={setRaceLanguageSelections} />
                  <ProficiencySummary title="Ability bonuses" values={Object.entries(selectedSubrace?.abilityBonuses ?? selectedRaceRules?.abilityBonuses ?? {}).map(([key, value]) => `${key.toUpperCase()} +${value}`)} />
                </div>
              </SectionCard>
            </>
          )}

          {step === "abilities" && (
            <>
              <SectionCard title="Ability scores" description="Choose your base ability scores. Race and subrace bonuses are applied automatically.">
                <AbilityScoreBuilder
                  baseScores={baseAbilities}
                  onBaseScoresChange={(next) => {
                    setBaseAbilities(next);
                    setForm((current) => ({
                      ...current,
                      abilities: applyAbilityBonuses(
                        applyAbilityBonuses(next, raceRules[current.race]?.abilityBonuses ?? {}),
                        catalogue.subraces.find((entry) => entry.name === current.subrace && entry.parentRace === current.race)?.abilityBonuses ?? {},
                      ),
                    }));
                  }}
                  raceBonuses={Object.fromEntries(abilityKeys.map((key) => [key, (selectedRaceRules?.abilityBonuses?.[key] ?? 0) + (selectedSubrace?.abilityBonuses?.[key] ?? 0)]))}
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
              <SectionCard title="Starting Equipment" description="Choose the equipment granted by your class and background. Each choice adds the selected items to Current Inventory.">
                <div className="mb-5 flex items-center justify-center gap-1 rounded-xl border border-stone-800 bg-stone-950/70 p-1">
                  <button type="button" onClick={() => setEquipmentMode("equipment")} className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold ${equipmentMode === "equipment" ? "bg-stone-100 text-stone-950" : "text-stone-500 hover:text-stone-300"}`}>Equipment</button>
                  <button type="button" onClick={() => setEquipmentMode("gold")} className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold ${equipmentMode === "gold" ? "bg-stone-100 text-stone-950" : "text-stone-500 hover:text-stone-300"}`}>Gold</button>
                </div>
                {equipmentMode === "gold" && (
                  <div className="mb-5 rounded-2xl border border-stone-800 bg-stone-950/60 p-5">
                    <h3 className="font-semibold">Starting Currency</h3>
                    <p className="mt-1 text-xs text-stone-500">Use this when the character takes gold instead of starting equipment.</p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-5">
                      {(["cp","sp","ep","gp","pp"] as const).map((coin) => <NumberField key={coin} label={coin.toUpperCase()} value={form.currency[coin]} min={0} onChange={(value) => setForm((current) => ({ ...current, currency: { ...current.currency, [coin]: value } }))} />)}
                    </div>
                  </div>
                )}
                {equipmentMode === "equipment" && <div className="space-y-4">
                  {[
                    ...(selectedClassRules?.startingEquipment ?? []).map((group, index) => ({ ...group, id: `class-${index}`, heading: "Class equipment" })),
                    ...(selectedBackgroundRules?.startingEquipment ?? []).map((group, index) => ({ ...group, id: `background-${index}`, heading: "Background equipment" })),
                  ].map((group) => (
                    <div key={group.id} className="rounded-2xl border border-stone-800 bg-stone-950/60 p-5">
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{group.heading}</h3>
                        <Badge>{group.label}</Badge>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {group.options.map((option, optionIndex) => {
                          const selected = startingEquipmentSelections[group.id] === optionIndex;
                          return (
                            <div
                              key={optionIndex}
                              className={`rounded-xl border p-4 transition ${selected ? "border-amber-500 bg-amber-950/30" : "border-stone-800 bg-stone-950/50 hover:border-stone-600"}`}
                            >
                              <button type="button" onClick={() => {
                                setStartingEquipmentSelections((current) => ({ ...current, [group.id]: optionIndex }));
                                applyStartingEquipment(group.id, optionIndex, option);
                              }} className="flex w-full items-start gap-3 text-left">
                                <span className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 ${selected ? "border-amber-400 bg-amber-400" : "border-stone-600"}`} />
                                <span className="font-semibold">{option.label}</span>
                              </button>
                              {option.items.length > 0 && (
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
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  {!((selectedClassRules?.startingEquipment?.length ?? 0) + (selectedBackgroundRules?.startingEquipment?.length ?? 0)) && (
                    <p className="text-sm text-stone-500">No parsed starting-equipment bundles were found. You can still add items manually below.</p>
                  )}
                </div>}
              </SectionCard>

              {equipmentMode === "equipment" && <SectionCard title={`Current Inventory (${equipmentSelections.length})`} description="This is the equipment that will be placed on the character.">
                {equipmentSelections.length === 0 ? <p className="text-sm text-stone-500">Nothing selected yet.</p> : (
                  <div className="space-y-2">
                    {equipmentSelections.map((entry) => {
                      const item = itemCatalogue.find((candidate) => candidate.id === entry.itemId);
                      if (!item) return null;
                      return <div key={entry.itemId} className="flex items-center justify-between gap-4 rounded-xl border border-stone-800 bg-stone-950/60 p-4">
                        <div><div className="font-semibold">{item.name}</div><div className="text-xs text-stone-500">{item.category}</div></div>
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => setEquipmentSelections((current) => current.map((candidate) => candidate.itemId === entry.itemId ? { ...candidate, quantity: Math.max(1, candidate.quantity - 1) } : candidate))} className="rounded-lg border border-stone-700 px-2 py-1">−</button>
                          <span className="w-8 text-center text-sm">{entry.quantity}</span>
                          <button type="button" onClick={() => setEquipmentSelections((current) => current.map((candidate) => candidate.itemId === entry.itemId ? { ...candidate, quantity: candidate.quantity + 1 } : candidate))} className="rounded-lg border border-stone-700 px-2 py-1">+</button>
                          <label className="flex items-center gap-2 text-sm text-stone-300"><input type="checkbox" checked={entry.equipped} onChange={(event) => setEquipmentSelections((current) => current.map((candidate) => candidate.itemId === entry.itemId ? { ...candidate, equipped: event.target.checked } : candidate))} /> Equip</label>
                          <button type="button" onClick={() => setEquipmentSelections((current) => current.filter((candidate) => candidate.itemId !== entry.itemId))} className="rounded-lg border border-red-900/60 px-2 py-1 text-red-400">Remove</button>
                        </div>
                      </div>;
                    })}
                  </div>
                )}
              </SectionCard>}

              <SectionCard title="Add Items" description="Add anything else from the imported 2014 equipment catalogue.">
                <div className="mb-4 flex gap-3">
                  <input value={equipmentSearch} onChange={(event) => setEquipmentSearch(event.target.value)} placeholder="Search equipment..." className="flex-1 rounded-xl border border-stone-700 bg-stone-950 px-4 py-2.5 text-sm text-stone-100 outline-none focus:border-amber-400" />
                  <Badge>{itemCatalogue.length} items</Badge>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {itemCatalogue
                    .filter((item) => `${item.name} ${item.category}`.toLowerCase().includes(equipmentSearch.toLowerCase()))
                    .slice(0, 40)
                    .map((item) => (
                      <div key={item.id} className="flex items-center justify-between rounded-xl border border-stone-800 bg-stone-950/60 p-3">
                        <div><div className="font-medium">{item.name}</div><div className="text-xs text-stone-600">{item.category}</div></div>
                        <button type="button" onClick={() => setEquipmentSelections((current) => current.some((entry) => entry.itemId === item.id) ? current : [...current, { itemId: item.id, quantity: 1, equipped: false }])} className="rounded-lg border border-stone-700 px-3 py-1.5 text-sm">Add</button>
                      </div>
                    ))}
                </div>
              </SectionCard>

              <SectionCard title="Currency" description="Currency is saved with the character and can be edited later from the inventory step.">
                <div className="grid gap-3 sm:grid-cols-5">{(["cp","sp","ep","gp","pp"] as const).map((coin) => <NumberField key={coin} label={coin.toUpperCase()} value={form.currency[coin]} min={0} onChange={(value) => setForm((current) => ({ ...current, currency: { ...current.currency, [coin]: value } }))} />)}</div>
              </SectionCard>
              <SectionCard title="Other Possessions" description="Use Notes on the final step for free-form possessions that are not represented by an item record.">
                <p className="text-sm text-stone-500">Add free-form possessions in Notes on the final step.</p>
              </SectionCard>
            </>
          )}

          {step === "whats-next" && (
            <>
              <SectionCard title="Final details" description="Finish the details that do not belong to a specific rules step.">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <NumberField label="Level" value={form.level} min={1} max={20} onChange={setLevel} />
                  <Field label="Alignment" value={form.alignment} onChange={(value) => setForm((current) => ({ ...current, alignment: value }))} />
                  <NumberField label="Speed" value={form.speed} min={0} onChange={(value) => setForm((current) => ({ ...current, speed: value }))} />
                  <NumberField label="Current HP" value={form.hp} min={0} onChange={(value) => setForm((current) => ({ ...current, hp: value }))} />
                  <NumberField label="Maximum HP" value={expectedMaxHp} min={1} onChange={() => undefined} />
                  <NumberField label="Armor Class" value={form.ac} min={0} onChange={(value) => setForm((current) => ({ ...current, ac: value }))} />
                  <Field label="Hit Dice" value={expectedHitDice} onChange={() => undefined} />
                  <NumberField label="Proficiency Bonus" value={expectedProficiencyBonus} min={0} onChange={() => undefined} />
                </div>
              </SectionCard>

              <SectionCard title="Review">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <ProficiencySummary title="Character" values={[form.name || "Unnamed", form.className, form.subclass, form.race, form.subrace, form.background].filter(Boolean)} />
                  <ProficiencySummary title="Abilities" values={Object.entries(asiBonusScores).map(([key, value]) => `${key.toUpperCase()} ${value}`)} />
                  <ProficiencySummary title="Equipment" values={(equipmentMode === "equipment" ? equipmentSelections : []).map((entry) => itemCatalogue.find((item) => item.id === entry.itemId)?.name ?? entry.itemId)} />
                  <ProficiencySummary title="Currency" values={Object.entries(form.currency).map(([coin, value]) => `${coin.toUpperCase()} ${value}`)} />
                </div>
              </SectionCard>

              {!canCreate && (
                <SectionCard title="Missing required details" description="Complete these items before the character can be created.">
                  <ul className="list-disc space-y-2 pl-5 text-sm text-amber-300">
                    {missingRequirements().map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </SectionCard>
              )}

              {creationError && <div className="rounded-xl border border-red-900/60 bg-red-950/20 px-4 py-3 text-sm text-red-300">{creationError}</div>}

              <SectionCard title="Notes">
                <textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} rows={8} className="w-full rounded-xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm leading-6 text-stone-100 outline-none focus:border-amber-400" placeholder="Backstory, campaign notes, reminders..." />
              </SectionCard>

              <div className="flex justify-end">
                <button type="button" onClick={submit} disabled={!canCreate} data-create-character="true" className="rounded-xl bg-stone-100 px-6 py-3 text-sm font-semibold text-stone-950 hover:bg-amber-300 disabled:opacity-40">Create Character</button>
              </div>
            </>
          )}
        </div>

        <BuilderFooter step={step} onStepChange={goToStep} canCreate={canCreate} missingRequirements={missingRequirements()} />
      </div>
    </div>
  );
}

type BuilderStep = "class" | "background" | "species" | "abilities" | "equipment" | "whats-next";
const BUILDER_STEPS: BuilderStep[] = ["class", "background", "species", "abilities", "equipment", "whats-next"];
const STEP_META: Record<BuilderStep, { number: number; title: string; description: string }> = {
  class: { number: 1, title: "Class", description: "Choose your class, subclass and class-specific proficiencies and options." },
  background: { number: 2, title: "Background", description: "Choose your background and the proficiencies, languages and feature it grants." },
  species: { number: 3, title: "Species", description: "Choose your race and subrace and review its traits." },
  abilities: { number: 4, title: "Abilities", description: "Set your ability scores and review the proficiencies gained so far." },
  equipment: { number: 5, title: "Equipment", description: "Choose the equipment your character will start with." },
  "whats-next": { number: 6, title: "What's Next", description: "Finish your character, review the build and create the character sheet." },
};

function BuilderStepNav({ step, onStepChange, missingRequirements }: { step: BuilderStep; onStepChange: (step: BuilderStep) => void; missingRequirements: string[] }) {
  return (
    <div className="border-b border-stone-800 bg-stone-950/95">
      <div className="mx-auto max-w-5xl overflow-x-auto px-4 sm:px-6 lg:px-8">
        <nav className="flex min-w-max items-stretch gap-1" aria-label="Character creation steps">
          {BUILDER_STEPS.map((entry, index) => {
            const active = entry === step;
            const meta = STEP_META[entry];
            return (
              <button
                key={entry}
                type="button"
                onClick={() => onStepChange(entry)}
                className={`relative px-4 py-4 text-left transition ${active ? "text-stone-100" : "text-stone-500 hover:text-stone-300"}`}
              >
                <span className="mr-2 text-[10px] font-bold text-stone-600">{index + 1}.</span>
                <span className="text-xs font-semibold uppercase tracking-wider">{meta.title}</span>
                {active && <span className="absolute inset-x-2 bottom-0 h-0.5 bg-amber-400" />}
              </button>
            );
          })}
        </nav>
        {missingRequirements.length > 0 && (
          <p className="border-t border-stone-800 px-1 py-2 text-xs text-amber-400">
            Complete this step before moving on: {missingRequirements.join("; ")}.
          </p>
        )}
      </div>
    </div>
  );
}

function BuilderFooter({ step, onStepChange, canCreate, missingRequirements }: { step: BuilderStep; onStepChange: (step: BuilderStep) => void; canCreate: boolean; missingRequirements: string[] }) {
  const index = BUILDER_STEPS.indexOf(step);
  const previous = index > 0 ? BUILDER_STEPS[index - 1] : null;
  const next = index < BUILDER_STEPS.length - 1 ? BUILDER_STEPS[index + 1] : null;
  return (
    <div className="sticky bottom-0 z-20 -mx-4 mt-8 border-t border-stone-800 bg-stone-950/95 px-4 py-4 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
        <button type="button" disabled={!previous} onClick={() => previous && onStepChange(previous)} className="rounded-xl border border-stone-700 px-5 py-2.5 text-sm font-semibold text-stone-300 hover:bg-stone-900 disabled:opacity-30">
          Back
        </button>
        <div className="text-xs text-stone-600">{index + 1} / {BUILDER_STEPS.length}</div>
        {next ? (
          <button type="button" onClick={() => onStepChange(next)} className="rounded-xl bg-stone-100 px-5 py-2.5 text-sm font-semibold text-stone-950 hover:bg-amber-300">
            Next: {STEP_META[next].title}
          </button>
        ) : (
          <button type="button" onClick={() => canCreate && document.querySelector<HTMLButtonElement>('button[data-create-character="true"]')?.click()} disabled={!canCreate} className="rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-semibold text-stone-950 hover:bg-amber-300 disabled:opacity-40">
            Create Character
          </button>
        )}
      </div>
    </div>
  );
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
            {children.map((entry) => <button key={entry.name} type="button" onClick={() => onSelect(race, entry.name)} className={`block w-full rounded-lg px-4 py-2 text-left text-sm ${selectedSubrace === entry.name ? "bg-amber-500/10 text-amber-300" : "text-stone-400 hover:bg-stone-900 hover:text-stone-200"}`}>{entry.name}</button>)}
          </div>}
        </div>;
      })}
    </div>
  </div>;
}

function ChoiceGroup({ title, choices, value, onChange, exclude = [] }: { title: string; choices: Array<{ count: number; options: string[] }>; value: string[]; onChange: (value: string[]) => void; exclude?: string[] }) {
  if (!choices.length) return null;
  let offset = 0;
  return <div className="mt-4 space-y-3">
    <h4 className="text-sm font-semibold text-stone-200">{title}</h4>
    {choices.flatMap((choice) => Array.from({ length: choice.count }, (_, index) => {
      const slot = offset++;
      const options = choice.options.filter((option) => (!exclude.includes(option) || value[slot] === option) && !value.some((selected, index) => index !== slot && selected === option));
      return <select key={`${title}-${slot}`} value={value[slot] ?? ""} onChange={(event) => {
        const next = [...value];
        next[slot] = event.target.value;
        onChange(next);
      }} className="w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-sm text-stone-100">
        <option value="">Choose an option...</option>
        {options.map((option) => <option key={option}>{option}</option>)}
      </select>;
    }))}
  </div>;
}

function AsiSelectionSection({ levels, choices, onChoicesChange, abilityChoices, onAbilityChoicesChange, availableFeats, featCatalogue }: {
  levels: number[];
  choices: string[];
  onChoicesChange: (value: string[]) => void;
  abilityChoices: Array<{ mode: "two" | "one"; first?: AbilityKey; second?: AbilityKey }>;
  onAbilityChoicesChange: (value: Array<{ mode: "two" | "one"; first?: AbilityKey; second?: AbilityKey }>) => void;
  availableFeats: Array<{ id: string; name: string; description: string; source: string }>;
  featCatalogue: Array<{ id: string; name: string; description: string; source: string }>;
}) {
  const abilityNames: Array<[AbilityKey, string]> = [["str","Strength"],["dex","Dexterity"],["con","Constitution"],["int","Intelligence"],["wis","Wisdom"],["cha","Charisma"]];
  return <SectionCard title="Ability Score Improvements / Feats" description="At each Ability Score Improvement level, choose the normal ability score improvement or replace it with a feat you qualify for.">
    <div className="space-y-5">
      {levels.map((level, index) => {
        const selectedFeatId = choices[index] ?? "";
        const choice = abilityChoices[index];
        const mode = choice?.mode ?? "two";
        const first = choice?.first ?? "";
        const second = choice?.second ?? "";
        const selectedFeat = featCatalogue.find((feat) => feat.id === selectedFeatId);
        const eligibleFeats = availableFeats.filter((feat) => !choices.includes(feat.id) || feat.id === selectedFeatId);
        return <div key={level} className="rounded-2xl border border-stone-800 bg-stone-950/60 p-5">
          <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">Level {level}</h3><Badge>ASI / Feat</Badge></div>
          <select value={selectedFeatId} onChange={(event) => {
            const next = [...choices]; next[index] = event.target.value; onChoicesChange(next);
          }} className="mt-3 w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-sm text-stone-100">
            <option value="">Ability Score Improvement</option>
            {eligibleFeats.map((feat) => <option key={feat.id} value={feat.id}>{feat.name}</option>)}
          </select>
          {!selectedFeatId && <div className="mt-4 rounded-xl border border-stone-800 p-4">
            <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500">ASI allocation</label>
            <select value={mode} onChange={(event) => {
              const next = [...abilityChoices];
              next[index] = {
                mode: event.target.value as "two" | "one",
                first: choice?.first,
                second: choice?.second,
              };
              onAbilityChoicesChange(next);
            }} className="mt-2 w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-sm">
              <option value="two">+2 to one ability score</option>
              <option value="one">+1 to two different ability scores</option>
            </select>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <select value={first} onChange={(event) => {
                const next = [...abilityChoices];
                next[index] = {
                  mode,
                  first: event.target.value ? event.target.value as AbilityKey : undefined,
                  second: choice?.second,
                };
                onAbilityChoicesChange(next);
              }} className="rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-sm">
                <option value="">Choose an ability...</option>
                {abilityNames.map(([key, name]) => <option key={key} value={key}>{name}</option>)}
              </select>
              {mode === "one" && <select value={second} onChange={(event) => {
                const next = [...abilityChoices];
                next[index] = {
                  mode,
                  first: choice?.first,
                  second: event.target.value ? event.target.value as AbilityKey : undefined,
                };
                onAbilityChoicesChange(next);
              }} className="rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-sm">
                <option value="">Choose an ability...</option>
                {abilityNames.filter(([key]) => key !== choice?.first).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
              </select>}
            </div>
            <p className="mt-2 text-xs text-stone-500">Ability scores cannot be increased above 20.</p>
          </div>}
          {selectedFeat && <article className="mt-4 rounded-xl border border-amber-900/60 bg-amber-950/20 p-4"><div className="flex items-center gap-2"><h3 className="font-semibold text-amber-300">{selectedFeat.name}</h3>{selectedFeat.source && <Badge>{selectedFeat.source}</Badge>}</div><p className="mt-2 whitespace-pre-line text-sm leading-6 text-stone-300">{selectedFeat.description}</p></article>}
        </div>;
      })}
    </div>
  </SectionCard>;
}

function ExpertiseSelectionSection({ levels, selected, onChange, skills }: { levels: number[]; selected: string[]; onChange: (value: string[]) => void; skills: string[] }) {
  let offset = 0;
  return <SectionCard title="Expertise" description="Choose the skill proficiencies that gain Expertise at each level shown below.">
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
  return <SectionCard title="Magical Secrets" description="Choose the spells from any class granted by each Magical Secrets feature. These choices count toward the class's spells known.">
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

function SpellSelectionSection({ className, level, availableSpells, cantripsKnown, spellLimit, spellbook, selectedSpells, onChange }: { className: string; level: number; availableSpells: Array<{ id: string; name: string; level: number; school: string; description: string }>; cantripsKnown: number; spellLimit: number | null; spellbook: boolean; selectedSpells: SpellEntry[]; onChange: (value: SpellEntry[]) => void }) {
  if (!cantripsKnown && spellLimit === null) return null;
  const selectedCantrips = selectedSpells.filter((entry) => availableSpells.find((spell) => spell.id === entry.spellId)?.level === 0);
  const selectedLeveled = selectedSpells.filter((entry) => {
    const spell = availableSpells.find((candidate) => candidate.id === entry.spellId);
    return Boolean(spell && spell.level > 0);
  });
  const label = spellbook ? "Spellbook" : spellLimit === null ? "Prepared spells" : "Spells known";
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
    onChange([...selectedSpells, { spellId, prepared: spell.level === 0 || !spellbook }]);
  }
  const spellbookText = "Choose the spells in your spellbook. At level " + level + ", your character can have " + (spellLimit ?? 0) + " spells in the spellbook.";
  const knownText = "Choose the spells your character starts with. You can select " + cantripsKnown + " cantrip" + (cantripsKnown === 1 ? "" : "s") + (spellLimit !== null ? " and " + spellLimit + " " + label.toLowerCase() + "." : ".");
  return <SectionCard title="Spells" description={spellbook ? spellbookText : knownText}>
    <div className="grid gap-5 lg:grid-cols-2">
      <SpellPicker title={"Cantrips (" + selectedCantrips.length + "/" + cantripsKnown + ")"} spells={availableSpells.filter((spell) => spell.level === 0)} selected={selectedSpells} remaining={remainingCantrips} onToggle={toggle} />
      {spellLimit !== null && <SpellPicker title={label + " (" + selectedLeveled.length + "/" + spellLimit + ")"} spells={availableSpells.filter((spell) => spell.level > 0)} selected={selectedSpells} remaining={remainingLeveled} onToggle={toggle} />}
      {spellLimit === null && spellbook && <SpellPicker title={"Spellbook (" + selectedLeveled.length + "/" + (spellLimit ?? 0) + ")"} spells={availableSpells.filter((spell) => spell.level > 0)} selected={selectedSpells} remaining={remainingLeveled} onToggle={toggle} />}
    </div>
    <p className="mt-4 text-xs text-stone-500">Only spells normally available to this class, subclass or species and within the character&apos;s current spell level are shown.</p>
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

function OptionalFeatureGroup({ title, count, featureTypes, catalogue, selected, onChange }: { title: string; count: number; featureTypes: string[]; catalogue: Array<{ id: string; name: string; description: string; featureTypes: string[]; source: string }>; selected: string[]; onChange: (value: string[]) => void }) {
  const options = catalogue.filter((entry) => entry.featureTypes.some((type) => featureTypes.includes(type)));
  const slots = Array.from({ length: count }, (_, index) => selected.filter((id) => options.some((option) => option.id === id))[index] ?? "");
  return <div className="mt-4 rounded-2xl border border-stone-800 bg-stone-950/60 p-5">
    <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{title}</h3><Badge>{count} choice{count === 1 ? "" : "s"}</Badge></div>
    <div className="mt-3 space-y-3">
      {slots.map((slot, index) => <select key={index} value={slot} onChange={(event) => {
        const currentGroupIds = selected.filter((id) => options.some((option) => option.id === id));
        const nextGroupIds = [...currentGroupIds];
        if (event.target.value) nextGroupIds[index] = event.target.value; else nextGroupIds.splice(index, 1);
        const otherIds = selected.filter((id) => !options.some((option) => option.id === id));
        onChange([...otherIds, ...nextGroupIds.filter(Boolean)]);
      }} className="w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-sm text-stone-100">
        <option value="">Choose an option...</option>
        {options.filter((option) => !selected.includes(option.id) || option.id === slot).map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
      </select>)}
    </div>
    {slots.map((slot) => {
      const feature = options.find((option) => option.id === slot);
      return feature ? <article key={feature.id} className="mt-3 rounded-xl border border-amber-900/50 bg-amber-950/20 p-4"><div className="font-semibold text-amber-300">{feature.name}</div><p className="mt-2 whitespace-pre-line text-sm leading-6 text-stone-300">{feature.description}</p></article> : null;
    })}
    {!options.length && <p className="mt-3 text-sm text-stone-500">No imported options match this choice group.</p>}
  </div>;
}

function ProficiencySummary({ title, values }: { title: string; values: string[] }) {
  return <div className="rounded-xl border border-stone-800 bg-stone-950/60 p-4"><h4 className="text-xs font-semibold uppercase tracking-wider text-stone-500">{title}</h4><p className="mt-2 text-sm text-stone-200">{values.length ? values.join(", ") : "None"}</p></div>;
}

function InfoBox({ title, badge, text }: { title: string; badge?: string; text: string }) {
  return <div className="mt-5 rounded-2xl border border-stone-800 bg-stone-950/60 p-5"><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-semibold">{title}</h3>{badge && <Badge>{badge}</Badge>}</div><p className="mt-3 whitespace-pre-line text-sm leading-7 text-stone-400">{text}</p></div>;
}

function Field({ label, value, onChange, required = false }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  return <label><span className="text-xs font-semibold uppercase tracking-wider text-stone-500">{label}</span><input required={required} value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-sm text-stone-100 outline-none focus:border-amber-400" /></label>;
}

function NumberField({ label, value, min, max, onChange }: { label: string; value: number; min?: number; max?: number; onChange: (value: number) => void }) {
  return <label><span className="text-xs font-semibold uppercase tracking-wider text-stone-500">{label}</span><input type="number" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-2 w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-sm text-stone-100 outline-none focus:border-amber-400" /></label>;
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <label><span className="text-xs font-semibold uppercase tracking-wider text-stone-500">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-sm text-stone-100 outline-none focus:border-amber-400">{options.length === 0 ? <option value="">None</option> : <>
    <option value="">Choose an option...</option>
    {options.map((option) => <option key={option}>{option}</option>)}
  </>}</select></label>;
}
