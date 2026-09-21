#!/usr/bin/env node
/**
 * 5e.tools -> Supabase importer
 *
 * Phase 5: spells + classes + subclasses + races + subraces + backgrounds + features + items + feats
 *
 * Design goals:
 *   - runs outside Next.js so the Supabase service-role key never reaches
 *     the browser
 *   - reads the current 5e.tools source index rather than hard-coding files
 *   - supports remote GitHub data or a local 5e.tools checkout
 *   - preserves raw 5e.tools JSON in raw_data
 *   - uses stable content_keys; subraces also include their parent race identity
 *   - dry-run first, database write only when explicitly requested
 *   - safe repeat imports via upsert
 */

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

const CONFIG = {
  githubBase: process.env.FIVEETOOLS_BASE_URL ?? "",
  githubApiBase: process.env.FIVEETOOLS_API_BASE_URL ?? "",
  supabaseUrl: process.env.SUPABASE_URL ?? "",
  serviceRoleKey:
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    "",
};

const SCHOOL_NAMES = {
  A: "Abjuration",
  C: "Conjuration",
  D: "Divination",
  E: "Enchantment",
  V: "Evocation",
  I: "Illusion",
  N: "Necromancy",
  T: "Transmutation",
};

const DEFAULT_SPELL_SOURCES = ["PHB"];
const DEFAULT_CLASS_SOURCES = ["PHB"];
const DEFAULT_SUBCLASS_SOURCES = ["PHB"];
const DEFAULT_RACE_SOURCES = ["PHB"];
const DEFAULT_SUBRACE_SOURCES = ["PHB"];
const DEFAULT_BACKGROUND_SOURCES = ["PHB"];
const DEFAULT_BATCH_SIZE = 250;
const DEFAULT_ITEM_SOURCES = ["PHB"];
const DEFAULT_FEAT_SOURCES = ["PHB"];
const DEFAULT_OPTIONAL_FEATURE_SOURCES = ["PHB"];

// The GitHub contents API is rate-limited. Class data is stored in a small,
// stable set of files in the 5e.tools repositories, so keep the discovered
// file list cached and fall back to the canonical filenames when the API
// refuses the listing (for example HTTP 403 rate limits).
const CLASS_FILE_CACHE = new Map();
const CANONICAL_CLASS_FILES = [
  "class-artificer.json",
  "class-barbarian.json",
  "class-bard.json",
  "class-cleric.json",
  "class-druid.json",
  "class-fighter.json",
  "class-monk.json",
  "class-paladin.json",
  "class-ranger.json",
  "class-rogue.json",
  "class-sorcerer.json",
  "class-warlock.json",
  "class-wizard.json",
];

const GITHUB_BASES = {
  "2014": "https://raw.githubusercontent.com/5etools-mirror-3/5etools-2014-src/refs/heads/main",
  "2024": "https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/refs/heads/main",
  custom: "https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/refs/heads/main",
};

const GITHUB_API_BASES = {
  "2014": "https://api.github.com/repos/5etools-mirror-3/5etools-2014-src",
  "2024": "https://api.github.com/repos/5etools-mirror-3/5etools-src",
  custom: "https://api.github.com/repos/5etools-mirror-3/5etools-src",
};

const argv = process.argv.slice(2);

function argValue(name, fallback = undefined) {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
}

function hasArg(name) {
  return argv.includes(name);
}

function die(message) {
  console.error(`\nERROR: ${message}\n`);
  process.exit(1);
}

function csv(value) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function assertNonEmptyString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function slug(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .replace(/-+/g, "-");
}

function contentKey(edition, entityType, source, name) {
  const parts = [edition, entityType, String(source).toLowerCase(), slug(name)];
  return parts.join(":");
}

function subraceContentKey(edition, source, parentRaceSource, parentRaceName, name) {
  // A subrace name is not globally unique within a source. Eberron's
  // "Variant; Mark of Finding (ERLW)", for example, exists for both Human
  // and Half-Orc. The parent race is therefore part of the logical identity.
  const parent = `${String(parentRaceSource).toLowerCase()}-${slug(parentRaceName)}`;
  return contentKey(edition, "subrace", source, `${parent}-${name}`);
}

function featureContentKey(edition, source, featureType, parentClassSource, parentClassName, subclassSource, subclassShortName, name, level) {
  const parentClass = `${String(parentClassSource).toLowerCase()}-${slug(parentClassName)}`;
  if (featureType === "subclass") {
    const parentSubclass = `${String(subclassSource).toLowerCase()}-${slug(subclassShortName)}`;
    return contentKey(edition, "feature", source, `${parentClass}-${parentSubclass}-${slug(name)}-level-${level}`);
  }
  return contentKey(edition, "feature", source, `${parentClass}-${slug(name)}-level-${level}`);
}

function cleanWhitespace(value) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function renderTag(tag, body) {
  const parts = String(body ?? "").split("|");
  const lowerTag = tag.toLowerCase();

  switch (lowerTag) {
    case "item":
    case "spell":
    case "creature":
    case "condition":
    case "action":
    case "status":
    case "skill":
    case "sense":
    case "language":
    case "class":
    case "subclass":
    case "background":
    case "race":
      return parts.length >= 3 ? parts[2] : parts[0];
    case "filter":
      return parts[1] || parts[0];
    case "dice":
    case "damage":
    case "chance":
      return parts[0] || "";
    case "dc":
      return parts.join(" | ");
    case "hit":
      return parts[0] || "";
    case "recharge":
      return parts[0] || "Recharge";
    default:
      return parts[parts.length - 1] || parts[0] || "";
  }
}

function renderRichText(value) {
  if (typeof value === "string") {
    return value.replace(/\{@([a-zA-Z0-9_-]+)\s+([^}]+)\}/g, (_, tag, body) =>
      renderTag(tag, body),
    );
  }

  if (Array.isArray(value)) {
    return value.map(renderRichText).filter(Boolean).join("\n");
  }

  if (value && typeof value === "object") {
    if (typeof value.entry === "string") return renderRichText(value.entry);
    if (Array.isArray(value.items)) {
      return value.items.map(renderRichText).filter(Boolean).join("\n");
    }
    if (Array.isArray(value.entries)) {
      return value.entries.map(renderRichText).filter(Boolean).join("\n");
    }
  }

  return "";
}

function renderEntries(entries) {
  if (!Array.isArray(entries)) return "";
  return cleanWhitespace(entries.map(renderRichText).filter(Boolean).join("\n\n"));
}

function formatDistance(distance) {
  if (!distance || typeof distance !== "object") return "";

  const type = distance.type ?? "";
  const amount = distance.amount;

  if (type === "self") return "Self";
  if (type === "touch") return "Touch";
  if (type === "sight") return "Sight";
  if (type === "unlimited") return "Unlimited";
  if (type === "special") return "Special";

  if (amount !== undefined && type) {
    const unit =
      {
        feet: "feet",
        foot: "foot",
        miles: "miles",
        mile: "mile",
        meters: "meters",
        meter: "meter",
      }[type] ?? type;
    return `${amount} ${unit}`;
  }

  return String(type || "");
}

function formatRange(range) {
  if (!range || typeof range !== "object") return "";

  const type = range.type;
  if (type === "special") return "Special";
  if (type === "point") return formatDistance(range.distance);

  const shaped = {
    line: "Line",
    cone: "Cone",
    sphere: "Sphere",
    hemisphere: "Hemisphere",
    cube: "Cube",
    cylinder: "Cylinder",
  };

  if (shaped[type]) {
    const distance = formatDistance(range.distance);
    return distance ? `${shaped[type]}, ${distance}` : shaped[type];
  }

  return type ? String(type) : "";
}

function formatTime(time) {
  if (!Array.isArray(time) || time.length === 0) return "";

  return time
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      if (part.unit === "reaction") {
        return part.condition ? `Reaction (${part.condition})` : "Reaction";
      }
      if (part.unit === "special") return "Special";

      const unit =
        {
          action: "action",
          bonus: "bonus action",
          minute: "minute",
          hour: "hour",
          round: "round",
          special: "special",
        }[part.unit] ?? part.unit;

      return part.number !== undefined ? `${part.number} ${unit}` : String(unit);
    })
    .filter(Boolean)
    .join(" or ");
}

function formatComponents(components) {
  if (!components || typeof components !== "object") return "";
  const result = [];
  if (components.v) result.push("V");
  if (components.s) result.push("S");
  if (components.m) result.push("M");
  return result.join(", ");
}

function materialComponent(components) {
  if (!components || typeof components !== "object") return "";
  if (typeof components.m === "string") return components.m;
  if (components.m && typeof components.m === "object") {
    return components.m.text || components.m.item || JSON.stringify(components.m);
  }
  return "";
}

