export type AbilityKey = "str" | "dex" | "con" | "int" | "wis" | "cha";
export type AbilityScores = Record<AbilityKey, number>;
export type SpellLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type AccessMode = "player" | "dm";
export type ContentType = "spell" | "feature" | "item";
export type FeatureSourceType = "class" | "subclass" | "race" | "background" | "feat" | "homebrew";

export interface Spell {
  id: string;
  name: string;
  level: SpellLevel;
  school: string;
  castingTime: string;
  range: string;
  duration: string;
  description: string;
  higherLevels?: string;
  classes: string[];
  subclasses?: string[];
  races?: string[];
  requiredCharacterLevel?: number;
  source?: string;
  edition?: "2014" | "2024" | "custom";
  contentKey?: string;
}

export interface Feature {
  id: string;
  name: string;
  source: string;
  sourceType: FeatureSourceType;
  requiredLevel: number;
  description: string;
  uses?: { max: number; recovery: string };
  className?: string;
  subclassName?: string;
  raceName?: string;
  backgroundName?: string;
  featId?: string;
  requiresFeatureId?: string;
}


export interface Feat {
  id: string;
  name: string;
  description: string;
  prerequisite?: unknown;
  ability?: unknown;
  source: string;
  edition?: "2014" | "2024" | "custom";
  contentKey?: string;
}

export interface Item {
  id: string;
  name: string;
  category: string;
  rarity: string;
  description: string;
  weight?: string;
  value?: string;
  requiresAttunement?: boolean;
  restricted?: boolean;
  requiredCharacterLevel?: number;
  requiredClass?: string;
  armorClass?: number;
  armorCategory?: string;
  armorDexMax?: number | null;
  shieldBonus?: number;
  strengthRequirement?: number;
  stealthDisadvantage?: boolean;
  weaponDamage?: string;
  weaponDamageVersatile?: string;
  weaponDamageType?: string;
  weaponProperties?: string[];
  weaponCategory?: string;
  weaponRange?: string;
  magicBonus?: number;
  bonusAc?: number;
  isWeapon?: boolean;
  isArmor?: boolean;
  isShield?: boolean;
}

export type HomebrewType = "spell" | "feature" | "feat" | "item" | "race" | "subrace" | "class" | "subclass" | "background" | "other";

export interface HomebrewContent {
  id: string;
  name: string;
  contentType: HomebrewType;
  description: string;
  source: string;
  edition: "2014" | "2024" | "custom";
  className?: string;
  subclassName?: string;
  raceName?: string;
  backgroundName?: string;
  requiredLevel?: number;
  featureTypes: string[];
  prerequisites: unknown;
  data: unknown;
  isPublished: boolean;
}

export interface InventoryEntry {
  itemId: string;
  quantity: number;
  equipped: boolean;
  notes?: string;
}

export interface SpellEntry {
  spellId: string;
  prepared: boolean;
}

export interface ContentOverride {
  type: ContentType;
  contentId: string;
  reason?: string;
}

export interface SubraceDefinition {
  id: string;
  name: string;
  parentRace: string;
  description: string;
  source: string;
  abilityBonuses: Partial<AbilityScores>;
  speed?: number;
}

export interface OptionalFeatureDefinition {
  id: string;
  name: string;
  description: string;
  featureTypes: string[];
  source: string;
  contentKey?: string;
}

export interface Currency {
  cp: number;
  sp: number;
  ep: number;
  gp: number;
  pp: number;
}

export interface Character {
  id: string;
  name: string;
  race: string;
  subrace: string;
  className: string;
  subclass: string;
  level: number;
  background: string;
  alignment: string;
  playerName: string;
  hp: number;
  maxHp: number;
  tempHp: number;
  ac: number;
  speed?: number;
  hitDice: string;
  proficiencyBonus: number;
  abilities: AbilityScores;
  savingThrows: AbilityKey[];
  skills: string[];
  tools: string[];
  languages: string[];
  features: string[];
  spells: SpellEntry[];
  inventory: InventoryEntry[];
  feats: string[];
  optionalFeatures: string[];
  homebrew: string[];
  accessOverrides: ContentOverride[];
  resourceUses: Record<string, number>;
  currency: Currency;
  notes: string;
}

export interface NewCharacterInput {
  name: string;
  race: string;
  subrace?: string;
  className: string;
  subclass: string;
  level: number;
  background: string;
  alignment: string;
  playerName: string;
  hp: number;
  maxHp: number;
  ac: number;
  speed: number;
  hitDice: string;
  proficiencyBonus: number;
  abilities: AbilityScores;
  savingThrows?: AbilityKey[];
  notes: string;
  spells?: SpellEntry[];
  skills?: string[];
  tools?: string[];
  languages?: string[];
  optionalFeatures?: string[];
  homebrew?: string[];
  feats?: string[];
  inventory?: InventoryEntry[];
  resourceUses?: Record<string, number>;
  currency?: Currency;
}

export interface ClassDefinition {
  id: string;
  name: string;
  spellcasting: "prepared" | "known" | "none";
  maxSpellLevelByCharacterLevel: number[];
  subclassUnlockLevel: number;
}

export interface ClassRuleData {
  hitDie?: number | null;
  spellcastingAbility?: string | null;
  casterProgression?: string | null;
  cantripProgression?: number[];
  spellsKnownProgression?: number[];
  preparedSpells?: string | null;
  spellbookProgression?: number[];
  spellSlots?: number[][];
  pactSlotProgression?: Array<{ count: number; level: number }>;
  subclassUnlockLevel?: number;
  asiLevels?: number[];
}

export interface SubclassDefinition {
  id: string;
  name: string;
  className: string;
}

export interface RaceDefinition {
  id: string;
  name: string;
}
