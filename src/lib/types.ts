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
  armorDexMax?: number | null;
  shieldBonus?: number;
  strengthRequirement?: number;
  stealthDisadvantage?: boolean;
  weaponDamage?: string;
  weaponDamageVersatile?: string;
  weaponDamageType?: string;
  weaponProperties?: string[];
  weaponRange?: string;
  magicBonus?: number;
  bonusAc?: number;
  isWeapon?: boolean;
  isArmor?: boolean;
  isShield?: boolean;
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

export interface Character {
  id: string;
  name: string;
  race: string;
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
  speed: number;
  hitDice: string;
  proficiencyBonus: number;
  abilities: AbilityScores;
  savingThrows: AbilityKey[];
  skills: string[];
  languages: string[];
  features: string[];
  spells: SpellEntry[];
  inventory: InventoryEntry[];
  feats: string[];
  optionalFeatures: string[];
  accessOverrides: ContentOverride[];
  resourceUses: Record<string, number>;
  notes: string;
}

export interface NewCharacterInput {
  name: string;
  race: string;
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
  notes: string;
  skills?: string[];
  languages?: string[];
  feats?: string[];
  resourceUses?: Record<string, number>;
}

export interface ClassDefinition {
  id: string;
  name: string;
  spellcasting: "prepared" | "known" | "none";
  maxSpellLevelByCharacterLevel: number[];
  subclassUnlockLevel: number;
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