function formatDuration(duration) {
  if (!Array.isArray(duration) || duration.length === 0) return "";

  return duration
    .map((part) => {
      if (!part || typeof part !== "object") return "";

      if (part.type === "instant") {
        return part.concentration ? "Concentration, instantaneous" : "Instantaneous";
      }
      if (part.type === "permanent") return "Permanent";
      if (part.type === "special") return "Special";

      if (part.type === "timed" && part.duration) {
        const d = part.duration;
        const unit =
          {
            round: "round",
            rounds: "rounds",
            minute: "minute",
            minutes: "minutes",
            hour: "hour",
            hours: "hours",
            day: "day",
            days: "days",
            week: "week",
            weeks: "weeks",
            month: "month",
            months: "months",
            year: "year",
            years: "years",
          }[d.type] ?? d.type;
        const amount = d.amount !== undefined ? `${d.amount} ${unit}` : unit;
        return part.concentration ? `Concentration, up to ${amount}` : amount;
      }

      return "";
    })
    .filter(Boolean)
    .join(" or ");
}

function asName(entry) {
  if (typeof entry === "string") return entry;
  if (entry && typeof entry === "object" && typeof entry.name === "string") return entry.name;
  return "";
}

function asClassRef(entry) {
  const name = asName(entry);
  if (!name) return null;
  const source =
    entry && typeof entry === "object" && typeof entry.source === "string"
      ? entry.source.trim()
      : "";
  return { name: name.trim(), source: source || null };
}

function classRefKey(ref) {
  return `${ref.name.trim().toLowerCase()}|${String(ref.source ?? "").trim().toLowerCase()}`;
}

function extractSpellClassRefs(spell) {
  const refs = new Map();
  const mainLists = [spell?.classes?.fromClassList];
  const variantLists = [spell?.classes?.fromClassListVariant];

  for (const list of mainLists) {
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      const ref = asClassRef(entry);
      if (ref) refs.set(classRefKey(ref), { ...ref, type: "class" });
    }
  }

  for (const list of variantLists) {
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      const ref = asClassRef(entry);
      if (ref) refs.set(classRefKey(ref), { ...ref, type: "variant" });
    }
  }

  return [...refs.values()].sort((a, b) =>
    `${a.name}|${a.source ?? ""}`.localeCompare(`${b.name}|${b.source ?? ""}`),
  );
}

function sourceLookupSpellEntry(spell, spellSourceLookup) {
  if (!spellSourceLookup || !spell?.source || !spell?.name) return null;

  const source = spell.source;
  const sourceBucket =
    spellSourceLookup[source] ??
    spellSourceLookup[String(source).toLowerCase()] ??
    spellSourceLookup[String(source).toUpperCase()];
  if (!sourceBucket || typeof sourceBucket !== "object") return null;

  return (
    sourceBucket[spell.name] ??
    sourceBucket[String(spell.name).toLowerCase()] ??
    Object.entries(sourceBucket).find(([name]) => name.toLowerCase() === spell.name.toLowerCase())?.[1] ??
    null
  );
}

function extractSpellClassRefsFromSourceLookup(spell, spellSourceLookup) {
  const sourceEntry = sourceLookupSpellEntry(spell, spellSourceLookup);
  const refs = [];
  const classes = sourceEntry?.class;
  if (!Array.isArray(classes)) return refs;

  for (const entry of classes) {
    const ref = asClassRef(entry);
    if (ref) refs.push({ ...ref, type: "class-source" });
  }

  return refs;
}

function mergeSpellClassRefs(raw, spellSourceLookup) {
  const refs = new Map();

  for (const ref of extractSpellClassRefs(raw)) {
    // Main class lists win over the optional/variant version when both exist.
    const key = classRefKey(ref);
    const existing = refs.get(key);
    if (!existing || existing.type === "variant") refs.set(key, ref);
  }

  for (const ref of extractSpellClassRefsFromSourceLookup(raw, spellSourceLookup)) {
    const key = classRefKey(ref);
    if (!refs.has(key)) refs.set(key, ref);
  }

  return [...refs.values()].sort((a, b) =>
    `${a.name}|${a.source ?? ""}`.localeCompare(`${b.name}|${b.source ?? ""}`),
  );
}

function transformSpell(raw, edition, sourceFromFile, spellSourceLookup = null) {
  if (!raw || typeof raw !== "object") {
    throw new Error("Spell entry is not an object");
  }

  const name = assertNonEmptyString(raw.name, "Spell name");
  const source = assertNonEmptyString(raw.source ?? sourceFromFile, "Spell source");

  const isConcentrationFromDuration =
    Array.isArray(raw.duration) &&
    raw.duration.some((entry) => entry && entry.concentration === true);

  return {
    row: {
      name,
      level: Number.isInteger(raw.level) ? raw.level : 0,
      school: SCHOOL_NAMES[raw.school] ?? raw.school ?? "",
      casting_time: formatTime(raw.time),
      range: formatRange(raw.range),
      duration: formatDuration(raw.duration),
      components: formatComponents(raw.components),
      material_component: materialComponent(raw.components),
      description: renderEntries(raw.entries),
      higher_levels: renderEntries(raw.entriesHigherLevel),
      concentration: Boolean(raw.concentration ?? isConcentrationFromDuration),
      ritual: Boolean(raw.ritual),
      source,
      source_code: source,
      edition,
      page: Number.isInteger(raw.page) ? raw.page : null,
      is_homebrew: false,
      owner_id: null,
      content_key: contentKey(edition, "spell", source, name),
      raw_data: raw,
    },
    classRefs: mergeSpellClassRefs(raw, spellSourceLookup),
  };
}

function githubBaseForEdition(edition) {
  return CONFIG.githubBase || GITHUB_BASES[edition] || GITHUB_BASES.custom;
}

function githubApiBaseForEdition(edition) {
  return CONFIG.githubApiBase || GITHUB_API_BASES[edition] || GITHUB_API_BASES.custom;
}

function isAllSourcesRequest(sources) {
  return sources.length === 1 && sources[0].toLowerCase() === "all";
}

function isEditionCompatibleSubclassParent(edition, classSource) {
  const source = classSource ?? "PHB";
  if (edition === "2024") return source === "XPHB";
  if (edition === "2014") return source !== "XPHB";
  return true;
}

function uniqSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

