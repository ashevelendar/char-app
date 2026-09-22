import type {
  Character,
  ClassDefinition,
  Feature,
  Item,
  RaceDefinition,
  Spell,
  SubclassDefinition,
} from "./types";

const fullCasterProgression = [0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 9, 9];
const halfCasterProgression = [0, 0, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5];
const thirdCasterProgression = [0, 0, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5];
const warlockProgression = [0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];

export const classDefinitions: ClassDefinition[] = [
  { id: "barbarian", name: "Barbarian", spellcasting: "none", maxSpellLevelByCharacterLevel: Array(21).fill(0), subclassUnlockLevel: 3 },
  { id: "bard", name: "Bard", spellcasting: "known", maxSpellLevelByCharacterLevel: fullCasterProgression, subclassUnlockLevel: 3 },
  { id: "cleric", name: "Cleric", spellcasting: "prepared", maxSpellLevelByCharacterLevel: fullCasterProgression, subclassUnlockLevel: 1 },
  { id: "druid", name: "Druid", spellcasting: "prepared", maxSpellLevelByCharacterLevel: fullCasterProgression, subclassUnlockLevel: 2 },
  { id: "fighter", name: "Fighter", spellcasting: "none", maxSpellLevelByCharacterLevel: Array(21).fill(0), subclassUnlockLevel: 3 },
  { id: "monk", name: "Monk", spellcasting: "none", maxSpellLevelByCharacterLevel: Array(21).fill(0), subclassUnlockLevel: 3 },
  { id: "paladin", name: "Paladin", spellcasting: "prepared", maxSpellLevelByCharacterLevel: halfCasterProgression, subclassUnlockLevel: 3 },
  { id: "ranger", name: "Ranger", spellcasting: "known", maxSpellLevelByCharacterLevel: halfCasterProgression, subclassUnlockLevel: 3 },
  { id: "rogue", name: "Rogue", spellcasting: "none", maxSpellLevelByCharacterLevel: Array(21).fill(0), subclassUnlockLevel: 3 },
  { id: "sorcerer", name: "Sorcerer", spellcasting: "known", maxSpellLevelByCharacterLevel: fullCasterProgression, subclassUnlockLevel: 1 },
  { id: "warlock", name: "Warlock", spellcasting: "known", maxSpellLevelByCharacterLevel: warlockProgression, subclassUnlockLevel: 1 },
  { id: "wizard", name: "Wizard", spellcasting: "prepared", maxSpellLevelByCharacterLevel: fullCasterProgression, subclassUnlockLevel: 2 },
  { id: "artificer", name: "Artificer", spellcasting: "prepared", maxSpellLevelByCharacterLevel: thirdCasterProgression, subclassUnlockLevel: 3 },
];

export const races: RaceDefinition[] = [
  { id: "human", name: "Human" },
  { id: "elf", name: "Elf" },
  { id: "dwarf", name: "Dwarf" },
  { id: "lizardfolk", name: "Lizardfolk" },
  { id: "skarn", name: "Skarn" },
  { id: "duskling", name: "Duskling" },
  { id: "half-elf", name: "Half-Elf" },
  { id: "tiefling", name: "Tiefling" },
];

export const subclasses: SubclassDefinition[] = [
  { id: "circle-dragons", name: "Circle of Dragons", className: "Druid" },
  { id: "circle-land", name: "Circle of the Land", className: "Druid" },
  { id: "circle-moon", name: "Circle of the Moon", className: "Druid" },
  { id: "circle-spores", name: "Circle of Spores", className: "Druid" },
  { id: "fiend", name: "The Fiend", className: "Warlock" },
  { id: "great-old-one", name: "The Great Old One", className: "Warlock" },
  { id: "hexblade", name: "Hexblade", className: "Warlock" },
  { id: "school-evocation", name: "School of Evocation", className: "Wizard" },
  { id: "school-abjuration", name: "School of Abjuration", className: "Wizard" },
  { id: "berserker", name: "Path of the Berserker", className: "Barbarian" },
  { id: "lore", name: "College of Lore", className: "Bard" },
  { id: "devotion", name: "Oath of Devotion", className: "Paladin" },
];

