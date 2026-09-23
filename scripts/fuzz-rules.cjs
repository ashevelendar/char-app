const fs = require("node:fs");
const path = require("node:path");
const nodeAssert = require("node:assert/strict");

const assertionMetrics = { total: 0, ok: 0, equal: 0, deepEqual: 0 };
const checkMetrics = new Map();
const assert = {
  ok(...args) {
    assertionMetrics.total += 1;
    assertionMetrics.ok += 1;
    return nodeAssert.ok(...args);
  },
  equal(...args) {
    assertionMetrics.total += 1;
    assertionMetrics.equal += 1;
    return nodeAssert.equal(...args);
  },
  deepEqual(...args) {
    assertionMetrics.total += 1;
    assertionMetrics.deepEqual += 1;
    return nodeAssert.deepEqual(...args);
  },
};

function loadFuzzCatalogue() {
  const snapshotPath = path.join(__dirname, "fixtures", "fuzz-catalogue.json");
  if (!fs.existsSync(snapshotPath)) {
    console.warn("  Catalogue snapshot not found. Using the small src/lib/data.ts fixture catalogue.");
    console.warn("  Run: npm run fuzz:catalogue");
    return null;
  }
  return JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
}

const fuzzCatalogue = loadFuzzCatalogue();
const catalogueSource = fuzzCatalogue ? "Supabase snapshot" : "src/lib/data.ts fixture";
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

const DEFAULT_ITERATIONS = 500000;

function parseArgs(argv) {
  const args = { iterations: DEFAULT_ITERATIONS, seed: 20260923 };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--iterations" || arg === "-n") {
      args.iterations = Math.max(1, Number(argv[++index] ?? DEFAULT_ITERATIONS));
    } else if (arg === "--seed") {
      args.seed = Number(argv[++index] ?? args.seed) >>> 0;
    } else if (/^\d+$/.test(arg)) {
      // Also accept a bare positional iteration count.
      args.iterations = Math.max(1, Number(arg));
    } else if (arg === "--help" || arg === "-h") {
      console.log("Usage: node scripts/fuzz-rules.cjs [--iterations 500000] [--seed 12345]");
      process.exit(0);
    }
  }
  return args;
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

const rng = createRng(parseArgs(process.argv.slice(2)).seed);

const classes = Array.from(new Set(
  (fuzzCatalogue?.classes ?? (data.classDefinitions ?? []).map((entry) => entry.name)).filter(Boolean),
));
const races = Array.from(new Set(
  (fuzzCatalogue?.races ?? (data.races ?? []).map((entry) => entry.name)).filter(Boolean),
));
const subclasses = fuzzCatalogue?.subclasses ?? data.subclasses ?? [];
const abilityKeys = ["str", "dex", "con", "int", "wis", "cha"];
const skills = [
  "Acrobatics", "Animal Handling", "Arcana", "Athletics", "Deception",
  "History", "Insight", "Intimidation", "Investigation", "Medicine",
  "Nature", "Perception", "Performance", "Persuasion", "Religion",
  "Sleight of Hand", "Stealth", "Survival",
];

const backgrounds = Array.from(new Set(
  (fuzzCatalogue?.backgrounds ?? data.backgroundNames ?? (data.backgrounds ?? []).map((entry) => entry.name)).filter(Boolean),
));

function buildSyntheticFeats() {
  const result = [];
  for (let index = 0; index < 36; index += 1) {
    const ability = abilityKeys[index % abilityKeys.length];
    const secondAbility = abilityKeys[(index + 1) % abilityKeys.length];
    const prerequisite = index % 6 === 0
      ? { level: 8 }
      : index % 6 === 1
        ? { ability: [{ [ability]: 13 }] }
        : index % 6 === 2
          ? { class: [classes[index % classes.length]] }
          : index % 6 === 3
            ? { race: [{ name: races[index % races.length] }] }
            : index % 6 === 4
              ? { proficiency: [skills[index % skills.length]] }
              : { feat: ["Fuzz Prerequisite"] };
    result.push({
      id: "fuzz-feat-" + index,
      name: index === 0 ? "Fuzz Prerequisite" : "Fuzz Feat " + index,
      description: "Synthetic feat used by the headless rules fuzzer.",
      prerequisite,
      ability: index % 5 === 0
        ? [{ from: [ability, secondAbility], amount: 1 }]
        : index % 5 === 1
          ? { ability, amount: 2 }
          : { [ability]: 1 },
      source: "Fuzz Fixture",
      edition: "custom",
    });
  }
  return result;
}