async function readJsonUrl(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "dnd-character-manager/5etools-importer",
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while fetching ${url}`);
  }

  return response.json();
}

async function readJsonFile(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

const JSON_CACHE = new Map();

async function loadJson(pathOrUrl) {
  const key = /^https?:\/\//i.test(pathOrUrl) ? pathOrUrl : resolve(pathOrUrl);
  if (JSON_CACHE.has(key)) return JSON_CACHE.get(key);

  const value = /^https?:\/\//i.test(pathOrUrl)
    ? await readJsonUrl(pathOrUrl)
    : await readJsonFile(resolve(pathOrUrl));

  JSON_CACHE.set(key, value);
  return value;
}

async function loadSpellFile({ source, dataDir, sourceFile, edition }) {
  if (sourceFile) return loadJson(sourceFile);

  if (dataDir) {
    const index = await loadJson(resolve(dataDir, "data/spells/index.json"));
    const filename = index[source];
    if (!filename) {
      throw new Error(`Source ${source} was not found in data/spells/index.json`);
    }
    return loadJson(resolve(dataDir, "data/spells", filename));
  }

  const index = await loadJson(`${githubBaseForEdition(edition)}/data/spells/index.json`);
  const filename = index[source];
  if (!filename) {
    throw new Error(`Source ${source} was not found in the 5e.tools spell index`);
  }

  return loadJson(`${githubBaseForEdition(edition)}/data/spells/${filename}`);
}

async function loadIndexedEntityFile({ entityDir, indexName, source, dataDir, sourceFile, edition }) {
  if (sourceFile) return loadJson(sourceFile);

  if (dataDir) {
    const index = await loadJson(resolve(dataDir, `data/${entityDir}/index.json`));
    const filename = index[source];
    if (!filename) {
      throw new Error(`Source ${source} was not found in data/${entityDir}/index.json`);
    }
    return loadJson(resolve(dataDir, `data/${entityDir}`, filename));
  }

  const index = await loadJson(`${githubBaseForEdition(edition)}/data/${entityDir}/index.json`);
  const filename = index[source];
  if (!filename) {
    throw new Error(`Source ${source} was not found in the 5e.tools ${entityDir} index`);
  }

  return loadJson(`${githubBaseForEdition(edition)}/data/${entityDir}/${filename}`);
}

async function loadSingleDataEntityFile({ entityFile, entityKey, source, dataDir, sourceFile, edition }) {
  if (sourceFile) {
    const json = await loadJson(sourceFile);
    return Array.isArray(json?.[entityKey])
      ? json[entityKey].filter((entry) => !entry?.source || entry.source === source)
      : [];
  }

  const path = dataDir
    ? resolve(dataDir, "data", entityFile)
    : `${githubBaseForEdition(edition)}/data/${entityFile}`;
  const json = await loadJson(path);

  return Array.isArray(json?.[entityKey])
    ? json[entityKey].filter((entry) => !entry?.source || entry.source === source)
    : [];
}

async function loadRaceEntries({ source, dataDir, sourceFile, edition }) {
  // 5e.tools stores races in the top-level data/races.json file.
  // There is no data/races/index.json in the current repository.
  return loadSingleDataEntityFile({
    entityFile: "races.json",
    entityKey: "race",
    source,
    dataDir,
    sourceFile,
    edition,
  });
}

async function loadSubraceEntries({ source, dataDir, sourceFile, edition }) {
  if (sourceFile) {
    const json = await loadJson(sourceFile);
    return Array.isArray(json?.subrace)
      ? json.subrace.filter((entry) => entry?.name && entry?.raceName && (!entry?.source || entry.source === source))
      : [];
  }

  const path = dataDir
    ? resolve(dataDir, "data", "races.json")
    : `${githubBaseForEdition(edition)}/data/races.json`;
  const json = await loadJson(path);

  return Array.isArray(json?.subrace)
    ? json.subrace.filter((entry) => entry?.name && entry?.raceName && (!entry?.source || entry.source === source))
    : [];
}

async function loadRaceAndSubraceJson({ dataDir, edition, sourceFile }) {
  const path = sourceFile
    ? sourceFile
    : dataDir
      ? resolve(dataDir, "data", "races.json")
      : `${githubBaseForEdition(edition)}/data/races.json`;
  return loadJson(path);
}

async function loadBackgroundEntries({ source, dataDir, sourceFile, edition }) {
  // 5e.tools stores backgrounds in the top-level data/backgrounds.json file.
  // There is no data/backgrounds/index.json in the current repository.
  return loadSingleDataEntityFile({
    entityFile: "backgrounds.json",
    entityKey: "background",
    source,
    dataDir,
    sourceFile,
    edition,
  });
}

async function loadItemEntries({ source, dataDir, sourceFile, edition }) {
  // 5e.tools stores items in the top-level data/items.json file.
  const path = sourceFile
    ? sourceFile
    : dataDir
      ? resolve(dataDir, "data", "items.json")
      : `${githubBaseForEdition(edition)}/data/items.json`;
  const json = await loadJson(path);
  return Array.isArray(json?.item)
    ? json.item.filter((entry) => entry?.name && (!entry?.source || entry.source === source))
    : [];
}

async function loadOptionalFeatureEntries({ source, dataDir, sourceFile, edition }) {
  const path = sourceFile
    ? resolve(sourceFile)
    : dataDir
      ? resolve(dataDir, "data/optionalfeatures.json")
      : `${githubBaseForEdition(edition)}/data/optionalfeatures.json`;

  const json = await loadJson(path);

  return Array.isArray(json?.optionalfeature)
    ? json.optionalfeature.filter(
        (entry) => !entry?.source || entry.source === source,
      )
    : [];
}

async function loadFeatEntries({ source, dataDir, sourceFile, edition }) {
  const path = sourceFile
    ? sourceFile
    : dataDir
      ? resolve(dataDir, "data", "feats.json")
      : `${githubBaseForEdition(edition)}/data/feats.json`;
  const json = await loadJson(path);
  return Array.isArray(json?.feat)
    ? json.feat.filter((entry) => entry?.name && (!entry?.source || entry.source === source))
    : [];
}

async function listClassFiles({ dataDir, edition }) {
  if (dataDir) {
    const names = await readdir(resolve(dataDir, "data/class"));
    return names
      .filter((name) => /^class-[a-z0-9-]+\.json$/i.test(name))
      .sort();
  }

  if (CLASS_FILE_CACHE.has(edition)) return CLASS_FILE_CACHE.get(edition);

  const response = await fetch(`${githubApiBaseForEdition(edition)}/contents/data/class`, {
    headers: {
      "User-Agent": "dnd-character-manager/5etools-importer",
      Accept: "application/vnd.github+json",
    },
  });

  if (response.ok) {
    const entries = await response.json();
    const names = entries
      .filter((entry) => entry?.type === "file" && /^class-[a-z0-9-]+\.json$/i.test(entry.name))
      .map((entry) => entry.name)
      .sort();
    if (!names.length) throw new Error(`No class JSON files found in 5e.tools data/class for edition ${edition}`);
    CLASS_FILE_CACHE.set(edition, names);
    return names;
  }

  // Do not make the entire importer depend on GitHub's authenticated/API rate
  // limit. The class directory in the 2014 and current 5e.tools repositories
  // uses these canonical base-class filenames. The JSON itself is fetched from
  // raw.githubusercontent.com, which is separate from the Contents API.
  if (response.status === 403 || response.status === 429) {
    const fallback = [...CANONICAL_CLASS_FILES];
    CLASS_FILE_CACHE.set(edition, fallback);
    console.warn(`Warning: GitHub Contents API returned HTTP ${response.status}; using canonical class file list.`);
    return fallback;
  }

  throw new Error(`HTTP ${response.status} while listing 5e.tools class files`);
}

async function loadClassEntries({ source, dataDir, sourceFile, edition }) {
  if (sourceFile) {
    const json = await loadJson(sourceFile);
    return Array.isArray(json?.class) ? json.class.filter((entry) => !entry?.source || entry.source === source) : [];
  }

  const files = await listClassFiles({ dataDir, edition });
  const matches = [];

  for (const filename of files) {
    const json = dataDir
      ? await loadJson(resolve(dataDir, "data/class", filename))
      : await loadJson(`${githubBaseForEdition(edition)}/data/class/${filename}`);
    const entries = Array.isArray(json?.class) ? json.class : [];
    matches.push(...entries.filter((entry) => !entry?.source || entry.source === source));
  }

  return matches;
}

async function loadSubclassEntries({ source, dataDir, sourceFile, edition }) {
  if (sourceFile) {
    const json = await loadJson(sourceFile);
    const subclasses = Array.isArray(json?.subclass) ? json.subclass : [];
    return subclasses
       .filter((subclass) => {
        if (subclass?.source && subclass.source !== source) return false;
        return isEditionCompatibleSubclassParent(edition, subclass.classSource);
      })
      .map((subclass) => ({
        subclass,
        parent: { name: subclass.className, source: subclass.classSource ?? "PHB" },
      }));
  }

  const files = await listClassFiles({ dataDir, edition });
  const matches = [];

  for (const filename of files) {
    const json = dataDir
      ? await loadJson(resolve(dataDir, "data/class", filename))
      : await loadJson(`${githubBaseForEdition(edition)}/data/class/${filename}`);
    const subclasses = Array.isArray(json?.subclass) ? json.subclass : [];

    for (const subclass of subclasses) {
      if (subclass?.source && subclass.source !== source) continue;
      if (!isEditionCompatibleSubclassParent(edition, subclass.classSource)) continue;
      matches.push({
        subclass,
        parent: { name: subclass.className, source: subclass.classSource ?? "PHB" },
      });
    }
  }

  return matches;
}

async function loadFeatureEntries({ source, dataDir, sourceFile, edition }) {
  if (sourceFile) {
    const json = await loadJson(sourceFile);
    const classFeatures = Array.isArray(json?.classFeature) ? json.classFeature : [];
    const subclassFeatures = Array.isArray(json?.subclassFeature) ? json.subclassFeature : [];
    return [
      ...classFeatures
        .filter((entry) => !entry?.source || entry.source === source)
        .map((feature) => ({ type: "class", feature })),
      ...subclassFeatures
        .filter((entry) => !entry?.source || entry.source === source)
        .map((feature) => ({ type: "subclass", feature })),
    ];
  }

  const files = await listClassFiles({ dataDir, edition });
  const matches = [];

  for (const filename of files) {
    const json = dataDir
      ? await loadJson(resolve(dataDir, "data/class", filename))
      : await loadJson(`${githubBaseForEdition(edition)}/data/class/${filename}`);

    const classFeatures = Array.isArray(json?.classFeature) ? json.classFeature : [];
    const subclassFeatures = Array.isArray(json?.subclassFeature) ? json.subclassFeature : [];

    for (const feature of classFeatures) {
      if (feature?.source && feature.source !== source) continue;
      matches.push({ type: "class", feature });
    }
    for (const feature of subclassFeatures) {
      if (feature?.source && feature.source !== source) continue;
      if (!isEditionCompatibleSubclassParent(edition, feature?.classSource)) continue;
      matches.push({ type: "subclass", feature });
    }
  }

  return matches;
}

function transformFeature(raw, featureType, edition, sourceFromFile) {
  if (!raw || typeof raw !== "object") throw new Error("Feature entry is not an object");

  const name = assertNonEmptyString(raw.name, "Feature name");
  const source = assertNonEmptyString(raw.source ?? sourceFromFile, "Feature source");
  const level = Number.isInteger(raw.level) && raw.level >= 1 ? raw.level : 1;
  const parentClassName = assertNonEmptyString(raw.className, "Feature parent class name");
  const parentClassSource = assertNonEmptyString(raw.classSource ?? (edition === "2024" ? "XPHB" : "PHB"), "Feature parent class source");

  const row = {
    name,
    description: renderEntries(raw.entries),
    source_type: featureType,
    source,
    source_code: source,
    required_level: level,
    edition,
    page: Number.isInteger(raw.page) ? raw.page : null,
    is_homebrew: false,
    owner_id: null,
    content_key: featureContentKey(
      edition,
      source,
      featureType,
      parentClassSource,
      parentClassName,
      raw.subclassSource,
      raw.subclassShortName,
      name,
      level,
    ),
    raw_data: raw,
  };

  return {
    row,
    featureType,
    parentClassName,
    parentClassSource,
    subclassShortName: featureType === "subclass" ? assertNonEmptyString(raw.subclassShortName, "Feature subclass short name") : null,
    subclassSource: featureType === "subclass" ? assertNonEmptyString(raw.subclassSource ?? source, "Feature subclass source") : null,
  };
}

function itemWeight(raw) {
  if (raw?.weight === undefined || raw?.weight === null || raw?.weight === "") return null;
  return String(raw.weight);
}

function itemValue(raw) {
  if (raw?.value === undefined || raw?.value === null || raw?.value === "") return null;
  if (typeof raw.value === "object") return JSON.stringify(raw.value);
  return String(raw.value);
}

function itemCategory(raw) {
  if (typeof raw?.type === "string" && raw.type.trim()) return raw.type.trim();
  if (typeof raw?.weaponCategory === "string" && raw.weaponCategory.trim()) return raw.weaponCategory.trim();
  return "";
}

function transformOptionalFeature(raw, edition, sourceFromFile) {
  if (!raw || typeof raw !== "object") {
    throw new Error("Optional feature entry is not an object");
  }

  const name = assertNonEmptyString(raw.name, "Optional feature name");
  const source = assertNonEmptyString(
    raw.source ?? sourceFromFile,
    "Optional feature source",
  );

  return {
    row: {
      name,
      description: renderEntries(raw.entries),
      feature_types: Array.isArray(raw.featureType) ? raw.featureType : [],
      prerequisite: raw.prerequisite ?? null,
      consumes: raw.consumes ?? null,
      additional_spells: raw.additionalSpells ?? null,
      optional_feature_progression: raw.optionalfeatureProgression ?? null,
      is_class_feature_variant: Boolean(raw.isClassFeatureVariant),
      source,
      source_code: source,
      edition,
      page: Number.isInteger(raw.page) ? raw.page : null,
      is_homebrew: false,
      owner_id: null,
      content_key: contentKey(
        edition,
        "optionalfeature",
        source,
        name,
      ),
      raw_data: raw,
    },
  };
}

function transformFeat(raw, edition, sourceFromFile) {
  if (!raw || typeof raw !== "object") throw new Error("Feat entry is not an object");
  const name = assertNonEmptyString(raw.name, "Feat name");
  const source = assertNonEmptyString(raw.source ?? sourceFromFile, "Feat source");
  return {
    row: {
      name,
      description: renderEntries(raw.entries),
      prerequisite: raw.prerequisite ?? null,
      ability: raw.ability ?? null,
      additional_spells: raw.additionalSpells ?? null,
      source, source_code: source, edition,
      page: Number.isInteger(raw.page) ? raw.page : null,
      is_homebrew: false, owner_id: null,
      content_key: contentKey(edition, "feat", source, name),
      raw_data: raw,
    },
  };
}

function transformItem(raw, edition, sourceFromFile) {
  if (!raw || typeof raw !== "object") throw new Error("Item entry is not an object");
  const name = assertNonEmptyString(raw.name, "Item name");
  const source = assertNonEmptyString(raw.source ?? sourceFromFile, "Item source");

  return {
    row: {
      name,
      category: itemCategory(raw),
      rarity: typeof raw.rarity === "string" ? raw.rarity : "",
      description: renderEntries(raw.entries),
      weight: itemWeight(raw),
      value: itemValue(raw),
      requires_attunement: Boolean(raw.reqAttune),
      minimum_level: Number.isInteger(raw.reqAttuneLevel) && raw.reqAttuneLevel >= 1 ? raw.reqAttuneLevel : null,
      source,
      source_code: source,
      edition,
      page: Number.isInteger(raw.page) ? raw.page : null,
      is_homebrew: false,
      owner_id: null,
      content_key: contentKey(edition, "item", source, name),
      raw_data: raw,
    },
  };
}

function transformRace(raw, edition, sourceFromFile) {
  if (!raw || typeof raw !== "object") throw new Error("Race entry is not an object");
  const name = assertNonEmptyString(raw.name, "Race name");
  const source = assertNonEmptyString(raw.source ?? sourceFromFile, "Race source");

  return {
    row: {
      name,
      description: renderEntries(raw.entries),
      source,
      source_code: source,
      edition,
      page: Number.isInteger(raw.page) ? raw.page : null,
      is_homebrew: false,
      owner_id: null,
      content_key: contentKey(edition, "race", source, name),
      raw_data: raw,
    },
  };
}

function transformSubrace(raw, edition, sourceFromFile) {
  if (!raw || typeof raw !== "object") throw new Error("Subrace entry is not an object");
  const name = assertNonEmptyString(raw.name, "Subrace name");
  const source = assertNonEmptyString(raw.source ?? sourceFromFile, "Subrace source");
  const raceName = assertNonEmptyString(raw.raceName, "Subrace parent race name");
  const raceSource = assertNonEmptyString(raw.raceSource ?? "PHB", "Subrace parent race source");

  return {
    row: {
      name,
      description: renderEntries(raw.entries),
      source,
      source_code: source,
      edition,
      page: Number.isInteger(raw.page) ? raw.page : null,
      race_name: raceName,
      race_source_code: raceSource,
      is_homebrew: false,
      owner_id: null,
      content_key: subraceContentKey(edition, source, raceSource, raceName, name),
      raw_data: raw,
    },
    parentRaceName: raceName,
    parentRaceSource: raceSource,
  };
}

function transformBackground(raw, edition, sourceFromFile) {
  if (!raw || typeof raw !== "object") throw new Error("Background entry is not an object");
  const name = assertNonEmptyString(raw.name, "Background name");
  const source = assertNonEmptyString(raw.source ?? sourceFromFile, "Background source");

  return {
    row: {
      name,
      description: renderEntries(raw.entries),
      source,
      source_code: source,
      edition,
      page: Number.isInteger(raw.page) ? raw.page : null,
      is_homebrew: false,
      owner_id: null,
      content_key: contentKey(edition, "background", source, name),
      raw_data: raw,
    },
  };
}

function transformSubclass(raw, parent, edition, sourceFromFile) {
  if (!raw || typeof raw !== "object") throw new Error("Subclass entry is not an object");
  const name = assertNonEmptyString(raw.name, "Subclass name");
  const source = assertNonEmptyString(raw.source ?? sourceFromFile, "Subclass source");
  const parentName = assertNonEmptyString(parent?.name, "Subclass parent class name");
  const parentSource = parent?.source ?? (edition === "2024" ? "XPHB" : "PHB");

  return {
    row: {
      name,
      description: renderEntries(raw.entries),
      source,
      source_code: source,
      edition,
      page: Number.isInteger(raw.page) ? raw.page : null,
      is_homebrew: false,
      owner_id: null,
      content_key: contentKey(edition, "subclass", source, name),
      raw_data: {
        ...raw,
        _parentClass: {
          name: parentName,
          source: parentSource,
        },
      },
    },
    parentClassName: parentName,
    parentClassSource: parentSource,
  };
}

function classDescription(raw) {
  if (Array.isArray(raw?.entries)) return renderEntries(raw.entries);
  if (Array.isArray(raw?.startingProficiencies?.entries)) return renderEntries(raw.startingProficiencies.entries);
  return "";
}

function transformClass(raw, edition, sourceFromFile) {
  if (!raw || typeof raw !== "object") throw new Error("Class entry is not an object");

  const name = assertNonEmptyString(raw.name, "Class name");
  const source = assertNonEmptyString(raw.source ?? sourceFromFile, "Class source");

  return {
    row: {
      name,
      description: classDescription(raw),
      hit_die: Number.isInteger(raw?.hd?.faces) ? raw.hd.faces : null,
      spellcasting_ability: typeof raw.spellcastingAbility === "string" ? raw.spellcastingAbility : null,
      source,
      source_code: source,
      edition,
      page: Number.isInteger(raw.page) ? raw.page : null,
      is_homebrew: false,
      owner_id: null,
      content_key: contentKey(edition, "class", source, name),
      raw_data: raw,
    },
  };
}

async function supabaseRequest(path, options = {}) {
  if (!CONFIG.supabaseUrl || !CONFIG.serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY) are required for database imports. Use --dry-run for transformation-only testing.",
    );
  }

  const response = await fetch(`${CONFIG.supabaseUrl.replace(/\/$/, "")}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: CONFIG.serviceRoleKey,
      Authorization: `Bearer ${CONFIG.serviceRoleKey}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Supabase HTTP ${response.status}: ${text}`);
  }

  return text ? JSON.parse(text) : null;
}

