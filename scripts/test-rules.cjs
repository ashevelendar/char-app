const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

require.extensions[".ts"] = function loadTypeScript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const rules = require(path.resolve(__dirname, "../src/lib/rules.ts"));

const character = (overrides = {}) => ({
  id: "test",
  name: "Test",
  race: "Human",
  subrace: "",
  className: "Wizard",
  subclass: "",
  level: 5,
  background: "",
  alignment: "",
  playerName: "",
  hp: 20,
  maxHp: 20,
  tempHp: 0,
  ac: 10,
  speed: 30,
  hitDice: "5d6",
  proficiencyBonus: 3,
  abilities: { str: 10, dex: 14, con: 14, int: 16, wis: 10, cha: 10 },
  savingThrows: [],
  skills: [],
  tools: [],
  languages: [],
  features: [],
  featureProvenance: [],
  spells: [],
  inventory: [],
  feats: [],
  asiHistory: [],
  expertiseHistory: [],
  magicalSecretsHistory: [],
  optionalFeatures: [],
  homebrew: [],
  accessOverrides: [],
  resourceUses: {},
  currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
  notes: "",
  ...overrides,
});

function test(name, fn) {
  try {
    fn();
    console.log("✓ " + name);
  } catch (error) {
    console.error("✗ " + name);
    throw error;
  }
}

test("proficiency bonus follows 5e level bands", () => {
  assert.equal(rules.getProficiencyBonus(1), 2);
  assert.equal(rules.getProficiencyBonus(5), 3);
  assert.equal(rules.getProficiencyBonus(9), 4);
  assert.equal(rules.getProficiencyBonus(13), 5);
  assert.equal(rules.getProficiencyBonus(17), 6);
  assert.equal(rules.getProficiencyBonus(20), 6);
});

test("ability modifiers use floor((score - 10) / 2)", () => {
  assert.equal(rules.getAbilityModifier(9), -1);
  assert.equal(rules.getAbilityModifier(10), 0);
  assert.equal(rules.getAbilityModifier(14), 2);
  assert.equal(rules.getAbilityModifier(20), 5);
});

test("single-class characters do not require multiclass prerequisites", () => {
  const wizard = character({
    className: "Wizard",
    level: 1,
    abilities: { str: 8, dex: 10, con: 10, int: 10, wis: 10, cha: 8 },
    classLevels: [{ className: "Wizard", level: 1 }],
  });
  assert.deepEqual(rules.validateMulticlassClassLevels(wizard.classLevels, wizard.abilities), []);
});

test("multiclass prerequisites and total level are enforced", () => {
  const fighterWizard = character({ className: "Fighter", subclass: "", level: 7, abilities: { str: 13, dex: 10, con: 14, int: 13, wis: 10, cha: 8 }, classLevels: [
    { className: "Fighter", level: 3 },
    { className: "Wizard", level: 4 },
  ] });
  assert.equal(rules.getTotalCharacterLevel(fighterWizard), 7);
  assert.equal(rules.getClassLevel(fighterWizard, "Fighter"), 3);
  assert.equal(rules.getClassLevel(fighterWizard, "Wizard"), 4);
  assert.deepEqual(rules.validateMulticlassClassLevels(fighterWizard.classLevels, fighterWizard.abilities), []);

  const badFighter = character({ className: "Fighter", subclass: "", level: 2, abilities: { str: 12, dex: 12, con: 10, int: 10, wis: 10, cha: 10 }, classLevels: [
    { className: "Fighter", level: 1 },
    { className: "Wizard", level: 1 },
  ] });
  assert.ok(rules.validateMulticlassClassLevels(badFighter.classLevels, badFighter.abilities).some((error) => error.includes("Fighter")));
});

test("multiclass HP and hit dice use each class hit die", () => {
  const c = character({
    className: "Fighter",
    level: 5,
    abilities: { str: 13, dex: 10, con: 14, int: 13, wis: 10, cha: 8 },
    classLevels: [
      { className: "Fighter", level: 3 },
      { className: "Wizard", level: 2 },
    ],
  });
  assert.equal(rules.getMulticlassHitDice(c.classLevels), "3d10 + 2d6");
  assert.equal(rules.getExpectedMulticlassMaxHp(c.classLevels, 14), 42);
});

test("multiclass spell eligibility remains class-level specific", () => {
  const wizard = character({
    className: "Wizard",
    level: 5,
    abilities: { str: 8, dex: 10, con: 10, int: 13, wis: 13, cha: 8 },
    classLevels: [
      { className: "Wizard", level: 1 },
      { className: "Cleric", level: 4 },
    ],
  });
  const secondLevelWizardSpell = spells.find((spell) => spell.level === 2 && spell.classes.includes("Wizard"));
  assert.ok(secondLevelWizardSpell);
  assert.equal(rules.isSpellNormallyAvailable(wizard, secondLevelWizardSpell), false);
});

