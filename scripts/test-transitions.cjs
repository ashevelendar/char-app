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
const data = require(path.resolve(__dirname, "../src/lib/data.ts"));

function loadCatalogue() {
  const snapshotPath = path.join(__dirname, "fixtures", "fuzz-catalogue.json");
  return fs.existsSync(snapshotPath)
    ? JSON.parse(fs.readFileSync(snapshotPath, "utf8"))
    : null;
}

const snapshot = loadCatalogue();
const source = snapshot ? "Supabase snapshot" : "src/lib/data.ts fixture";
const classes = Array.from(new Set(
  (snapshot?.classes ?? (data.classDefinitions ?? []).map((entry) => entry.name)).filter((name) => rules.getClassDefinition(name)),
));
const races = Array.from(new Set(
  (snapshot?.races ?? (data.races ?? []).map((entry) => entry.name)).filter(Boolean),
));
const subclasses = snapshot?.subclasses ?? data.subclasses ?? [];
const features = snapshot?.features?.length ? snapshot.features : data.features ?? [];
const spells = snapshot?.spells?.length ? snapshot.spells : data.spells ?? [];

assert.ok(classes.length > 0, "No supported classes loaded");
assert.ok(races.length > 0, "No races loaded");
assert.ok(features.length > 0, "No features loaded");

const subclassByClass = new Map();
for (const className of classes) {
  const options = subclasses.filter((entry) => entry.className === className).map((entry) => entry.name);
  subclassByClass.set(className, options);
}

function createRng(seed) {
  let state = seed >>> 0;
  return {
    next() {
      state = (Math.imul(state ^ (state >>> 15), 1 | state) + 0x6D2B79F5) >>> 0;
      let value = Math.imul(state ^ (state >>> 7), 61 | state) ^ state;
      value = (value ^ (value >>> 14)) >>> 0;
      return value / 4294967296;
    },
    int(min, max) {
      return Math.floor(this.next() * (max - min + 1)) + min;
    },
    pick(values) {
      return values[this.int(0, values.length - 1)];
    },
  };
}

function character(overrides = {}) {
  const className = overrides.className ?? "Wizard";
  const level = overrides.level ?? 10;
  const abilities = {
    str: 14,
    dex: 14,
    con: 14,
    int: 16,
    wis: 12,
    cha: 12,
    ...(overrides.abilities ?? {}),
  };
  const base = {
    id: "transition-fuzz",
    name: "Transition Fuzz",
    race: overrides.race ?? races[0],
    subrace: "",
    className,
    subclass: overrides.subclass ?? "",
    level,
    background: overrides.background ?? "",
    alignment: "",
    playerName: "",
    hp: 40,
    maxHp: 40,
    tempHp: 0,
    ac: 15,
    speed: 30,
    hitDice: rules.getExpectedHitDice(className, level),
    proficiencyBonus: rules.getProficiencyBonus(level),
    abilities,
    savingThrows: [],
    skills: ["Arcana", "Perception", "Stealth"],
    tools: [],
    languages: ["Common"],
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
  };
  const expectedMaxHp = rules.getExpectedMaxHp(className, level, abilities.con);
  base.maxHp = expectedMaxHp;
  base.hp = expectedMaxHp;

  const automatic = rules.getAutomaticallyGrantedFeatureIds(base, features);
  return {
    ...base,
    features: automatic,
    featureProvenance: automatic.map((featureId) => ({ featureId, source: "automatic" })),
  };
}

function validSubclass(className, level, rng) {
  const definition = rules.getClassDefinition(className);
  const options = subclassByClass.get(className) ?? [];
  if (!definition || level < (definition.subclassUnlockLevel ?? 1) || !options.length) return "";
  return rng.pick(options);
}

function assertValidState(characterValue, previous, label) {
  const c = characterValue;

  assert.ok(classes.includes(c.className), label + ": class must be supported");
  assert.ok(races.includes(c.race), label + ": race must be in catalogue");
  assert.ok(c.level >= 1 && c.level <= 20, label + ": level must be clamped");
  assert.equal(c.hitDice, rules.getExpectedHitDice(c.className, c.level));
  assert.equal(c.proficiencyBonus, rules.getProficiencyBonus(c.level));
  assert.equal(c.maxHp, rules.getExpectedMaxHp(c.className, c.level, c.abilities.con));
  assert.ok(c.hp >= 0 && c.hp <= c.maxHp);
  assert.equal(new Set(c.features).size, c.features.length);
  assert.equal(new Set(c.spells.map((entry) => entry.spellId)).size, c.spells.length);

  const subclassOptions = subclassByClass.get(c.className) ?? [];
  if (c.subclass) {
    const definition = rules.getClassDefinition(c.className);
    assert.ok(c.level >= (definition?.subclassUnlockLevel ?? 1), label + ": subclass cannot exist before unlock");
    assert.ok(subclassOptions.includes(c.subclass), label + ": subclass must belong to current class");
  }

  for (const featureId of c.features) {
    const feature = features.find((entry) => entry.id === featureId);
    assert.ok(feature, label + ": every feature id must exist");
    const provenance = c.featureProvenance.find((entry) => entry.featureId === featureId);
    assert.ok(provenance, label + ": every feature must have provenance");
    if (provenance.source === "automatic") {
      assert.ok(rules.isFeatureNormallyAvailable(c, feature), label + ": automatic feature is stale");
    }
  }

  for (const entry of c.spells) {
    const spell = spells.find((candidate) => candidate.id === entry.spellId);
    assert.ok(spell, label + ": every spell id must exist");
    if (entry.source === "normal") {
      assert.ok(rules.isSpellNormallyAvailable(c, spell), label + ": normal spell is stale");
    }
  }

  if (previous) {
    assert.equal(c.features.some((id) => previous.features.includes(id) && previous.featureProvenance.some((p) => p.featureId === id && p.source === "automatic") && !rules.isFeatureNormallyAvailable(c, features.find((f) => f.id === id))), false, label + ": old automatic feature leaked through");
  }
}

