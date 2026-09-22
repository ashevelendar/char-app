import { classDefinitions, features, items, races, spells, subclasses } from "./data";
import type { Character, ClassRuleData, ContentType, Feat, Feature, Item, Spell } from "./types";

type RuleClassCatalogue = Record<string, ClassRuleData>;

function getDynamicClassRule(className: string, classCatalogue?: RuleClassCatalogue) {
  return classCatalogue?.[className];
}

function spellcastingModeFromRule(rule?: ClassRuleData) {
  if (!rule) return undefined;
  if (rule.casterProgression === "none") return "none" as const;
  if (rule.preparedSpells) return "prepared" as const;
  if (rule.spellsKnownProgression?.length || rule.casterProgression === "pact") return "known" as const;
  if (rule.casterProgression) return "prepared" as const;
  return undefined;
}

function maxSpellLevelsFromRule(rule?: ClassRuleData) {
  if (!rule) return undefined;
  if (rule.pactSlotProgression?.length) return [0, ...rule.pactSlotProgression.map((entry) => entry.level)];
  if (rule.spellSlots?.length) {
    return [0, ...rule.spellSlots.map((row) =>
      row.reduce((highest, count, index) => count > 0 ? index + 1 : highest, 0),
    )];
  }
  return undefined;
}

export type SpellcastingRuleCatalogue = RuleClassCatalogue;



export function getClassDefinition(className: string, classCatalogue?: RuleClassCatalogue) {
  const fallback = classDefinitions.find((entry) => entry.name === className);
  const rule = getDynamicClassRule(className, classCatalogue);
  if (!rule) return fallback;

  const spellcasting = spellcastingModeFromRule(rule) ?? fallback?.spellcasting ?? "none";
  const maxSpellLevelByCharacterLevel = maxSpellLevelsFromRule(rule) ?? fallback?.maxSpellLevelByCharacterLevel ?? Array(21).fill(0);

  return {
    id: fallback?.id ?? className.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    name: className,
    spellcasting,
    maxSpellLevelByCharacterLevel,
    subclassUnlockLevel: rule.subclassUnlockLevel ?? fallback?.subclassUnlockLevel ?? 1,
  };
}

export function getSubclassDefinition(subclassName: string) {
  return subclasses.find((entry) => entry.name === subclassName);
}

export function getMaxSpellLevel(character: Character, classCatalogue?: RuleClassCatalogue) {
  const definition = getClassDefinition(character.className, classCatalogue);
  return definition?.maxSpellLevelByCharacterLevel[Math.max(1, Math.min(20, character.level))] ?? 0;
}

export function getSpellcastingMode(character: Character, classCatalogue?: RuleClassCatalogue) {
  return getClassDefinition(character.className, classCatalogue)?.spellcasting ?? "none";
}

export function getHitDieSize(className: string, classCatalogue?: RuleClassCatalogue) {
  const dynamic = getDynamicClassRule(className, classCatalogue)?.hitDie;
  if (typeof dynamic === "number" && dynamic > 0) return dynamic;

  const sizes: Record<string, number> = {
    Barbarian: 12,
    Bard: 8,
    Cleric: 8,
    Druid: 8,
    Fighter: 10,
    Monk: 8,
    Paladin: 10,
    Ranger: 10,
    Rogue: 8,
    Sorcerer: 6,
    Warlock: 8,
    Wizard: 6,
    Artificer: 8,
  };
  return sizes[className] ?? 8;
}

export function getAbilityModifier(score: number) {
  return Math.floor((score - 10) / 2);
}

export function getProficiencyBonus(level: number) {
  const safeLevel = Math.max(1, Math.min(20, level));
  return 2 + Math.floor((safeLevel - 1) / 4);
}

export function getExpectedMaxHp(className: string, level: number, constitution: number, classCatalogue?: RuleClassCatalogue) {
  const safeLevel = Math.max(1, Math.min(20, level));
  const hitDie = getHitDieSize(className, classCatalogue);
  const averageGain = Math.floor(hitDie / 2) + 1;
  const conMod = getAbilityModifier(constitution);
  const perLevelGain = Math.max(1, averageGain + conMod);
  return Math.max(1, hitDie + conMod + Math.max(0, safeLevel - 1) * perLevelGain);
}

export function getExpectedHitDice(className: string, level: number, classCatalogue?: RuleClassCatalogue) {
  const safeLevel = Math.max(1, Math.min(20, level));
  return safeLevel + "d" + getHitDieSize(className, classCatalogue);
}


