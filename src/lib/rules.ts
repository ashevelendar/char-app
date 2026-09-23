import { classDefinitions, features, items, races, spells, subclasses } from "./data";
import type { AbilityKey, AbilityScores, AsiHistoryEntry, Character, ClassRuleData, ContentType, ExpertiseHistoryEntry, Feat, Feature, Item, MagicalSecretsHistoryEntry, Spell, SubclassDefinition } from "./types";

type RuleClassCatalogue = Record<string, ClassRuleData>;

function getDynamicClassRule(className: string, classCatalogue?: RuleClassCatalogue) {
  return classCatalogue?.[className];
}