export const classes = classDefinitions.map((entry) => entry.name);
export const backgroundNames = ["Acolyte", "Criminal", "Folk Hero", "Hermit", "Noble", "Sage", "Soldier", "Swamp Warden"];

export const spells: Spell[] = [
  { id: "guidance", name: "Guidance", level: 0, school: "Divination", castingTime: "1 action", range: "Touch", duration: "Concentration, up to 1 minute", description: "You touch one willing creature. Once before the spell ends, the target can add a d4 to one ability check of its choice.", classes: ["Cleric", "Druid", "Artificer"] },
  { id: "produce-flame", name: "Produce Flame", level: 0, school: "Conjuration", castingTime: "1 action", range: "Self", duration: "10 minutes", description: "A flickering flame appears in your hand. You can hold it for light or hurl it at a creature using the spell's normal attack rules.", classes: ["Druid"] },
  { id: "eldritch-blast", name: "Eldritch Blast", level: 0, school: "Evocation", castingTime: "1 action", range: "120 feet", duration: "Instantaneous", description: "A beam of crackling energy streaks toward a creature within range.", classes: ["Warlock"] },
  { id: "minor-illusion", name: "Minor Illusion", level: 0, school: "Illusion", castingTime: "1 action", range: "30 feet", duration: "1 minute", description: "You create a sound or an image of an object within range that lasts for the duration.", classes: ["Bard", "Sorcerer", "Warlock", "Wizard"] },
  { id: "cure-wounds", name: "Cure Wounds", level: 1, school: "Evocation", castingTime: "1 action", range: "Touch", duration: "Instantaneous", description: "A creature you touch regains hit points. The spell has no effect on constructs or undead.", higherLevels: "Healing increases when cast with a spell slot of 2nd level or higher.", classes: ["Bard", "Cleric", "Druid", "Paladin", "Ranger", "Artificer"] },
  { id: "entangle", name: "Entangle", level: 1, school: "Conjuration", castingTime: "1 action", range: "90 feet", duration: "Concentration, up to 1 minute", description: "Grasping weeds and vines sprout from the ground in a 20-foot square and can restrict movement.", classes: ["Druid"] },
  { id: "hex", name: "Hex", level: 1, school: "Enchantment", castingTime: "1 bonus action", range: "90 feet", duration: "Concentration, up to 1 hour", description: "You place a curse on a creature that lets you deal extra damage and impose disadvantage on one chosen ability.", classes: ["Warlock"] },
  { id: "armor-of-agathys", name: "Armor of Agathys", level: 1, school: "Abjuration", castingTime: "1 action", range: "Self", duration: "1 hour", description: "Protective frost surrounds you, granting temporary hit points and harming creatures that hit you while those temporary hit points remain.", higherLevels: "Both temporary hit points and damage increase with higher-level slots.", classes: ["Warlock"] },
  { id: "shield", name: "Shield", level: 1, school: "Abjuration", castingTime: "1 reaction", range: "Self", duration: "1 round", description: "An invisible barrier of magical force appears and protects you until the start of your next turn.", classes: ["Sorcerer", "Wizard"] },
  { id: "misty-step", name: "Misty Step", level: 2, school: "Conjuration", castingTime: "1 bonus action", range: "Self", duration: "Instantaneous", description: "Briefly surrounded by silvery mist, you teleport up to 30 feet to an unoccupied space you can see.", classes: ["Sorcerer", "Warlock", "Wizard"] },
  { id: "moonbeam", name: "Moonbeam", level: 2, school: "Evocation", castingTime: "1 action", range: "120 feet", duration: "Concentration, up to 1 minute", description: "A silvery beam of pale light shines down in a cylinder and affects creatures that enter or start their turn there.", higherLevels: "The damaging effect increases with higher-level slots.", classes: ["Druid"] },
  { id: "dragons-breath", name: "Dragon's Breath", level: 2, school: "Transmutation", castingTime: "1 bonus action", range: "Touch", duration: "Concentration, up to 1 minute", description: "You imbue a willing creature with the ability to exhale destructive energy.", higherLevels: "Damage increases with a higher-level slot.", classes: ["Sorcerer", "Wizard"], subclasses: ["Circle of Dragons"] },
  { id: "call-lightning", name: "Call Lightning", level: 3, school: "Conjuration", castingTime: "1 action", range: "120 feet", duration: "Concentration, up to 10 minutes", description: "A storm cloud appears above you and can call down bolts of lightning into an area you can see.", higherLevels: "Damage increases with a higher-level slot.", classes: ["Druid"] },
  { id: "counterspell", name: "Counterspell", level: 3, school: "Abjuration", castingTime: "1 reaction", range: "60 feet", duration: "Instantaneous", description: "You attempt to interrupt a creature in the process of casting a spell.", classes: ["Sorcerer", "Warlock", "Wizard"] },
  { id: "fireball", name: "Fireball", level: 3, school: "Evocation", castingTime: "1 action", range: "150 feet", duration: "Instantaneous", description: "A bright streak flashes from your pointing finger to a point you choose, then blossoms into a fiery explosion.", higherLevels: "Damage increases with a higher-level slot.", classes: ["Sorcerer", "Wizard", "Artificer"] },
  { id: "polymorph", name: "Polymorph", level: 4, school: "Transmutation", castingTime: "1 action", range: "60 feet", duration: "Concentration, up to 1 hour", description: "You transform a creature you can see into a new form for the duration, subject to the spell's restrictions.", classes: ["Bard", "Druid", "Sorcerer", "Wizard"] },
  { id: "flame-strike", name: "Flame Strike", level: 5, school: "Evocation", castingTime: "1 action", range: "60 feet", duration: "Instantaneous", description: "A vertical column of divine fire roars downward in an area you choose.", higherLevels: "Damage increases with a higher-level slot.", classes: ["Cleric"] },
  { id: "wish", name: "Wish", level: 9, school: "Conjuration", castingTime: "1 action", range: "Self", duration: "Instantaneous", description: "Wish is a reality-altering spell capable of reproducing the effects of other spells and achieving broader effects at the DM's discretion.", classes: ["Sorcerer", "Wizard"] },
];