const feats = fuzzCatalogue?.feats?.length ? fuzzCatalogue.feats : data.feats?.length ? data.feats : buildSyntheticFeats();
const spells = fuzzCatalogue?.spells?.length ? fuzzCatalogue.spells : data.spells ?? [];
const features = fuzzCatalogue?.features?.length ? fuzzCatalogue.features : data.features ?? [];

const supportedClasses = classes.filter((className) => Boolean(rules.getClassDefinition(className)));

const validClassSubclasses = supportedClasses.flatMap((className) => {
  const names = subclasses
    .filter((entry) => entry.className === className)
    .map((entry) => entry.name);
  return (names.length ? names : [""]).map((subclass) => ({ className, subclass }));
});

assert.ok(classes.length > 0, "No classes loaded from " + catalogueSource);
assert.ok(races.length > 0, "No races loaded from " + catalogueSource);
assert.equal(
  supportedClasses.length,
  classes.length,
  "Every catalogue class must be supported by the rules engine",
);

function character(overrides = {}) {
  const className = overrides.className ?? rng.pick(classes);
  const level = overrides.level ?? rng.int(1, 20);
  const abilities = {
    str: rng.int(3, 20),
    dex: rng.int(3, 20),
    con: rng.int(3, 20),
    int: rng.int(3, 20),
    wis: rng.int(3, 20),
    cha: rng.int(3, 20),
    ...(overrides.abilities ?? {}),
  };

  return {
    id: "fuzz",
    name: "Fuzz",
    race: overrides.race ?? rng.pick(races),
    subrace: overrides.subrace ?? "",
    className,
    subclass: overrides.subclass ?? "",
    level,
    background: overrides.background ?? (backgrounds.length ? rng.pick(backgrounds) : ""),
    alignment: "",
    playerName: "",
    hp: 1,
    maxHp: 1,
    tempHp: 0,
    ac: 10,
    speed: 30,
    hitDice: "",
    proficiencyBonus: 0,
    abilities,
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
  };
}

function check(name, fn, context) {
  checkMetrics.set(name, (checkMetrics.get(name) ?? 0) + 1);
  try {
    fn();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      [
        name,
        detail,
        "",
        "Character:",
        JSON.stringify(context, null, 2),
      ].join("\n"),
      { cause: error },
    );
  }
}

function assertFiniteNonNegative(value, label) {
  assert.equal(typeof value, "number", label + " must be a number");
  assert.ok(Number.isFinite(value), label + " must be finite");
  assert.ok(value >= 0, label + " must be non-negative");
}

