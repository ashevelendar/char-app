"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Badge, PageHeader, SectionCard } from "../../../../components/AppShell";
import AbilityScoreBuilder, { applyAbilityBonuses, type AbilityScoreMethod } from "../../../../components/AbilityScoreBuilder";
import { useCharacters } from "../../../../context/CharacterContext";
import type { AbilityKey, AbilityScores, AsiHistoryEntry, Character, Currency, ExpertiseHistoryEntry, InventoryEntry, MagicalSecretsHistoryEntry, SpellEntry } from "../../../../lib/types";
import { getAbilityScoreImprovementLevelsUpTo, getCantripsKnown, getCarryingCapacity, getClassDefinition, validateAsiHistory, validateExpertiseHistory, validateMagicalSecretsHistory, getExpectedHitDice, getExpectedMaxHp, getFeatAbilityBonuses, getFeatAbilityOptions, getInventoryWeight, getMaxSpellLevel, getNewAbilityScoreImprovementLevels, getPreparedSpellCount, getProficiencyBonus, getSpellsKnown, getSpellbookProgression, getAvailableItems, isFeatAvailable, isSpellNormallyAvailable } from "../../../../lib/rules";

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
function getAsiAbilityBonuses(entry?: AsiHistoryEntry): Partial<AbilityScores> {
  if (!entry || entry.mode === "feat" || entry.mode === "legacy") return {};
  if (!entry.first) return {};
  if (entry.mode === "two") return { [entry.first]: 2 };
  if (!entry.second || entry.second === entry.first) return {};
  return { [entry.first]: 1, [entry.second]: 1 };
}

function getAsiHistoryBonusTotal(entries: AsiHistoryEntry[]): AbilityScores {
  return entries.reduce((total, entry) => {
    const bonuses = getAsiAbilityBonuses(entry);
    for (const key of abilityKeys) total[key] += bonuses[key] ?? 0;
    return total;
  }, { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 });
}

function stripManagedNotes(notes: string) {
  return notes
    .split("\n")
    .filter((line) => !/^(?:Expertise:|Expertise History:|Magical Secrets History:|ASI History:|Feat Ability Choices:)/.test(line.trim()))
    .join("\n")
    .trim();
}

function parseMagicalSecretsHistory(notes: string): MagicalSecretsHistoryEntry[] {
  const match = notes.match(/^Magical Secrets History:\s*(.+)$/m);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[1]) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is MagicalSecretsHistoryEntry => {
      if (!entry || typeof entry !== "object") return false;
      const value = entry as Record<string, unknown>;
      return typeof value.level === "number" && Array.isArray(value.spellIds) && value.spellIds.every((id) => typeof id === "string");
    }).sort((a, b) => a.level - b.level);
  } catch {
    return [];
  }
}

function parseExpertiseHistory(notes: string): ExpertiseHistoryEntry[] {
  const match = notes.match(/^Expertise History:\s*(.+)$/m);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[1]) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is ExpertiseHistoryEntry => {
      if (!entry || typeof entry !== "object") return false;
      const value = entry as Record<string, unknown>;
      return typeof value.level === "number" && Array.isArray(value.skills) && value.skills.every((skill) => typeof skill === "string");
    }).sort((a, b) => a.level - b.level);
  } catch {
    return [];
  }
}