function seedNormalSpells(c, rng) {
  const available = spells.filter((spell) => rules.isSpellNormallyAvailable(c, spell));
  const selected = [];
  for (const spell of available) {
    if (selected.length >= 8) break;
    selected.push({ spellId: spell.id, prepared: false, source: "normal" });
  }
  if (selected.length < 1) {
    const cantrip = spells.find((spell) => spell.level === 0 && spell.classes.includes(c.className));
    if (cantrip) selected.push({ spellId: cantrip.id, prepared: false, source: "normal" });
  }
  const dmSpell = spells.find((spell) => !available.includes(spell));
  if (dmSpell) selected.push({ spellId: dmSpell.id, prepared: false, source: "dm" });
  return { ...c, spells: selected };
}

function randomPatch(c, rng) {
  const kind = rng.int(0, 5);

  if (kind === 0) {
    const nextClass = rng.pick(classes.filter((name) => name !== c.className));
    return { className: nextClass, subclass: validSubclass(nextClass, c.level, rng) };
  }

  if (kind === 1) {
    const nextLevel = rng.int(1, 20);
    return { level: nextLevel, subclass: validSubclass(c.className, nextLevel, rng) };
  }

  if (kind === 2) {
    const options = subclassByClass.get(c.className) ?? [];
    const definition = rules.getClassDefinition(c.className);
    if (options.length && c.level >= (definition?.subclassUnlockLevel ?? 1)) {
      return { subclass: rng.pick(options) };
    }
    return { subclass: "" };
  }

  if (kind === 3) {
    const nextRace = rng.pick(races.filter((name) => name !== c.race));
    return { race: nextRace, subrace: "" };
  }

  if (kind === 4) {
    return { background: "" };
  }

  return { abilities: { con: rng.int(8, 20) } };
}

function runSequence(initial, rng, steps) {
  let current = seedNormalSpells(initial, rng);
  assertValidState(current, null, "initial");

  for (let step = 0; step < steps; step += 1) {
    const patch = randomPatch(current, rng);
    const next = rules.applyCharacterTransition(current, patch, {
      subclasses,
      features,
      spells,
    });
    assertValidState(next, current, "step " + step);
    current = next;
  }
  return current;
}

function parseArgs(argv) {
  const args = { iterations: 5000, seed: 20260923 };
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--iterations" || arg === "-n") {
      args.iterations = Math.max(1, Number(argv[++index] ?? args.iterations));
    } else if (arg === "--seed") {
      args.seed = Number(argv[++index] ?? args.seed) >>> 0;
    } else if (/^\d+$/.test(arg)) {
      positional.push(Number(arg));
    }
  }
  if (positional[0] !== undefined) args.iterations = Math.max(1, positional[0]);
  if (positional[1] !== undefined) args.seed = positional[1] >>> 0;
  return args;
}

const parsedArgs = parseArgs(process.argv.slice(2));
const seed = parsedArgs.seed;
const iterations = parsedArgs.iterations;
const rng = createRng(seed);

let transitions = 0;

// Deterministic coverage: every supported class at every level, plus class transitions.
for (const className of classes) {
  for (let level = 1; level <= 20; level += 1) {
    const subclass = validSubclass(className, level, rng);
    const start = character({ className, level, subclass });
    const nextClass = classes[(classes.indexOf(className) + 1) % classes.length];
    const nextSubclass = validSubclass(nextClass, level, rng);
    const transitioned = rules.applyCharacterTransition(start, {
      className: nextClass,
      subclass: nextSubclass,
      level,
    }, { subclasses, features, spells });
    assertValidState(transitioned, start, "deterministic " + className + " " + level);
    transitions += 1;
  }
}

for (let index = 0; index < iterations; index += 1) {
  const startClass = rng.pick(classes);
  const startLevel = rng.int(1, 20);
  const startSubclass = validSubclass(startClass, startLevel, rng);
  const start = character({ className: startClass, level: startLevel, subclass: startSubclass });
  runSequence(start, rng, 8);
  transitions += 8;
}

console.log("");

const multiclassBase = character({
  className: "Fighter",
  level: 5,
  abilities: {
    str: 13, dex: 13, con: 14, int: 13, wis: 10, cha: 13,
  },
});
const multiclassResult = rules.applyCharacterTransition(
  multiclassBase,
  {
    classLevels: [
      { className: "Fighter", level: 3 },
      { className: "Wizard", level: 2 },
    ],
  },
  {
    subclasses,
    features,
    spells,
  },
);
assert.deepEqual(multiclassResult.classLevels, [
  { className: "Fighter", level: 3 },
  { className: "Wizard", level: 2 },
]);
assert.equal(multiclassResult.level, 5);
assert.equal(multiclassResult.hitDice, "3d10 + 2d6");
assert.equal(multiclassResult.maxHp, rules.getExpectedMulticlassMaxHp(multiclassResult.classLevels, 14));

console.log("✓ Character transition fuzz test passed");
console.log("  Catalogue source:", source);
console.log("  Supported classes:", classes.length);
console.log("  Deterministic transitions:", classes.length * 20);
console.log("  Random sequences:", iterations);
console.log("  Random transitions:", iterations * 8);
console.log("  Total transitions:", transitions);
console.log("  Seed:", seed);
console.log("");