async function upsertRows(table, rows, onConflict, batchSize = DEFAULT_BATCH_SIZE) {
  let written = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    await supabaseRequest(`${table}?on_conflict=${encodeURIComponent(onConflict)}`, {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(batch),
    });
    written += batch.length;
    console.log(`  ${table}: ${written}/${rows.length}`);
  }

  return written;
}

async function loadRaceContentMap(edition) {
  const query =
    `races?select=id,name,edition,source_code&owner_id=is.null&edition=eq.${encodeURIComponent(edition)}`;
  const rows = (await supabaseRequest(query, { method: "GET" })) ?? [];
  const map = new Map();

  for (const row of rows) {
    if (!row?.name || !row?.id) continue;
    const source = row.source_code || "PHB";
    map.set(contentKey(edition, "race", source, row.name), row.id);
  }

  return map;
}

async function loadSpellClassSourceLookup({ dataDir, edition }) {
  const path = dataDir
    ? resolve(dataDir, "data/spells/sources.json")
    : `${githubBaseForEdition(edition)}/data/spells/sources.json`;
  const json = await loadJson(path);
  return json && typeof json === "object" ? json : {};
}

async function loadClassMap(edition) {
  const query =
    `classes?select=id,name,edition,source_code&owner_id=is.null&edition=eq.${encodeURIComponent(edition)}`;
  const rows = (await supabaseRequest(query, { method: "GET" })) ?? [];
  const exact = new Map();
  const byName = new Map();

  for (const row of rows) {
    if (!row?.name || !row?.id) continue;
    const name = row.name.trim().toLowerCase();
    const source = String(row.source_code || "PHB").trim().toLowerCase();
    exact.set(`${name}|${source}`, row.id);
    if (!byName.has(name)) byName.set(name, new Set());
    byName.get(name).add(row.id);
  }

  return { exact, byName };
}

