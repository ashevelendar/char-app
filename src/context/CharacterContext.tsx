"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { defaultCharacter, features, items, spells } from "../lib/data";
import {
  getAvailableFeatures,
  getAvailableItems,
  getAvailableSpells,
  getExpectedMaxHp,
  getExpectedHitDice,
  getProficiencyBonus,
  getCantripsKnown,
  getPreparedSpellCount,
  getSpellsKnown,
  getSpellcastingMode,
  hasOverride,
  isFeatureNormallyAvailable,
  isItemNormallyAvailable,
  isSpellNormallyAvailable,
} from "../lib/rules";
import type {
  AccessMode,
  Character,
  ContentType,
  InventoryEntry,
  NewCharacterInput,
  Feat,
  Feature,
  Spell,
  SpellEntry,
} from "../lib/types";
import { supabase } from "../lib/supabase";
import { useAuth } from "./AuthContext";

const STORAGE_KEY = "dnd-character-manager-characters";
const SETTINGS_KEY = "dnd-character-manager-settings";

type DatabaseStatus = "loading" | "connected" | "error" | "local-only";

type Catalogue = {
  classes: string[];
  races: string[];
  subclasses: Array<{ name: string; className: string; description?: string; source?: string }>;
  backgrounds: string[];
};

type ContentMaps = {
  classByName: Map<string, string>;
  raceByName: Map<string, string>;
  subclassByName: Map<string, string>;
  backgroundByName: Map<string, string>;
  subclassByDbId: Map<string, string>;
  catalogue: Catalogue;
  spellCatalogue: Spell[];
  featureCatalogue: Feature[];
  featCatalogue: Feat[];
  spellByAppId: Map<string, string>;
  featureByAppId: Map<string, string>;
  itemByAppId: Map<string, string>;
  optionalFeatureByKey: Map<string, string>;
  spellByDbId: Map<string, string>;
  featureByDbId: Map<string, string>;
  itemByDbId: Map<string, string>;
  optionalFeatureByDbId: Map<string, string>;
};

type CharacterContextValue = {
  characters: Character[];
  hydrated: boolean;
  accessMode: AccessMode;
  databaseStatus: DatabaseStatus;
  setAccessMode: (mode: AccessMode) => void;
  createCharacter: (input: NewCharacterInput) => Promise<string>;
  updateCharacter: (id: string, patch: Partial<Character>) => Promise<void>;
  deleteCharacter: (id: string) => Promise<void>;
  addInventoryItem: (characterId: string, itemId: string, quantity?: number, override?: boolean) => Promise<boolean>;
  removeInventoryItem: (characterId: string, itemId: string) => Promise<void>;
  changeInventoryQuantity: (characterId: string, itemId: string, delta: number) => Promise<void>;
  toggleInventoryEquipped: (characterId: string, itemId: string) => Promise<void>;
  addSpell: (characterId: string, spellId: string, prepared?: boolean, override?: boolean) => Promise<boolean>;
  removeSpell: (characterId: string, spellId: string) => Promise<void>;
  toggleSpellPrepared: (characterId: string, spellId: string) => Promise<void>;
  addFeature: (characterId: string, featureId: string, override?: boolean) => Promise<boolean>;
  removeFeature: (characterId: string, featureId: string) => Promise<void>;
  addOptionalFeature: (characterId: string, optionalFeatureKey: string, override?: boolean) => Promise<boolean>;
  removeOptionalFeature: (characterId: string, optionalFeatureKey: string) => Promise<void>;
  revokeOverride: (characterId: string, type: ContentType, contentId: string) => Promise<void>;
  resetDemoData: () => Promise<void>;
  catalogue: Catalogue;
  spellCatalogue: Spell[];
  featureCatalogue: Feature[];
  featCatalogue: Feat[];
};

const CharacterContext = createContext<CharacterContextValue | undefined>(undefined);

function normalizeSpells(value: unknown): SpellEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry === "string") return [{ spellId: entry, prepared: false }];
    if (entry && typeof entry === "object" && "spellId" in entry && typeof entry.spellId === "string") {
      const candidate = entry as Partial<SpellEntry>;
      return [{ spellId: candidate.spellId as string, prepared: Boolean(candidate.prepared) }];
    }
    return [];
  });
}

function normalizeInventory(value: unknown): InventoryEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry === "string") {
      const item = items.find((candidate) => candidate.id === entry);
      return [{ itemId: entry, quantity: item?.id === "healing-potion" ? 3 : 1, equipped: item?.id === "studded-leather" }];
    }
    if (entry && typeof entry === "object" && "itemId" in entry && typeof entry.itemId === "string") {
      const candidate = entry as Partial<InventoryEntry>;
      return [{
        itemId: candidate.itemId as string,
        quantity: typeof candidate.quantity === "number" && candidate.quantity > 0 ? candidate.quantity : 1,
        equipped: Boolean(candidate.equipped),
        notes: typeof candidate.notes === "string" ? candidate.notes : undefined,
      }];
    }
    return [];
  });
}

function normalizeCharacter(value: Character): Character {
  const merged = {
    ...defaultCharacter,
    ...value,
    abilities: { ...defaultCharacter.abilities, ...(value.abilities ?? {}) },
    savingThrows: Array.isArray(value.savingThrows) ? value.savingThrows : [],
    skills: Array.isArray(value.skills) ? value.skills : [],
    languages: Array.isArray(value.languages) ? value.languages : [],
    feats: Array.isArray(value.feats) ? value.feats : [],
    features: Array.isArray(value.features) ? value.features : [],
    spells: normalizeSpells(value.spells),
    inventory: normalizeInventory(value.inventory),
    optionalFeatures: Array.isArray(value.optionalFeatures) ? value.optionalFeatures : [],
    accessOverrides: Array.isArray(value.accessOverrides) ? value.accessOverrides : [],
  };

  const level = Math.max(1, Math.min(20, Number(merged.level) || 1));
  const maxHp = getExpectedMaxHp(merged.className, level, merged.abilities.con);
  const wasAtMax = Number(merged.hp) >= Number(merged.maxHp);
  const hp = wasAtMax
    ? maxHp
    : Math.max(0, Math.min(maxHp, Number(merged.hp) || 0));

  return {
    ...merged,
    level,
    maxHp,
    hp,
    hitDice: getExpectedHitDice(merged.className, level),
    proficiencyBonus: getProficiencyBonus(level),
  };
}

function catalogueText(value: unknown): string {
  if (typeof value === "string") {
    return value
      .replace(/\{@[^\s}]+\s+([^}|}]+)(?:\|[^}]*)?\}/g, "$1")
      .trim();
  }
  if (Array.isArray(value)) {
    return value.map(catalogueText).filter(Boolean).join("\n\n");
  }
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    for (const key of ["entries", "entry", "items", "text"]) {
      if (key in object) {
        const text = catalogueText(object[key]);
        if (text) return text;
      }
    }
  }
  return "";
}