function parseAsiHistory(notes: string): AsiHistoryEntry[] {
  const match = notes.match(/^ASI History:\s*(.+)$/m);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[1]) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is AsiHistoryEntry => {
      if (!entry || typeof entry !== "object") return false;
      const value = entry as Record<string, unknown>;
      return typeof value.level === "number" && (value.mode === "two" || value.mode === "one" || value.mode === "feat" || value.mode === "legacy");
    }).sort((a, b) => a.level - b.level);
  } catch {
    return [];
  }
}


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

  const initialFeatAbilityChoices = useMemo(() => {
    const match = character.notes.match(/^Feat Ability Choices: (.+)$/m);
    if (!match) return {} as Record<string, AbilityKey>;
    try { return JSON.parse(match[1]) as Record<string, AbilityKey>; } catch { return {} as Record<string, AbilityKey>; }
  }, [character.notes]);

  const initialAsiHistory = useMemo(() => {
    const parsed = parseAsiHistory(character.notes);
    if (parsed.length) return parsed;
    const levels = getAbilityScoreImprovementLevelsUpTo(character.className, character.level, classRules);
    return levels.map((level, index) => {
      const featId = character.feats[index];
      return featId
        ? { level, mode: "feat" as const, featId, featAbility: initialFeatAbilityChoices[featId] }
        : { level, mode: "legacy" as const };
    });
  }, [character.notes, character.className, character.level, character.feats, classRules, initialFeatAbilityChoices]);
  const initialAsiBonuses = getAsiHistoryBonusTotal(initialAsiHistory);

  const getExistingFeatBonus = (ability: AbilityKey) => initialAsiHistory.reduce((total, entry) => {
    if (entry.mode !== "feat" || !entry.featId) return total;
    const feat = featCatalogue.find((candidate) => candidate.id === entry.featId);
    return total + (feat ? (getFeatAbilityBonuses(feat, entry.featAbility ?? initialFeatAbilityChoices[entry.featId])[ability] ?? 0) : 0);
  }, 0);

  const [baseAbilities, setBaseAbilities] = useState<AbilityScores>(() => ({
    str: Math.max(1, character.abilities.str - (raceRules[character.race]?.abilityBonuses.str ?? 0) - (catalogue.subraces.find((entry) => entry.name === character.subrace && entry.parentRace === character.race)?.abilityBonuses.str ?? 0) - getExistingFeatBonus("str") - initialAsiBonuses.str),
    dex: Math.max(1, character.abilities.dex - (raceRules[character.race]?.abilityBonuses.dex ?? 0) - (catalogue.subraces.find((entry) => entry.name === character.subrace && entry.parentRace === character.race)?.abilityBonuses.dex ?? 0) - getExistingFeatBonus("dex") - initialAsiBonuses.dex),
    con: Math.max(1, character.abilities.con - (raceRules[character.race]?.abilityBonuses.con ?? 0) - (catalogue.subraces.find((entry) => entry.name === character.subrace && entry.parentRace === character.race)?.abilityBonuses.con ?? 0) - getExistingFeatBonus("con") - initialAsiBonuses.con),
    int: Math.max(1, character.abilities.int - (raceRules[character.race]?.abilityBonuses.int ?? 0) - (catalogue.subraces.find((entry) => entry.name === character.subrace && entry.parentRace === character.race)?.abilityBonuses.int ?? 0) - getExistingFeatBonus("int") - initialAsiBonuses.int),
    wis: Math.max(1, character.abilities.wis - (raceRules[character.race]?.abilityBonuses.wis ?? 0) - (catalogue.subraces.find((entry) => entry.name === character.subrace && entry.parentRace === character.race)?.abilityBonuses.wis ?? 0) - getExistingFeatBonus("wis") - initialAsiBonuses.wis),
    cha: Math.max(1, character.abilities.cha - (raceRules[character.race]?.abilityBonuses.cha ?? 0) - (catalogue.subraces.find((entry) => entry.name === character.subrace && entry.parentRace === character.race)?.abilityBonuses.cha ?? 0) - getExistingFeatBonus("cha") - initialAsiBonuses.cha),
  }));
  const [abilities, setAbilities] = useState<AbilityScores>(character.abilities);
  const [abilityMethod, setAbilityMethod] = useState<AbilityScoreMethod>("manual");
  const [skills, setSkills] = useState<string[]>(character.skills);
  const [tools, setTools] = useState<string[]>(character.tools);
  const [languages, setLanguages] = useState<string[]>(character.languages);
  const [asiHistory, setAsiHistory] = useState<AsiHistoryEntry[]>(initialAsiHistory);
  const [featAbilityChoices, setFeatAbilityChoices] = useState<Record<string, AbilityKey>>(initialFeatAbilityChoices);
  const magicalSecretHistoryFromNotes = useMemo(() => parseMagicalSecretsHistory(character.notes), [character.notes]);
  const [magicalSecretHistory, setMagicalSecretHistory] = useState<MagicalSecretsHistoryEntry[]>(magicalSecretHistoryFromNotes);
  const magicalSecretSelections = magicalSecretHistory.flatMap((entry) => entry.spellIds);
  const [selectedSpells, setSelectedSpells] = useState<SpellEntry[]>(() =>
    (character.spells ?? [])
      .filter((entry) => entry.source !== "magical-secrets" && !magicalSecretSelections.includes(entry.spellId))
      .map((entry) => ({ ...entry, source: entry.source ?? "legacy" })),
  );

  function updateMagicalSecretHistory(level: number, spellIds: string[]) {
    setMagicalSecretHistory((current) => {
      const filtered = current.filter((entry) => entry.level !== level);
      const unique = [...new Set(spellIds.filter(Boolean))];
      return unique.length ? [...filtered, { level, spellIds: unique }].sort((a, b) => a.level - b.level) : filtered;
    });
  }
  const [optionalFeatures, setOptionalFeatures] = useState<string[]>(character.optionalFeatures ?? []);
  const [classSkillSelections, setClassSkillSelections] = useState<string[]>([]);
  const [backgroundSkillSelections, setBackgroundSkillSelections] = useState<string[]>([]);
  const [backgroundToolSelections, setBackgroundToolSelections] = useState<string[]>([]);
  const [backgroundLanguageSelections, setBackgroundLanguageSelections] = useState<string[]>([]);
  const [classLanguageSelections, setClassLanguageSelections] = useState<string[]>([]);
  const [raceLanguageSelections, setRaceLanguageSelections] = useState<string[]>([]);
  const [subraceSkillSelections, setSubraceSkillSelections] = useState<string[]>(() => {
    const subrace = catalogue.subraces.find((entry) => entry.name === character.subrace && entry.parentRace === character.race);
    return character.skills.filter((skill) => subrace?.skills?.choices.some((choice) => choice.options.includes(skill)));
  });
  const [subraceToolSelections, setSubraceToolSelections] = useState<string[]>(() => {
    const subrace = catalogue.subraces.find((entry) => entry.name === character.subrace && entry.parentRace === character.race);
    return character.tools.filter((tool) => subrace?.tools?.choices.some((choice) => choice.options.includes(tool)));
  });
  const [subraceLanguageSelections, setSubraceLanguageSelections] = useState<string[]>(() => {
    const subrace = catalogue.subraces.find((entry) => entry.name === character.subrace && entry.parentRace === character.race);
    return character.languages.filter((language) => subrace?.languages?.choices.some((choice) => choice.options.includes(language)));
  });
  const [equipmentSelections, setEquipmentSelections] = useState<InventoryEntry[]>(character.inventory);
  const [startingEquipmentSelections, setStartingEquipmentSelections] = useState<Record<string, number>>({});
  const [startingItemChoices, setStartingItemChoices] = useState<Record<string, string>>({});
  const [equipmentSearch, setEquipmentSearch] = useState("");
  const [equipmentMode, setEquipmentMode] = useState<"equipment" | "gold">("equipment");
  const [currency, setCurrency] = useState<Currency>(character.currency ?? { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 });
  const [step, setStep] = useState<BuilderStep>("class");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);

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
    ...(raceRules[form.race]?.skills.fixed ?? []),
    ...raceRules[form.race]?.skills.choices.flatMap((choice) => choice.options.filter((option) => raceLanguageSelections.includes(option))) ?? [],
    ...(selectedSubrace?.skills?.fixed ?? []),
    ...selectedSubrace?.skills?.choices.flatMap((choice) => choice.options.filter((option) => subraceSkillSelections.includes(option))) ?? [],
    ...(selectedClassRules?.skills.fixed ?? []),
    ...classSkillSelections.filter(Boolean),
    ...(selectedBackgroundRules?.skills ?? []),
    ...backgroundSkillSelections.filter(Boolean),
  ])], [raceRules, form.race, selectedSubrace, subraceSkillSelections, selectedClassRules, classSkillSelections, selectedBackgroundRules, backgroundSkillSelections, raceLanguageSelections]);

  const selectedTools = useMemo(() => [...new Set([
    ...(raceRules[form.race]?.tools.fixed ?? []),
    ...(selectedSubrace?.tools?.fixed ?? []),
    ...selectedSubrace?.tools?.choices.flatMap((choice) => choice.options.filter((option) => subraceToolSelections.includes(option))) ?? [],
    ...(selectedClassRules?.tools.fixed ?? []),
    ...(selectedBackgroundRules?.tools ?? []),
    ...backgroundToolSelections.filter(Boolean),
  ])], [raceRules, form.race, selectedSubrace, subraceToolSelections, selectedClassRules, selectedBackgroundRules, backgroundToolSelections]);

  const selectedLanguages = useMemo(() => [...new Set([
    ...(raceRules[form.race]?.languages.fixed ?? []),
    ...raceLanguageSelections.filter(Boolean),
    ...(selectedSubrace?.languages?.fixed ?? []),
    ...selectedSubrace?.languages?.choices.flatMap((choice) => choice.options.filter((option) => subraceLanguageSelections.includes(option))) ?? [],
    ...(selectedClassRules?.languages.fixed ?? []),
    ...classLanguageSelections.filter(Boolean),
    ...(selectedBackgroundRules?.languages ?? []),
    ...backgroundLanguageSelections.filter(Boolean),
  ])], [raceRules, form.race, raceLanguageSelections, selectedSubrace, subraceLanguageSelections, selectedClassRules, classLanguageSelections, selectedBackgroundRules, backgroundLanguageSelections]);

  const optionalChoiceGroups = useMemo(
    () => getOptionalChoiceGroups(
      selectedClassRules?.optionalFeatureProgression ?? [],
      subclassOptionalFeatureProgression[form.subclass] ?? [],
      form.level,
    ),
    [selectedClassRules, subclassOptionalFeatureProgression, form.subclass, form.level],
  );

  const allAsiLevels = getAbilityScoreImprovementLevelsUpTo(form.className, form.level, classRules);
  const newAsiLevels = getNewAbilityScoreImprovementLevels(character.className, character.level, form.level, classRules);
  const asiChoices = allAsiLevels.map((level) => asiHistory.find((entry) => entry.level === level)?.featId ?? "");

  useEffect(() => {
    const currentAsiLevels = getAbilityScoreImprovementLevelsUpTo(form.className, form.level, classRules);
    setAsiHistory((current) => {
      const next = currentAsiLevels.map((level) => current.find((entry) => entry.level === level) ?? {
        level,
        mode: level <= character.level ? "legacy" as const : "two" as const,
      });
      return next.filter((entry) => entry.level <= form.level);
    });
  }, [form.className, form.level, classRules]);

  function updateAsiHistory(level: number, entry: AsiHistoryEntry | undefined) {
    const previous = asiHistory.find((item) => item.level === level);
    const previousAbilityBonuses = getAsiAbilityBonuses(previous);
    const nextAbilityBonuses = getAsiAbilityBonuses(entry);
    const getFeatBonuses = (item?: AsiHistoryEntry) => {
      if (!item || item.mode !== "feat" || !item.featId) return {};
      const feat = featCatalogue.find((candidate) => candidate.id === item.featId);
      return feat ? getFeatAbilityBonuses(feat, item.featAbility) : {};
    };
    const previousFeatBonuses = getFeatBonuses(previous);
    const nextFeatBonuses = getFeatBonuses(entry);

    setAsiHistory((current) => {
      const without = current.filter((item) => item.level !== level);
      return entry ? [...without, { ...entry, level }].sort((a, b) => a.level - b.level) : without;
    });

    setBaseAbilities((current) => {
      const next = { ...current };
      for (const key of abilityKeys) {
        next[key] = Math.max(
          1,
          next[key]
            + (previousAbilityBonuses[key] ?? 0)
            - (nextAbilityBonuses[key] ?? 0)
            + (previousFeatBonuses[key] ?? 0)
            - (nextFeatBonuses[key] ?? 0),
        );
      }
      return next;
    });
  }

  const progressionAbilities = useMemo(() => {
    const next = applyAbilityBonuses(
      applyAbilityBonuses({ ...baseAbilities }, raceRules[form.race]?.abilityBonuses ?? {}),
      selectedSubrace?.abilityBonuses ?? {},
    );

    asiHistory.forEach((entry) => {
      if (entry.mode === "feat" && entry.featId) {
        const feat = featCatalogue.find((candidate) => candidate.id === entry.featId);
        if (feat) {
          const bonuses = getFeatAbilityBonuses(feat, entry.featAbility ?? featAbilityChoices[entry.featId]);
          (Object.keys(bonuses) as AbilityKey[]).forEach((key) => {
            next[key] = Math.min(20, next[key] + (bonuses[key] ?? 0));
          });
        }
      } else {
        const bonuses = getAsiAbilityBonuses(entry);
        (Object.keys(bonuses) as AbilityKey[]).forEach((key) => {
          next[key] = Math.min(20, next[key] + (bonuses[key] ?? 0));
        });
      }
    });

    return next;
  }, [baseAbilities, form.race, selectedSubrace, raceRules, asiHistory, featCatalogue, featAbilityChoices]);

  const expertiseLevels = useMemo(
    () => featureCatalogue
      .filter((feature) => feature.name.toLowerCase() === "expertise" && feature.className === form.className && feature.requiredLevel <= form.level)
      .sort((a, b) => a.requiredLevel - b.requiredLevel)
      .map((feature) => feature.requiredLevel),
    [featureCatalogue, form.className, form.level],
  );

  const initialExpertiseHistory = useMemo(() => {
    const parsed = parseExpertiseHistory(character.notes);
    if (parsed.length) return parsed;
    const legacyMatch = character.notes.match(/^Expertise:\s*(.+)$/m);
    const legacySkills = legacyMatch?.[1]?.split(",").map((value) => value.trim()).filter(Boolean) ?? [];
    return legacySkills.length && expertiseLevels.length
      ? expertiseLevels.map((level, index) => ({ level, skills: legacySkills.slice(index * 2, index * 2 + 2) })).filter((entry) => entry.skills.length)
      : [];
  }, [character.notes, expertiseLevels]);
  const [expertiseHistory, setExpertiseHistory] = useState<ExpertiseHistoryEntry[]>(initialExpertiseHistory);
  const expertiseSelections = expertiseHistory.flatMap((entry) => entry.skills);

  function updateExpertiseHistory(level: number, skills: string[]) {
    setExpertiseHistory((current) => {
      const filtered = current.filter((entry) => entry.level !== level);
      return skills.filter(Boolean).length ? [...filtered, { level, skills: [...new Set(skills.filter(Boolean))] }].sort((a, b) => a.level - b.level) : filtered;
    });
  }
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
    () => spellCatalogue.filter((spell) => isSpellNormallyAvailable(spellCharacter, spell, classRules)),
    [spellCatalogue, spellCharacter],
  );
  const magicalSecretSpellOptions = useMemo(() => {
    const maxLevel = getMaxSpellLevel(spellCharacter, classRules);
    return spellCatalogue.filter((spell) => spell.level <= maxLevel);
  }, [spellCatalogue, spellCharacter, classRules]);

  const cantripsKnown = getCantripsKnown(form.className, form.level, classRules);
  const spellsKnown = getSpellsKnown(form.className, form.level, classRules);
  const preparedSpellLimit = getPreparedSpellCount(spellCharacter, classRules);
  const spellbookLimit = getSpellbookProgression(form.className, form.level, classRules);
  const knownSpellLimit = spellbookLimit ?? spellsKnown ?? preparedSpellLimit;
  const magicalSecretCount = magicalSecretFeatures.length * 2;
  const normalSpellLimit = spellbookLimit ?? (knownSpellLimit === null ? null : Math.max(0, knownSpellLimit - magicalSecretCount));

  const effectiveSelectedSpells = selectedSpells.filter((entry) => !magicalSecretSelections.includes(entry.spellId));

  const inventoryRuleCharacter = useMemo(() => ({
    ...character,
    ...form,
    abilities: progressionAbilities,
    skills: selectedSkills,
    tools: selectedTools,
    languages: selectedLanguages,
    feats: asiChoices.filter(Boolean),
  }), [character, form, progressionAbilities, selectedSkills, selectedTools, selectedLanguages, asiChoices]);

  const availableInventoryItems = useMemo(
    () => getAvailableItems(inventoryRuleCharacter, true, itemCatalogue),
    [inventoryRuleCharacter, itemCatalogue],
  );

  const inventoryWeight = getInventoryWeight(inventoryRuleCharacter, itemCatalogue);
  const carryingCapacity = getCarryingCapacity(inventoryRuleCharacter);
  const overCarryingCapacity = inventoryWeight > carryingCapacity;

  const startingEquipmentGroups = [
    ...(selectedClassRules?.startingEquipment ?? []).map((group, index) => ({ ...group, id: `class-${index}`, heading: "Class equipment" })),
    ...(selectedBackgroundRules?.startingEquipment ?? []).map((group, index) => ({ ...group, id: `background-${index}`, heading: "Background equipment" })),
  ];

  const incompleteStartingEquipment = startingEquipmentGroups.some((group) => {
    if (group.options.length <= 1) return false;
    const optionIndex = startingEquipmentSelections[group.id];
    if (optionIndex === undefined) return true;
    const option = group.options[optionIndex];
    if (!option) return true;
    return option.items.some((entry, entryIndex) =>
      Boolean(entry.choiceType && !startingItemChoices[`${group.id}:${optionIndex}:${entryIndex}`]),
    );
  });

  function selectRace(race: string, subrace = "") {
    const subraceRules = catalogue.subraces.find((entry) => entry.name === subrace && entry.parentRace === race);
    const speed = subraceRules?.speed ?? raceRules[race]?.speed ?? 30;
    setForm((current) => ({ ...current, race, subrace, speed }));
    setRaceLanguageSelections([]);
    setAbilities(applyAbilityBonuses(applyAbilityBonuses(baseAbilities, raceRules[race]?.abilityBonuses ?? {}), subraceRules?.abilityBonuses ?? {}));
  }

  function setSubrace(value: string) {
    const subraceRules = catalogue.subraces.find((entry) => entry.name === value && entry.parentRace === form.race);
    const speed = subraceRules?.speed ?? raceRules[form.race]?.speed ?? 30;
    setForm((current) => ({ ...current, subrace: value, speed }));
    setAbilities(applyAbilityBonuses(applyAbilityBonuses(baseAbilities, raceRules[form.race]?.abilityBonuses ?? {}), subraceRules?.abilityBonuses ?? {}));
  }

  function equipmentChoiceOptions(choiceType: string) {
    const type = choiceType.toLowerCase();
    const mundaneItems = itemCatalogue.filter((item) => {
      const rarity = (item.rarity || "").trim().toLowerCase();
      const category = (item.category || "").trim().toLowerCase();
      return (rarity === "" || rarity === "common" || rarity === "none" || rarity === "mundane")
        && !category.includes("magic")
        && !item.requiresAttunement
        && item.magicBonus == null
        && item.bonusAc == null
        && !/\b(?:wand|rod|staff|potion|scroll|ring|cloak|amulet|medal|orb)\b/i.test(item.name);
    });
    return mundaneItems.filter((item) => {
      if (type === "weaponmartial") return Boolean(item.isWeapon && item.weaponCategory?.toLowerCase().includes("martial"));
      if (type === "weaponsimple") return Boolean(item.isWeapon && item.weaponCategory?.toLowerCase().includes("simple"));
      if (type === "armorlight") return Boolean(item.isArmor && item.armorCategory?.toLowerCase().includes("light"));
      if (type === "armormedium") return Boolean(item.isArmor && item.armorCategory?.toLowerCase().includes("medium"));
      if (type === "armorheavy") return Boolean(item.isArmor && item.armorCategory?.toLowerCase().includes("heavy"));
      if (type === "instrumentmusical") return item.name.toLowerCase().includes("instrument");
      if (type === "focusspellcastingarcane") return ["arcane focus", "component pouch"].includes(item.name.toLowerCase());
      if (type === "focusspellcastingdruidic") return ["druidic focus"].includes(item.name.toLowerCase());
      if (type === "focusspellcastingholy") return ["holy symbol"].includes(item.name.toLowerCase());
      if (type.includes("focusspellcasting")) return item.name.toLowerCase().includes("focus") || item.name.toLowerCase().includes("symbol") || item.name.toLowerCase().includes("component pouch");
      return item.category.toLowerCase() === "equipment";
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
        const chosen = entry.choiceType ? equipmentChoiceOptions(entry.choiceType).find((item) => item.id === choiceId) : undefined;
        if (entry.choiceType && !chosen) return [];
        if (entry.special) return [];
        const item = chosen ?? itemCatalogue.filter((candidate) => {
          const rarity = (candidate.rarity || "").trim().toLowerCase();
          const category = (candidate.category || "").trim().toLowerCase();
          return (rarity === "" || rarity === "common" || rarity === "none" || rarity === "mundane")
            && !category.includes("magic")
            && !candidate.requiresAttunement
            && candidate.magicBonus == null
            && candidate.bonusAc == null
            && !/\b(?:wand|rod|staff|potion|scroll|ring|cloak|amulet|medal|orb)\b/i.test(candidate.name);
        }).find((candidate) => {
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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveError("");

    const incompleteAsi = allAsiLevels.some((level) => {
      const entry = asiHistory.find((item) => item.level === level);
      if (!entry || !entry.mode) return true;
      if (entry.mode === "feat") {
        if (!entry.featId) return true;
        const feat = featCatalogue.find((candidate) => candidate.id === entry.featId);
        const options = feat ? getFeatAbilityOptions(feat) : [];
        return options.length > 1 && !entry.featAbility && !featAbilityChoices[entry.featId];
      }
      return !entry.first || (entry.mode === "one" && (!entry.second || entry.second === entry.first));
    });

    if (incompleteAsi) {
      setStep("abilities");
      setSaveError("Please complete every Ability Score Improvement before saving. Existing ASIs must also be recorded so the character's ability-score history is unambiguous.");
      return;
    }

    const asiErrors = validateAsiHistory(asiHistory, form.className, form.level, featCatalogue, classRules);
    if (asiErrors.length) {
      setStep("abilities");
      setSaveError(asiErrors[0]);
      return;
    }

    const expertiseErrors = validateExpertiseHistory(expertiseHistory, expertiseLevels, selectedSkills);
    if (expertiseErrors.length) {
      setStep("class");
      setSaveError(expertiseErrors[0]);
      return;
    }

    const magicalSecretsErrors = validateMagicalSecretsHistory(
      magicalSecretHistory,
      magicalSecretFeatures.map((feature) => feature.requiredLevel),
      spellCatalogue,
      spellCharacter,
      classRules,
    );
    if (magicalSecretsErrors.length) {
      setStep("class");
      setSaveError(magicalSecretsErrors[0]);
      return;
    }

    if (equipmentMode === "equipment" && incompleteStartingEquipment) {
      setStep("equipment");
      setSaveError("Please choose a starting-equipment option and complete every equipment choice before saving.");
      return;
    }

    setSaving(true);
    try {
      await onSave({
        ...form,
        skills: selectedSkills,
        tools: selectedTools,
        languages: selectedLanguages,
        inventory: equipmentMode === "equipment" ? equipmentSelections : [],
        currency,
        abilities: progressionAbilities,
        feats: asiChoices.filter(Boolean),
        spells: [
          ...effectiveSelectedSpells.map((entry) => ({ ...entry, source: entry.source === "dm" ? "dm" as const : "normal" as const })),
          ...magicalSecretSelections
            .filter(Boolean)
            .map((spellId) => ({ spellId, prepared: true, source: "magical-secrets" as const })),
        ],
        optionalFeatures,
        notes: [
          form.notes,
          expertiseSelections.filter(Boolean).length ? "Expertise: " + expertiseSelections.filter(Boolean).join(", ") : "",
          expertiseHistory.length ? "Expertise History: " + JSON.stringify(expertiseHistory) : "",
          magicalSecretHistory.length ? "Magical Secrets History: " + JSON.stringify(magicalSecretHistory) : "",
          asiHistory.length ? "ASI History: " + JSON.stringify(asiHistory) : "",
          Object.keys(featAbilityChoices).length ? "Feat Ability Choices: " + JSON.stringify(featAbilityChoices) : "",
        ].filter(Boolean).join("\n\n"),
      });
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error ?? "Could not save this character."));
    } finally {
      setSaving(false);
    }
  }

  const canAdvanceFromStep = (currentStep: BuilderStep) => {
    if (currentStep === "class") return Boolean(form.className);
    if (currentStep === "abilities") {
      return allAsiLevels.every((level) => {
        const entry = asiHistory.find((item) => item.level === level);
        if (!entry) return false;
        if (entry.mode === "feat") {
          if (!entry.featId) return false;
          const feat = featCatalogue.find((candidate) => candidate.id === entry.featId);
          const options = feat ? getFeatAbilityOptions(feat) : [];
          return !options.length || Boolean(entry.featAbility || featAbilityChoices[entry.featId]);
        }
        return Boolean(entry.first) && (entry.mode !== "one" || Boolean(entry.second && entry.second !== entry.first));
      });
    }
    if (currentStep === "background") {
      const choices = selectedBackgroundRules;
      return Boolean(form.background) &&
        (!choices || choices.skillChoices.reduce((total, choice) => total + choice.count, 0) === backgroundSkillSelections.filter(Boolean).length) &&
        (!choices || choices.toolChoices.reduce((total, choice) => total + choice.count, 0) === backgroundToolSelections.filter(Boolean).length) &&
        (!choices || choices.languageChoices.reduce((total, choice) => total + choice.count, 0) === backgroundLanguageSelections.filter(Boolean).length);
    }
    if (currentStep === "equipment") {
      if (equipmentMode === "gold") return true;
      return !incompleteStartingEquipment;
    }
    if (currentStep === "species") {
      if (!form.race) return false;
      const hasSubraces = catalogue.subraces.some((entry) => entry.parentRace === form.race);
      if (hasSubraces && !form.subrace) return false;
      const subrace = catalogue.subraces.find((entry) => entry.name === form.subrace && entry.parentRace === form.race);
      const skillSlots = subrace?.skills?.choices.reduce((total, choice) => total + choice.count, 0) ?? 0;
      const toolSlots = subrace?.tools?.choices.reduce((total, choice) => total + choice.count, 0) ?? 0;
      const languageSlots = subrace?.languages?.choices.reduce((total, choice) => total + choice.count, 0) ?? 0;
      return subraceSkillSelections.filter(Boolean).length === skillSlots
        && subraceToolSelections.filter(Boolean).length === toolSlots
        && subraceLanguageSelections.filter(Boolean).length === languageSlots;
    }
    return true;
  };

  return (
    <div className="min-h-[calc(100vh-120px)] bg-stone-950">
      <BuilderStepNav step={step} onStepChange={setStep} canAdvance={canAdvanceFromStep(step)} />

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
                    setStartingEquipmentSelections((current) => {
                      const nextSelections = { ...current };
                      Object.keys(nextSelections).filter((key) => key.startsWith("class-")).forEach((key) => delete nextSelections[key]);
                      return nextSelections;
                    });
                    setEquipmentSelections((current) => current.filter((entry) => !entry.notes?.startsWith("starting:class-")));
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
                  spellLimit={normalSpellLimit} spellbook={spellbookLimit !== null}
                  selectedSpells={effectiveSelectedSpells}
                  onChange={setSelectedSpells}
                />
              )}
              {expertiseLevels.length > 0 && (
                <ExpertiseSelectionSection levels={expertiseLevels} history={expertiseHistory} onChange={updateExpertiseHistory} skills={selectedSkills} />
              )}
              {magicalSecretFeatures.length > 0 && (
                <MagicalSecretsSection
                  features={magicalSecretFeatures}
                  spells={magicalSecretSpellOptions}
                  history={magicalSecretHistory}
                  onChange={updateMagicalSecretHistory}
                />
              )}
              {allAsiLevels.length > 0 && (
                <AsiSelectionSection
                  levels={allAsiLevels}
                  characterLevel={character.level}
                  asiHistory={asiHistory}
                  onAsiChange={updateAsiHistory}
                  featCatalogue={featCatalogue}
                  character={spellCharacter}
                  featAbilityChoices={featAbilityChoices}
                  onFeatAbilityChoiceChange={(featId, ability) => {
                    setFeatAbilityChoices((current) => ({ ...current, [featId]: ability }));
                    const entry = asiHistory.find((item) => item.featId === featId);
                    if (entry) updateAsiHistory(entry.level, { ...entry, featAbility: ability });
                  }}
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
                  setStartingEquipmentSelections((current) => {
                    const nextSelections = { ...current };
                    Object.keys(nextSelections).filter((key) => key.startsWith("background-")).forEach((key) => delete nextSelections[key]);
                    return nextSelections;
                  });
                  setEquipmentSelections((current) => current.filter((entry) => !entry.notes?.startsWith("starting:background-")));
                }} />
                {selectedBackgroundRules?.description && <p className="mt-5 whitespace-pre-line text-sm leading-7 text-stone-400">{selectedBackgroundRules.description}</p>}
              </SectionCard>
              {selectedBackgroundRules && <SectionCard title="Background benefits">
                {selectedBackgroundRules.skills.length > 0 && <p className="text-sm text-stone-300"><b>Fixed skills:</b> {selectedBackgroundRules.skills.join(", ")}</p>}
                <ChoiceGroup title="Choose skills" choices={selectedBackgroundRules.skillChoices} value={backgroundSkillSelections} onChange={setBackgroundSkillSelections} exclude={[...(selectedClassRules?.skills.fixed ?? []), ...classSkillSelections]} />
                {selectedBackgroundRules.tools.length > 0 && <p className="mt-4 text-sm text-stone-300"><b>Fixed tools:</b> {selectedBackgroundRules.tools.join(", ")}</p>}
                <ChoiceGroup title="Choose tools" choices={selectedBackgroundRules.toolChoices} value={backgroundToolSelections} onChange={setBackgroundToolSelections} />
                {selectedBackgroundRules.languages.length > 0 && <p className="mt-4 text-sm text-stone-300"><b>Fixed languages:</b> {selectedBackgroundRules.languages.join(", ")}</p>}
                <ChoiceGroup title="Choose languages" choices={selectedBackgroundRules.languageChoices} value={backgroundLanguageSelections} onChange={setBackgroundLanguageSelections} />
                {selectedBackgroundRules.featureName && <div className="mt-5 rounded-2xl border border-amber-900/50 bg-amber-950/20 p-5"><div className="text-xs font-semibold uppercase tracking-wider text-amber-500">Background Feature</div><h3 className="mt-1 text-lg font-semibold text-amber-300">{selectedBackgroundRules.featureName}</h3><p className="mt-3 whitespace-pre-line text-sm leading-7 text-stone-300">{selectedBackgroundRules.featureDescription}</p></div>}
              </SectionCard>}
              {selectedBackgroundRules && <SectionCard title="Background traits">
                <div className="space-y-3">
                  {featureCatalogue.filter((feature) => feature.sourceType === "background" && feature.backgroundName === form.background && feature.requiredLevel <= form.level).map((feature) => (
                    <article key={feature.id} className="rounded-xl border border-stone-800 bg-stone-950/60 p-4">
                      <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{feature.name}</h3><Badge>Background Feature</Badge></div>
                      <p className="mt-2 whitespace-pre-line text-sm leading-6 text-stone-400">{feature.description}</p>
                    </article>
                  ))}
                </div>
              </SectionCard>}
            </>
          )}

          {step === "species" && (
            <>
              <SectionCard title="Species" description="Change the race or subrace and review the associated traits.">
                <RacePicker races={catalogue.races.map((name) => ({ name, source: raceRules[name]?.source ?? "", description: raceRules[name]?.description ?? "" }))} subraces={catalogue.subraces} selectedRace={form.race} selectedSubrace={form.subrace} onSelect={selectRace} />
              </SectionCard>
              {raceRules[form.race] && <InfoBox title={form.race} badge={raceRules[form.race].source} text={raceRules[form.race].description || "No species description is available."} />}
              {selectedSubrace && <InfoBox title={selectedSubrace.name} badge={selectedSubrace.source} text={selectedSubrace.description || "No subrace description is available."} />}
              <SectionCard title="Species traits">
                <div className="space-y-3">
                  {featureCatalogue.filter((feature) => feature.sourceType === "race" && feature.raceName === form.race && feature.requiredLevel <= form.level).map((feature) => (
                    <article key={feature.id} className="rounded-xl border border-stone-800 bg-stone-950/60 p-4">
                      <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{feature.name}</h3><Badge>Species Trait</Badge></div>
                      <p className="mt-2 whitespace-pre-line text-sm leading-6 text-stone-400">{feature.description}</p>
                    </article>
                  ))}
                  {selectedSubrace?.description && <p className="text-sm leading-6 text-stone-400">{selectedSubrace.description}</p>}
                </div>
                <ChoiceGroup title="Choose species languages" choices={raceRules[form.race]?.languages.choices ?? []} value={raceLanguageSelections} onChange={setRaceLanguageSelections} />
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <ProficiencySummary title="Languages" values={selectedLanguages} />
                  <ProficiencySummary title="Ability bonuses" values={Object.entries(selectedSubrace?.abilityBonuses ?? raceRules[form.race]?.abilityBonuses ?? {}).map(([key, value]) => key.toUpperCase() + " " + (value >= 0 ? "+" : "") + value)} />
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
                  {startingEquipmentGroups.map((group) => (
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
                <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${overCarryingCapacity ? "border-red-900/70 bg-red-950/20 text-red-300" : "border-stone-800 bg-stone-950/60 text-stone-400"}`}>
                  Carrying weight: <span className="font-semibold text-stone-200">{inventoryWeight.toFixed(1)} lb</span> / {carryingCapacity} lb
                  {overCarryingCapacity && <span className="ml-2 font-semibold">Over carrying capacity</span>}
                </div>
                <div className="space-y-2">
                  {equipmentSelections.length === 0 ? <p className="text-sm text-stone-500">Nothing carried.</p> : equipmentSelections.map((entry) => {
                    const item = itemCatalogue.find((candidate) => candidate.id === entry.itemId);
                    return item ? <div key={entry.itemId} className="flex flex-col gap-3 rounded-xl border border-stone-800 bg-stone-950/60 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div><div className="font-semibold">{item.name}</div><div className="text-xs text-stone-500">{item.category}</div></div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button type="button" onClick={() => setEquipmentSelections((current) => current.map((candidate) => candidate.itemId === entry.itemId ? { ...candidate, quantity: Math.max(1, candidate.quantity - 1) } : candidate))} className="rounded-lg border border-stone-700 px-2 py-1">−</button>
                        <span className="w-8 text-center text-sm">{entry.quantity}</span>
                        <button type="button" onClick={() => setEquipmentSelections((current) => current.map((candidate) => candidate.itemId === entry.itemId ? { ...candidate, quantity: candidate.quantity + 1 } : candidate))} className="rounded-lg border border-stone-700 px-2 py-1">+</button>
                        <label className={`flex items-center gap-2 text-sm ${item.isWeapon || item.isArmor || item.isShield ? "text-stone-300" : "text-stone-600"}`}><input type="checkbox" checked={entry.equipped} disabled={!(item.isWeapon || item.isArmor || item.isShield) && !entry.equipped} onChange={(event) => setEquipmentSelections((current) => current.map((candidate) => candidate.itemId === entry.itemId ? { ...candidate, equipped: event.target.checked } : candidate))} /> Equip</label>
                        <button type="button" onClick={() => setEquipmentSelections((current) => current.filter((candidate) => candidate.itemId !== entry.itemId))} className="rounded-lg border border-red-900/60 px-2 py-1 text-red-400">Remove</button>
                      </div>
                    </div> : null;
                  })}
                </div>
              </SectionCard>}

              <SectionCard title="Add Items" description="Search normally available equipment. Restricted or DM-granted items remain in existing inventories but are not offered as normal additions.">
                <div className="mb-4 flex gap-3"><input value={equipmentSearch} onChange={(event) => setEquipmentSearch(event.target.value)} placeholder="Search equipment..." className="flex-1 rounded-xl border border-stone-700 bg-stone-950 px-4 py-2.5 text-sm text-stone-100 outline-none focus:border-amber-400" /><Badge>{itemCatalogue.length} items</Badge></div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {availableInventoryItems.filter((item) => `${item.name} ${item.category}`.toLowerCase().includes(equipmentSearch.toLowerCase())).slice(0, 40).map((item) => <div key={item.id} className="flex items-center justify-between rounded-xl border border-stone-800 bg-stone-950/60 p-3"><div><div className="font-medium">{item.name}</div><div className="text-xs text-stone-600">{item.category}</div></div><button type="button" onClick={() => setEquipmentSelections((current) => current.some((entry) => entry.itemId === item.id) ? current : [...current, { itemId: item.id, quantity: 1, equipped: false }])} className="rounded-lg border border-stone-700 px-3 py-1.5 text-sm">Add</button></div>)}
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
                  {newAsiLevels.length > 0 && <div className="rounded-xl border border-amber-900/60 bg-amber-950/20 p-4"><h3 className="font-semibold text-amber-300">Ability Score Improvement / Feat</h3><p className="mt-2 text-sm text-stone-400">New ASI levels reached: {newAsiLevels.join(", ")}. Complete them in the Ability Score Improvements section.</p></div>}
                </div>
              </SectionCard>



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

          {saveError && <div className="rounded-2xl border border-red-900/70 bg-red-950/30 px-4 py-3 text-sm text-red-300">{saveError}</div>}
          <BuilderFooter step={step} onStepChange={setStep} canAdvance={canAdvanceFromStep(step)} saving={saving} />
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

function BuilderStepNav({ step, onStepChange, canAdvance }: { step: BuilderStep; onStepChange: (step: BuilderStep) => void; canAdvance: boolean }) {
  const currentIndex = BUILDER_STEPS.indexOf(step);
  return <div className="border-b border-stone-800 bg-stone-950/95"><div className="mx-auto max-w-5xl overflow-x-auto px-4 sm:px-6 lg:px-8"><nav className="flex min-w-max items-stretch gap-1">{BUILDER_STEPS.map((entry, entryIndex) => {
    const active = entry === step;
    const reachable = entryIndex <= currentIndex || (entryIndex === currentIndex + 1 && canAdvance);
    return <button key={entry} type="button" disabled={!reachable} onClick={() => reachable && onStepChange(entry)} className={`relative px-4 py-4 text-left ${active ? "text-stone-100" : "text-stone-500 hover:text-stone-300"} disabled:cursor-not-allowed disabled:opacity-30`}>
      <span className="mr-2 text-[10px] font-bold text-stone-600">{STEP_META[entry].number}.</span>
      <span className="text-xs font-semibold uppercase tracking-wider">{STEP_META[entry].title}</span>
      {active && <span className="absolute inset-x-2 bottom-0 h-0.5 bg-amber-400" />}
    </button>;
  })}</nav></div></div>;
}
function BuilderFooter({ step, onStepChange, canAdvance, saving }: { step: BuilderStep; onStepChange: (step: BuilderStep) => void; canAdvance: boolean; saving: boolean }) {
  const index = BUILDER_STEPS.indexOf(step);
  const previous = index > 0 ? BUILDER_STEPS[index - 1] : null;
  const next = index < BUILDER_STEPS.length - 1 ? BUILDER_STEPS[index + 1] : null;
  return <div className="sticky bottom-0 z-20 -mx-4 mt-8 border-t border-stone-800 bg-stone-950/95 px-4 py-4 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"><div className="mx-auto flex max-w-5xl items-center justify-between gap-3"><button type="button" disabled={!previous} onClick={() => previous && onStepChange(previous)} className="rounded-xl border border-stone-700 px-5 py-2.5 text-sm font-semibold text-stone-300 hover:bg-stone-900 disabled:opacity-30">Back</button><div className="text-xs text-stone-600">{index + 1} / {BUILDER_STEPS.length}</div>{next ? <button type="button" disabled={!canAdvance} onClick={() => canAdvance && onStepChange(next)} className="rounded-xl bg-stone-100 px-5 py-2.5 text-sm font-semibold text-stone-950 hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-30">Next: {STEP_META[next].title}</button> : <button type="submit" disabled={saving} className="rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-semibold text-stone-950 hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Saving..." : "Save Character"}</button>}</div></div>;
}
function getEquipmentPackDescription(label: string) {
  const normalized = label.toLowerCase();
  if (normalized.includes("dungeoneer")) return "Contains a backpack, crowbar, hammer, 10 pitons, 10 torches, tinderbox, 10 days of rations, a waterskin and 50 feet of hempen rope.";
  if (normalized.includes("explorer")) return "Contains a backpack, bedroll, mess kit, tinderbox, 10 torches, 10 days of rations, a waterskin and 50 feet of hempen rope.";
  return "";
}

function RacePicker({ races, subraces, selectedRace, selectedSubrace, onSelect }: {
  races: Array<{ name: string; source: string; description: string }>;
  subraces: Array<{ name: string; parentRace: string }>;
  selectedRace: string;
  selectedSubrace: string;
  onSelect: (race: string, subrace?: string) => void;
}) {
  const [expanded, setExpanded] = useState(selectedRace);
  const sourceOrder = ["PHB", ...Array.from(new Set(races.map((race) => race.source || "Other").filter((source) => source !== "PHB"))).sort((a, b) => a.localeCompare(b))];
  const grouped = sourceOrder.map((source) => ({
    source,
    races: races.filter((race) => (race.source || "Other") === source).sort((a, b) => a.name.localeCompare(b.name)),
  })).filter((group) => group.races.length > 0);

  return <div>
    <div className="text-xs font-semibold uppercase tracking-wider text-stone-500">Race</div>
    <div className="mt-3 space-y-6">
      {grouped.map((group) => (
        <section key={group.source}>
          <div className="mb-2 flex items-center gap-3">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-amber-300">{group.source}</h3>
            <div className="h-px flex-1 bg-stone-800" />
          </div>
          <div className="space-y-2">
            {group.races.map((race) => {
              const children = subraces.filter((entry) => entry.parentRace === race.name).sort((a, b) => a.name.localeCompare(b.name));
              const open = expanded === race.name;
              const selected = selectedRace === race.name;
              const buttonClass = "flex w-full items-center justify-between px-4 py-3 text-left " + (selected && !selectedSubrace ? "bg-stone-800 text-stone-100" : selected ? "bg-stone-900 text-stone-200" : "text-stone-300");
              return <div key={race.name} className="rounded-xl border border-stone-800 bg-stone-950/60 overflow-hidden">
                <button type="button" onClick={() => { setExpanded(open ? "" : race.name); onSelect(race.name); }} className={buttonClass}>
                  <span className="font-semibold">{race.name}</span>
                  {children.length > 0 && <span className="text-xs text-stone-500">{children.length} subrace{children.length === 1 ? "" : "s"} {open ? "▴" : "▾"}</span>}
                </button>
                {open && selected && <div className="border-t border-stone-800 bg-stone-950/40 px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-amber-500">{race.source || "Species"}</div>
                  <p className="mt-2 whitespace-pre-line text-sm leading-6 text-stone-400">{race.description || "No species description is available."}</p>
                </div>}
                {open && children.length > 0 && <div className="border-t border-stone-800 p-2">
                  {children.map((entry) => <button key={entry.name} type="button" onClick={() => { setExpanded(race.name); onSelect(race.name, entry.name); }} className={"block w-full rounded-lg px-4 py-2 text-left text-sm " + (selectedSubrace === entry.name && selectedRace === race.name ? "bg-amber-500/10 text-amber-300" : "text-stone-400 hover:bg-stone-900 hover:text-stone-200")}>{entry.name}</button>)}
                </div>}
              </div>;
            })}
          </div>
        </section>
      ))}
    </div>
  </div>;
}
function ChoiceGroup({ title, choices, value, onChange, exclude = [] }: { title: string; choices: Array<{ count: number; options: string[] }>; value: string[]; onChange: (value: string[]) => void; exclude?: string[] }) {
  if (!choices.length) return null;
  let offset = 0;
  const totalChoices = choices.reduce((sum, choice) => sum + choice.count, 0);
  return <div className="mt-4 space-y-3">
    <h4 className="text-sm font-semibold text-stone-200">{title}{totalChoices > 0 ? ` (${totalChoices})` : ""}</h4>
    {choices.flatMap((choice) => Array.from({ length: choice.count }, () => {
      const slot = offset++;
      const options = choice.options.filter((option) => (!exclude.includes(option) || value[slot] === option) && !value.some((selected, index) => index !== slot && selected === option));
      return <select key={`${title}-${slot}`} value={value[slot] ?? ""} onChange={(event) => { const next = [...value]; next[slot] = event.target.value; onChange(next); }} className="w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-sm text-stone-100"><option value="">Choose an option...</option>{options.map((option) => <option key={option}>{option}</option>)}</select>;
    }))}
  </div>;
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
function AsiSelectionSection({
  levels,
  characterLevel,
  asiHistory,
  onAsiChange,
  featCatalogue,
  character,
  featAbilityChoices,
  onFeatAbilityChoiceChange,
}: {
  levels: number[];
  characterLevel: number;
  asiHistory: AsiHistoryEntry[];
  onAsiChange: (level: number, entry: AsiHistoryEntry | undefined) => void;
  featCatalogue: Array<{ id: string; name: string; description: string; source: string; prerequisite?: unknown; ability?: unknown }>;
  character: Character;
  featAbilityChoices: Record<string, AbilityKey>;
  onFeatAbilityChoiceChange: (featId: string, ability: AbilityKey) => void;
}) {
  const abilityNames: Array<[AbilityKey, string]> = [["str","Strength"],["dex","Dexterity"],["con","Constitution"],["int","Intelligence"],["wis","Wisdom"],["cha","Charisma"]];
  const recordedFeatIds = asiHistory.filter((entry) => entry.mode === "feat" && entry.featId).map((entry) => entry.featId as string);

  return <SectionCard
    title="Ability Score Improvements"
    description="Every ASI is recorded by level so existing choices can be edited safely and future level-ups are applied without double-counting bonuses."
  >
    <div className="mb-5 rounded-xl border border-amber-900/50 bg-amber-950/20 p-4 text-sm leading-6 text-stone-300">
      <span className="font-semibold text-amber-300">Legacy character?</span> If this character was created before ASI history was added, record each previous ASI below. This is necessary because the old character data stored the resulting ability scores, but not which ASI produced them.
      {character.feats.length > 0 && (
        <div className="mt-2 text-stone-400">
          Existing feat records available to assign: {character.feats.map((featId) => featCatalogue.find((feat) => feat.id === featId)?.name ?? featId).join(", ")}
        </div>
      )}
    </div>

    <div className="space-y-5">
      {levels.map((level) => {
        const entry = asiHistory.find((item) => item.level === level);
        const mode = entry?.mode ?? "two";
        const selectedFeatId = entry?.featId ?? "";
        const feat = featCatalogue.find((candidate) => candidate.id === selectedFeatId);
        const first = entry?.first ?? "";
        const second = entry?.second ?? "";

        const availableFeats = featCatalogue.filter((candidate) => {
          if (recordedFeatIds.includes(candidate.id) && candidate.id !== selectedFeatId) return false;
          if (character.feats.includes(candidate.id)) return true;
          return isFeatAvailable(character, candidate as typeof candidate & { prerequisite?: unknown; ability?: unknown });
        });

        return <div key={level} className="rounded-2xl border border-stone-800 bg-stone-950/60 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">Level {level}</h3>
            <Badge>{level <= characterLevel ? "Existing ASI" : "New ASI"}</Badge>
            {(mode === "legacy" || (!entry?.first && mode !== "feat")) && <Badge tone="warn">Needs recording</Badge>}
          </div>

          <select
            value={mode}
            onChange={(event) => {
              const nextMode = event.target.value as "two" | "one" | "feat" | "legacy";
              onAsiChange(level, {
                level,
                mode: nextMode,
                first: nextMode === "feat" ? undefined : entry?.first,
                second: nextMode === "one" ? entry?.second : undefined,
                featId: nextMode === "feat" ? entry?.featId : undefined,
                featAbility: nextMode === "feat" ? entry?.featAbility : undefined,
              });
            }}
            className="mt-3 w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-sm"
          >
            <option value="legacy">Record previous choice...</option>
            <option value="two">+2 to one ability score</option>
            <option value="one">+1 to two different ability scores</option>
            <option value="feat">Choose a feat</option>
          </select>

          {mode === "feat" ? (
            <>
              <select
                value={selectedFeatId}
                onChange={(event) => onAsiChange(level, {
                  level,
                  mode: "feat",
                  featId: event.target.value || undefined,
                  featAbility: event.target.value === selectedFeatId ? entry?.featAbility : undefined,
                })}
                className="mt-3 w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-sm"
              >
                <option value="">Choose a feat...</option>
                {availableFeats.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
              </select>

              {feat && (
                <article className="mt-4 rounded-xl border border-amber-900/60 bg-amber-950/20 p-4">
                  <div className="flex items-center gap-2"><h3 className="font-semibold text-amber-300">{feat.name}</h3>{feat.source && <Badge>{feat.source}</Badge>}</div>
                  <p className="mt-2 whitespace-pre-line text-sm leading-6 text-stone-300">{feat.description}</p>
                  {(() => {
                    const options = getFeatAbilityOptions(feat as Parameters<typeof getFeatAbilityOptions>[0]);
                    if (!options.length) return null;
                    const grouped = [...new Map(options.map((option) => [option.ability, option])).values()];
                    const selectedAbility = entry?.featAbility ?? featAbilityChoices[feat.id];
                    return (
                      <div className="mt-4 rounded-xl border border-stone-700 bg-stone-950/60 p-3">
                        <div className="text-xs font-semibold uppercase tracking-wider text-stone-400">Ability Score Effect</div>
                        {grouped.length > 1 ? (
                          <select
                            value={selectedAbility ?? ""}
                            onChange={(event) => onFeatAbilityChoiceChange(feat.id, event.target.value as AbilityKey)}
                            className="mt-2 w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-sm"
                          >
                            <option value="">Choose an ability...</option>
                            {grouped.map((option) => <option key={option.ability} value={option.ability}>+{option.amount} {option.ability.toUpperCase()}</option>)}
                          </select>
                        ) : <p className="mt-2 text-sm text-amber-300">+{grouped[0].amount} {grouped[0].ability.toUpperCase()}</p>}
                      </div>
                    );
                  })()}
                </article>
              )}
            </>
          ) : (
            <div className="mt-3">
              {mode === "legacy" && (
                <p className="mb-3 rounded-xl border border-stone-700 bg-stone-950/70 p-3 text-sm leading-6 text-stone-400">
                  This ASI predates stored history. The character's current score already includes this ASI, so record the original allocation first. After that, changing it will safely replace the old bonus.
                </p>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
              <select
                value={first}
                onChange={(event) => onAsiChange(level, {
                  level,
                  mode,
                  first: event.target.value ? event.target.value as AbilityKey : undefined,
                  second: mode === "one" ? entry?.second : undefined,
                })}
                className="rounded-xl border border-stone-700 bg-stone-950/60 px-3 py-2.5 text-sm"
              >
                <option value="">Choose an ability...</option>
                {abilityNames.map(([key, name]) => <option key={key} value={key}>{name}</option>)}
              </select>
              {mode === "one" && <select
                value={second}
                onChange={(event) => onAsiChange(level, {
                  level,
                  mode: "one",
                  first: entry?.first,
                  second: event.target.value ? event.target.value as AbilityKey : undefined,
                })}
                className="rounded-xl border border-stone-700 bg-stone-950/60 px-3 py-2.5 text-sm"
              >
                <option value="">Choose an ability...</option>
                {abilityNames.filter(([key]) => key !== entry?.first).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
              </select>}
              </div>
            </div>
          )}
        </div>;
      })}
    </div>
  </SectionCard>;
}

function ExpertiseSelectionSection({ levels, history, onChange, skills }: { levels: number[]; history: ExpertiseHistoryEntry[]; onChange: (level: number, skills: string[]) => void; skills: string[] }) {
  const selected = history.flatMap((entry) => entry.skills);
  return <SectionCard title="Expertise" description="Choose the skill proficiencies that gain Expertise. Each Expertise level is stored separately so changes do not shift or overwrite another level.">
    <div className="space-y-4">
      {levels.map((level) => {
        const values = history.find((entry) => entry.level === level)?.skills ?? [];
        return <div key={level} className="rounded-xl border border-stone-800 p-4">
          <div className="mb-3 font-semibold">Level {level} Expertise</div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[0, 1].map((slot) => <select key={slot} value={values[slot] ?? ""} onChange={(event) => {
              const next = [...values];
              if (event.target.value) next[slot] = event.target.value;
              else next.splice(slot, 1);
              onChange(level, next);
            }} className="rounded-xl border border-stone-700 bg-stone-950/60 px-3 py-2.5 text-sm">
              <option value="">Choose a skill...</option>
              {skills.filter((skill) => !selected.includes(skill) || values.includes(skill)).map((skill) => <option key={skill}>{skill}</option>)}
            </select>)}
          </div>
        </div>;
      })}
    </div>
  </SectionCard>;
}

function MagicalSecretsSection({ features, spells, history, onChange }: { features: Array<{ id: string; name: string; requiredLevel: number }>; spells: Array<{ id: string; name: string; level: number; description: string }>; history: MagicalSecretsHistoryEntry[]; onChange: (level: number, spellIds: string[]) => void }) {
  const selected = history.flatMap((entry) => entry.spellIds);
  return <SectionCard title="Magical Secrets" description="Choose two spells for each Magical Secrets feature. Each choice is stored against the level that granted it, so later changes do not shift earlier selections.">
    <div className="space-y-4">
      {features.map((feature) => {
        const values = history.find((entry) => entry.level === feature.requiredLevel)?.spellIds ?? [];
        return <div key={feature.id} className="rounded-xl border border-stone-800 p-4">
          <div className="mb-3 font-semibold">Level {feature.requiredLevel} · {feature.name}</div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[0, 1].map((slot) => <select key={slot} value={values[slot] ?? ""} onChange={(event) => {
              const next = [...values];
              if (event.target.value) next[slot] = event.target.value;
              else next.splice(slot, 1);
              onChange(feature.requiredLevel, next);
            }} className="rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-sm">
              <option value="">Choose a spell...</option>
              {spells.filter((spell) => !selected.includes(spell.id) || values.includes(spell.id)).map((spell) => <option key={spell.id} value={spell.id}>{spell.name} (Level {spell.level})</option>)}
            </select>)}
          </div>
          <div className="mt-3 space-y-2">
            {values.map((spellId) => {
              const spell = spells.find((candidate) => candidate.id === spellId);
              return spell ? <article key={spellId} className="rounded-xl border border-stone-800 bg-stone-950/50 p-3"><div className="font-medium">{spell.name}</div><p className="mt-1 text-xs leading-5 text-stone-500">{spell.description}</p></article> : null;
            })}
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
  return <SectionCard title="Spells" description={spellbook ? "Edit the spells in the character's spellbook." : "Edit the character's known or prepared spells."}>
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