export const features: Feature[] = [
  { id: "druidic", name: "Druidic", source: "Druid", sourceType: "class", requiredLevel: 1, className: "Druid", description: "You know Druidic, the secret language of druids, and can leave hidden messages written in it." },
  { id: "wild-shape", name: "Wild Shape", source: "Druid", sourceType: "class", requiredLevel: 2, className: "Druid", description: "You can use druidic magic to assume the form of a beast according to your campaign's rules." },
  { id: "dragon-affinity", name: "Dragon Affinity", source: "Circle of Dragons", sourceType: "subclass", requiredLevel: 2, className: "Druid", subclassName: "Circle of Dragons", description: "You develop a supernatural connection to dragons. Choose a dragon ancestry that shapes later subclass features." },
  { id: "draconic-speech", name: "Draconic Speech", source: "Circle of Dragons", sourceType: "subclass", requiredLevel: 2, className: "Druid", subclassName: "Circle of Dragons", description: "You can speak, read and write Draconic and communicate basic concepts with dragons." },
  { id: "dragon-form", name: "Dragon Form", source: "Circle of Dragons", sourceType: "subclass", requiredLevel: 6, className: "Druid", subclassName: "Circle of Dragons", description: "You can temporarily assume a draconic form. The precise benefits depend on your Circle of Dragons rules." },
  { id: "draconic-resilience", name: "Draconic Resilience", source: "Circle of Dragons", sourceType: "subclass", requiredLevel: 10, className: "Druid", subclassName: "Circle of Dragons", description: "Your bond with draconic power strengthens, improving your resilience against threats associated with your chosen ancestry." },
  { id: "lizardfolk-bite", name: "Bite", source: "Lizardfolk", sourceType: "race", requiredLevel: 1, raceName: "Lizardfolk", description: "Your fanged maw is a natural weapon suitable for close combat." },
  { id: "lizardfolk-hold-breath", name: "Hold Breath", source: "Lizardfolk", sourceType: "race", requiredLevel: 1, raceName: "Lizardfolk", description: "You can hold your breath for an extended period, according to the rules used by your campaign." },
  { id: "pact-magic", name: "Pact Magic", source: "Warlock", sourceType: "class", requiredLevel: 1, className: "Warlock", description: "Your pact grants you access to a limited set of magical resources represented by your class spellcasting." },
  { id: "eldritch-invocations", name: "Eldritch Invocations", source: "Warlock", sourceType: "class", requiredLevel: 2, className: "Warlock", description: "You learn supernatural secrets that grant additional abilities." },
  { id: "pact-boon", name: "Pact Boon", source: "Warlock", sourceType: "class", requiredLevel: 3, className: "Warlock", description: "Your patron grants you a boon that shapes your pact." },
  { id: "mystic-arcanum", name: "Mystic Arcanum", source: "Warlock", sourceType: "class", requiredLevel: 11, className: "Warlock", description: "Your patron entrusts you with access to powerful arcanum beyond your normal pact magic." },
  { id: "arcane-recovery", name: "Arcane Recovery", source: "Wizard", sourceType: "class", requiredLevel: 1, className: "Wizard", description: "You can recover some spent magical resources after a period of study and rest." },
  { id: "arcane-tradition", name: "Arcane Tradition", source: "Wizard", sourceType: "class", requiredLevel: 2, className: "Wizard", description: "You adopt a wizardly tradition that shapes your specialist features." },
  { id: "spell-mastery", name: "Spell Mastery", source: "Wizard", sourceType: "class", requiredLevel: 18, className: "Wizard", description: "Your mastery of lesser spells allows unusually flexible use of selected spells." },
  { id: "dm-boon", name: "DM's Boon", source: "Campaign", sourceType: "homebrew", requiredLevel: 1, description: "A campaign-specific feature granted directly by the DM." },
];