function makeMaps(
  classesRows: Array<{ id: string; name: string }>,
  raceRows: Array<{ id: string; name: string }>,
  subclassRows: Array<{
    id: string;
    name: string;
    class_id?: string | null;
    description?: string | null;
    source?: string | null;
    source_code?: string | null;
    raw_data?: unknown;
  }>,
  backgroundRows: Array<{ id: string; name: string }>,
  spellRows: Array<{
    id: string;
    name: string;
    level: number;
    school: string;
    casting_time: string;
    range: string;
    duration: string;
    description: string;
    higher_levels?: string | null;
    source?: string | null;
    source_code?: string | null;
    edition?: string | null;
    content_key?: string | null;
  }>,
  spellClassRows: Array<{ spell_id: string; class_id: string }>,
  spellSubclassRows: Array<{ spell_id: string; subclass_id: string }>,
  spellRaceRows: Array<{ spell_id: string; race_id: string }>,
  featureRows: Array<{ id: string; name: string }>,
  itemRows: Array<{ id: string; name: string }>,
  optionalFeatureRows: Array<{ id: string; content_key: string | null }>,
  classFeatureRows: Array<{ class_id: string; feature_id: string; required_level?: number | null }>,
  subclassFeatureRows: Array<{ subclass_id: string; feature_id: string; required_level?: number | null }>,
  featRows: Array<{ id: string; name: string; description?: string | null; prerequisite?: unknown; ability?: unknown; source?: string | null; edition?: string | null; content_key?: string | null }>,
): ContentMaps {  const byName = (rows: Array<{ id: string; name: string }>) => new Map(rows.map((row) => [row.name, row.id]));
  const classNameById = new Map(classesRows.map((row: any) => [row.id, row.name]));  const subclassNameById = new Map(subclassRows.map((row: any) => [row.id, row.name]));  const raceNameById = new Map(raceRows.map((row: any) => [row.id, row.name]));
  const uniqueNames = (values: string[]) => [...new Set(values.filter(Boolean))];

  const spellClassesById = new Map<string, Set<string>>();
  for (const link of spellClassRows) {
    const name = classNameById.get(link.class_id);
    if (!name) continue;
    if (!spellClassesById.has(link.spell_id)) spellClassesById.set(link.spell_id, new Set());
    spellClassesById.get(link.spell_id)!.add(name);
  }

  const spellSubclassesById = new Map<string, Set<string>>();
  for (const link of spellSubclassRows) {
    const name = subclassNameById.get(link.subclass_id);
    if (!name) continue;    if (!spellSubclassesById.has(link.spell_id)) spellSubclassesById.set(link.spell_id, new Set());
    spellSubclassesById.get(link.spell_id)!.add(name);
  }

  const spellRacesById = new Map<string, Set<string>>();
  for (const link of spellRaceRows) {
    const name = raceNameById.get(link.race_id);    if (!name) continue;
    if (!spellRacesById.has(link.spell_id)) spellRacesById.set(link.spell_id, new Set());
    spellRacesById.get(link.spell_id)!.add(name);
  }

  const sourcePriority = (row: { source?: string | null; source_code?: string | null }) =>
    (row.source_code ?? row.source ?? "") === "PHB" ? 0 : 1;

  const canonicalSpellByKey = new Map<string, typeof spellRows[number]>();
  for (const row of [...spellRows].sort((a, b) => {
    const rank = sourcePriority(a) - sourcePriority(b);
    return rank || (a.name + "|" + a.level + "|" + a.school + "|" + a.id).localeCompare(b.name + "|" + b.level + "|" + b.school + "|" + b.id);
  })) {
    const key = row.name.trim().toLowerCase() + "::" + row.level + "::" + row.school;
    if (!canonicalSpellByKey.has(key)) canonicalSpellByKey.set(key, row);
  }

  const canonicalSpellRows = [...canonicalSpellByKey.values()];
  const canonicalIdByDbId = new Map(
    spellRows.map((row) => {
      const key = row.name.trim().toLowerCase() + "::" + row.level + "::" + row.school;
      return [row.id, canonicalSpellByKey.get(key)?.id ?? row.id] as const;
    }),
  );

  const spellCatalogue: Spell[] = canonicalSpellRows
    .map((row) => ({
      id: row.id,
      name: row.name,
      level: Math.max(0, Math.min(9, row.level)) as Spell["level"],
      school: row.school ?? "",
      castingTime: row.casting_time ?? "",
      range: row.range ?? "",
      duration: row.duration ?? "",
      description: row.description ?? "",
      higherLevels: row.higher_levels ?? undefined,
      classes: [...(spellClassesById.get(row.id) ?? new Set<string>())],
      subclasses: [...(spellSubclassesById.get(row.id) ?? new Set<string>())],
      races: [...(spellRacesById.get(row.id) ?? new Set<string>())],
      source: row.source ?? row.source_code ?? undefined,
      edition: (row.edition === "2024" || row.edition === "custom" ? row.edition : "2014") as Spell["edition"],
      contentKey: row.content_key ?? undefined,
    }))
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));

  const spellByName = new Map(
    spellCatalogue.map((spell) => [spell.name.trim().toLowerCase(), spell.id] as const),
  );

  const reverseByName = (rows: Array<{ id: string; name: string }>, source: { id: string; name: string }[]) =>
    new Map(rows.map((row) => [row.id, source.find((entry) => entry.name === row.name)?.id ?? row.id]));

  const classFeatureById = new Map<string, { className: string; requiredLevel: number }>();
  for (const link of classFeatureRows) {
    const className = classNameById.get(link.class_id);
    if (className) classFeatureById.set(link.feature_id, { className, requiredLevel: Number(link.required_level) || 1 });
  }
  const subclassFeatureById = new Map<string, { subclassName: string; className: string; requiredLevel: number }>();
  for (const link of subclassFeatureRows) {
    const subclassRow = subclassRows.find((row) => row.id === link.subclass_id);
    const subclassName = subclassNameById.get(link.subclass_id);
    const className = classNameById.get(subclassRow?.class_id ?? "");
    if (subclassName && className) {
      subclassFeatureById.set(link.feature_id, {
        subclassName,
        className,
        requiredLevel: Number(link.required_level) || 1,
      });
    }
  }

  const featureCatalogue: Feature[] = featureRows
    .map((row: any) => {
      const classLink = classFeatureById.get(row.id);
      const subclassLink = subclassFeatureById.get(row.id);
      return {
        id: row.id,
        name: row.name,
        source: row.source ?? row.source_code ?? "",
        sourceType: subclassLink ? "subclass" : "class",
        requiredLevel: subclassLink?.requiredLevel ?? classLink?.requiredLevel ?? (Number(row.required_level) || 1),
        description: row.description ?? "",
        className: classLink?.className ?? subclassLink?.className,
        subclassName: subclassLink?.subclassName,
      } satisfies Feature;
    })
    .filter((feature) => feature.name)
    .sort((a, b) => a.requiredLevel - b.requiredLevel || a.name.localeCompare(b.name));

  const featCatalogue: Feat[] = featRows
    .map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description ?? "",
      prerequisite: row.prerequisite,
      ability: row.ability,
      source: row.source ?? "",
      edition: (row.edition === "2024" || row.edition === "custom" ? row.edition : "2014") as Feat["edition"],
      contentKey: row.content_key ?? undefined,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    classByName: byName(classesRows),
    raceByName: byName(raceRows),
    subclassByName: byName(subclassRows),
    backgroundByName: byName(backgroundRows),
    spellCatalogue,
    featureCatalogue,
    featCatalogue,
    spellByAppId: new Map(spells.flatMap((spell) => {
      const dbId = spellByName.get(spell.name.trim().toLowerCase());
      return dbId ? [[spell.id, dbId] as const] : [];
    })),
    featureByAppId: new Map(features.flatMap((feature) => {
      const dbId = featureRows.find((row) => row.name === feature.name)?.id;
      return dbId ? [[feature.id, dbId] as const] : [];
    })),
    itemByAppId: new Map(items.flatMap((item) => {
      const dbId = itemRows.find((row) => row.name === item.name)?.id;
      return dbId ? [[item.id, dbId] as const] : [];
    })),
    optionalFeatureByKey: new Map(
      optionalFeatureRows.flatMap((row) =>
        row.content_key ? [[row.content_key, row.id] as const] : [],
      ),
    ),
    spellByDbId: canonicalIdByDbId,
    featureByDbId: reverseByName(featureRows, features),
    itemByDbId: reverseByName(itemRows, items),
    optionalFeatureByDbId: new Map(
      optionalFeatureRows.flatMap((row) =>
        row.content_key ? [[row.id, row.content_key] as const] : [],
      ),
    ),
    subclassByDbId: new Map(subclassRows.map((row: any) => [row.id, row.name])),
    catalogue: {
      classes: uniqueNames(classesRows.map((row) => row.name)),
      races: uniqueNames(raceRows.map((row) => row.name)),
      subclasses: Array.from(
        new Map(
          subclassRows
            .map((row) => {
              const className = classNameById.get(row.class_id ?? "") ?? "";
              const subclassFeature = featureCatalogue.find(
                (feature) =>
                  feature.sourceType === "subclass" &&
                  feature.className === className &&
                  feature.subclassName &&
                  feature.name === row.name &&
                  Boolean(feature.description?.trim()),
              );
              return {
                name: row.name,
                className,
                description:
                  row.description?.trim() ||
                  catalogueText(
                    row.raw_data &&
                    typeof row.raw_data === "object"
                      ? (row.raw_data as Record<string, unknown>).fluff
                      : undefined,
                  ) ||
                  subclassFeature?.description?.trim() ||
                  "",
                source: row.source ?? row.source_code ?? "",
              };
            })
            .filter((entry) => entry.name && entry.className)
            .map((entry) => [entry.className + "::" + entry.name, entry] as const),
        ).values(),
      ),
      backgrounds: uniqueNames(backgroundRows.map((row) => row.name)),
    },
  };
}