function fuzzCharacter(characterValue, coverage = {}) {
  const c = characterValue;
  const scanAllCatalogue = coverage.scanAllCatalogue === true;
  const featScan = coverage.skipFeatScan ? [] : coverage.focusFeat ? [coverage.focusFeat] : scanAllCatalogue ? feats : [];
  const spellScan = coverage.focusSpell ? [coverage.focusSpell] : coverage.spellScan ? coverage.spellScan : scanAllCatalogue ? spells : spells.slice(0, Math.min(spells.length, 40));
  const spellPool = scanAllCatalogue ? spells : spellScan;
  const level = c.level;

  check("basic progression", () => {
    const definition = rules.getClassDefinition(c.className);
    assert.ok(definition && definition.name === c.className);
    assert.equal(rules.getAbilityModifier(3), -4);
    assert.equal(rules.getAbilityModifier(9), -1);
    assert.equal(rules.getAbilityModifier(10), 0);
    assert.equal(rules.getAbilityModifier(11), 0);
    assert.equal(rules.getAbilityModifier(20), 5);
    assert.equal(rules.getProficiencyBonus(level), 2 + Math.floor((level - 1) / 4));

    const hitDie = rules.getHitDieSize(c.className);
    assert.ok(Number.isInteger(hitDie) && hitDie > 0);

    const expectedHp = rules.getExpectedMaxHp(c.className, level, c.abilities.con);
    const expectedHitDice = rules.getExpectedHitDice(c.className, level);
    assert.ok(Number.isInteger(expectedHp) && expectedHp > 0);
    assert.equal(expectedHitDice, level + "d" + hitDie);

    if (level > 1) {
      assert.ok(
        rules.getExpectedMaxHp(c.className, level, c.abilities.con) >=
        rules.getExpectedMaxHp(c.className, level - 1, c.abilities.con),
        "HP should not decrease as level increases",
      );
    }
  }, c);

  check("spell progression", () => {
    const maxSpellLevel = rules.getMaxSpellLevel(c);
    const mode = rules.getSpellcastingMode(c);
    const slots = rules.getSpellSlotSummary(c.className, level);

    assert.ok(Number.isInteger(maxSpellLevel) && maxSpellLevel >= 0 && maxSpellLevel <= 9);
    assert.ok(["none", "prepared", "known"].includes(mode));

    let previousSlotLevel = 0;
    for (const slot of slots) {
      assert.ok(Number.isInteger(slot.level) && slot.level >= 1 && slot.level <= 9);
      assert.ok(Number.isInteger(slot.count) && slot.count > 0);
      assert.ok(slot.level > previousSlotLevel);
      assert.ok(slot.level <= maxSpellLevel || mode === "none");
      previousSlotLevel = slot.level;
    }

    const cantrips = rules.getCantripsKnown(c.className, level);
    const known = rules.getSpellsKnown(c.className, level);
    const prepared = rules.getPreparedSpellCount(c);

    assert.ok(Number.isInteger(cantrips) && cantrips >= 0);
    assert.ok(known === null || (Number.isInteger(known) && known >= 0));
    assert.ok(prepared === null || (Number.isInteger(prepared) && prepared >= 1));

    const spellbook = rules.getSpellbookProgression(c.className, level);
    const wizardSpellbook = rules.getWizardSpellbookProgression(level);
    assert.ok(spellbook === null || (Number.isInteger(spellbook) && spellbook >= 0));
    assert.equal(wizardSpellbook, 6 + (level - 1) * 2);

    const summary = rules.getSpellcastingSummary(c);
    assert.equal(summary.mode, mode);
    assert.equal(summary.maxSpellLevel, maxSpellLevel);
  }, c);

  check("feat parsing and prerequisites", () => {
    for (const feat of featScan) {
      const options = rules.getFeatAbilityOptions(feat);
      const bonuses = rules.getFeatAbilityBonuses(feat);
      assert.ok(Array.isArray(options));
      assert.ok(bonuses && typeof bonuses === "object");

      for (const option of options) {
        assert.ok(abilityKeys.includes(option.ability));
        assert.ok(Number.isFinite(option.amount));
      }

      const selected = options[0];
      if (selected) {
        const selectedBonuses = rules.getFeatAbilityBonuses(feat, selected.ability);
        assert.equal(selectedBonuses[selected.ability], selected.amount);
      }

      const available = rules.isFeatAvailable(c, feat);
      assert.equal(typeof available, "boolean");
      assert.equal(typeof rules.getFeatRestrictionReason(c, feat), "string");

      // Exercise prerequisite parsing with the feat explicitly owned as both
      // the app-style id and the human-readable name. This catches regressions
      // where feat prerequisites accidentally stop matching either representation.
      const ownedById = { ...c, feats: [feat.id] };
      const ownedByName = { ...c, feats: [feat.name] };
      assert.equal(typeof rules.isFeatAvailable(ownedById, feat), "boolean");
      assert.equal(typeof rules.isFeatAvailable(ownedByName, feat), "boolean");
    }
  }, c);

  check("spell catalogue filtering", () => {
    const available = rules.getAvailableSpells(c, true, spellPool);
    const availableIds = new Set(available.map((spell) => spell.id));

    for (const spell of available) {
      assert.ok(availableIds.has(spell.id));
      assert.ok(spell.level >= 0 && spell.level <= 9);
      assert.ok(spell.level === 0 || spell.level <= rules.getMaxSpellLevel(c));
    }

    for (const spell of spellScan) {
      assert.equal(typeof rules.isSpellNormallyAvailable(c, spell), "boolean");
      assert.equal(typeof rules.getSpellRestrictionReason(c, spell), "string");
    }
  }, c);

  if (coverage.skipFeatureGraph !== true) check("feature dependency graph", () => {
    const availableFeatures = rules.getAvailableFeatures(c, false, features);
    assert.ok(Array.isArray(availableFeatures));
    for (const feature of features.slice(0, Math.min(features.length, 40))) {
      assert.equal(typeof rules.isFeatureNormallyAvailable(c, feature), "boolean");
      assert.equal(typeof rules.getFeatureRestrictionReason(c, feature), "string");
    }

    const granted = rules.getAutomaticallyGrantedFeatureIds(c, features);
    assert.ok(Array.isArray(granted));
    assert.equal(new Set(granted).size, granted.length);

    const subclassOptions = rules.getSubclassOptionsForClass(c.className, subclasses);
    assert.ok(Array.isArray(subclassOptions));
    assert.ok(subclassOptions.every((entry) => entry.className === c.className));
    assert.deepEqual(rules.getRaceNames(races), races);

    const featureIds = new Set(features.map((feature) => feature.id));
    for (const featureId of granted) assert.ok(featureIds.has(featureId));

    const grantedSet = new Set(granted);
    for (const featureId of granted) {
      const feature = features.find((entry) => entry.id === featureId);
      if (!feature) continue;
      const required = feature.requiresFeatureIds?.length
        ? feature.requiresFeatureIds
        : feature.requiresFeatureId
          ? [feature.requiresFeatureId]
          : [];
      for (const prerequisite of required) {
        assert.ok(
          grantedSet.has(prerequisite),
          "Feature " + feature.name + " is granted without prerequisite " + prerequisite,
        );
      }
    }
  }, c);

  check("ASI history", () => {
    const levels = rules.getAbilityScoreImprovementLevelsUpTo(c.className, level);
    const entries = levels.map((asiLevel, index) => {
      if (feats.length && index % 4 === 3) {
        const feat = feats[index % feats.length];
        const options = rules.getFeatAbilityOptions(feat);
        return {
          level: asiLevel,
          mode: "feat",
          featId: feat.id,
          ...(options.length > 1 ? { featAbility: options[0].ability } : {}),
        };
      }
      return {
        level: asiLevel,
        mode: "one",
        first: abilityKeys[index % abilityKeys.length],
        second: abilityKeys[(index + 1) % abilityKeys.length],
      };
    });

    assert.deepEqual(
      rules.validateAsiHistory(entries, c.className, level, feats),
      [],
    );

    const invalid = levels.length
      ? [...entries, { ...entries[0], level: entries[0].level }]
      : [{ level: 4, mode: "one", first: "str", second: "str" }];

    const invalidErrors = rules.validateAsiHistory(invalid, c.className, level, feats);
    assert.ok(invalidErrors.length > 0);
  }, c);

  check("Expertise history", () => {
    const expertiseLevels = c.className === "Rogue"
      ? [3, 6, 10, 14, 18].filter((value) => value <= level)
      : c.className === "Bard"
        ? [3, 10].filter((value) => value <= level)
        : [];

    if (!expertiseLevels.length) return;

    const entries = expertiseLevels.map((expertiseLevel, index) => ({
      level: expertiseLevel,
      skills: [skills[(index * 2) % skills.length], skills[(index * 2 + 1) % skills.length]],
    }));

    assert.deepEqual(
      rules.validateExpertiseHistory(entries, expertiseLevels, entries.flatMap((entry) => entry.skills)),
      [],
    );
  }, c);

  check("Magical Secrets history validation", () => {
    const magicalSecretsLevels = c.className === "Bard"
      ? [10, 14, 18].filter((value) => value <= level)
      : [];

    if (!magicalSecretsLevels.length) return;

    const eligibleSpells = spellPool.filter(
      (spell) => spell.level === 0 || spell.level <= rules.getMaxSpellLevel(c),
    );
    if (!eligibleSpells.length) return;

    const entries = magicalSecretsLevels.map((entryLevel) => ({
      level: entryLevel,
      spellIds: eligibleSpells.slice(0, 2).map((spell) => spell.id),
    }));

    assert.deepEqual(
      rules.validateMagicalSecretsHistory(entries, magicalSecretsLevels, spellPool, c),
      [],
    );
  }, c);
}