async function loadClassContentMap(edition) {
  const query =
    `classes?select=id,name,edition,source_code&owner_id=is.null&edition=eq.${encodeURIComponent(edition)}`;
  const rows = (await supabaseRequest(query, { method: "GET" })) ?? [];
  const map = new Map();

  for (const row of rows) {
    if (!row?.name || !row?.id) continue;
    const source = row.source_code || "PHB";
    map.set(contentKey(edition, "class", source, row.name), row.id);
  }

  return map;
}

async function loadSubclassContentMap(edition) {
  const query =
    `subclasses?select=id,name,edition,source_code,raw_data&owner_id=is.null&edition=eq.${encodeURIComponent(edition)}`;
  const rows = (await supabaseRequest(query, { method: "GET" })) ?? [];
  const map = new Map();

  for (const row of rows) {
    if (!row?.id || !row?.name) continue;
    const raw = row.raw_data && typeof row.raw_data === "object" ? row.raw_data : {};
    const parent = raw._parentClass && typeof raw._parentClass === "object" ? raw._parentClass : {};
    const className = parent.name;
    const classSource = parent.source || (edition === "2024" ? "XPHB" : "PHB");
    const shortName = raw.shortName || row.name;
    const subclassSource = row.source_code || "PHB";
    if (!className) continue;
    const key = [
      edition,
      String(classSource).toLowerCase(),
      slug(className),
      String(subclassSource).toLowerCase(),
      slug(shortName),
    ].join(":");
    map.set(key, row.id);
  }

  return map;
}

function resolveFeatureClassId(item, classMap) {
  return classMap.get(contentKey(item.row.edition, "class", item.parentClassSource, item.parentClassName)) ?? null;
}

function resolveFeatureSubclassId(item, subclassMap) {
  const key = [
    item.row.edition,
    String(item.parentClassSource).toLowerCase(),
    slug(item.parentClassName),
    String(item.subclassSource).toLowerCase(),
    slug(item.subclassShortName),
  ].join(":");
  return subclassMap.get(key) ?? null;
}

function resolveSubclassClassId(item, classMap) {
  const exactKey = contentKey(item.row.edition, "class", item.parentClassSource, item.parentClassName);
  return classMap.get(exactKey) ?? null;
}

function resolveSubraceRaceId(item, raceMap) {
  const exactKey = contentKey(
    item.row.edition,
    "race",
    item.parentRaceSource,
    item.parentRaceName,
  );
  return raceMap.get(exactKey) ?? null;
}

function resolveSpellClassId(ref, classMap) {
  const name = ref.name.trim().toLowerCase();
  if (ref.source) {
    const exact = classMap.exact.get(`${name}|${ref.source.trim().toLowerCase()}`);
    if (exact) return exact;
  }

  const candidates = classMap.byName.get(name);
  if (candidates?.size === 1) return [...candidates][0];
  return null;
}

function spellClassLinks(spells, classMap) {
  const links = [];
  const missing = new Set();
  const missingBySpell = new Map();
  let totalRefs = 0;

  for (const spell of spells) {
    for (const ref of spell.classRefs ?? []) {
      // `fromClassListVariant` is deliberately not written into spell_classes.
      // That table represents the normal class spell list. Variant/optional lists
      // are kept in the raw source data for future optional-feature support.
      if (ref.type === "variant") continue;

      totalRefs += 1;
      const classId = resolveSpellClassId(ref, classMap);
      if (!classId) {
        const label = `${ref.name}${ref.source ? ` (${ref.source})` : ""}`;
        missing.add(label);
        if (!missingBySpell.has(spell.row.name)) missingBySpell.set(spell.row.name, []);
        missingBySpell.get(spell.row.name).push(label);
        continue;
      }
      links.push({ spell_id: spell.row.id, class_id: classId });
    }
  }

  return {
    links,
    missing: [...missing].sort(),
    missingBySpell,
    totalRefs,
  };
}

async function loadRowsByContentKeys(table, contentKeys, extraQuery = "") {
  const result = new Map();
  const chunkSize = 100;

  for (let i = 0; i < contentKeys.length; i += chunkSize) {
    const keys = contentKeys.slice(i, i + chunkSize);
    if (!keys.length) continue;

    // Keep `in.(...)` filters small enough for the REST gateway URL limit.
    // JSON quoting also protects punctuation in source/name values.
    const filter = keys.map((key) => JSON.stringify(key)).join(",");
    const query = `${table}?select=id,content_key${extraQuery}&content_key=in.(${encodeURIComponent(filter)})`;
    const rows = await supabaseRequest(query, { method: "GET" });

    for (const row of rows ?? []) {
      if (row?.content_key && row?.id) result.set(row.content_key, row.id);
    }
  }

  return result;
}

async function loadImportedSpellIds(contentKeys) {
  return loadRowsByContentKeys("spells", contentKeys);
}

async function deleteByIds(table, column, ids) {
  const chunkSize = 100;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const batch = ids.slice(i, i + chunkSize);
    if (!batch.length) continue;
    const filter = batch.join(",");
    await supabaseRequest(`${table}?${column}=in.(${encodeURIComponent(filter)})`, { method: "DELETE" });
  }
}

async function upsertContentSource({ edition, source, entityType }) {
  await supabaseRequest("content_sources?on_conflict=code%2Cedition", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([
      {
        code: source,
        name: source,
        edition,
        source_type: "5etools",
        is_official: true,
        metadata: {
          repository: "https://github.com/5etools-mirror-3/5etools-src",
          entity_type: entityType,
        },
      },
    ]),
  });
}

