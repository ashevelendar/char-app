import { classDefinitions, features, items, races, spells, subclasses } from "./data";
import type { AbilityKey, AbilityScores, AsiHistoryEntry, Character, CharacterClassLevel, ClassRuleData, ContentType, ExpertiseHistoryEntry, Feat, Feature, Item, MagicalSecretsHistoryEntry, Spell, SubclassDefinition } from "./types";

type RuleClassCatalogue = Record<string, ClassRuleData>;

export type { RuleClassCatalogue };

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
  const classLevels = getCharacterClassLevels(character);
  if (classLevels.length > 1) return getMulticlassMaxSpellLevel(character, classCatalogue);
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
    Mystic: 8,
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


export function getCharacterClassLevels(character: Character): CharacterClassLevel[] {
  const supplied = Array.isArray(character.classLevels)
    ? character.classLevels
        .filter((entry) => entry && typeof entry.className === "string")
        .map((entry) => ({
          className: entry.className,
          level: Math.max(0, Math.min(20, Number(entry.level) || 0)),
          subclass: entry.subclass || undefined,
        }))
        .filter((entry) => entry.level > 0)
    : [];
  if (supplied.length) return supplied;
  return [{
    className: character.className,
    level: Math.max(1, Math.min(20, character.level)),
    subclass: character.subclass || undefined,
  }];
}

export function getTotalCharacterLevel(character: Character): number {
  return Math.min(20, getCharacterClassLevels(character).reduce((sum, entry) => sum + entry.level, 0));
}

export function getClassLevel(character: Character, className: string): number {
  return getCharacterClassLevels(character).find((entry) => entry.className === className)?.level ?? 0;
}

const MULTICLASS_PREREQUISITES: Record<string, Partial<Record<AbilityKey, number>>> = {
  Barbarian: { str: 13 },
  Bard: { cha: 13 },
  Cleric: { wis: 13 },
  Druid: { wis: 13 },
  Fighter: { str: 13, dex: 13 },
  Monk: { dex: 13, wis: 13 },
  Paladin: { str: 13, cha: 13 },
  Ranger: { dex: 13, wis: 13 },
  Rogue: { dex: 13 },
  Sorcerer: { cha: 13 },
  Warlock: { cha: 13 },
  Wizard: { int: 13 },
  Artificer: { int: 13 },
};

export function getMulticlassPrerequisites(className: string): Partial<Record<AbilityKey, number>> {
  return { ...(MULTICLASS_PREREQUISITES[className] ?? {}) };
}

export function validateMulticlassClassLevels(
  classLevels: CharacterClassLevel[],
  abilities: AbilityScores,
  subclasses: SubclassDefinition[] = subclasses,
  classCatalogue?: RuleClassCatalogue,
): string[] {
  const errors: string[] = [];
  const normalized = classLevels
    .filter((entry) => entry && typeof entry.className === "string")
    .map((entry) => ({ ...entry, level: Number(entry.level) || 0 }));

  if (!normalized.length) return ["At least one class is required."];
  const seen = new Set<string>();
  let total = 0;

  for (const entry of normalized) {
    const className = entry.className;
    const level = Math.max(0, Math.min(20, entry.level));
    if (seen.has(className)) errors.push(`Class ${className} appears more than once. Combine its levels into one entry.`);
    seen.add(className);
    if (!getClassDefinition(className, classCatalogue)) errors.push(`Unknown class "${className}".`);
    if (level < 1 || level > 20) errors.push(`${className} level must be between 1 and 20.`);
    total += level;

    const prerequisites = getMulticlassPrerequisites(className);
    if (className === "Fighter") {
      if (abilities.str < 13 && abilities.dex < 13) errors.push("Multiclassing into Fighter requires STR 13 or DEX 13.");
    } else {
      for (const [ability, minimum] of Object.entries(prerequisites) as Array<[AbilityKey, number]>) {
        if ((abilities[ability] ?? 0) < minimum) errors.push(`Multiclassing into ${className} requires ${ability.toUpperCase()} ${minimum}.`);
      }
    }

    const definition = getClassDefinition(className, classCatalogue);
    if (entry.subclass) {
      const unlock = definition?.subclassUnlockLevel ?? 1;
      if (level < unlock) errors.push(`${className} subclass ${entry.subclass} requires class level ${unlock}.`);
      if (!subclasses.some((candidate) => candidate.className === className && candidate.name === entry.subclass)) {
        errors.push(`Subclass "${entry.subclass}" is not valid for ${className}.`);
      }
    }
  }

  if (total !== 20 && total > 20) errors.push("Total class levels cannot exceed 20.");
  if (total < 1) errors.push("Total class levels must be at least 1.");
  return errors;
}