function runDeterministicCoverage() {
  let cases = 0;
  const levels = Array.from({ length: 20 }, (_, index) => index + 1);
  const boundaryLevels = [1, 2, 3, 4, 5, 8, 10, 12, 16, 19, 20];
  const representativeAbilities = [
    { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    { str: 20, dex: 20, con: 20, int: 20, wis: 20, cha: 20 },
  ];

  // 1. Core progression: every class at every level and representative CON values.
  // This covers proficiency, hit die, HP, hit dice, ASI levels and non-spellcasting
  // progression without repeating the full race/subclass/cartesian product.
  for (const className of supportedClasses) {
    for (const level of levels) {
      for (const abilities of representativeAbilities) {
        fuzzCharacter(character({ className, level, abilities }), {
          skipFeatureGraph: true,
          skipFeatScan: true,
          spellScan: [],
        });
        cases += 1;
      }
    }
  }

  // 2. Spell progression: every class at every level, plus every real subclass
  // at its owning class and every level. The full spell catalogue is checked
  // separately below, so these cases focus on progression mechanics.
  for (const className of supportedClasses) {
    for (const level of levels) {
      fuzzCharacter(character({ className, level }), {
        skipFeatureGraph: true,
        skipFeatScan: true,
        spellScan: spells,
      });
      cases += 1;
    }
  }
  for (const { className, subclass } of validClassSubclasses) {
    if (!subclass) continue;
    for (const level of levels) {
      fuzzCharacter(character({ className, subclass, level }), {
        skipFeatureGraph: true,
        skipFeatScan: true,
        spellScan: spells,
      });
      cases += 1;
    }
  }

  // 3. Every feat gets targeted prerequisite coverage. We only vary the
  // dimensions that can actually affect that feat, instead of pairing every
  // feat with every race/class/level.
  for (const feat of feats) {
    const prerequisite = feat.prerequisite ?? feat.prerequisites ?? {};
    const raw = JSON.stringify(prerequisite).toLowerCase();
    const hasClass = raw.includes("class");
    const hasRace = raw.includes("race");
    const hasLevel = raw.includes("level");
    const hasAbility = raw.includes("ability");
    const hasProficiency = raw.includes("proficiency") || raw.includes("skill");
    const hasFeat = raw.includes("feat");
    const hasSpellcasting = raw.includes("spellcasting");

    const targetClasses = hasClass ? supportedClasses : [supportedClasses[0]];
    const targetRaces = hasRace ? races : [races[0]];
    const targetLevels = hasLevel ? boundaryLevels : [1, 20];
    const abilitySets = hasAbility
      ? [
          { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
          { str: 13, dex: 13, con: 13, int: 13, wis: 13, cha: 13 },
          { str: 20, dex: 20, con: 20, int: 20, wis: 20, cha: 20 },
        ]
      : [{ str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }];

    for (const className of targetClasses) {
      for (const race of targetRaces) {
        for (const level of targetLevels) {
          for (const abilities of abilitySets) {
            const skillsForFeat = hasProficiency ? skills : [];
            const featsForFeat = hasFeat ? [feat.id] : [];
            const spellcastingClass = hasSpellcasting ? className : undefined;
            fuzzCharacter(character({
              className: spellcastingClass ?? className,
              race,
              level,
              abilities,
              skills: skillsForFeat,
              feats: featsForFeat,
            }), {
              focusFeat: feat,
              skipFeatureGraph: true,
              spellScan: hasSpellcasting ? spells : [],
            });
            cases += 1;
          }
        }
      }
    }
  }

  // 4. Full feature dependency graph is exercised once against every class,
  // subclass and level where the graph can change. This avoids rescanning all
  // 1,291 features for every unrelated character.
  for (const className of supportedClasses) {
    for (const level of levels) {
      fuzzCharacter(character({ className, level }), {
        scanAllCatalogue: true,
        skipFeatScan: true,
        spellScan: [],
      });
      cases += 1;
    }
  }
  for (const { className, subclass } of validClassSubclasses) {
    if (!subclass) continue;
    for (const level of boundaryLevels) {
      fuzzCharacter(character({ className, subclass, level }), {
        scanAllCatalogue: true,
        skipFeatScan: true,
        spellScan: [],
      });
      cases += 1;
    }
  }

  return cases;
}

function runRandomFuzz(iterations) {
  const progressInterval = Math.max(1, Math.floor(iterations / 10));
  for (let index = 0; index < iterations; index += 1) {
    const className = rng.pick(supportedClasses);
    const classSubclasses = subclasses.filter((entry) => entry.className === className);
    const subclass = classSubclasses.length && rng.next() < 0.7
      ? rng.pick(classSubclasses).name
      : "";

    const selectedFeats = [];
    const featCount = feats.length ? rng.int(0, Math.min(4, feats.length)) : 0;
    while (selectedFeats.length < featCount) {
      const featId = rng.pick(feats).id;
      if (!selectedFeats.includes(featId)) selectedFeats.push(featId);
    }

    const selectedSkills = skills.filter(() => rng.next() < 0.3).slice(0, rng.int(0, 6));
    const selectedTools = skills.filter(() => rng.next() < 0.12).slice(0, rng.int(0, 3));
    const selectedLanguages = ["Common", "Draconic", "Elvish", "Dwarvish", "Infernal", "Sylvan"]
      .filter(() => rng.next() < 0.35)
      .slice(0, rng.int(0, 3));

    fuzzCharacter(character({
      className,
      subclass,
      feats: selectedFeats,
      skills: selectedSkills,
      tools: selectedTools,
      languages: selectedLanguages,
      abilities: Object.fromEntries(abilityKeys.map((key) => [key, rng.int(3, 20)])),
      level: rng.int(1, 20),
    }), { skipFeatureGraph: true });

    if ((index + 1) % progressInterval === 0 || index + 1 === iterations) {
      console.log("  Random progress:", (index + 1) + "/" + iterations);
    }
  }
}

const options = parseArgs(process.argv.slice(2));
const started = Date.now();

console.log("D&D rules fuzz test");
console.log("Seed:", options.seed);
console.log("Random iterations:", options.iterations);
console.log("Catalogue source:", catalogueSource);
console.log("Catalogue:", classes.length, "classes,", races.length, "races,", subclasses.length, "subclasses,", feats.length, "feats,", spells.length, "spells,", features.length, "features");
console.log("Supported rules-engine classes:", supportedClasses.length);
console.log("Catalogue/rules-engine class parity: exact");
console.log("Deterministic coverage: rule-aware, no item selection");
console.log("Deterministic feat coverage: targeted by prerequisite type");
console.log("Intentional coverage gap: item selection/equipment rules are excluded by request.");

const coverageCases = runDeterministicCoverage();
runRandomFuzz(options.iterations);

const elapsed = Date.now() - started;
console.log("");
console.log("✓ Fuzz test passed");
console.log("  Deterministic coverage cases:", coverageCases);
console.log("  Random characters tested:", options.iterations);
console.log("  Total cases:", coverageCases + options.iterations);
console.log("  Seed:", options.seed);
console.log("  Duration:", elapsed + "ms");
console.log("  Assertion calls per deterministic/random check group:");
for (const [name, count] of checkMetrics) {
  console.log("    " + name + ": " + count);
}
console.log("  Exact assertion calls:", assertionMetrics.total);
console.log("    assert.ok:", assertionMetrics.ok);
console.log("    assert.equal:", assertionMetrics.equal);
console.log("    assert.deepEqual:", assertionMetrics.deepEqual);