test("multiclass spellcasting combines caster levels but keeps Warlock pact magic separate", () => {
  const clericWizard = character({
    className: "Cleric",
    level: 5,
    abilities: { str: 8, dex: 10, con: 10, int: 13, wis: 13, cha: 8 },
    classLevels: [
      { className: "Cleric", level: 3 },
      { className: "Wizard", level: 2 },
    ],
  });
  assert.equal(rules.getMulticlassSpellcastingLevel(clericWizard), 5);
  assert.deepEqual(rules.getMulticlassSpellSlotSummary(clericWizard), [
    { level: 1, count: 4 },
    { level: 2, count: 3 },
    { level: 3, count: 2 },
  ]);

  const warlockWizard = character({
    className: "Wizard",
    level: 5,
    abilities: { str: 8, dex: 10, con: 10, int: 13, wis: 10, cha: 13 },
    classLevels: [
      { className: "Wizard", level: 3 },
      { className: "Warlock", level: 2 },
    ],
  });
  assert.equal(rules.getMulticlassSpellcastingLevel(warlockWizard), 3);
  assert.equal(rules.getMulticlassMaxSpellLevel(warlockWizard), 2);
  assert.deepEqual(rules.getSpellSlotSummary("Warlock", 2), [{ level: 1, count: 2 }]);
});

test("multiclass ASIs are derived from class levels", () => {
  const c = character({
    className: "Fighter",
    level: 8,
    abilities: { str: 13, dex: 13, con: 10, int: 10, wis: 10, cha: 10 },
    classLevels: [
      { className: "Fighter", level: 4 },
      { className: "Rogue", level: 4 },
    ],
  });
  assert.deepEqual(rules.getAbilityScoreImprovementLevelsForCharacter(c), [4, 8]);
});

test("HP progression uses class hit die and Constitution", () => {
  assert.equal(rules.getExpectedMaxHp("Wizard", 1, 10), 6);
  assert.equal(rules.getExpectedMaxHp("Wizard", 5, 14), 32);
  assert.equal(rules.getExpectedMaxHp("Fighter", 5, 14), 44);
});

test("hit dice track class hit die and level", () => {
  assert.equal(rules.getExpectedHitDice("Wizard", 5), "5d6");
  assert.equal(rules.getExpectedHitDice("Fighter", 8), "8d10");
});

test("ASI levels are correct for standard classes", () => {
  assert.deepEqual(rules.getAbilityScoreImprovementLevels("Wizard"), [4, 8, 12, 16, 19]);
  assert.deepEqual(rules.getAbilityScoreImprovementLevels("Fighter"), [4, 6, 8, 12, 14, 16, 19]);
  assert.deepEqual(rules.getNewAbilityScoreImprovementLevels("Fighter", 4, 8), [6, 8]);
});

test("full caster spell progression reaches 3rd-level spells at wizard 5", () => {
  const wizard = character({ level: 5 });
  const wizardClass = {
    id: "test-wizard",
    name: "Wizard",
    spellSlots: [[2], [3], [4, 2], [4, 3], [4, 3, 2]],
  };
  const classCatalogue = { Wizard: wizardClass };
  assert.equal(rules.getMaxSpellLevel(wizard, classCatalogue), 3);
  assert.deepEqual(
    rules.getSpellSlotSummary("Wizard", 5, classCatalogue),
    [
      { level: 1, count: 4 },
      { level: 2, count: 3 },
      { level: 3, count: 2 },
    ],
  );
});

test("warlock uses pact spell slots", () => {
  const warlock = character({ className: "Warlock", level: 10 });
  assert.equal(rules.getMaxSpellLevel(warlock), 5);
  const slots = rules.getSpellSlotSummary("Warlock", 10);
  assert.deepEqual(slots, [{ level: 5, count: 2 }]);
});

test("spellcasting mode distinguishes prepared and known casters", () => {
  assert.equal(rules.getSpellcastingMode(character({ className: "Wizard" })), "prepared");
  assert.equal(rules.getSpellcastingMode(character({ className: "Bard" })), "known");
  assert.equal(rules.getSpellcastingMode(character({ className: "Fighter" })), "none");
});

test("prepared spell limits and known-spell limits are level-aware", () => {
  const wizard = character({ className: "Wizard", level: 5 });
  const wizardClass = {
    id: "test-wizard",
    name: "Wizard",
    preparedSpells: "<$int_mod$> + <$level$>",
    spellcastingAbility: "int",
    casterProgression: "full",
  };
  const classCatalogue = { Wizard: wizardClass };
  assert.equal(rules.getPreparedSpellCount(wizard, classCatalogue), 8);
  assert.equal(rules.getSpellsKnown("Warlock", 5), 6);
});

test("ASI validation catches missing, duplicate and invalid choices", () => {
  const errors = rules.validateAsiHistory(
    [{ level: 4, mode: "one", first: "str", second: "str" }],
    "Wizard",
    8,
  );
  assert.ok(errors.some((error) => error.includes("must be different")));
  assert.ok(errors.some((error) => error.includes("level 8 is missing")));
});

test("Expertise validation enforces two proficient, unique skills", () => {
  const errors = rules.validateExpertiseHistory(
    [{ level: 3, skills: ["Stealth", "Stealth"] }],
    [3],
    ["Stealth", "Perception"],
  );
  assert.ok(errors.some((error) => error.includes("duplicate skill")));
});

test("inventory weight and carrying capacity use Strength", () => {
  const c = character({ abilities: { str: 12, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } });
  const item = { id: "heavy", name: "Heavy Item", category: "Adventuring Gear", rarity: "Common", description: "", weight: "20 lb" };
  const inventory = [{ itemId: "heavy", quantity: 2, equipped: false }];
  assert.equal(rules.getInventoryWeight(c, [item]), 0);
  assert.equal(rules.getInventoryWeight({ ...c, inventory }, [item]), 40);
  assert.equal(rules.getCarryingCapacity(c), 180);
  assert.equal(rules.isItemOverCarryingCapacity({ ...c, inventory: [{ itemId: "heavy", quantity: 10, equipped: false }] }, [item]), true);
});

console.log("\nAll rules tests passed.\n");