export const items: Item[] = [
  { id: "longsword", name: "Longsword", category: "Weapon", rarity: "Common", description: "A well-used longsword kept for emergencies and close combat.", weight: "3 lb", value: "15 gp", weaponDamage: "1d8", weaponDamageVersatile: "1d10", weaponDamageType: "slashing", weaponProperties: ["Versatile"], weaponCategory: "Martial", weaponRange: "5 ft.", isWeapon: true },
  { id: "studded-leather", name: "Studded Leather", category: "Armour", rarity: "Common", description: "Light armour reinforced with small metal studs.", weight: "13 lb", value: "45 gp", armorClass: 12, armorCategory: "Light", isArmor: true },
  { id: "healing-potion", name: "Potion of Healing", category: "Consumable", rarity: "Common", description: "A small vial of restorative magic used to recover from injuries.", weight: "0.5 lb", value: "50 gp" },
  { id: "dragon-scale", name: "Dragon Scale Pendant", category: "Wondrous Item", rarity: "Uncommon", description: "A mounted dragon scale worn as a reminder of a druidic bond with dragonkind.", weight: "—", value: "Priceless", requiresAttunement: true },
  { id: "backpack", name: "Backpack", category: "Adventuring Gear", rarity: "Common", description: "A sturdy travel pack containing basic adventuring supplies.", weight: "5 lb", value: "2 gp" },
  { id: "quarterstaff", name: "Quarterstaff", category: "Weapon", rarity: "Common", description: "A simple wooden staff used as a walking stick or weapon.", weight: "4 lb", value: "0.2 gp", weaponDamage: "1d6", weaponDamageVersatile: "1d8", weaponDamageType: "bludgeoning", weaponProperties: ["Versatile"], weaponCategory: "Simple", weaponRange: "5 ft.", isWeapon: true },
  { id: "dagger", name: "Dagger", category: "Weapon", rarity: "Common", description: "A small, light blade suitable for close combat or throwing.", weight: "1 lb", value: "2 gp", weaponDamage: "1d4", weaponDamageType: "piercing", weaponProperties: ["Finesse", "Light", "Thrown"], weaponCategory: "Simple", weaponRange: "20/60 ft.", isWeapon: true },
  { id: "shield", name: "Shield", category: "Armour", rarity: "Common", description: "A sturdy shield carried on one arm for protection.", weight: "6 lb", value: "10 gp", armorClass: 2, shieldBonus: 2, armorCategory: "Shield", isArmor: true, isShield: true },
  { id: "rope-hempen", name: "Hemp Rope", category: "Adventuring Gear", rarity: "Common", description: "A strong coil of hempen rope useful for climbing, tying and general adventuring.", weight: "10 lb", value: "1 gp" },
  { id: "torch", name: "Torch", category: "Adventuring Gear", rarity: "Common", description: "A simple torch that provides light when lit.", weight: "1 lb", value: "0.01 gp" },
  { id: "rations", name: "Rations", category: "Consumable", rarity: "Common", description: "Travel-ready food intended to keep an adventurer fed on the road.", weight: "2 lb", value: "0.5 gp" },
  { id: "waterskin", name: "Waterskin", category: "Adventuring Gear", rarity: "Common", description: "A leather container for carrying drinking water.", weight: "5 lb full", value: "0.2 gp" },
  { id: "cloak-protection", name: "Cloak of Protection", category: "Wondrous Item", rarity: "Uncommon", description: "A magical cloak that improves the wearer's general defenses.", weight: "—", value: "500 gp", requiresAttunement: true, bonusAc: 1 },
  { id: "ring-invisibility", name: "Ring of Invisibility", category: "Ring", rarity: "Legendary", description: "A legendary ring that can render its wearer invisible while its magic is active.", requiresAttunement: true, restricted: true },
  { id: "holy-avenger", name: "Holy Avenger", category: "Weapon", rarity: "Legendary", description: "A legendary weapon of extraordinary power. This demo catalogue treats it as DM-granted content.", requiresAttunement: true, restricted: true },
];