async function loadContentMaps(): Promise<ContentMaps> {
  if (!supabase) throw new Error("Supabase is not configured.");

  const [
    classesResult,
    racesResult,
    subclassesResult,
    backgroundsResult,
    spellsResult,
    featuresResult,
    itemsResult,
    optionalFeaturesResult,
    spellClassesResult,
    spellSubclassesResult,
    spellRacesResult,
    classFeaturesResult,
    subclassFeaturesResult,
    featsResult,
  ] = await Promise.all([    supabase.from("classes").select("id,name").is("owner_id", null),
    supabase.from("races").select("id,name").is("owner_id", null),    supabase.from("subclasses").select("id,name,class_id,description,source,source_code,edition,raw_data").is("owner_id", null).eq("edition", "2014"),
    supabase.from("backgrounds").select("id,name").is("owner_id", null),
    supabase.from("spells").select("id,name,level,school,casting_time,range,duration,description,higher_levels,source,source_code,edition,content_key").is("owner_id", null).eq("edition", "2014"),
    supabase.from("features").select("id,name,description,source,source_code,source_type,required_level,edition").is("owner_id", null).eq("edition", "2014"),
    supabase.from("items").select("id,name").is("owner_id", null),
    supabase.from("optional_features").select("id,content_key").is("owner_id", null),
    supabase.from("spell_classes").select("spell_id,class_id"),
    supabase.from("spell_subclasses").select("spell_id,subclass_id"),
    supabase.from("spell_races").select("spell_id,race_id"),
    supabase.from("class_features").select("class_id,feature_id,required_level"),
    supabase.from("subclass_features").select("subclass_id,feature_id,required_level"),
    supabase.from("feats").select("id,name,description,prerequisite,ability,source,source_code,edition,content_key").eq("edition", "2014").is("owner_id", null),
  ]);
  const results = [
    classesResult,
    racesResult,
    subclassesResult,    backgroundsResult,
    spellsResult,
    featuresResult,
    itemsResult,
    optionalFeaturesResult,
    spellClassesResult,
    spellSubclassesResult,
    spellRacesResult,
    classFeaturesResult,
    subclassFeaturesResult,
    featsResult,
  ];

  const failed = results.find((result) => result.error);
  if (failed?.error) throw failed.error;

  const rows = {
    classes: classesResult.data ?? [],
    races: racesResult.data ?? [],
    subclasses: subclassesResult.data ?? [],
    backgrounds: backgroundsResult.data ?? [],
    spells: spellsResult.data ?? [],
    features: featuresResult.data ?? [],
    items: itemsResult.data ?? [],
    optionalFeatures: optionalFeaturesResult.data ?? [],
    spellClasses: spellClassesResult.data ?? [],
    spellSubclasses: spellSubclassesResult.data ?? [],
    spellRaces: spellRacesResult.data ?? [],
    classFeatures: classFeaturesResult.data ?? [],
    subclassFeatures: subclassFeaturesResult.data ?? [],
    feats: featsResult.data ?? [],
  };

  if (
    rows.classes.length === 0 ||
    rows.races.length === 0 ||
    rows.subclasses.length === 0 ||
    rows.backgrounds.length === 0 ||
    rows.spells.length === 0 ||
    rows.features.length === 0 ||
    rows.items.length === 0
  ) {
    throw new Error("The Supabase content library is empty. Run supabase/002_seed_and_permissions.sql first.");
  }

  return makeMaps(
    rows.classes,
    rows.races,
    rows.subclasses,
    rows.backgrounds,
    rows.spells,
    rows.spellClasses,
    rows.spellSubclasses,
    rows.spellRaces,
    rows.features,
    rows.items,
    rows.optionalFeatures,
    rows.classFeatures,
    rows.subclassFeatures,
    rows.feats,
  );
}