const FULL_CASTER_SLOTS: number[][] = [
  [],
  [2],
  [3],
  [4, 2],
  [4, 3],
  [4, 3, 2],
  [4, 3, 3],
  [4, 3, 3, 1],
  [4, 3, 3, 2],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

const HALF_CASTER_SLOTS: number[][] = [
  [],
  [],
  [2],
  [3],
  [3],
  [4, 2],
  [4, 2],
  [4, 2],
  [4, 2],
  [4, 2, 2],
  [4, 2, 2],
  [4, 3, 2],
  [4, 3, 2],
  [4, 3, 2, 1],
  [4, 3, 2, 1],
  [4, 3, 2, 1],
  [4, 3, 3, 1],
  [4, 3, 3, 1],
  [4, 3, 3, 1, 1],
  [4, 3, 3, 1, 1],
  [4, 3, 3, 1, 1],
];

const WARLOCK_SLOTS = [
  { count: 1, level: 1 },
  { count: 2, level: 1 },
  { count: 2, level: 2 },
  { count: 2, level: 2 },
  { count: 2, level: 3 },
  { count: 2, level: 3 },
  { count: 2, level: 4 },
  { count: 2, level: 4 },
  { count: 2, level: 5 },
  { count: 2, level: 5 },
  { count: 3, level: 5 },
  { count: 3, level: 5 },
  { count: 3, level: 5 },
  { count: 3, level: 5 },
  { count: 3, level: 5 },
  { count: 3, level: 5 },
  { count: 4, level: 5 },
  { count: 4, level: 5 },
  { count: 4, level: 5 },
  { count: 4, level: 5 },
  { count: 4, level: 5 },
];

const CANTRIPS_KNOWN: Record<string, number[]> = {
  Bard: [0, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
  Cleric: [0, 3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
  Druid: [0, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
  Sorcerer: [0, 4, 4, 4, 5, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6],
  Warlock: [0, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
  Wizard: [0, 3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
  Artificer: [0, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
};

const SPELLS_KNOWN: Record<string, number[]> = {
  Bard: [0, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 15, 16, 16, 18, 18, 19, 19, 20, 22],
  Ranger: [0, 0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15],
  Sorcerer: [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 12, 13, 13, 14, 14, 15, 15, 15, 15],
  Warlock: [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15],
};

export function getAbilityScoreImprovementLevels(className: string, classCatalogue?: RuleClassCatalogue) {
  const dynamic = getDynamicClassRule(className, classCatalogue)?.asiLevels;
  if (dynamic?.length) return dynamic;
  if (className === "Fighter") return [4, 6, 8, 12, 14, 16, 19];
  if (className === "Rogue") return [4, 8, 10, 12, 16, 19];
  return [4, 8, 12, 16, 19];
}

export function getNewAbilityScoreImprovementLevels(className: string, oldLevel: number, newLevel: number, classCatalogue?: RuleClassCatalogue) {
  return getAbilityScoreImprovementLevels(className, classCatalogue).filter((level) => level > oldLevel && level <= newLevel);
}

export function getAbilityScoreImprovementLevelsUpTo(className: string, level: number, classCatalogue?: RuleClassCatalogue) {
  return getAbilityScoreImprovementLevels(className, classCatalogue).filter((asiLevel) => asiLevel <= level);
}

function normalizeRuleText(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

type FeatPrerequisiteCharacter = Pick<Character, "level" | "abilities" | "race" | "subrace" | "className" | "background" | "feats" | "skills" | "tools" | "languages">;

function featPrerequisiteMet(prerequisite: unknown, character: FeatPrerequisiteCharacter): boolean {
  if (!prerequisite) return true;
  if (Array.isArray(prerequisite)) return prerequisite.every((entry) => featPrerequisiteMet(entry, character));
  if (typeof prerequisite !== "object") return true;

  const rule = prerequisite as Record<string, unknown>;

  if (typeof rule.level === "number" && character.level < rule.level) return false;

  const abilityRule = rule.ability;
  if (Array.isArray(abilityRule) && abilityRule.length > 0) {
    const abilityMet = abilityRule.some((entry) => {
      if (!entry || typeof entry !== "object") return true;
      return Object.entries(entry as Record<string, unknown>).some(([key, value]) => {
        const score = character.abilities[key as keyof typeof character.abilities];
        return typeof score === "number" && typeof value === "number" && score >= value;
      });
    });
    if (!abilityMet) return false;
  }

  const raceRule = rule.race;
  if (Array.isArray(raceRule) && raceRule.length > 0) {
    const raceMet = raceRule.some((entry) => {
      if (typeof entry === "string") return normalizeRuleText(entry) === normalizeRuleText(character.race);
      if (!entry || typeof entry !== "object") return false;
      const race = normalizeRuleText((entry as Record<string, unknown>).name);
      const subrace = normalizeRuleText((entry as Record<string, unknown>).subrace);
      const currentRace = normalizeRuleText(character.race);
      const currentSubrace = normalizeRuleText(character.subrace);
      return race === currentRace && (!subrace || subrace === currentSubrace);
    });
    if (!raceMet) return false;
  }

  const classRule = rule.class;
  if (Array.isArray(classRule) && classRule.length > 0) {
    const classMet = classRule.some((entry) => normalizeRuleText(entry) === normalizeRuleText(character.className));
    if (!classMet) return false;
  }

  const backgroundRule = rule.background;
  if (Array.isArray(backgroundRule) && backgroundRule.length > 0) {
    const backgroundMet = backgroundRule.some((entry) => normalizeRuleText(entry) === normalizeRuleText(character.background));
    if (!backgroundMet) return false;
  }

  if (rule.spellcastingFeature === true || rule.spellcasting === true) {
    if (getClassDefinition(character.className)?.spellcasting === "none") return false;
  }

  const featRule = rule.feat;
  if (Array.isArray(featRule) && featRule.length > 0) {
    const owned = new Set(character.feats.map(normalizeRuleText));
    const featMet = featRule.some((entry) => {
      const name = normalizeRuleText(typeof entry === "string" ? entry.split("|")[0] : "");
      return Boolean(name && [...owned].some((ownedFeat) => ownedFeat === name));
    });
    if (!featMet) return false;
  }

  const proficiencyRule = rule.proficiency;
  if (Array.isArray(proficiencyRule) && proficiencyRule.length > 0) {
    const proficiencies = new Set([...character.skills, ...character.tools, ...character.languages].map(normalizeRuleText));
    const proficiencyMet = proficiencyRule.some((entry) => proficiencies.has(normalizeRuleText(entry)));
    if (!proficiencyMet) return false;
  }

  return true;
}

export function isFeatAvailable(character: FeatPrerequisiteCharacter, feat: Feat) {
  return featPrerequisiteMet(feat.prerequisite, character);
}

export function getFeatRestrictionReason(character: FeatPrerequisiteCharacter, feat: Feat) {
  if (!feat.prerequisite) return "";
  if (!featPrerequisiteMet(feat.prerequisite, character)) return "Prerequisites not met";
  return "";
}

export type SpellSlotSummary = {
  level: number;
  count: number;
};

export function getCantripsKnown(className: string, level: number) {
  const progression = CANTRIPS_KNOWN[className];
  if (!progression) return 0;
  const safeLevel = Math.max(1, Math.min(20, level));
  return progression[safeLevel] ?? 0;
}

export function getSpellsKnown(className: string, level: number) {
  const progression = SPELLS_KNOWN[className];
  if (!progression) return null;
  const safeLevel = Math.max(1, Math.min(20, level));
  return progression[safeLevel] ?? 0;
}

export function getPreparedSpellCount(character: Character) {
  const level = Math.max(1, Math.min(20, character.level));
  if (!["Cleric", "Druid", "Paladin", "Artificer", "Wizard"].includes(character.className)) return null;

  const abilityModifier =
    character.className === "Cleric" || character.className === "Druid"
      ? getAbilityModifier(character.abilities.wis)
      : character.className === "Paladin"
        ? getAbilityModifier(character.abilities.cha)
        : getAbilityModifier(character.abilities.int);

  const base = character.className === "Paladin" || character.className === "Artificer"
    ? Math.floor(level / 2)
    : level;

  return Math.max(1, base + abilityModifier);
}

export function getWizardSpellbookProgression(level: number) {
  const safeLevel = Math.max(1, Math.min(20, level));  return 6 + (safeLevel - 1) * 2;
}

export function getSpellSlotSummary(className: string, level: number): SpellSlotSummary[] {
  const safeLevel = Math.max(1, Math.min(20, level));

  if (className === "Warlock") {
    const slot = WARLOCK_SLOTS[safeLevel - 1];
    return slot ? [{ level: slot.level, count: slot.count }] : [];
  }

  const definition = classDefinitions.find((entry) => entry.name === className);
  if (!definition || definition.spellcasting === "none") return [];

  const useHalfCaster = ["Paladin", "Ranger"].includes(className);
  const progression = useHalfCaster ? HALF_CASTER_SLOTS : FULL_CASTER_SLOTS;

  return (progression[safeLevel] ?? []).map((count, index) => ({ level: index + 1, count }));
}

export function getSpellcastingSummary(character: Character) {
  return {
    mode: getSpellcastingMode(character),
    maxSpellLevel: getMaxSpellLevel(character),
    cantripsKnown: getCantripsKnown(character.className, character.level),
    spellsKnown: getSpellsKnown(character.className, character.level),
    preparedSpells: getPreparedSpellCount(character),
    wizardSpellbookProgression: character.className === "Wizard"
      ? getWizardSpellbookProgression(character.level)
      : null,
    slots: getSpellSlotSummary(character.className, character.level),
  };
}

export function hasOverride(character: Character, type: ContentType, contentId: string) {
  return character.accessOverrides.some((entry) => entry.type === type && entry.contentId === contentId);
}

export function isSpellNormallyAvailable(character: Character, spell: Spell) {
  if (spell.requiredCharacterLevel && character.level < spell.requiredCharacterLevel) return false;
  const withinLevel = spell.level === 0 || spell.level <= getMaxSpellLevel(character);
  if (!withinLevel) return false;
  const classMatch = spell.classes.includes(character.className);
  const subclassMatch = Boolean(spell.subclasses?.includes(character.subclass));
  const raceMatch = Boolean(spell.races?.includes(character.race));
  return classMatch || subclassMatch || raceMatch;
}

export function getSpellRestrictionReason(character: Character, spell: Spell) {
  if (spell.requiredCharacterLevel && character.level < spell.requiredCharacterLevel) {
    return `Requires character level ${spell.requiredCharacterLevel}`;
  }
  if (spell.level > 0 && spell.level > getMaxSpellLevel(character)) {
    return `Your ${character.className} level ${character.level} normally reaches ${getMaxSpellLevel(character)}th-level spells`;
  }
  if (!spell.classes.includes(character.className) && !spell.subclasses?.includes(character.subclass) && !spell.races?.includes(character.race)) {
    return `Not on the ${character.className} spell list or another granted source`;
  }
  return "Restricted by prerequisites";
}

export function isFeatureNormallyAvailable(character: Character, feature: Feature) {
  if (feature.requiredLevel > character.level) return false;
  if (feature.sourceType === "class") return feature.className === character.className;
  if (feature.sourceType === "subclass") {
    return feature.className === character.className && feature.subclassName === character.subclass;
  }
  if (feature.sourceType === "race") return feature.raceName === character.race;
  if (feature.sourceType === "background") return feature.backgroundName === character.background;
  if (feature.sourceType === "feat") return Boolean(feature.featId && character.feats.includes(feature.featId));
  return false;
}

export function getFeatureRestrictionReason(character: Character, feature: Feature) {
  if (feature.requiredLevel > character.level) return `Requires level ${feature.requiredLevel}`;
  if (feature.sourceType === "class" && feature.className !== character.className) return `Belongs to the ${feature.className} class`;
  if (feature.sourceType === "subclass" && feature.subclassName !== character.subclass) return `Belongs to ${feature.subclassName}`;
  if (feature.sourceType === "race" && feature.raceName !== character.race) return `Belongs to the ${feature.raceName} race`;
  if (feature.sourceType === "background" && feature.backgroundName !== character.background) return `Belongs to the ${feature.backgroundName} background`;
  if (feature.sourceType === "feat") return "Requires a feat or other prerequisite";
  return "Requires a DM grant";
}

export function isItemNormallyAvailable(character: Character, item: Item) {
  if (item.requiredCharacterLevel && character.level < item.requiredCharacterLevel) return false;
  if (item.requiredClass && item.requiredClass !== character.className) return false;
  return !item.restricted;
}

export function getItemRestrictionReason(character: Character, item: Item) {
  if (item.requiredCharacterLevel && character.level < item.requiredCharacterLevel) return `Requires character level ${item.requiredCharacterLevel}`;
  if (item.requiredClass && item.requiredClass !== character.className) return `Intended for ${item.requiredClass}`;
  if (item.restricted) return `${item.rarity} content is marked as DM-granted in this app`;
  return "Restricted by prerequisites";
}

export function getAvailableSpells(character: Character, includeOverrides = true, sourceSpells: Spell[] = spells) {
  return sourceSpells.filter((spell) => isSpellNormallyAvailable(character, spell) || (includeOverrides && hasOverride(character, "spell", spell.id)));
}

export function getAvailableFeatures(character: Character, includeOverrides = true) {
  return features.filter((feature) => isFeatureNormallyAvailable(character, feature) || (includeOverrides && hasOverride(character, "feature", feature.id)));
}

export function getAvailableItems(character: Character, includeOverrides = true, sourceItems: Item[] = items) {
  return sourceItems.filter((item) => isItemNormallyAvailable(character, item) || (includeOverrides && hasOverride(character, "item", item.id)));
}

export function getSubclassOptionsForClass(className: string) {
  return subclasses.filter((entry) => entry.className === className);
}

export function getRaceNames() {
  return races.map((entry) => entry.name);
}