async function recordImport({ edition, source, entityType, sourceFile, recordCount, status = "success", errorMessage = null }) {
  await supabaseRequest("content_imports", {
    method: "POST",
    body: JSON.stringify([
      {
        source_code: source,
        edition,
        entity_type: entityType,
        source_file: sourceFile,
        source_revision: "5etools-src@main",
        record_count: recordCount,
        status,
        error_message: errorMessage,
        metadata: {
          importer: "dnd-character-manager/5etools-importer",
        },
      },
    ]),
  });
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function duplicateComparable(record) {
  // 5e.tools can contain the same logical catalogue record more than once.
  // raw_data is deliberately excluded from duplicate comparison because it
  // may contain source metadata/version details that do not change the
  // imported record. Subrace parent identity is part of content_key, so
  // same-named subraces with different parents are distinct records. Everything else on the transformed record is retained,
  // including relationship metadata such as parent race/class and spell
  // class links, so genuine conflicts are still rejected.
  const comparable = { ...record };
  comparable.row = { ...record.row };
  delete comparable.row.raw_data;
  return comparable;
}

function differingPaths(first, second, prefix = "") {
  if (stableJson(first) === stableJson(second)) return [];

  if (first === null || second === null || typeof first !== "object" || typeof second !== "object") {
    return [prefix || "value"];
  }

  if (Array.isArray(first) || Array.isArray(second)) {
    return [prefix || "value"];
  }

  const keys = new Set([...Object.keys(first), ...Object.keys(second)]);
  return [...keys].flatMap((key) =>
    differingPaths(first[key], second[key], prefix ? `${prefix}.${key}` : key),
  ).sort();
}

function dedupeIdenticalTransformed(records) {
  const seen = new Map();
  const deduped = [];
  let skipped = 0;

  for (const record of records) {
    const key = record.row.content_key;
    const previous = seen.get(key);

    if (!previous) {
      seen.set(key, record);
      deduped.push(record);
      continue;
    }

    const previousComparable = duplicateComparable(previous);
    const currentComparable = duplicateComparable(record);

    if (stableJson(previousComparable) !== stableJson(currentComparable)) {
      const differences = differingPaths(previousComparable, currentComparable);
      throw new Error(
        `Conflicting duplicate content_key detected: ${key}\n` +
          `  first: ${previous.row.name} (${previous.row.source})\n` +
          `  second: ${record.row.name} (${record.row.source})\n` +
          `  differing fields: ${differences.join(", ") || "unknown"}`,
      );
    }

    skipped += 1;
  }

  if (skipped > 0) {
    console.log(`  Deduplicated ${skipped} identical duplicate record${skipped === 1 ? "" : "s"} (raw source metadata differences ignored).`);
  }

  return deduped;
}

function assertNoDuplicateKeys(rows) {
  const seen = new Map();
  for (const row of rows) {
    const previous = seen.get(row.content_key);
    if (previous) {
      throw new Error(
        `Duplicate content_key detected: ${row.content_key}\n` +
          `  first: ${previous}\n` +
          `  second: ${row.name} (${row.source})`,
      );
    }
    seen.set(row.content_key, `${row.name} (${row.source})`);
  }
}

function printDryRun(entity, records) {
  let sample;

  if (entity === "spells") {
    sample = records.slice(0, 5).map((item) => ({
      name: item.row.name,
      level: item.row.level,
      school: item.row.school,
      source: item.row.source,
      edition: item.row.edition,
      classes: (item.classRefs ?? [])
        .filter((ref) => ref.type !== "variant")
        .map((ref) => `${ref.name}${ref.source ? ` (${ref.source})` : ""}`),
      variant_classes: (item.classRefs ?? [])
        .filter((ref) => ref.type === "variant")
        .map((ref) => `${ref.name}${ref.source ? ` (${ref.source})` : ""}`),
      casting_time: item.row.casting_time,
      range: item.row.range,
      duration: item.row.duration,
      components: item.row.components,
      material_component: item.row.material_component,
      content_key: item.row.content_key,
    }));
  } else if (entity === "subclasses") {
    sample = records.slice(0, 5).map((item) => ({
      name: item.row.name,
      parent_class: item.parentClassName,
      parent_class_source: item.parentClassSource,
      source: item.row.source,
      edition: item.row.edition,
      page: item.row.page,
      content_key: item.row.content_key,
    }));
  } else if (entity === "features") {
    sample = records.slice(0, 5).map((item) => ({
      name: item.row.name,
      feature_type: item.featureType,
      parent_class: item.parentClassName,
      parent_class_source: item.parentClassSource,
      subclass: item.subclassShortName,
      level: item.row.required_level,
      source: item.row.source,
      edition: item.row.edition,
      page: item.row.page,
      content_key: item.row.content_key,
    }));
  } else if (entity === "feats") {
    sample = records.slice(0, 5).map((item) => ({ name: item.row.name, source: item.row.source, edition: item.row.edition, page: item.row.page, content_key: item.row.content_key }));
  } else if (entity === "subraces") {
    sample = records.slice(0, 5).map((item) => ({
      name: item.row.name,
      parent_race: item.parentRaceName,
      parent_race_source: item.parentRaceSource,
      source: item.row.source,
      edition: item.row.edition,
      page: item.row.page,
      content_key: item.row.content_key,
    }));
  } else {
    sample = records.slice(0, 5).map((item) => ({
      name: item.row.name,
      source: item.row.source,
      edition: item.row.edition,
      page: item.row.page,
      content_key: item.row.content_key,
    }));
  }

  console.log("\nDRY RUN SAMPLE\n");
  console.log(JSON.stringify(sample, null, 2));

  if (records.length > 5) {
    console.log(`\n...and ${records.length - 5} more transformed records.`);
  }
}

async function discoverSources(entity, edition, dataDir, sourceFile) {
  const sources = [];

  if (sourceFile) {
    const json = await loadJson(sourceFile);
    if (entity === "races") return uniqSorted((json?.race || []).map((x) => x?.source));
    if (entity === "subraces") return uniqSorted((json?.subrace || []).map((x) => x?.source));
    if (entity === "backgrounds") return uniqSorted((json?.background || []).map((x) => x?.source));
    if (entity === "spells") return uniqSorted((json?.spell || []).map((x) => x?.source));
    if (entity === "items") return uniqSorted((json?.item || []).map((x) => x?.source));
    if (entity === "feats") return uniqSorted((json?.feat || []).map((x) => x?.source));
    if (entity === "optionalfeatures") return uniqSorted((json?.optionalfeature || []).map((x) => x?.source));
    if (entity === "classes") return uniqSorted((json?.class || []).map((x) => x?.source));
    if (entity === "subclasses") return uniqSorted((json?.subclass || []).map((x) => x?.source));
    if (entity === "features") {
      for (const entry of [...(json?.classFeature || []), ...(json?.subclassFeature || [])]) {
        if (entry?.classSource && !isEditionCompatibleSubclassParent(edition, entry.classSource)) continue;
        sources.push(entry?.source);
      }
      return uniqSorted(sources);
    }
    if (entity === "classes" || entity === "subclasses") {
      const key = entity === "classes" ? "class" : "subclass";
      for (const entry of Array.isArray(json?.[key]) ? json[key] : []) {
        if (entity === "subclasses" && !isEditionCompatibleSubclassParent(edition, entry?.classSource)) continue;
        sources.push(entry?.source);
      }
      return uniqSorted(sources);
    }
  }

  if (entity === "races" || entity === "subraces") {
    const json = await loadRaceAndSubraceJson({ dataDir: dataDir || undefined, edition, sourceFile: sourceFile || undefined });
    return uniqSorted((json?.[entity === "races" ? "race" : "subrace"] || []).map((x) => x?.source));
  }

  if (entity === "backgrounds" || entity === "items" || entity === "feats" || entity === "optionalfeatures") {
    const entityFile = entity === "backgrounds"
      ? "backgrounds.json"
      : entity === "items"
        ? "items.json"
        : entity === "feats"
          ? "feats.json"
          : "optionalfeatures.json";
    const entityKey = entity === "backgrounds"
      ? "background"
      : entity === "items"
        ? "item"
        : entity === "feats"
          ? "feat"
          : "optionalfeature";
    const path = dataDir ? resolve(dataDir, "data", entityFile) : `${githubBaseForEdition(edition)}/data/${entityFile}`;
    const json = await loadJson(path);
    return uniqSorted((json?.[entityKey] || []).map((x) => x?.source));
  }

  if (entity === "spells") {
    const index = await loadJson(dataDir ? resolve(dataDir, "data/spells/index.json") : `${githubBaseForEdition(edition)}/data/spells/index.json`);
    return uniqSorted(Object.keys(index || {}));
  }

  const files = await listClassFiles({ dataDir, edition });
  for (const filename of files) {
    const json = dataDir
      ? await loadJson(resolve(dataDir, "data/class", filename))
      : await loadJson(`${githubBaseForEdition(edition)}/data/class/${filename}`);
    if (entity === "features") {
      for (const entry of [...(json?.classFeature || []), ...(json?.subclassFeature || [])]) {
        if (entry?.classSource && !isEditionCompatibleSubclassParent(edition, entry.classSource)) continue;
        sources.push(entry?.source);
      }
      continue;
    }
    const key = entity === "classes" ? "class" : "subclass";
    for (const entry of Array.isArray(json?.[key]) ? json[key] : []) {
      if (entity === "subclasses" && !isEditionCompatibleSubclassParent(edition, entry?.classSource)) continue;
      sources.push(entry?.source);
    }
  }
  return uniqSorted(sources);
}

async function expandSources({ entity, edition, sources, dataDir, sourceFile }) {
  if (!isAllSourcesRequest(sources)) return sources;
  const discovered = await discoverSources(entity, edition, dataDir, sourceFile);
  if (!discovered.length) throw new Error(`No sources discovered for ${entity} (${edition}).`);
  console.log(`Expanded --sources all to ${discovered.length} source codes.`);
  return discovered;
}

function printHelp() {
  console.log(`5e.tools importer

Usage:
  node --env-file=tools/.env.importer tools/5etools-importer.mjs [options]

Options:
  --entity <spells|classes|subclasses|races|subraces|backgrounds|features|items|feats|optionalfeatures>
  --edition <2014|2024|custom>
  --sources <PHB|all|CSV>
  --limit <number>
  --data-dir <path>
  --source-file <path>
  --output <path>
  --dry-run
  --help

Spells use 5e.tools' canonical data/spells/sources.json class-list mapping when available.`);
}

async function main() {
  if (hasArg("--help") || hasArg("-h")) {
    printHelp();
    return;
  }

  const entity = (argValue("--entity", "spells") ?? "spells").toLowerCase();
  const edition = argValue("--edition", "2014");
  const defaultSources =
    entity === "classes" ? DEFAULT_CLASS_SOURCES :
    entity === "subclasses" ? DEFAULT_SUBCLASS_SOURCES :
    entity === "races" ? DEFAULT_RACE_SOURCES :
    entity === "subraces" ? DEFAULT_SUBRACE_SOURCES :
    entity === "backgrounds" ? DEFAULT_BACKGROUND_SOURCES :
    entity === "features" ? ["PHB"] :
    entity === "items" ? DEFAULT_ITEM_SOURCES :
    entity === "feats" ? DEFAULT_FEAT_SOURCES :
    entity === "optionalfeatures" ? DEFAULT_OPTIONAL_FEATURE_SOURCES :
    DEFAULT_SPELL_SOURCES;
  const sources = csv(argValue("--sources", defaultSources.join(",")));
  const limitValue = argValue("--limit", "");
  const limit = limitValue ? Number(limitValue) : Infinity;
  const dataDir = argValue("--data-dir", "");
  const sourceFile = argValue("--source-file", "");
  const dryRun = hasArg("--dry-run");
  const outputPath = argValue("--output", "");

  if (!["spells", "classes", "subclasses", "races", "subraces", "backgrounds", "features", "items", "feats", "optionalfeatures"].includes(entity)) {
    die(`Phase 5 supports spells, classes, subclasses, races, subraces, backgrounds, features, items, and feats. Received entity: ${entity}`);
  }

  if (!["2014", "2024", "custom"].includes(edition)) {
    die(`Unsupported edition "${edition}". Use 2014, 2024, or custom.`);
  }

  if (!sources.length) die("At least one source is required.");

  if (limitValue && (!Number.isFinite(limit) || limit <= 0 || !Number.isInteger(limit))) {
    die("--limit must be a positive whole number");
  }

  if (sourceFile && sources.length !== 1 && !isAllSourcesRequest(sources)) {
    die("--source-file can only be used with one source, or with --sources all");
  }

  const expandedSources = await expandSources({
    entity,
    edition,
    sources,
    dataDir: dataDir || undefined,
    sourceFile: sourceFile || undefined,
  });

  const transformed = [];
  const filesUsed = [];
  let spellClassSourceLookup = null;

  console.log("5e.tools importer");
  console.log(`Entity : ${entity}`);
  console.log(`Edition: ${edition}`);
  console.log(`Sources: ${expandedSources.join(", ")}`);
  console.log(`Mode   : ${dryRun ? "dry-run" : "database import"}`);

  if (entity === "spells" && !sourceFile) {
    spellClassSourceLookup = await loadSpellClassSourceLookup({
      dataDir: dataDir || undefined,
      edition,
    });
    console.log("  Loaded canonical spell/class lookup from data/spells/sources.json");
  }

  for (const source of expandedSources) {
    console.log(`\nLoading ${source}...`);

    let entries;
    if (entity === "spells") {
      const json = await loadSpellFile({
        source,
        dataDir: dataDir || undefined,
        sourceFile: sourceFile || undefined,
        edition,
      });
      entries = Array.isArray(json?.spell) ? json.spell.filter((entry) => !entry?.source || entry.source === source) : [];
    } else if (entity === "classes") {
      entries = await loadClassEntries({
        source,
        dataDir: dataDir || undefined,
        sourceFile: sourceFile || undefined,
        edition,
      });
    } else if (entity === "subclasses") {
      entries = await loadSubclassEntries({
        source,
        dataDir: dataDir || undefined,
        sourceFile: sourceFile || undefined,
        edition,
      });
    } else if (entity === "races") {
      entries = await loadRaceEntries({
        source,
        dataDir: dataDir || undefined,
        sourceFile: sourceFile || undefined,
        edition,
      });
    } else if (entity === "features") {
      entries = await loadFeatureEntries({
        source,
        dataDir: dataDir || undefined,
        sourceFile: sourceFile || undefined,
        edition,
      });
    } else if (entity === "items") {
      entries = await loadItemEntries({
        source,
        dataDir: dataDir || undefined,
        sourceFile: sourceFile || undefined,
        edition,
      });
    } else if (entity === "feats") {
      entries = await loadFeatEntries({
        source, dataDir: dataDir || undefined, sourceFile: sourceFile || undefined, edition,
      });
    } else if (entity === "optionalfeatures") {
      entries = await loadOptionalFeatureEntries({
        source,
        dataDir: dataDir || undefined,
        sourceFile: sourceFile || undefined,
        edition,
      });
    } else if (entity === "subraces") {
      entries = await loadSubraceEntries({
        source,
        dataDir: dataDir || undefined,
        sourceFile: sourceFile || undefined,
        edition,
      });
    } else {
      entries = await loadBackgroundEntries({
        source,
        dataDir: dataDir || undefined,
        sourceFile: sourceFile || undefined,
        edition,
      });
    }

    if (!entries.length) {
      throw new Error(`No ${entity} entries found in source ${source}.`);
    }

    const selected = entries.slice(0, Number.isFinite(limit) ? limit : undefined);

    const sourceRows = selected.map((entry) => {
      if (entity === "spells") return transformSpell(entry, edition, source, spellClassSourceLookup);
      if (entity === "classes") return transformClass(entry, edition, source);
      if (entity === "subclasses") return transformSubclass(entry.subclass, entry.parent, edition, source);
      if (entity === "races") return transformRace(entry, edition, source);
      if (entity === "subraces") return transformSubrace(entry, edition, source);
      if (entity === "features") return transformFeature(entry.feature, entry.type, edition, source);
      if (entity === "items") return transformItem(entry, edition, source);
      if (entity === "feats") return transformFeat(entry, edition, source);
      if (entity === "optionalfeatures") return transformOptionalFeature(entry, edition, source);
      return transformBackground(entry, edition, source);
    });

    transformed.push(...sourceRows);
    const entityPath =
      entity === "spells" ? "data/spells" :
      entity === "classes" || entity === "subclasses" || entity === "features" ? "data/class" :
      entity === "races" || entity === "subraces" ? "data/races" :
      entity === "items" ? "data/items.json" :
      entity === "feats" ? "data/feats.json" :
      entity === "optionalfeatures" ? "data/optionalfeatures.json" :
      "data/backgrounds";
    filesUsed.push(sourceFile || `${entityPath}/${source}`);

    console.log(`  Found ${entries.length} matching ${entity} records`);
    console.log(`  Selected ${sourceRows.length} records`);
  }

  if (!transformed.length) die("Nothing was transformed.");

  const uniqueTransformed = dedupeIdenticalTransformed(transformed);
  const rows = uniqueTransformed.map((item) => item.row);
  assertNoDuplicateKeys(rows);

  if (outputPath) {
    const out = resolve(outputPath);
    await mkdir(resolve(out, ".."), { recursive: true });
    await writeFile(
      out,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          entity,
          edition,
          sources: expandedSources,
          records: rows,
        },
        null,
        2,
      ),
      "utf8",
    );
    console.log(`\nWrote uniqueTransformed JSON: ${out}`);
  }

  if (dryRun) {
    printDryRun(entity, uniqueTransformed);
    if (entity === "spells") {
      const mainRefs = uniqueTransformed.reduce(
        (sum, item) => sum + (item.classRefs?.filter((ref) => ref.type !== "variant").length ?? 0),
        0,
      );
      const spellsWithRefs = uniqueTransformed.filter((item) => (item.classRefs?.some((ref) => ref.type !== "variant"))).length;
      console.log(`\nSpell class diagnostics:`);
      console.log(`  Spells with normal class-list refs: ${spellsWithRefs}`);
      console.log(`  Normal class-list refs found: ${mainRefs}`);
      console.log(`  Optional/variant refs retained in raw data: ${uniqueTransformed.reduce((sum, item) => sum + (item.classRefs?.filter((ref) => ref.type === "variant").length ?? 0), 0)}`);
    }
    console.log("\nDry run complete. No Supabase writes were made.");
    return;
  }

  console.log("\nPreparing Supabase import...");

  for (const source of expandedSources) {
    await upsertContentSource({ edition, source, entityType: entity });
  }

  if (entity === "classes") {
    await upsertRows("classes", rows, "content_key");

    for (const source of expandedSources) {
      await recordImport({
        edition,
        source,
        entityType: entity,
        sourceFile: filesUsed.join(", "),
        recordCount: uniqueTransformed.filter((item) => item.row.source === source).length,
      });
    }

    console.log(`\nImport complete: ${rows.length} class records.`);
    return;
  }

  if (entity === "races" || entity === "backgrounds") {
    const table = entity;
    await upsertRows(table, rows, "content_key");

    for (const source of expandedSources) {
      await recordImport({
        edition,
        source,
        entityType: entity,
        sourceFile: filesUsed.join(", "),
        recordCount: uniqueTransformed.filter((item) => item.row.source === source).length,
      });
    }

    console.log(`\nImport complete: ${rows.length} ${entity} records.`);
    return;
  }

  if (entity === "subraces") {
      const raceMap = await loadRaceContentMap(edition);
      const subraceRows = [];
      const missingParents = new Set();

      for (const item of uniqueTransformed) {
        const raceId = resolveSubraceRaceId(item, raceMap);
        if (!raceId) {
          missingParents.add(`${item.parentRaceName} (${item.parentRaceSource})`);
          continue;
        }
        subraceRows.push({ ...item.row, race_id: raceId });
      }

      if (missingParents.size) {
        throw new Error(
          `Could not resolve parent race for subrace import: ${[...missingParents].sort().join(", ")}. Import the matching races first.`,
        );
      }

      await upsertRows("subraces", subraceRows, "content_key");

      for (const source of expandedSources) {
        await recordImport({
          edition,
          source,
          entityType: entity,
          sourceFile: filesUsed.join(", "),
          recordCount: uniqueTransformed.filter((item) => item.row.source === source).length,
        });
      }

    console.log(`\nImport complete: ${subraceRows.length} subrace records.`);
    return;
  }

  if (entity === "features") {
    const classMap = await loadClassContentMap(edition);
    const subclassMap = await loadSubclassContentMap(edition);
    const featureRows = [];
    const classLinks = [];
    const subclassLinks = [];
    const missingParents = new Set();

    for (const item of uniqueTransformed) {
      featureRows.push(item.row);
      if (item.featureType === "class") {
        const classId = resolveFeatureClassId(item, classMap);
        if (!classId) {
          missingParents.add(`class ${item.parentClassName} (${item.parentClassSource})`);
          continue;
        }
        classLinks.push({ class_id: classId, feature_id: null, required_level: item.row.required_level, _content_key: item.row.content_key });
      } else {
        const subclassId = resolveFeatureSubclassId(item, subclassMap);
        if (!subclassId) {
          missingParents.add(`subclass ${item.subclassShortName} (${item.subclassSource}) on ${item.parentClassName} (${item.parentClassSource})`);
          continue;
        }
        subclassLinks.push({ subclass_id: subclassId, feature_id: null, required_level: item.row.required_level, _content_key: item.row.content_key });
      }
    }

    if (missingParents.size) {
      throw new Error(`Could not resolve feature parent(s): ${[...missingParents].sort().join(", ")}. Import the matching classes/subclasses first.`);
    }

    await upsertRows("features", featureRows, "content_key");
    const idByKey = await loadRowsByContentKeys(
      "features",
      featureRows.map((row) => row.content_key),
      `&owner_id=is.null&edition=eq.${encodeURIComponent(edition)}`,
    );

    for (const link of classLinks) {
      link.feature_id = idByKey.get(link._content_key);
      delete link._content_key;
    }
    for (const link of subclassLinks) {
      link.feature_id = idByKey.get(link._content_key);
      delete link._content_key;
    }

    if ([...classLinks, ...subclassLinks].some((link) => !link.feature_id)) {
      throw new Error("Could not retrieve imported feature UUIDs for all feature links.");
    }

    // Rebuild relationships for the imported catalogue features only.
    const importedFeatureIds = [...idByKey.values()];
    if (importedFeatureIds.length) {
      await deleteByIds("class_features", "feature_id", importedFeatureIds);
      await deleteByIds("subclass_features", "feature_id", importedFeatureIds);
    }

    if (classLinks.length) await upsertRows("class_features", classLinks, "class_id,feature_id");
    if (subclassLinks.length) await upsertRows("subclass_features", subclassLinks, "subclass_id,feature_id");

    for (const source of expandedSources) {
      await recordImport({
        edition,
        source,
        entityType: entity,
        sourceFile: filesUsed.join(", "),
        recordCount: uniqueTransformed.filter((item) => item.row.source === source).length,
      });
    }

    console.log(`\nImport complete: ${featureRows.length} feature records.`);
    console.log(`Class feature links written: ${classLinks.length}`);
    console.log(`Subclass feature links written: ${subclassLinks.length}`);
    return;
  }

  if (entity === "feats") {
    await upsertRows("feats", rows, "content_key");
    for (const source of expandedSources) {
      await recordImport({ edition, source, entityType: entity, sourceFile: filesUsed.join(", "), recordCount: uniqueTransformed.filter((item) => item.row.source === source).length });
    }
    console.log(`\nImport complete: ${rows.length} feat records.`);
    return;
  }

  if (entity === "items") {
    await upsertRows("items", rows, "content_key");

    for (const source of expandedSources) {
      await recordImport({
        edition,
        source,
        entityType: entity,
        sourceFile: filesUsed.join(", "),
        recordCount: uniqueTransformed.filter((item) => item.row.source === source).length,
      });
    }

    console.log(`\nImport complete: ${rows.length} item records.`);
    return;
  }

  if (entity === "subclasses") {
    const classMap = await loadClassContentMap(edition);
    const subclassRows = [];
    const missingParents = new Set();

    for (const item of uniqueTransformed) {
      const classId = resolveSubclassClassId(item, classMap);
      if (!classId) {
        missingParents.add(`${item.parentClassName} (${item.parentClassSource})`);
        continue;
      }
      subclassRows.push({ ...item.row, class_id: classId });
    }

    if (missingParents.size) {
      throw new Error(
        `Could not resolve parent class for subclass import: ${[...missingParents].sort().join(", ")}. Import the matching classes first.`,
      );
    }

    await upsertRows("subclasses", subclassRows, "content_key");

    for (const source of expandedSources) {
      await recordImport({
        edition,
        source,
        entityType: entity,
        sourceFile: filesUsed.join(", "),
        recordCount: uniqueTransformed.filter((item) => item.row.source === source).length,
      });
    }

    console.log(`\nImport complete: ${subclassRows.length} subclass records.`);
    return;
  }

  const classMap = await loadClassMap(edition);
  const idsByKey = await loadImportedSpellIds(rows.map((row) => row.content_key));
  const linked = uniqueTransformed.map((item) => ({
    ...item,
    row: { ...item.row, id: idsByKey.get(item.row.content_key) },
  }));

  const missingId = linked.find((item) => !item.row.id);
  if (missingId) throw new Error(`Could not retrieve imported UUID for "${missingId.row.name}"`);

  // Build and validate the complete association set BEFORE deleting the old
  // links. If the 5e.tools class lookup or catalogue is incomplete, the import
  // stops safely instead of wiping a previously-valid set of spell links.
  const { links, missing, totalRefs, missingBySpell } = spellClassLinks(linked, classMap);
  if (totalRefs > 0 && links.length === 0) {
    throw new Error(
      `Spell class-link extraction resolved 0 of ${totalRefs} normal class-list refs. Existing spell_classes rows were left untouched.`,
    );
  }
  if (missing.length) {
    const examples = [...missingBySpell.entries()]
      .slice(0, 12)
      .map(([spell, refs]) => `    ${spell}: ${refs.join(", ")}`)
      .join("\n");
    throw new Error(
      `Could not resolve ${missing.length} class reference${missing.length === 1 ? "" : "s"} against the ${edition} class catalogue. Existing spell_classes rows were left untouched.\n` +
      `${examples}`,
    );
  }

  await upsertRows("spells", rows, "content_key");

  await deleteByIds("spell_classes", "spell_id", linked.map((item) => item.row.id));
  if (links.length) await upsertRows("spell_classes", links, "spell_id,class_id");

  for (const source of expandedSources) {
    await recordImport({
      edition,
      source,
      entityType: entity,
      sourceFile: filesUsed.join(", "),
      recordCount: uniqueTransformed.filter((item) => item.row.source === source).length,
    });
  }

  console.log(`\nImport complete: ${rows.length} spell records.`);
  console.log(`Normal class-list refs found: ${totalRefs}`);
  console.log(`Class links written: ${links.length}`);
}

main().catch((error) => {
  console.error("\nIMPORT FAILED");
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