export function getMulticlassHitDice(classLevels: CharacterClassLevel[], classCatalogue?: RuleClassCatalogue): string {
  return classLevels
    .filter((entry) => entry.level > 0)
    .map((entry) => `${entry.level}d${getHitDieSize(entry.className, classCatalogue)}`)
    .join(" + ");
}

export function getExpectedMulticlassMaxHp(
  classLevels: CharacterClassLevel[],
  constitution: number,
  classCatalogue?: RuleClassCatalogue,
): number {
  const conMod = getAbilityModifier(constitution);
  let hp = 0;
  for (const entry of classLevels) {
    const level = Math.max(0, Math.min(20, Number(entry.level) || 0));
    if (level <= 0) continue;
    const hitDie = getHitDieSize(entry.className, classCatalogue);
    const averageGain = Math.floor(hitDie / 2) + 1;
    hp += hitDie + conMod + Math.max(0, level - 1) * Math.max(1, averageGain + conMod);
  }
  return Math.max(1, hp);
}

function getCasterContribution(className: string, level: number, classCatalogue?: RuleClassCatalogue): number {
  const rule = getDynamicClassRule(className, classCatalogue);
  const progression = rule?.casterProgression;
  if (progression === "full") return level;
  if (progression === "artificer") return Math.ceil(level / 2);
  if (progression === "half") return Math.floor(level / 2);
  if (progression === "third") return Math.floor(level / 3);
  return 0;
}

export function getMulticlassSpellcastingLevel(character: Character, classCatalogue?: RuleClassCatalogue): number {
  return Math.min(20, getCharacterClassLevels(character).reduce(
    (sum, entry) => sum + getCasterContribution(entry.className, entry.level, classCatalogue),
    0,
  ));
}

export function getMulticlassSpellSlotSummary(character: Character, classCatalogue?: RuleClassCatalogue): SpellSlotSummary[] {
  const casterLevel = getMulticlassSpellcastingLevel(character, classCatalogue);
  if (casterLevel < 1) return [];
  return (FULL_CASTER_SLOTS[casterLevel] ?? []).map((count, index) => ({ level: index + 1, count })).filter((entry) => entry.count > 0);
}

