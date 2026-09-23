#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { createClient } = require("@supabase/supabase-js");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    let value = match[2].trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

loadEnvFile(path.join(process.cwd(), ".env.local"));
loadEnvFile(path.join(process.cwd(), ".env"));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  throw new Error(
    "Supabase environment variables are missing. Expected NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local or the environment.",
  );
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

async function fetchAll(table, select, filters = []) {
  const pageSize = 1000;
  const rows = [];

  for (let start = 0; ; start += pageSize) {
    let query = supabase.from(table).select(select).range(start, start + pageSize - 1);
    for (const filter of filters) {
      query = query[filter.method](...filter.args);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Failed to export ${table}: ${error.message}`);
    rows.push(...(data ?? []));

    if (!data || data.length < pageSize) break;
  }

  return rows;
}

function extractItemRules(raw) {
  if (!raw || typeof raw !== "object") return {};
  const armorCategory = typeof raw.armorCategory === "string" ? raw.armorCategory : "";
  const properties = Array.isArray(raw.property)
    ? raw.property
        .map((entry) =>
          typeof entry === "string"
            ? entry
            : entry && typeof entry === "object" && "name" in entry
              ? String(entry.name)
              : "",
        )
        .filter(Boolean)
    : [];
  const rawAc = Number(raw.ac);
  const isShield = armorCategory.toLowerCase() === "shield";
  const isWeapon = Boolean(raw.dmg1 || raw.weaponCategory || raw.weapon);
  const isArmor = Boolean(armorCategory || Number.isFinite(rawAc));

  return {
    armorClass: Number.isFinite(rawAc) ? rawAc : undefined,
    armorCategory: armorCategory || undefined,
    armorDexMax: armorCategory.toLowerCase() === "medium"
      ? 2
      : armorCategory.toLowerCase() === "heavy" || isShield
        ? 0
        : null,
    shieldBonus: isShield ? (Number.isFinite(rawAc) ? rawAc : 2) : undefined,
    strengthRequirement: Number.isFinite(Number(raw.strength)) ? Number(raw.strength) : undefined,
    stealthDisadvantage: Boolean(raw.stealth),
    weaponDamage: typeof raw.dmg1 === "string" ? raw.dmg1 : undefined,
    weaponDamageVersatile: typeof raw.dmg2 === "string" ? raw.dmg2 : undefined,
    weaponDamageType: typeof raw.dmgType === "string" ? raw.dmgType : undefined,
    weaponProperties: properties,
    weaponCategory: typeof raw.weaponCategory === "string" ? raw.weaponCategory : undefined,
    weaponRange: raw.range ? String(raw.range) : undefined,
    magicBonus: Number.isFinite(Number(raw.bonusWeapon)) ? Number(raw.bonusWeapon) : undefined,
    bonusAc: Number.isFinite(Number(raw.bonusAc)) ? Number(raw.bonusAc) : undefined,
    isWeapon,
    isArmor,
    isShield,
  };
}

function clean(value) {
  return value == null ? "" : String(value);
}

function extractRequiredFeatureIds(raw, featureRows, currentId) {
  const byId = new Map(featureRows.map((row) => [row.id, row.id]));
  const byName = new Map(featureRows.map((row) => [row.name.trim().toLowerCase(), row.id]));
  const keys = new Set([
    "requiresFeatureId", "requiredFeatureId", "requiresFeature", "requiredFeature",
    "prerequisiteFeature", "prerequisiteFeatures", "featurePrerequisite", "featurePrerequisites",
    "prerequisite", "prerequisites",
  ]);

  const resolve = (value) => {
    if (typeof value === "string") {
      const text = value.trim();
      if (!text) return [];
      if (byId.has(text) && text !== currentId) return [text];
      const byNameId = byName.get(text.toLowerCase());
      return byNameId && byNameId !== currentId ? [byNameId] : [];
    }
    if (Array.isArray(value)) return value.flatMap(resolve);
    if (!value || typeof value !== "object") return [];
    return ["id", "featureId", "feature_id", "name", "feature"].flatMap((key) => resolve(value[key]));
  };

  const found = [];
  function visit(value) {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (keys.has(key)) found.push(...resolve(child));
      visit(child);
    }
  }

  visit(raw);
  return [...new Set(found)].filter((id) => id !== currentId);
}

async function main() {
  console.log("Exporting the real 2014 Supabase catalogue for the headless rules fuzzer...");

  const [classes, races, subclasses, backgrounds, spells, features, items, feats, subraces] =
    await Promise.all([
      fetchAll("classes", "id,name,raw_data", [
        { method: "is", args: ["owner_id", null] },
        { method: "eq", args: ["edition", "2014"] },
      ]),
      fetchAll("races", "id,name,description,source,source_code,raw_data", [
        { method: "is", args: ["owner_id", null] },
        { method: "eq", args: ["edition", "2014"] },
      ]),
      fetchAll("subclasses", "id,name,class_id,description,source,source_code,edition,raw_data", [
        { method: "is", args: ["owner_id", null] },
        { method: "eq", args: ["edition", "2014"] },
      ]),
      fetchAll("backgrounds", "id,name,description,source,source_code,raw_data", [
        { method: "is", args: ["owner_id", null] },
        { method: "eq", args: ["edition", "2014"] },
      ]),
      fetchAll("spells", "id,name,level,school,casting_time,range,duration,description,higher_levels,source,source_code,edition,content_key", [
        { method: "is", args: ["owner_id", null] },
        { method: "eq", args: ["edition", "2014"] },
      ]),
      fetchAll("features", "id,name,description,source,source_code,source_type,required_level,edition,raw_data", [
        { method: "is", args: ["owner_id", null] },
        { method: "eq", args: ["edition", "2014"] },
      ]),
      fetchAll("items", "id,name,category,rarity,description,weight,value,requires_attunement,minimum_level,raw_data", [
        { method: "is", args: ["owner_id", null] },
        { method: "eq", args: ["edition", "2014"] },
      ]),
      fetchAll("feats", "id,name,description,prerequisite,ability,source,source_code,edition,content_key", [
        { method: "is", args: ["owner_id", null] },
        { method: "eq", args: ["edition", "2014"] },
      ]),
      fetchAll("subraces", "id,name,race_id,race_name,description,source,source_code,raw_data", [
        { method: "is", args: ["owner_id", null] },
        { method: "eq", args: ["edition", "2014"] },
      ]),
    ]);

  const [spellClasses, spellSubclasses, spellRaces, classFeatures, subclassFeatures, raceFeatures, backgroundFeatures] =
    await Promise.all([
      fetchAll("spell_classes", "spell_id,class_id"),
      fetchAll("spell_subclasses", "spell_id,subclass_id"),
      fetchAll("spell_races", "spell_id,race_id"),
      fetchAll("class_features", "class_id,feature_id,required_level"),
      fetchAll("subclass_features", "subclass_id,feature_id,required_level"),
      fetchAll("race_features", "race_id,feature_id"),
      fetchAll("background_features", "background_id,feature_id"),
    ]);

  const classById = new Map(classes.map((row) => [row.id, row.name]));
  const subclassById = new Map(subclasses.map((row) => [row.id, row.name]));
  const raceById = new Map(races.map((row) => [row.id, row.name]));
  const backgroundById = new Map(backgrounds.map((row) => [row.id, row.name]));
  const subclassClassById = new Map(subclasses.map((row) => [row.id, classById.get(row.class_id) ?? ""]));

  const relationMap = (rows, key, valueMap) => {
    const result = new Map();
    for (const row of rows) {
      const value = valueMap.get(row[key]);
      if (!value) continue;
      if (!result.has(row[value === undefined ? key : "spell_id"])) result.set(row[value === undefined ? key : "spell_id"], new Set());
      result.get(row[value === undefined ? key : "spell_id"]).add(value);
    }
    return result;
  };

  const spellClassNames = new Map();
  for (const row of spellClasses) {
    const name = classById.get(row.class_id);
    if (!name) continue;
    if (!spellClassNames.has(row.spell_id)) spellClassNames.set(row.spell_id, new Set());
    spellClassNames.get(row.spell_id).add(name);
  }

  const spellSubclassNames = new Map();
  for (const row of spellSubclasses) {
    const name = subclassById.get(row.subclass_id);
    if (!name) continue;
    if (!spellSubclassNames.has(row.spell_id)) spellSubclassNames.set(row.spell_id, new Set());
    spellSubclassNames.get(row.spell_id).add(name);
  }

  const spellRaceNames = new Map();
  for (const row of spellRaces) {
    const name = raceById.get(row.race_id);
    if (!name) continue;
    if (!spellRaceNames.has(row.spell_id)) spellRaceNames.set(row.spell_id, new Set());
    spellRaceNames.get(row.spell_id).add(name);
  }

  const classFeatureById = new Map();
  for (const row of classFeatures) {
    const className = classById.get(row.class_id);
    if (className) classFeatureById.set(row.feature_id, { className, requiredLevel: Number(row.required_level) || 1 });
  }

  const subclassFeatureById = new Map();
  for (const row of subclassFeatures) {
    const subclassName = subclassById.get(row.subclass_id);
    const className = subclassClassById.get(row.subclass_id);
    if (subclassName && className) {
      subclassFeatureById.set(row.feature_id, {
        subclassName,
        className,
        requiredLevel: Number(row.required_level) || 1,
      });
    }
  }

  const raceFeatureById = new Map();
  for (const row of raceFeatures) {
    const name = raceById.get(row.race_id);
    if (name) raceFeatureById.set(row.feature_id, name);
  }

  const backgroundFeatureById = new Map();
  for (const row of backgroundFeatures) {
    const name = backgroundById.get(row.background_id);
    if (name) backgroundFeatureById.set(row.feature_id, name);
  }

  const snapshot = {
    version: 1,
    edition: "2014",
    classes: classes.map((row) => row.name).filter(Boolean),
    races: races.map((row) => row.name).filter(Boolean),
    subclasses: subclasses.map((row) => ({
      name: row.name,
      className: subclassClassById.get(row.id) ?? "",
      source: row.source ?? row.source_code ?? "",
    })).filter((row) => row.name && row.className),
    backgrounds: backgrounds.map((row) => row.name).filter(Boolean),
    subraces: subraces.map((row) => ({
      id: row.id,
      name: row.name,
      parentRace: row.race_name ?? raceById.get(row.race_id) ?? "",
      source: row.source ?? row.source_code ?? "",
      description: clean(row.description),
    })).filter((row) => row.name && row.parentRace),
    spells: spells.map((row) => ({
      id: row.id,
      name: row.name,
      level: Math.max(0, Math.min(9, Number(row.level) || 0)),
      school: row.school ?? "",
      castingTime: row.casting_time ?? "",
      range: row.range ?? "",
      duration: row.duration ?? "",
      description: row.description ?? "",
      higherLevels: row.higher_levels ?? undefined,
      classes: [...(spellClassNames.get(row.id) ?? new Set())],
      subclasses: [...(spellSubclassNames.get(row.id) ?? new Set())],
      races: [...(spellRaceNames.get(row.id) ?? new Set())],
      source: row.source ?? row.source_code ?? undefined,
      edition: "2014",
      contentKey: row.content_key ?? undefined,
    })),
    features: features.map((row) => {
      const subclassLink = subclassFeatureById.get(row.id);
      const raceName = raceFeatureById.get(row.id);
      const backgroundName = backgroundFeatureById.get(row.id);
      const classLink = classFeatureById.get(row.id);
      const sourceType = subclassLink
        ? "subclass"
        : raceName
          ? "race"
          : backgroundName
            ? "background"
            : classLink
              ? "class"
              : (row.source_type === "race" || row.source_type === "background" || row.source_type === "feat" ? row.source_type : "class");

      const requires = extractRequiredFeatureIds(row.raw_data, features, row.id);

      return {
        id: row.id,
        name: row.name,
        source: row.source ?? row.source_code ?? "",
        sourceType,
        requiredLevel: subclassLink?.requiredLevel ?? classLink?.requiredLevel ?? (Number(row.required_level) || 1),
        description: row.description ?? "",
        className: classLink?.className ?? subclassLink?.className,
        subclassName: subclassLink?.subclassName,
        raceName: raceName ?? (sourceType === "race" ? row.source ?? undefined : undefined),
        backgroundName: backgroundName ?? (sourceType === "background" ? row.source ?? undefined : undefined),
        ...(requires.length ? { requiresFeatureIds: requires, requiresFeatureId: requires[0] } : {}),
      };
    }).filter((row) => row.name),
    items: items.map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category ?? "Equipment",
      rarity: row.rarity ?? "Common",
      description: row.description ?? "",
      weight: row.weight ?? undefined,
      value: row.value ?? undefined,
      requiresAttunement: Boolean(row.requires_attunement),
      requiredCharacterLevel: row.minimum_level ?? undefined,
      ...extractItemRules(row.raw_data),
    })).filter((row) => row.name),
    feats: feats.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description ?? "",
      prerequisite: row.prerequisite,
      ability: row.ability,
      source: row.source ?? row.source_code ?? "",
      edition: "2014",
      contentKey: row.content_key ?? undefined,
    })).filter((row) => row.name),
  };

  const output = path.join(process.cwd(), "scripts", "fixtures", "fuzz-catalogue.json");
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(snapshot, null, 2) + "\n");

  console.log("");
  console.log("✓ Fuzz catalogue exported");
  console.log("  Output:", path.relative(process.cwd(), output));
  console.log("  Classes:", snapshot.classes.length);
  console.log("  Races:", snapshot.races.length);
  console.log("  Subclasses:", snapshot.subclasses.length);
  console.log("  Backgrounds:", snapshot.backgrounds.length);
  console.log("  Subraces:", snapshot.subraces.length);
  console.log("  Feats:", snapshot.feats.length);
  console.log("  Spells:", snapshot.spells.length);
  console.log("  Items:", snapshot.items.length);
  console.log("  Features:", snapshot.features.length);
  console.log("");
  console.log("This file is catalogue data only. It contains no character or user data.");
}

main().catch((error) => {
  console.error("\n✗ Catalogue export failed");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
