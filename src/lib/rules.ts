import { classDefinitions, features, items, races, spells, subclasses } from "./data";
import type { Character, ContentType, Feature, Item, Spell } from "./types";

export function getClassDefinition(className: string) {
  return classDefinitions.find((entry) => entry.name === className);
}

export function getSubclassDefinition(subclassName: string) {
  return subclasses.find((entry) => entry.name === subclassName);
}

export function getMaxSpellLevel(character: Character) {
  const definition = getClassDefinition(character.className);
  return definition?.maxSpellLevelByCharacterLevel[Math.max(1, Math.min(20, character.level))] ?? 0;
}

export function getSpellcastingMode(character: Character) {
  return getClassDefinition(character.className)?.spellcasting ?? "none";
}

export function getHitDieSize(className: string) {
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

export function getExpectedMaxHp(className: string, level: number, constitution: number) {
  const safeLevel = Math.max(1, Math.min(20, level));
  const hitDie = getHitDieSize(className);
  const averageGain = Math.floor(hitDie / 2) + 1;
  const conMod = getAbilityModifier(constitution);
  return Math.max(1, hitDie + conMod + Math.max(0, safeLevel - 1) * (averageGain + conMod));
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

export function getAvailableSpells(character: Character, includeOverrides = true) {
  return spells.filter((spell) => isSpellNormallyAvailable(character, spell) || (includeOverrides && hasOverride(character, "spell", spell.id)));
}

export function getAvailableFeatures(character: Character, includeOverrides = true) {
  return features.filter((feature) => isFeatureNormallyAvailable(character, feature) || (includeOverrides && hasOverride(character, "feature", feature.id)));
}

export function getAvailableItems(character: Character, includeOverrides = true) {
  return items.filter((item) => isItemNormallyAvailable(character, item) || (includeOverrides && hasOverride(character, "item", item.id)));
}

export function getSubclassOptionsForClass(className: string) {
  return subclasses.filter((entry) => entry.className === className);
}

export function getRaceNames() {
  return races.map((entry) => entry.name);
}