function appIdToDbId(map: Map<string, string>, appId: string) {
  return map.get(appId) ?? null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function relationName(value: unknown) {
  if (!value || typeof value !== "object" || !("name" in value)) return "";
  const name = (value as { name?: unknown }).name;
  return typeof name === "string" ? name : "";
}

function toCharacter(
  row: any,
  spellRows: any[],
  featureRows: any[],
  itemRows: any[],
  optionalFeatureRows: any[],
  overrideRows: any[],
  maps: ContentMaps,
): Character {
  const spellsForCharacter = spellRows
    .filter((entry) => entry.character_id === row.id)
    .flatMap((entry) => {
      const appId = maps.spellByDbId.get(entry.spell_id);
      return appId ? [{ spellId: appId, prepared: Boolean(entry.prepared) }] : [];
    });

  const featuresForCharacter = featureRows
    .filter((entry) => entry.character_id === row.id)
    .flatMap((entry) => {
      const appId = maps.featureByDbId.get(entry.feature_id);
      return appId ? [appId] : [];
    });

  const inventoryForCharacter = itemRows
    .filter((entry) => entry.character_id === row.id)
    .flatMap((entry) => {
      const appId = maps.itemByDbId.get(entry.item_id);
      return appId ? [{
        itemId: appId,
        quantity: Number(entry.quantity) || 1,
        equipped: Boolean(entry.equipped),
      }] : [];
    });

  const optionalFeaturesForCharacter = optionalFeatureRows
    .filter((entry) => entry.character_id === row.id)
    .flatMap((entry) => {
      const key = maps.optionalFeatureByDbId.get(entry.optional_feature_id);
      return key ? [key] : [];
    });

  const overrides = overrideRows
    .filter((entry) => entry.character_id === row.id)
    .flatMap((entry) => {
      const appId =
        entry.content_type === "spell" ? maps.spellByDbId.get(entry.content_id) :
        entry.content_type === "feature" ? maps.featureByDbId.get(entry.content_id) :
        entry.content_type === "item" ? maps.itemByDbId.get(entry.content_id) :
        undefined;
      return appId ? [{ type: entry.content_type as ContentType, contentId: appId, reason: entry.reason ?? undefined }] : [];
    });

  return normalizeCharacter({
    id: row.id,
    name: row.name,
    race: relationName(row.race),
    className: relationName(row.class),
    subclass: maps.subclassByDbId.get(row.subclass_id) ?? relationName(row.subclass),
    background: relationName(row.background),
    level: row.level,
    alignment: row.alignment ?? "",
    playerName: row.player_name ?? "",
    hp: row.current_hp ?? 0,
    maxHp: row.max_hp ?? 0,
    tempHp: row.temporary_hp ?? 0,
    ac: row.armor_class ?? 10,
    speed: row.speed ?? 30,
    hitDice: row.hit_dice ?? "",
    proficiencyBonus: row.proficiency_bonus ?? 2,
    abilities: {
      str: row.strength ?? 10,
      dex: row.dexterity ?? 10,
      con: row.constitution ?? 10,
      int: row.intelligence ?? 10,
      wis: row.wisdom ?? 10,
      cha: row.charisma ?? 10,
    },
    savingThrows: Array.isArray(row.saving_throws) ? row.saving_throws : [],
    skills: Array.isArray(row.skills) ? row.skills : [],
    languages: Array.isArray(row.languages) ? row.languages : [],
    feats: Array.isArray(row.feats) ? row.feats : [],
    optionalFeatures: optionalFeaturesForCharacter,
    features: featuresForCharacter,
    spells: spellsForCharacter,
    inventory: inventoryForCharacter,
    accessOverrides: overrides,
    notes: row.notes ?? "",
  });
}

export function CharacterProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [accessMode, setAccessModeState] = useState<AccessMode>("player");
  const [hydrated, setHydrated] = useState(false);
  const [databaseStatus, setDatabaseStatus] = useState<DatabaseStatus>("loading");
  const [catalogue, setCatalogue] = useState<Catalogue>({ classes: [], races: [], subclasses: [], backgrounds: [] });
  const [spellCatalogue, setSpellCatalogue] = useState<Spell[]>([]);
  const [featureCatalogue, setFeatureCatalogue] = useState<Feature[]>([]);
  const [featCatalogue, setFeatCatalogue] = useState<Feat[]>([]);

  useEffect(() => {
    if (!user || !supabase) {
      setCharacters([]);
      setCatalogue({ classes: [], races: [], subclasses: [], backgrounds: [] });      setSpellCatalogue([]);
      setFeatureCatalogue([]);
      setFeatCatalogue([]);      setHydrated(true);
      setDatabaseStatus(supabase ? "local-only" : "error");
      return;
    }

    let cancelled = false;

    async function load() {
      setHydrated(false);
      setDatabaseStatus("loading");
      try {
        const maps = await loadContentMaps();
        setCatalogue(maps.catalogue);
        setSpellCatalogue(maps.spellCatalogue);        setFeatureCatalogue(maps.featureCatalogue);
        setFeatCatalogue(maps.featCatalogue);

        const profileResult = await supabase!
          .from("profiles")
          .select("access_mode")
          .eq("id", user!.id)
          .maybeSingle();

        if (profileResult.error) throw profileResult.error;

        if (profileResult.data?.access_mode === "dm" || profileResult.data?.access_mode === "player") {
          setAccessModeState(profileResult.data.access_mode);
        }

        const characterResult = await supabase!
          .from("characters")
          .select(`
            id,name,race_id,class_id,subclass_id,background_id,level,alignment,player_name,
            current_hp,max_hp,temporary_hp,armor_class,speed,hit_dice,proficiency_bonus,
            strength,dexterity,constitution,intelligence,wisdom,charisma,
            saving_throws,skills,languages,notes,
            race:races(name),class:classes(name),subclass:subclasses(name),background:backgrounds(name)
          `)
          .eq("user_id", user!.id)
          .order("created_at", { ascending: true });

        if (characterResult.error) throw characterResult.error;

        const ids = (characterResult.data ?? []).map((row: any) => row.id);

        const [spellResult, featureResult, itemResult, optionalFeatureResult, overrideResult] = await Promise.all([
          ids.length
            ? supabase!.from("character_spells").select("character_id,spell_id,prepared").in("character_id", ids)
            : Promise.resolve({ data: [], error: null }),
          ids.length
            ? supabase!.from("character_features").select("character_id,feature_id").in("character_id", ids)
            : Promise.resolve({ data: [], error: null }),
          ids.length
            ? supabase!.from("character_items").select("character_id,item_id,quantity,equipped").in("character_id", ids)
            : Promise.resolve({ data: [], error: null }),
          ids.length
            ? supabase!.from("character_optional_features").select("character_id,optional_feature_id").in("character_id", ids)
            : Promise.resolve({ data: [], error: null }),
          ids.length
            ? supabase!.from("character_overrides").select("character_id,content_type,content_id,reason").in("character_id", ids)
            : Promise.resolve({ data: [], error: null }),
        ]);

        for (const result of [spellResult, featureResult, itemResult, optionalFeatureResult, overrideResult]) {
          if (result.error) throw result.error;
        }

        if (cancelled) return;

        let nextCharacters = (characterResult.data ?? []).map((row: any) =>
          toCharacter(
            row,
            spellResult.data ?? [],
            featureResult.data ?? [],
            itemResult.data ?? [],
            optionalFeatureResult.data ?? [],
            overrideResult.data ?? [],
            maps,
          ),
        );

        setCharacters(nextCharacters);
        setDatabaseStatus("connected");
      } catch (error) {
        console.error("Supabase load failed:", error);
        setDatabaseStatus("error");

        try {
          const saved = window.localStorage.getItem(STORAGE_KEY);
          if (saved) {
            const parsed = JSON.parse(saved) as Character[];
            if (Array.isArray(parsed) && parsed.length) setCharacters(parsed.map(normalizeCharacter));
            else setCharacters([]);
          } else {
            setCharacters([]);
          }
        } catch {
          setCharacters([]);
        }
      } finally {
        if (!cancelled) setHydrated(true);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!hydrated || !user) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(characters));
  }, [characters, hydrated, user]);

  useEffect(() => {
    if (!hydrated || !user) return;
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ accessMode }));
  }, [accessMode, hydrated, user]);

  async function getMapsForWrite() {
    return loadContentMaps();
  }

  const value = useMemo<CharacterContextValue>(() => ({
    characters,
    hydrated,
    accessMode,
    databaseStatus,
    catalogue,
    spellCatalogue,
    featureCatalogue,
    featCatalogue,

    setAccessMode: (mode) => {
      setAccessModeState(mode);
      if (supabase && user) {
        void supabase.from("profiles").upsert({
          id: user.id,
          access_mode: mode,
        });
      }
    },

    createCharacter: async (input) => {
      const baseId = crypto.randomUUID();
      const level = Math.max(1, Math.min(20, Number(input.level) || 1));
      const maxHp = getExpectedMaxHp(input.className, level, input.abilities.con);
      const baseCharacter: Character = {
        id: baseId,
        ...input,
        level,
        hp: Math.max(0, Math.min(maxHp, input.hp || maxHp)),
        maxHp,
        hitDice: getExpectedHitDice(input.className, level),
        proficiencyBonus: getProficiencyBonus(level),
        tempHp: 0,
        savingThrows: [],
        skills: [],
        languages: [],
        feats: input.feats ?? [],
        optionalFeatures: [],
        features: [],
        spells: [],
        inventory: [],
        accessOverrides: [],
        notes: input.notes,
      };

      const starterFeatures = featureCatalogue.filter((feature) =>
        feature.requiredLevel <= baseCharacter.level &&
        feature.className === baseCharacter.className &&
        (!feature.subclassName || feature.subclassName === baseCharacter.subclass)
      ).map((feature) => feature.id);
      const character: Character = { ...baseCharacter, features: starterFeatures };

      setCharacters((current) => [...current, character]);

      if (supabase && user) {
        try {
          const maps = await getMapsForWrite();
          await insertCharacterToDb(user.id, character, maps);
          for (const featureId of starterFeatures) {
            const featureDbId = appIdToDbId(maps.featureByAppId, featureId);
            if (featureDbId) {
              await supabase.from("character_features").upsert({
                character_id: character.id,
                feature_id: featureDbId,
                source: "class/subclass/race/background",
              }, { onConflict: "character_id,feature_id" });
            }
          }
          setDatabaseStatus("connected");
        } catch (error) {
          console.error("Could not save new character:", error);
          setDatabaseStatus("error");
        }      }

      return character.id;
    },
    updateCharacter: async (id, patch) => {
      const currentCharacter = characters.find((entry) => entry.id === id);
      const progressionChanged =
        patch.level !== undefined ||
        patch.className !== undefined ||
        patch.abilities?.con !== undefined;

      const localPatch: Partial<Character> = { ...patch };

      if (currentCharacter && progressionChanged) {
        const nextClassName = patch.className ?? currentCharacter.className;
        const nextLevel = Math.max(1, Math.min(20, patch.level ?? currentCharacter.level));
        const nextConstitution = patch.abilities?.con ?? currentCharacter.abilities.con;
        const nextMaxHp = getExpectedMaxHp(nextClassName, nextLevel, nextConstitution);
        const hpDelta = nextMaxHp - currentCharacter.maxHp;

        localPatch.level = nextLevel;
        localPatch.maxHp = nextMaxHp;
        localPatch.hp = Math.max(0, Math.min(nextMaxHp, currentCharacter.hp + hpDelta));
        localPatch.hitDice = getExpectedHitDice(nextClassName, nextLevel);
        localPatch.proficiencyBonus = getProficiencyBonus(nextLevel);
      }

      setCharacters((current) =>
        current.map((character) =>
          character.id === id ? { ...character, ...localPatch } : character,
        ),
      );

      if (!supabase || !user || !isUuid(id)) return;

      try {
        const maps = await getMapsForWrite();
        const dbPatch: Record<string, unknown> = {};

        if (patch.name !== undefined) dbPatch.name = patch.name;
        if (progressionChanged && currentCharacter) {
          const nextClassName = patch.className ?? currentCharacter.className;
          const nextLevel = Math.max(1, Math.min(20, patch.level ?? currentCharacter.level));
          const nextConstitution = patch.abilities?.con ?? currentCharacter.abilities.con;
          const nextMaxHp = getExpectedMaxHp(nextClassName, nextLevel, nextConstitution);
          const hpDelta = nextMaxHp - currentCharacter.maxHp;

          dbPatch.level = nextLevel;
          dbPatch.max_hp = nextMaxHp;
          dbPatch.current_hp = Math.max(
            0,
            Math.min(nextMaxHp, currentCharacter.hp + hpDelta),
          );
          dbPatch.hit_dice = getExpectedHitDice(nextClassName, nextLevel);
          dbPatch.proficiency_bonus = getProficiencyBonus(nextLevel);
        }

        if (patch.alignment !== undefined) dbPatch.alignment = patch.alignment;
        if (patch.playerName !== undefined) dbPatch.player_name = patch.playerName;
        if (patch.hp !== undefined && !progressionChanged) dbPatch.current_hp = patch.hp;
        if (patch.maxHp !== undefined && !progressionChanged) dbPatch.max_hp = patch.maxHp;
        if (patch.tempHp !== undefined) dbPatch.temporary_hp = patch.tempHp;
        if (patch.ac !== undefined) dbPatch.armor_class = patch.ac;
        if (patch.speed !== undefined) dbPatch.speed = patch.speed;
        if (patch.hitDice !== undefined && !progressionChanged) dbPatch.hit_dice = patch.hitDice;
        if (patch.proficiencyBonus !== undefined && !progressionChanged) dbPatch.proficiency_bonus = patch.proficiencyBonus;
        if (patch.notes !== undefined) dbPatch.notes = patch.notes;
        if (patch.feats !== undefined) dbPatch.feats = patch.feats;
        if (patch.race !== undefined) dbPatch.race_id = maps.raceByName.get(patch.race) ?? null;
        if (patch.className !== undefined) dbPatch.class_id = maps.classByName.get(patch.className) ?? null;
        if (patch.subclass !== undefined) dbPatch.subclass_id = maps.subclassByName.get(patch.subclass) ?? null;
        if (patch.background !== undefined) dbPatch.background_id = maps.backgroundByName.get(patch.background) ?? null;

        if (patch.abilities) {
          dbPatch.strength = patch.abilities.str;
          dbPatch.dexterity = patch.abilities.dex;
          dbPatch.constitution = patch.abilities.con;
          dbPatch.intelligence = patch.abilities.int;
          dbPatch.wisdom = patch.abilities.wis;
          dbPatch.charisma = patch.abilities.cha;
        }

        if (patch.savingThrows !== undefined) dbPatch.saving_throws = patch.savingThrows;
        if (patch.skills !== undefined) dbPatch.skills = patch.skills;
        if (patch.languages !== undefined) dbPatch.languages = patch.languages;

        if (Object.keys(dbPatch).length) {
          const result = await supabase
            .from("characters")
            .update(dbPatch)
            .eq("id", id)
            .eq("user_id", user.id);

          if (result.error) throw result.error;
        }

        if (patch.features !== undefined) {
          const dbFeatureIds = Array.from(
            new Set(
              patch.features
                .map((featureId) => maps.featureByDbId.get(featureId) ?? maps.featureByAppId.get(featureId))
                .filter(Boolean),
            ),
          ) as string[];

          const deleteResult = await supabase
            .from("character_features")
            .delete()
            .eq("character_id", id);
          if (deleteResult.error) throw deleteResult.error;

          if (dbFeatureIds.length) {
            const insertResult = await supabase
              .from("character_features")
              .insert(
                dbFeatureIds.map((featureId) => ({
                  character_id: id,
                  feature_id: featureId,
                  dm_granted: false,
                  source: "Normal",
                })),
              );

            if (insertResult.error) throw insertResult.error;
          }
        }
      } catch (error) {
        console.error("Could not update character:", error);
        setDatabaseStatus("error");
      }
    },


    deleteCharacter: async (id) => {
      setCharacters((current) => current.filter((character) => character.id !== id));
      if (!supabase || !user || !isUuid(id)) return;

      try {
        const result = await supabase
          .from("characters")
          .delete()
          .eq("id", id)
          .eq("user_id", user.id);
        if (result.error) throw result.error;
      } catch (error) {
        console.error("Could not delete character:", error);
        setDatabaseStatus("error");
      }
    },

    addInventoryItem: async (characterId, itemId, quantity = 1, override = false) => {
      const character = characters.find((entry) => entry.id === characterId);
      const foundItem = items.find((entry) => entry.id === itemId);
      const allowed = character && foundItem ? isItemNormallyAvailable(character, foundItem) : false;

      if (!character || (!allowed && !(accessMode === "dm" && override))) return false;

      setCharacters((current) => current.map((entry) => {
        if (entry.id !== characterId) return entry;
        const existing = entry.inventory.find((item) => item.itemId === itemId);
        const inventory = existing
          ? entry.inventory.map((item) => item.itemId === itemId ? { ...item, quantity: item.quantity + Math.max(1, quantity) } : item)
          : [...entry.inventory, { itemId, quantity: Math.max(1, quantity), equipped: false }];
        const accessOverrides = !allowed && override && accessMode === "dm" && !hasOverride(entry, "item", itemId)
          ? [...entry.accessOverrides, { type: "item" as const, contentId: itemId, reason: "Granted by DM" }]
          : entry.accessOverrides;
        return { ...entry, inventory, accessOverrides };
      }));

      if (supabase && user && isUuid(characterId)) {
        try {
          const maps = await getMapsForWrite();
          const dbItemId = appIdToDbId(maps.itemByAppId, itemId);
          if (!dbItemId) throw new Error(`Item "${itemId}" is missing from the database catalogue.`);

          const existingResult = await supabase
            .from("character_items")
            .select("id,quantity")
            .eq("character_id", characterId)
            .eq("item_id", dbItemId)
            .maybeSingle();

          if (existingResult.error) throw existingResult.error;

          if (existingResult.data) {
            const result = await supabase
              .from("character_items")
              .update({ quantity: existingResult.data.quantity + Math.max(1, quantity) })
              .eq("id", existingResult.data.id);
            if (result.error) throw result.error;
          } else {
            const result = await supabase.from("character_items").insert({
              character_id: characterId,
              item_id: dbItemId,
              quantity: Math.max(1, quantity),
              equipped: false,
              dm_granted: !allowed && override,
            });
            if (result.error) throw result.error;
          }

          if (!allowed && override && accessMode === "dm") {
            await upsertOverride(characterId, "item", dbItemId, "Granted by DM");          }
        } catch (error) {
          console.error("Could not save inventory item:", error);
          setDatabaseStatus("error");
        }
      }

      return true;
    },

    removeInventoryItem: async (characterId, itemId) => {
      setCharacters((current) => current.map((character) =>
        character.id === characterId
          ? { ...character, inventory: character.inventory.filter((entry) => entry.itemId !== itemId) }
          : character,      ));

      if (supabase && user && isUuid(characterId)) {
        try {
          const maps = await getMapsForWrite();
          const dbItemId = appIdToDbId(maps.itemByAppId, itemId);
          if (dbItemId) {
            const result = await supabase.from("character_items").delete().eq("character_id", characterId).eq("item_id", dbItemId);
            if (result.error) throw result.error;
          }
        } catch (error) {
          console.error("Could not remove inventory item:", error);
          setDatabaseStatus("error");
        }
      }
    },

    changeInventoryQuantity: async (characterId, itemId, delta) => {
      const character = characters.find((entry) => entry.id === characterId);
      const existing = character?.inventory.find((entry) => entry.itemId === itemId);
      if (!character || !existing) return;

      const nextQuantity = existing.quantity + delta;
      setCharacters((current) => current.map((entry) => {
        if (entry.id !== characterId) return entry;
        const inventory = entry.inventory
          .map((item) => item.itemId === itemId ? { ...item, quantity: nextQuantity } : item)
          .filter((item) => item.quantity > 0);
        return { ...entry, inventory };
      }));

      if (supabase && user && isUuid(characterId)) {
        try {          const maps = await getMapsForWrite();
          const dbItemId = appIdToDbId(maps.itemByAppId, itemId);          if (!dbItemId) return;

          if (nextQuantity <= 0) {
            const result = await supabase.from("character_items").delete().eq("character_id", characterId).eq("item_id", dbItemId);
            if (result.error) throw result.error;
          } else {
            const result = await supabase.from("character_items").update({ quantity: nextQuantity }).eq("character_id", characterId).eq("item_id", dbItemId);
            if (result.error) throw result.error;
          }
        } catch (error) {
          console.error("Could not change inventory quantity:", error);
          setDatabaseStatus("error");
        }
      }
    },

    toggleInventoryEquipped: async (characterId, itemId) => {
      const character = characters.find((entry) => entry.id === characterId);
      const existing = character?.inventory.find((entry) => entry.itemId === itemId);
      if (!existing) return;

      const nextEquipped = !existing.equipped;
      setCharacters((current) => current.map((entry) =>
        entry.id === characterId
          ? { ...entry, inventory: entry.inventory.map((item) => item.itemId === itemId ? { ...item, equipped: nextEquipped } : item) }
          : entry,
      ));

      if (supabase && user && isUuid(characterId)) {
        try {
          const maps = await getMapsForWrite();
          const dbItemId = appIdToDbId(maps.itemByAppId, itemId);
          if (!dbItemId) return;
          const result = await supabase.from("character_items").update({ equipped: nextEquipped }).eq("character_id", characterId).eq("item_id", dbItemId);
          if (result.error) throw result.error;
        } catch (error) {
          console.error("Could not update equipped state:", error);
          setDatabaseStatus("error");
        }
      }
    },

    addSpell: async (characterId, spellId, prepared = false, override = false) => {
      const character = characters.find((entry) => entry.id === characterId);
      const foundSpell = spellCatalogue.find((entry) => entry.id === spellId) ?? spells.find((entry) => entry.id === spellId);
      const spellAllowed = character && foundSpell ? isSpellNormallyAvailable(character, foundSpell) : false;
      if (!character || !foundSpell || (!spellAllowed && !(accessMode === "dm" && override))) return false;

      if (spellAllowed && !override) {
        const levelForEntry = (entry: SpellEntry) =>
          spellCatalogue.find((spell) => spell.id === entry.spellId)?.level
          ?? spells.find((spell) => spell.id === entry.spellId)?.level
          ?? 1;
        const currentCantrips = character.spells.filter((entry) => levelForEntry(entry) === 0).length;
        const currentKnown = character.spells.filter((entry) => levelForEntry(entry) > 0).length;
        const cantripLimit = getCantripsKnown(character.className, character.level);
        const knownLimit = getSpellsKnown(character.className, character.level);

        if (foundSpell.level === 0 && cantripLimit > 0 && currentCantrips >= cantripLimit) return false;
        if (foundSpell.level > 0 && knownLimit !== null && currentKnown >= knownLimit) return false;
      }

      if (prepared && foundSpell.level > 0 && getSpellcastingMode(character) === "prepared") {
        const preparedLimit = getPreparedSpellCount(character);
        const preparedCount = character.spells.filter((entry) => entry.prepared).length;
        if (preparedLimit !== null && preparedCount >= preparedLimit) return false;
      }

      if (!character.spells.some((spell) => spell.spellId === spellId)) {
        setCharacters((current) => current.map((entry) => {
          if (entry.id !== characterId) return entry;
          const accessOverrides = !spellAllowed && override && accessMode === "dm" && !hasOverride(entry, "spell", spellId)
            ? [...entry.accessOverrides, { type: "spell" as const, contentId: spellId, reason: "Granted by DM" }]
            : entry.accessOverrides;
          return { ...entry, spells: [...entry.spells, { spellId, prepared }], accessOverrides };
        }));
      }

      if (supabase && user && isUuid(characterId)) {
        try {
          const maps = await getMapsForWrite();
          const dbSpellId = maps.spellByDbId.get(spellId) ?? appIdToDbId(maps.spellByAppId, spellId);
          if (!dbSpellId) throw new Error(`Spell "${spellId}" is missing from the database catalogue.`);

          const result = await supabase.from("character_spells").upsert({
            character_id: characterId,
            spell_id: dbSpellId,
            prepared,
            dm_granted: !spellAllowed && override,
            source: !spellAllowed && override ? "DM Grant" : "Normal",
          }, { onConflict: "character_id,spell_id" });

          if (result.error) throw result.error;

          if (!spellAllowed && override) {
            await upsertOverride(characterId, "spell", dbSpellId, "Granted by DM");
          }
        } catch (error) {
          console.error("Could not save spell:", error);
          setDatabaseStatus("error");
        }
      }

      return true;
    },

    removeSpell: async (characterId, spellId) => {
      setCharacters((current) => current.map((character) =>
        character.id === characterId
          ? { ...character, spells: character.spells.filter((entry) => entry.spellId !== spellId) }
          : character,
      ));

      if (supabase && user && isUuid(characterId)) {
        try {
          const maps = await getMapsForWrite();
          const dbSpellId = maps.spellByDbId.get(spellId) ?? appIdToDbId(maps.spellByAppId, spellId);
          if (dbSpellId) {
            const result = await supabase.from("character_spells").delete().eq("character_id", characterId).eq("spell_id", dbSpellId);
            if (result.error) throw result.error;
          }
        } catch (error) {
          console.error("Could not remove spell:", error);
          setDatabaseStatus("error");
        }
      }
    },

    toggleSpellPrepared: async (characterId, spellId) => {
      const character = characters.find((entry) => entry.id === characterId);
      if (!character) return;
      const current = character.spells.find((entry) => entry.spellId === spellId);
      if (!current) return;

      const nextPrepared = !current.prepared;
      if (nextPrepared) {
        const preparedLimit = getPreparedSpellCount(character);
        if (preparedLimit !== null && character.spells.filter((entry) => entry.prepared).length >= preparedLimit) return;
      }
      setCharacters((all) => all.map((entry) =>
        entry.id === characterId
          ? { ...entry, spells: entry.spells.map((spell) => spell.spellId === spellId ? { ...spell, prepared: nextPrepared } : spell) }
          : entry,
      ));

      if (supabase && user && isUuid(characterId)) {
        try {
          const maps = await getMapsForWrite();
          const dbSpellId = maps.spellByDbId.get(spellId) ?? appIdToDbId(maps.spellByAppId, spellId);
          if (!dbSpellId) return;
          const result = await supabase.from("character_spells").update({ prepared: nextPrepared }).eq("character_id", characterId).eq("spell_id", dbSpellId);
          if (result.error) throw result.error;
        } catch (error) {          console.error("Could not update prepared state:", error);
          setDatabaseStatus("error");
        }
      }
    },

    addFeature: async (characterId, featureId, override = false) => {
      const character = characters.find((entry) => entry.id === characterId);
      const foundFeature = featureCatalogue.find((entry) => entry.id === featureId) ?? features.find((entry) => entry.id === featureId);
      const featureAllowed = character && foundFeature ? isFeatureNormallyAvailable(character, foundFeature) : false;
      if (!character || (!featureAllowed && !(accessMode === "dm" && override))) return false;

      if (!character.features.includes(featureId)) {
        setCharacters((current) => current.map((entry) => {          if (entry.id !== characterId) return entry;
          const accessOverrides = !featureAllowed && override && accessMode === "dm" && !hasOverride(entry, "feature", featureId)
            ? [...entry.accessOverrides, { type: "feature" as const, contentId: featureId, reason: "Granted by DM" }]
            : entry.accessOverrides;
          return { ...entry, features: [...entry.features, featureId], accessOverrides };
        }));
      }

      if (supabase && user && isUuid(characterId)) {
        try {
          const maps = await getMapsForWrite();
          const dbFeatureId = maps.featureByDbId.get(featureId) ?? appIdToDbId(maps.featureByAppId, featureId);
          if (!dbFeatureId) throw new Error(`Feature "${featureId}" is missing from the database catalogue.`);

          const result = await supabase.from("character_features").upsert({
            character_id: characterId,
            feature_id: dbFeatureId,
            dm_granted: !featureAllowed && override,
            source: !featureAllowed && override ? "DM Grant" : "Normal",
          }, { onConflict: "character_id,feature_id" });

          if (result.error) throw result.error;

          if (!featureAllowed && override) {
            await upsertOverride(characterId, "feature", dbFeatureId, "Granted by DM");
          }
        } catch (error) {
          console.error("Could not save feature:", error);
          setDatabaseStatus("error");
        }
      }
      return true;    },

    addOptionalFeature: async (characterId, optionalFeatureKey, override = false) => {
      const character = characters.find((entry) => entry.id === characterId);
      if (!character) return false;

      if (!character.optionalFeatures.includes(optionalFeatureKey)) {
        setCharacters((current) => current.map((entry) =>
          entry.id === characterId
            ? { ...entry, optionalFeatures: [...entry.optionalFeatures, optionalFeatureKey] }
            : entry,
        ));
      }

      if (supabase && user && isUuid(characterId)) {
        try {
          const maps = await getMapsForWrite();
          const dbOptionalFeatureId = maps.optionalFeatureByKey.get(optionalFeatureKey);
          if (!dbOptionalFeatureId) {
            throw new Error(`Optional feature "${optionalFeatureKey}" is missing from the database catalogue.`);
          }

          const result = await supabase.from("character_optional_features").upsert({
            character_id: characterId,
            optional_feature_id: dbOptionalFeatureId,
            dm_granted: accessMode === "dm" && override,
            source: accessMode === "dm" && override ? "DM Grant" : "Normal",
          }, { onConflict: "character_id,optional_feature_id" });

          if (result.error) throw result.error;
        } catch (error) {
          console.error("Could not save optional feature:", error);
          setDatabaseStatus("error");
        }
      }

      return true;
    },

    removeOptionalFeature: async (characterId, optionalFeatureKey) => {
      setCharacters((current) => current.map((character) =>
        character.id === characterId
          ? { ...character, optionalFeatures: character.optionalFeatures.filter((key) => key !== optionalFeatureKey) }
          : character,
      ));

      if (supabase && user && isUuid(characterId)) {
        try {
          const maps = await getMapsForWrite();
          const dbOptionalFeatureId = maps.optionalFeatureByKey.get(optionalFeatureKey);
          if (dbOptionalFeatureId) {
            const result = await supabase
              .from("character_optional_features")
              .delete()
              .eq("character_id", characterId)
              .eq("optional_feature_id", dbOptionalFeatureId);
            if (result.error) throw result.error;
          }
        } catch (error) {
          console.error("Could not remove optional feature:", error);
          setDatabaseStatus("error");
        }
      }
    },

    removeFeature: async (characterId, featureId) => {
      setCharacters((current) => current.map((character) =>
        character.id === characterId
          ? { ...character, features: character.features.filter((id) => id !== featureId) }
          : character,
      ));

      if (supabase && user && isUuid(characterId)) {
        try {
          const maps = await getMapsForWrite();
          const dbFeatureId = appIdToDbId(maps.featureByAppId, featureId);
          if (dbFeatureId) {
            const result = await supabase.from("character_features").delete().eq("character_id", characterId).eq("feature_id", dbFeatureId);
            if (result.error) throw result.error;
          }
        } catch (error) {
          console.error("Could not remove feature:", error);
          setDatabaseStatus("error");
        }
      }
    },

    revokeOverride: async (characterId, type, contentId) => {
      setCharacters((current) => current.map((character) =>
        character.id === characterId
          ? { ...character, accessOverrides: character.accessOverrides.filter((entry) => !(entry.type === type && entry.contentId === contentId)) }
          : character,
      ));

      if (supabase && user && isUuid(characterId)) {
        try {
          const maps = await getMapsForWrite();
          const dbContentId =
            type === "spell" ? (maps.spellByDbId.get(contentId) ?? maps.spellByAppId.get(contentId)) :
            type === "feature" ? maps.featureByAppId.get(contentId) :
            type === "item" ? maps.itemByAppId.get(contentId) :
            undefined;

          if (dbContentId) {
            const result = await supabase.from("character_overrides").delete()
              .eq("character_id", characterId)
              .eq("content_type", type)
              .eq("content_id", dbContentId);
            if (result.error) throw result.error;
          }
        } catch (error) {
          console.error("Could not revoke override:", error);
          setDatabaseStatus("error");
        }
      }
    },

    resetDemoData: async () => {
      if (supabase && user) {
        try {
          const result = await supabase.from("characters").delete().eq("user_id", user.id);
          if (result.error) throw result.error;
          const maps = await getMapsForWrite();
          const migrated = await insertCharacterToDb(user.id, defaultCharacter, maps);
          setCharacters([migrated]);
          setDatabaseStatus("connected");
          return;
        } catch (error) {
          console.error("Could not reset database data:", error);
          setDatabaseStatus("error");
        }
      }

      setCharacters([defaultCharacter]);
    },
  }), [characters, hydrated, accessMode, databaseStatus, catalogue, spellCatalogue, featureCatalogue, featCatalogue, user]);

  return <CharacterContext.Provider value={value}>{children}</CharacterContext.Provider>;

  async function upsertOverride(characterId: string, type: ContentType, dbContentId: string, reason: string) {
    if (!supabase) return;
    const result = await supabase.from("character_overrides").upsert({
      character_id: characterId,
      content_type: type,
      content_id: dbContentId,
      reason,
    }, { onConflict: "character_id,content_type,content_id" });
    if (result.error) throw result.error;
  }
}