export const defaultCharacter: Character = {
  id: "ashe",
  name: "Ashe",
  race: "Lizardfolk",
  className: "Druid",
  subclass: "Circle of Dragons",
  level: 8,
  background: "Swamp Warden",
  alignment: "Neutral",
  playerName: "Ashe",
  hp: 74,
  maxHp: 74,
  tempHp: 0,
  ac: 17,
  speed: 30,
  hitDice: "8d8",
  proficiencyBonus: 3,
  abilities: { str: 12, dex: 16, con: 14, int: 10, wis: 18, cha: 8 },
  savingThrows: ["int", "wis"],
  skills: ["Animal Handling", "Nature", "Perception", "Survival"],
  languages: ["Common", "Draconic", "Druidic", "Lizardfolk"],
  feats: [],
  optionalFeatures: [],
  features: ["druidic", "wild-shape", "dragon-affinity", "draconic-speech", "dragon-form", "lizardfolk-bite", "lizardfolk-hold-breath"],
  spells: [
    { spellId: "guidance", prepared: true },
    { spellId: "produce-flame", prepared: true },
    { spellId: "cure-wounds", prepared: true },
    { spellId: "entangle", prepared: false },
    { spellId: "moonbeam", prepared: true },
    { spellId: "dragons-breath", prepared: false },
    { spellId: "call-lightning", prepared: true },
  ],
  inventory: [
    { itemId: "longsword", quantity: 1, equipped: false },
    { itemId: "studded-leather", quantity: 1, equipped: true },
    { itemId: "healing-potion", quantity: 3, equipped: false },
    { itemId: "dragon-scale", quantity: 1, equipped: false },
    { itemId: "backpack", quantity: 1, equipped: false },
  ],
  accessOverrides: [],
  resourceUses: {},
  notes: "Character notes will live here. This is currently local demo data, not a database.",
};