export function getMulticlassMaxSpellLevel(character: Character, classCatalogue?: RuleClassCatalogue): number {
  const slots = getMulticlassSpellSlotSummary(character, classCatalogue);
  return slots.length ? slots[slots.length - 1].level : 0;
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

export function validateAsiHistory(
  entries: AsiHistoryEntry[],
  className: string,
  level: number,
  featCatalogue: Feat[] = [],
  classCatalogue?: RuleClassCatalogue,
): string[] {
  const errors: string[] = [];
  const expectedLevels = getAbilityScoreImprovementLevelsUpTo(className, level, classCatalogue);
  const seenLevels = new Set<number>();

  for (const entry of entries) {
    if (seenLevels.has(entry.level)) {
      errors.push(`Ability Score Improvement level ${entry.level} is recorded more than once.`);
      continue;
    }
    seenLevels.add(entry.level);

    if (!expectedLevels.includes(entry.level)) {
      errors.push(`Ability Score Improvement level ${entry.level} is not valid for a level ${level} ${className}.`);
    }

    if (entry.mode === "legacy") continue;

    if (entry.mode === "two") {
      if (!entry.first) errors.push(`Level ${entry.level}: choose an ability for the +2 improvement.`);
      if (entry.second) errors.push(`Level ${entry.level}: a +2 improvement cannot also contain a second ability.`);
    } else if (entry.mode === "one") {
      if (!entry.first || !entry.second) errors.push(`Level ${entry.level}: choose two abilities for the +1/+1 improvement.`);
      if (entry.first && entry.second && entry.first === entry.second) errors.push(`Level ${entry.level}: the two +1 abilities must be different.`);
    } else if (entry.mode === "feat") {
      if (!entry.featId) {
        errors.push(`Level ${entry.level}: choose a feat.`);
        continue;
      }
      const feat = featCatalogue.find((candidate) => candidate.id === entry.featId);
      if (!feat) {
        errors.push(`Level ${entry.level}: the selected feat is no longer available in the catalogue.`);
        continue;
      }
      const options = getFeatAbilityOptions(feat);
      if (options.length > 1 && !entry.featAbility) {
        errors.push(`Level ${entry.level}: choose the ability granted by ${feat.name}.`);
      } else if (entry.featAbility && options.length && !options.some((option) => option.ability === entry.featAbility)) {
        errors.push(`Level ${entry.level}: the selected ability is not a valid choice for ${feat.name}.`);
      }
      if (entry.first || entry.second) errors.push(`Level ${entry.level}: a feat choice cannot also contain an ASI allocation.`);
    } else {
      errors.push(`Level ${entry.level}: unknown ASI choice mode.`);
    }
  }

  for (const expectedLevel of expectedLevels) {
    if (!entries.some((entry) => entry.level === expectedLevel)) {
      errors.push(`Ability Score Improvement level ${expectedLevel} is missing.`);
    }
  }

  return errors;
}

export function validateExpertiseHistory(
  entries: ExpertiseHistoryEntry[],
  expectedLevels: number[],
  availableSkills: string[],
): string[] {
  const errors: string[] = [];
  const seenLevels = new Set<number>();
  const seenSkills = new Set<string>();
  const available = new Set(availableSkills.map((skill) => skill.trim().toLowerCase()).filter(Boolean));

  for (const entry of entries) {
    if (seenLevels.has(entry.level)) {
      errors.push(`Expertise level ${entry.level} is recorded more than once.`);
      continue;
    }
    seenLevels.add(entry.level);

    if (!expectedLevels.includes(entry.level)) {
      errors.push(`Expertise level ${entry.level} is not a valid Expertise level for this character.`);
    }

    const skills = entry.skills.map((skill) => skill.trim()).filter(Boolean);
    if (skills.length !== 2) {
      errors.push(`Expertise level ${entry.level} must contain exactly two skills.`);
    }
    if (new Set(skills.map((skill) => skill.toLowerCase())).size !== skills.length) {
      errors.push(`Expertise level ${entry.level} contains a duplicate skill.`);
    }

    for (const skill of skills) {
      const key = skill.toLowerCase();
      if (!available.has(key)) errors.push(`Expertise level ${entry.level}: ${skill} is not one of the character's proficient skills.`);
      if (seenSkills.has(key)) errors.push(`Expertise level ${entry.level}: ${skill} was already selected for Expertise.`);
      seenSkills.add(key);
    }
  }

  for (const expectedLevel of expectedLevels) {
    if (!entries.some((entry) => entry.level === expectedLevel)) {
      errors.push(`Expertise level ${expectedLevel} is missing.`);
    }
  }

  return errors;
}

export function validateMagicalSecretsHistory(
  entries: MagicalSecretsHistoryEntry[],
  featureLevels: number[],
  spellCatalogue: Spell[],
  character: Character,
  classCatalogue?: RuleClassCatalogue,
): string[] {
  const errors: string[] = [];
  const seenLevels = new Set<number>();
  const spellById = new Map(spellCatalogue.map((spell) => [spell.id, spell]));

  for (const entry of entries) {
    if (seenLevels.has(entry.level)) {
      errors.push(`Magical Secrets level ${entry.level} is recorded more than once.`);
      continue;
    }
    seenLevels.add(entry.level);

    if (!featureLevels.includes(entry.level)) {
      errors.push(`Magical Secrets level ${entry.level} is not a valid feature level for this character.`);
    }
    if (entry.spellIds.length !== 2) {
      errors.push(`Magical Secrets level ${entry.level} must contain exactly two spells.`);
    }
    if (new Set(entry.spellIds).size !== entry.spellIds.length) {
      errors.push(`Magical Secrets level ${entry.level} contains a duplicate spell.`);
    }

    for (const spellId of entry.spellIds) {
      const spell = spellById.get(spellId);
      if (!spell) {
        errors.push(`Magical Secrets level ${entry.level}: a selected spell is no longer in the spell catalogue.`);
        continue;
      }
      if (spell.level > getMaxSpellLevel(character, classCatalogue)) {
        errors.push(`Magical Secrets level ${entry.level}: ${spell.name} is above the character's current maximum spell level.`);
      }
    }
  }

  for (const featureLevel of featureLevels) {
    if (!entries.some((entry) => entry.level === featureLevel)) {
      errors.push(`Magical Secrets level ${featureLevel} is missing.`);
    }
  }

  return errors;
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


function normalizeAbilityKey(value: unknown): AbilityKey | null {
  if (typeof value !== "string") return null;
  const normalized = value.toLowerCase().replace(/[\s_-]/g, "");
  const aliases: Record<string, AbilityKey> = {
    str: "str", strength: "str", dex: "dex", dexterity: "dex", con: "con", constitution: "con",
    int: "int", intelligence: "int", wis: "wis", wisdom: "wis", cha: "cha", charisma: "cha",
  };
  return aliases[normalized] ?? null;
}

function extractFeatAbilityRules(value: unknown): Array<{ ability: AbilityKey; amount: number }> {
  const result: Array<{ ability: AbilityKey; amount: number }> = [];
  const visit = (node: unknown, inheritedAmount?: number) => {
    if (!node) return;
    if (Array.isArray(node)) { node.forEach((entry) => visit(entry, inheritedAmount)); return; }
    if (typeof node !== "object") return;
    const object = node as Record<string, unknown>;
    const amount = typeof object.amount === "number" ? object.amount : inheritedAmount;
    const ability = normalizeAbilityKey(object.ability) ?? normalizeAbilityKey(object.name);
    if (ability && typeof amount === "number") result.push({ ability, amount });
    for (const key of ["str", "dex", "con", "int", "wis", "cha"] as AbilityKey[]) {
      const direct = object[key];
      if (typeof direct === "number") result.push({ ability: key, amount: direct });
    }
    if (Array.isArray(object.from)) object.from.forEach((entry) => visit({ ability: entry, amount }, amount));
    if (Array.isArray(object.choose)) object.choose.forEach((entry) => visit(entry, amount));
    if (object.choose && !Array.isArray(object.choose)) visit(object.choose, amount);
    if (Array.isArray(object.ability)) object.ability.forEach((entry) => visit(entry, amount));
  };
  visit(value);
  return result;
}

export function getFeatAbilityOptions(feat: Feat): Array<{ ability: AbilityKey; amount: number }> {
  const raw = extractFeatAbilityRules(feat.ability);
  const seen = new Set<string>();
  return raw.filter((entry) => {
    const key = entry.ability + ":" + entry.amount;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function getFeatAbilityBonuses(feat: Feat, selectedAbility?: AbilityKey): Partial<AbilityScores> {
  const rules = getFeatAbilityOptions(feat);
  if (!rules.length) return {};
  const hasChoice = rules.length > 1;
  const selected = selectedAbility ? rules.find((entry) => entry.ability === selectedAbility) : undefined;
  if (hasChoice && !selected) return {};
  const applied = selected ?? rules[0];
  return { [applied.ability]: applied.amount };
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

export function getCantripsKnown(className: string, level: number, classCatalogue?: RuleClassCatalogue) {
  const progression = getDynamicClassRule(className, classCatalogue)?.cantripProgression;
  if (progression?.length) {
    const safeLevel = Math.max(1, Math.min(20, level));
    return progression[safeLevel - 1] ?? progression[safeLevel] ?? 0;
  }
  const fallback = CANTRIPS_KNOWN[className];
  if (!fallback) return 0;
  const safeLevel = Math.max(1, Math.min(20, level));
  return fallback[safeLevel] ?? 0;
}

export function getSpellsKnown(className: string, level: number, classCatalogue?: RuleClassCatalogue) {
  const progression = getDynamicClassRule(className, classCatalogue)?.spellsKnownProgression;
  if (progression?.length) {
    const safeLevel = Math.max(1, Math.min(20, level));
    return progression[safeLevel - 1] ?? progression[safeLevel] ?? null;
  }
  const fallback = SPELLS_KNOWN[className];
  if (!fallback) return null;
  const safeLevel = Math.max(1, Math.min(20, level));
  return fallback[safeLevel] ?? 0;
}

function getSpellcastingAbilityModifier(character: Character, rule?: ClassRuleData) {
  const ability = rule?.spellcastingAbility?.toLowerCase().replace(/[^a-z]/g, "");
  const abilityKey: Record<string, keyof Character["abilities"]> = {
    str: "str",
    strength: "str",
    dex: "dex",
    dexterity: "dex",
    con: "con",
    constitution: "con",
    int: "int",
    intelligence: "int",
    wis: "wis",
    wisdom: "wis",
    cha: "cha",
    charisma: "cha",
  };
  const key = ability ? abilityKey[ability] : undefined;
  return key ? getAbilityModifier(character.abilities[key]) : null;
}

export function getPreparedSpellCount(character: Character, classCatalogue?: RuleClassCatalogue) {
  const level = Math.max(1, Math.min(20, character.level));
  const rule = getDynamicClassRule(character.className, classCatalogue);
  const formula = rule?.preparedSpells;
  if (formula) {
    const abilityModifierByToken: Record<string, number> = {
      str_mod: getAbilityModifier(character.abilities.str),
      dex_mod: getAbilityModifier(character.abilities.dex),
      con_mod: getAbilityModifier(character.abilities.con),
      int_mod: getAbilityModifier(character.abilities.int),
      wis_mod: getAbilityModifier(character.abilities.wis),
      cha_mod: getAbilityModifier(character.abilities.cha),
    };
    let expression = formula
      .replaceAll("<$level$>", String(level))
      .replace(/<\$([a-z]+_mod)\$>/g, (_, token: string) => String(abilityModifierByToken[token] ?? 0))
      .replace(/floor\(([^)]+)\)/gi, "$1");
    if (/^[0-9+*/().\s-]+$/.test(expression)) {
      const terms = expression.split("+").map((term) => term.trim()).filter(Boolean);
      const value = terms.reduce((sum, term) => {
        const parts = term.split("/").map((part) => Number(part.trim()));
        if (parts.some((part) => !Number.isFinite(part))) return Number.NaN;
        return sum + (parts.length === 2 ? Math.floor(parts[0] / parts[1]) : parts[0]);
      }, 0);
      if (Number.isFinite(value)) return Math.max(1, value);
    }
  }

  const abilityModifier = getSpellcastingAbilityModifier(character, rule);
  if (abilityModifier === null) return null;

  if (rule?.casterProgression === "half") {
    return Math.max(1, Math.floor(level / 2) + abilityModifier);
  }

  if (rule?.casterProgression === "full" || rule?.casterProgression === "artificer") {
    return Math.max(1, level + abilityModifier);
  }

  return null;
}

export function getSpellbookProgression(className: string, level: number, classCatalogue?: RuleClassCatalogue) {
  const safeLevel = Math.max(1, Math.min(20, level));
  const progression = getDynamicClassRule(className, classCatalogue)?.spellbookProgression;
  if (progression?.length) return progression[safeLevel - 1] ?? progression[safeLevel] ?? null;
  if (className === "Wizard") return 6 + (safeLevel - 1) * 2;
  return null;
}

export function getWizardSpellbookProgression(level: number, classCatalogue?: RuleClassCatalogue) {
  const dynamic = getSpellbookProgression("Wizard", level, classCatalogue);
  if (dynamic !== null) return dynamic;
  const safeLevel = Math.max(1, Math.min(20, level));
  return 6 + (safeLevel - 1) * 2;
}

export function getSpellSlotSummary(className: string, level: number, classCatalogue?: RuleClassCatalogue): SpellSlotSummary[] {
  const safeLevel = Math.max(1, Math.min(20, level));
  const rule = getDynamicClassRule(className, classCatalogue);

  if (rule?.pactSlotProgression?.length) {
    const slot = rule.pactSlotProgression[safeLevel - 1];
    return slot ? [{ level: slot.level, count: slot.count }] : [];
  }

  if (rule?.spellSlots?.length) {
    return (rule.spellSlots[safeLevel - 1] ?? []).map((count, index) => ({ level: index + 1, count })).filter((entry) => entry.count > 0);
  }

  if (className === "Warlock") {
    const slot = WARLOCK_SLOTS[safeLevel - 1];
    return slot ? [{ level: slot.level, count: slot.count }] : [];
  }

  const definition = classDefinitions.find((entry) => entry.name === className);
  if (!definition || definition.spellcasting === "none") return [];

  const useArtificer = className === "Artificer";
  const useHalfCaster = ["Paladin", "Ranger"].includes(className);
  const progression = useArtificer
    ? HALF_CASTER_SLOTS.map((row, index) => index === 0 ? [2] : row)
    : useHalfCaster ? HALF_CASTER_SLOTS : FULL_CASTER_SLOTS;

  return (progression[safeLevel] ?? []).map((count, index) => ({ level: index + 1, count }));
}

export function getSpellcastingSummary(character: Character, classCatalogue?: RuleClassCatalogue) {
  return {
    mode: getSpellcastingMode(character, classCatalogue),
    maxSpellLevel: getMaxSpellLevel(character, classCatalogue),
    cantripsKnown: getCantripsKnown(character.className, character.level, classCatalogue),
    spellsKnown: getSpellsKnown(character.className, character.level, classCatalogue),
    preparedSpells: getPreparedSpellCount(character, classCatalogue),
    wizardSpellbookProgression: character.className === "Wizard"
      ? getWizardSpellbookProgression(character.level)
      : null,
    slots: getSpellSlotSummary(character.className, character.level, classCatalogue),
  };
}

export function hasOverride(character: Character, type: ContentType, contentId: string) {
  return character.accessOverrides.some((entry) => entry.type === type && entry.contentId === contentId);
}

export function isSpellNormallyAvailable(character: Character, spell: Spell, classCatalogue?: RuleClassCatalogue) {
  const classLevels = getCharacterClassLevels(character);
  if (spell.requiredCharacterLevel && getTotalCharacterLevel(character) < spell.requiredCharacterLevel) return false;
  if (spell.level > 0 && spell.level > getMaxSpellLevel(character, classCatalogue)) return false;
  const classMatch = classLevels.some((entry) => spell.classes.includes(entry.className));
  const subclassMatch = classLevels.some((entry) => Boolean(entry.subclass && spell.subclasses?.includes(entry.subclass)));
  const raceMatch = Boolean(spell.races?.includes(character.race));
  return classMatch || subclassMatch || raceMatch;
}

export function getSpellRestrictionReason(character: Character, spell: Spell, classCatalogue?: RuleClassCatalogue) {
  if (spell.requiredCharacterLevel && character.level < spell.requiredCharacterLevel) {
    return `Requires character level ${spell.requiredCharacterLevel}`;
  }
  if (spell.level > 0 && spell.level > getMaxSpellLevel(character, classCatalogue)) {
    return `Your ${character.className} level ${character.level} normally reaches ${getMaxSpellLevel(character, classCatalogue)}th-level spells`;
  }
  if (!spell.classes.includes(character.className) && !spell.subclasses?.includes(character.subclass) && !spell.races?.includes(character.race)) {
    return `Not on the ${character.className} spell list or another granted source`;
  }
  return "Restricted by prerequisites";
}

export function isFeatureNormallyAvailable(character: Character, feature: Feature) {
  if (feature.sourceType === "class") {
    const classLevel = feature.className ? getClassLevel(character, feature.className) : 0;
    return classLevel >= feature.requiredLevel;
  }
  if (feature.sourceType === "subclass") {
    const classLevel = feature.className ? getClassLevel(character, feature.className) : 0;
    const subclass = feature.className
      ? getCharacterClassLevels(character).find((entry) => entry.className === feature.className)?.subclass
      : undefined;
    return classLevel >= feature.requiredLevel && subclass === feature.subclassName;
  }
  if (feature.requiredLevel > getTotalCharacterLevel(character)) return false;
  if (feature.sourceType === "race") return feature.raceName === character.race;
  if (feature.sourceType === "background") return feature.backgroundName === character.background;
  if (feature.sourceType === "feat") return Boolean(feature.featId && character.feats.includes(feature.featId));
  return false;
}

export function getAutomaticallyGrantedFeatureIds(character: Character, featureCatalogue: Feature[]) {
  const granted = new Set(character.features);
  const candidates = featureCatalogue
    .filter((feature) =>
      feature.requiredLevel <= getTotalCharacterLevel(character) &&
      (feature.sourceType === "class" || feature.sourceType === "subclass" || feature.sourceType === "race" || feature.sourceType === "background") &&
      isFeatureNormallyAvailable(character, feature) &&
      !/gain a feature from your|gain a feature from the|optional feature/i.test(feature.description),
    )
    .sort((a, b) => a.requiredLevel - b.requiredLevel || a.name.localeCompare(b.name));

  let changed = true;
  while (changed) {
    changed = false;
    for (const feature of candidates) {
      const requiredFeatureIds = feature.requiresFeatureIds?.length ? feature.requiresFeatureIds : (feature.requiresFeatureId ? [feature.requiresFeatureId] : []);
      if (requiredFeatureIds.some((requiredId) => !granted.has(requiredId))) continue;
      if (!granted.has(feature.id)) {
        granted.add(feature.id);
        changed = true;
      }
    }
  }

  return candidates.filter((feature) => granted.has(feature.id)).map((feature) => feature.id);
}

export function getFeatureRestrictionReason(character: Character, feature: Feature) {
  if (feature.requiredLevel > getTotalCharacterLevel(character)) return `Requires level ${feature.requiredLevel}`;
  if (feature.sourceType === "class" && feature.className && getClassLevel(character, feature.className) < feature.requiredLevel) return `Requires ${feature.className} class level ${feature.requiredLevel}`;
  if (feature.sourceType === "subclass" && feature.className && getClassLevel(character, feature.className) < feature.requiredLevel) return `Requires ${feature.className} class level ${feature.requiredLevel}`;
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

export function getItemWeight(item: Item) {
  if (!item.weight) return 0;
  const match = String(item.weight).match(/(\d+(?:\.\d+)?)\s*lb/i);
  return match ? Number(match[1]) : 0;
}

export function getInventoryWeight(character: Character, sourceItems: Item[] = items) {
  return character.inventory.reduce((total, entry) => {
    const item = sourceItems.find((candidate) => candidate.id === entry.itemId);
    return total + (item ? getItemWeight(item) * Math.max(0, entry.quantity) : 0);
  }, 0);
}

export function getCarryingCapacity(character: Character) {
  return Math.max(0, character.abilities.str * 15);
}

export function isItemOverCarryingCapacity(character: Character, sourceItems: Item[] = items) {
  return getInventoryWeight(character, sourceItems) > getCarryingCapacity(character);
}

export function canEquipItem(character: Character, item: Item) {
  if (!isItemNormallyAvailable(character, item)) return false;
  return Boolean(item.isWeapon || item.isArmor || item.isShield);
}

export function getEquipRestrictionReason(character: Character, item: Item) {
  if (!isItemNormallyAvailable(character, item)) return getItemRestrictionReason(character, item);
  if (!item.isWeapon && !item.isArmor && !item.isShield) return "This item is not currently represented as equippable equipment";
  if (item.requiredClass && item.requiredClass !== character.className) return `Intended for ${item.requiredClass}`;
  return "";
}

export type CharacterTransitionPatch = Partial<Character>;

export type CharacterTransitionContext = {
  classCatalogue?: RuleClassCatalogue;
  subclasses?: SubclassDefinition[];
  features?: Feature[];
  spells?: Spell[];
};

/**
 * Apply the rules-owned part of a character mutation without touching persistence.
 * UI/context code can handle presentation concerns such as AC and movement separately.
 */
export function applyCharacterTransition(
  currentCharacter: Character,
  patch: CharacterTransitionPatch,
  context: CharacterTransitionContext = {},
): Character {
  const classCatalogue = context.classCatalogue;
  const subclassCatalogue = context.subclasses ?? subclasses;
  const featureCatalogue = context.features ?? features;
  const spellCatalogue = context.spells ?? spells;

  const currentLevels = getCharacterClassLevels(currentCharacter);
  let nextClassLevels = patch.classLevels
    ? patch.classLevels.map((entry) => ({ ...entry, level: Math.max(1, Math.min(20, Number(entry.level) || 1)) }))
    : currentLevels.map((entry) => ({ ...entry }));

  if (!patch.classLevels && patch.level !== undefined && nextClassLevels.length === 1) {
    nextClassLevels[0].level = Math.max(1, Math.min(20, patch.level));
  }
  if (!patch.classLevels && patch.className !== undefined && nextClassLevels.length === 1) {
    nextClassLevels[0].className = patch.className;
  }
  if (!patch.classLevels && patch.subclass !== undefined && nextClassLevels.length === 1) {
    nextClassLevels[0].subclass = patch.subclass || undefined;
  }

  const nextTotalLevel = Math.min(20, nextClassLevels.reduce((sum, entry) => sum + entry.level, 0));
  const nextClassName = nextClassLevels[0]?.className ?? patch.className ?? currentCharacter.className;
  const nextSubclass = nextClassLevels[0]?.subclass ?? patch.subclass ?? "";
  const nextLevel = nextTotalLevel || Math.max(1, Math.min(20, patch.level ?? currentCharacter.level));
  const nextRace = patch.race ?? currentCharacter.race;
  const nextBackground = patch.background ?? currentCharacter.background;
  const nextFeats = patch.feats ?? currentCharacter.feats;
  const nextAbilities = { ...currentCharacter.abilities, ...(patch.abilities ?? {}) };

  const multiclassErrors = validateMulticlassClassLevels(nextClassLevels, nextAbilities, subclassCatalogue, classCatalogue);
  if (multiclassErrors.length) throw new Error(multiclassErrors[0]);

  const progressionChanged =
    patch.level !== undefined ||
    patch.className !== undefined ||
    patch.classLevels !== undefined ||
    patch.abilities?.con !== undefined;

  const featureSetChanged =
    patch.level !== undefined ||
    patch.className !== undefined ||
    patch.classLevels !== undefined ||
    patch.subclass !== undefined ||
    patch.race !== undefined ||
    patch.background !== undefined ||
    patch.feats !== undefined;

  const next: Character = {
    ...currentCharacter,
    ...patch,
    level: nextLevel,
    className: nextClassName,
    subclass: nextSubclass,
    classLevels: nextClassLevels.length > 1 || patch.classLevels !== undefined
      ? nextClassLevels
      : undefined,
    race: nextRace,
    background: nextBackground,
    feats: nextFeats,
    abilities: nextAbilities,
  };

  if (progressionChanged) {
    const nextMaxHp = nextClassLevels.length > 1
      ? getExpectedMulticlassMaxHp(nextClassLevels, nextAbilities.con, classCatalogue)
      : getExpectedMaxHp(nextClassName, nextLevel, nextAbilities.con, classCatalogue);
    const hpDelta = nextMaxHp - currentCharacter.maxHp;
    next.maxHp = nextMaxHp;
    next.hp = Math.max(0, Math.min(nextMaxHp, currentCharacter.hp + hpDelta));
    next.hitDice = nextClassLevels.length > 1
      ? getMulticlassHitDice(nextClassLevels, classCatalogue)
      : getExpectedHitDice(nextClassName, nextLevel, classCatalogue);
    next.proficiencyBonus = getProficiencyBonus(nextLevel);
  }

  if (featureSetChanged && patch.features === undefined) {
    const oldAutomatic = new Set(
      currentCharacter.featureProvenance.length
        ? currentCharacter.featureProvenance.filter((entry) => entry.source === "automatic").map((entry) => entry.featureId)
        : getAutomaticallyGrantedFeatureIds(currentCharacter, featureCatalogue),
    );
    const preservedFeatures = currentCharacter.features.filter((featureId) => !oldAutomatic.has(featureId));
    const nextAutoFeatures = getAutomaticallyGrantedFeatureIds(
      { ...next, features: preservedFeatures },
      featureCatalogue,
    );
    next.features = Array.from(new Set([...preservedFeatures, ...nextAutoFeatures]));
    next.featureProvenance = next.features.map((featureId) => ({
      featureId,
      source: preservedFeatures.includes(featureId)
        ? (currentCharacter.featureProvenance.find((entry) => entry.featureId === featureId)?.source ?? "legacy")
        : "automatic",
    }));
  }

  if (featureSetChanged && patch.spells === undefined) {
    next.spells = currentCharacter.spells.filter((entry) => {
      if (entry.source !== "normal") return true;
      const spell = spellCatalogue.find((candidate) => candidate.id === entry.spellId);
      return Boolean(spell && isSpellNormallyAvailable(next, spell, classCatalogue));
    });
  }

  return next;
}

export function getAvailableSpells(character: Character, includeOverrides = true, sourceSpells: Spell[] = spells, classCatalogue?: RuleClassCatalogue) {
  return sourceSpells.filter((spell) => isSpellNormallyAvailable(character, spell, classCatalogue) || (includeOverrides && hasOverride(character, "spell", spell.id)));
}

export function getAvailableFeatures(character: Character, includeOverrides = true, sourceFeatures: Feature[] = features) {
  return sourceFeatures.filter((feature) => isFeatureNormallyAvailable(character, feature) || (includeOverrides && hasOverride(character, "feature", feature.id)));
}

export function getAvailableItems(character: Character, includeOverrides = true, sourceItems: Item[] = items) {
  return sourceItems.filter((item) => isItemNormallyAvailable(character, item) || (includeOverrides && hasOverride(character, "item", item.id)));
}

export function getSubclassOptionsForClass(className: string, sourceSubclasses: SubclassDefinition[] = subclasses) {
  return sourceSubclasses.filter((entry) => entry.className === className);
}

export function getRaceNames(sourceRaces: Array<{ name: string }> | string[] = races) {
  return sourceRaces.map((entry) => typeof entry === "string" ? entry : entry.name);
}