async function insertCharacterToDb(userId: string, character: Character, maps: ContentMaps): Promise<Character> {
  if (!supabase) return character;

  const row = {
    id: isUuid(character.id) ? character.id : crypto.randomUUID(),    user_id: userId,
    name: character.name,
    race_id: maps.raceByName.get(character.race) ?? null,
    class_id: maps.classByName.get(character.className) ?? null,
    subclass_id: maps.subclassByName.get(character.subclass) ?? null,
    background_id: maps.backgroundByName.get(character.background) ?? null,
    level: character.level,
    alignment: character.alignment,
    player_name: character.playerName,
    current_hp: character.hp,
    max_hp: character.maxHp,
    temporary_hp: character.tempHp,
    armor_class: character.ac,    speed: character.speed,
    hit_dice: character.hitDice,
    proficiency_bonus: character.proficiencyBonus,
    strength: character.abilities.str,
    dexterity: character.abilities.dex,
    constitution: character.abilities.con,
    intelligence: character.abilities.int,
    wisdom: character.abilities.wis,
    charisma: character.abilities.cha,
    saving_throws: character.savingThrows,
    skills: character.skills,
    languages: character.languages,
    notes: character.notes,
    feats: character.feats,
  };

  const result = await supabase.from("characters").insert(row).select("id").single();
  if (result.error) throw result.error;

  const dbId = result.data.id as string;

  const spellRows = character.spells.flatMap((entry) => {
    const spellId = maps.spellByDbId.get(entry.spellId) ?? maps.spellByAppId.get(entry.spellId);
    return spellId ? [{
      character_id: dbId,
      spell_id: spellId,
      prepared: entry.prepared,
      source: "Migrated",
    }] : [];
  });

  const featureRows = character.features.flatMap((featureId) => {    const featureIdDb = maps.featureByAppId.get(featureId);    return featureIdDb ? [{
      character_id: dbId,
      feature_id: featureIdDb,
      source: "Migrated",
    }] : [];
  });

  const optionalFeatureRows = character.optionalFeatures.flatMap((optionalFeatureKey) => {
    const optionalFeatureId = maps.optionalFeatureByKey.get(optionalFeatureKey);
    return optionalFeatureId ? [{
      character_id: dbId,
      optional_feature_id: optionalFeatureId,
      dm_granted: false,
      source: "Migrated",
    }] : [];
  });

  const itemRows = character.inventory.flatMap((entry) => {
    const itemId = maps.itemByAppId.get(entry.itemId);
    return itemId ? [{
      character_id: dbId,
      item_id: itemId,
      quantity: entry.quantity,
      equipped: entry.equipped,
      dm_granted: false,
    }] : [];
  });

  if (spellRows.length) {
    const insert = await supabase.from("character_spells").insert(spellRows);
    if (insert.error) throw insert.error;
  }

  if (featureRows.length) {
    const insert = await supabase.from("character_features").insert(featureRows);
    if (insert.error) throw insert.error;
  }

  if (itemRows.length) {
    const insert = await supabase.from("character_items").insert(itemRows);
    if (insert.error) throw insert.error;
  }

  if (optionalFeatureRows.length) {
    const insert = await supabase.from("character_optional_features").insert(optionalFeatureRows);
    if (insert.error) throw insert.error;
  }

  for (const override of character.accessOverrides) {
    const contentId =
      override.type === "spell" ? maps.spellByAppId.get(override.contentId) :
      override.type === "feature" ? maps.featureByAppId.get(override.contentId) :
      override.type === "item" ? maps.itemByAppId.get(override.contentId) :
      undefined;

    if (contentId) {
      const insert = await supabase.from("character_overrides").insert({
        character_id: dbId,
        content_type: override.type,
        content_id: contentId,
        reason: override.reason ?? "Migrated",
      });
      if (insert.error) throw insert.error;
    }
  }

  return { ...character, id: dbId };
}

export function useCharacters() {
  const context = useContext(CharacterContext);
  if (!context) throw new Error("useCharacters must be used inside CharacterProvider");
  return context;
}

export function getCharacterContentCounts(character: Character) {
  return {
    availableSpells: getAvailableSpells(character).length,
    availableFeatures: getAvailableFeatures(character).length,
    availableItems: getAvailableItems(character).length,
  };
}