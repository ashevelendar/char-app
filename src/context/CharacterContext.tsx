    description?: string | null;
    source?: string | null;
    source_code?: string | null;
    raw_data?: unknown;
  }>,
  backgroundRows: Array<{ id: string; name: string; description?: string | null; source?: string | null; source_code?: string | null; raw_data?: unknown }>,
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
  featureRows: Array<{ id: string; name: string; description?: string | null; source?: string | null; source_code?: string | null; source_type?: string | null; required_level?: number | null; raw_data?: unknown }>,
  itemRows: Array<{ id: string; name: string; category?: string | null; rarity?: string | null; description?: string | null; weight?: string | null; value?: string | null; requires_attunement?: boolean | null; minimum_level?: number | null; raw_data?: unknown }>,
  classFeatureRows: Array<{ class_id: string; feature_id: string; required_level?: number | null }>,
  subclassFeatureRows: Array<{ subclass_id: string; feature_id: string; required_level?: number | null }>,
  raceFeatureRows: Array<{ race_id: string; feature_id: string }>,
  backgroundFeatureRows: Array<{ background_id: string; feature_id: string }>,
  featRows: Array<{ id: string; name: string; description?: string | null; prerequisite?: unknown; ability?: unknown; source?: string | null; edition?: string | null; content_key?: string | null }>,
  subraceRows: Array<{ id: string; name: string; race_id: string; race_name?: string | null; description?: string | null; source?: string | null; source_code?: string | null; raw_data?: unknown }>,
  optionalFeatureRows: Array<{ id: string; name: string; description?: string | null; feature_types?: unknown; source?: string | null; content_key?: string | null; raw_data?: unknown }>,
): ContentMaps {  const byName = (rows: Array<{ id: string; name: string }>) => new Map(rows.map((row) => [row.name, row.id]));
  const classNameById = new Map(classesRows.map((row: any) => [row.id, row.name]));
  const subclassNameById = new Map(subclassRows.map((row: any) => [row.id, row.name]));
  const raceNameById = new Map(raceRows.map((row: any) => [row.id, row.name]));
  const backgroundNameById = new Map(backgroundRows.map((row: any) => [row.id, row.name]));
  const uniqueNames = (values: string[]) => [...new Set(values.filter(Boolean))];

  function preferredRows<T extends { name: string; source?: string | null; source_code?: string | null }>(rows: T[]) {
    return [...rows].sort((a, b) => {
      const aPriority = (a.source_code ?? a.source ?? "") === "PHB" ? 0 : 1;
      const bPriority = (b.source_code ?? b.source ?? "") === "PHB" ? 0 : 1;
      return aPriority - bPriority || a.name.localeCompare(b.name);
    });
  }

  const raceRules = Object.fromEntries(
    preferredRows(raceRows)
      .filter((row, index, rows) => rows.findIndex((candidate) => candidate.name === row.name) === index)
      .map((row) => [
        row.name,
        {
          abilityBonuses: extractAbilityBonuses(row.raw_data),
          description: row.description ?? "",
          source: row.source ?? row.source_code ?? "",
          naturalArmor: extractNaturalArmor(row.raw_data),
          languages: extractProficiencyRules(row.raw_data, "languageProficiencies"),
          skills: extractProficiencyRules(row.raw_data, "skillProficiencies"),
          tools: extractProficiencyRules(row.raw_data, "toolProficiencies"),
        },
      ]),
  ) as Record<string, RaceRules>;

  const backgroundRules = Object.fromEntries(
    preferredRows(backgroundRows)
      .filter((row, index, rows) => rows.findIndex((candidate) => candidate.name === row.name) === index)
      .map((row) => {
        const raw = row.raw_data && typeof row.raw_data === "object" ? row.raw_data as Record<string, unknown> : {};
        const feature = extractBackgroundFeature(raw);
        const skillRules = extractProficiencyRules(raw, "skillProficiencies");
        const languageRules = extractProficiencyRules(raw, "languageProficiencies");
        const alternateLanguageRules = extractProficiencyRules(raw, "languages");
        const toolRules = extractProficiencyRules(raw, "toolProficiencies");
        const languageText = catalogueText(raw.entries);
        const textLanguageMatch = languageText.match(/\b(two|one|three|four|five|six)\s+of\s+your\s+choice\b/i);
        const textLanguageCount = textLanguageMatch
          ? ({ one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 }[textLanguageMatch[1].toLowerCase()] ?? 0)
          : 0;
        const languageChoices = languageRules.choices.length
          ? languageRules.choices          : alternateLanguageRules.choices.length
            ? alternateLanguageRules.choices
            : textLanguageCount > 0
              ? [{ count: textLanguageCount, options: LANGUAGE_OPTIONS_2014 }]
              : [];
        const storedDescription = row.description?.trim();
        const usableDescription = storedDescription && !/^Built-in background catalogue entry\.?$/i.test(storedDescription)
          ? storedDescription
          : "";
        const lore = usableDescription
          || catalogueText(raw.fluff)
          || catalogueText(raw.entries);
        return [
          row.name,
          {
            description: lore,
            skills: skillRules.fixed,
            skillChoices: skillRules.choices,
            languages: [...new Set([...languageRules.fixed, ...alternateLanguageRules.fixed])],
            languageChoices,
            tools: toolRules.fixed,
            toolChoices: toolRules.choices,
            startingEquipment: extractStartingEquipment(raw),
            featureName: feature.name,
            featureDescription: feature.description,
          },
        ];
      }),
  ) as Record<string, BackgroundRules>;

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

  const raceFeatureById = new Map<string, string>();
  for (const link of raceFeatureRows) {
    const raceName = raceNameById.get(link.race_id);
    if (raceName) raceFeatureById.set(link.feature_id, raceName);
  }
  const backgroundFeatureById = new Map<string, string>();
  for (const link of backgroundFeatureRows) {
    const backgroundName = backgroundNameById.get(link.background_id);
    if (backgroundName) backgroundFeatureById.set(link.feature_id, backgroundName);
  }

  const featureCatalogue: Feature[] = featureRows
    .map((row: any) => {
      const classLink = classFeatureById.get(row.id);
      const subclassLink = subclassFeatureById.get(row.id);
      const raceName = raceFeatureById.get(row.id);
      const backgroundName = backgroundFeatureById.get(row.id);
      const sourceType = subclassLink
        ? "subclass"
        : raceName
          ? "race"
          : backgroundName
            ? "background"
            : classLink
              ? "class"
              : (row.source_type === "race" || row.source_type === "background" || row.source_type === "feat" ? row.source_type : "class");
      return {
        id: row.id,
        name: row.name,
        source: row.source ?? row.source_code ?? "",
        sourceType,
        requiredLevel: subclassLink?.requiredLevel ?? classLink?.requiredLevel ?? (Number(row.required_level) || 1),
        description: cleanDisplayText(row.description ?? ""),
        uses: extractFeatureUses(row.raw_data),
        className: classLink?.className ?? subclassLink?.className,
        subclassName: subclassLink?.subclassName,
        raceName: raceName ?? (sourceType === "race" ? row.source ?? undefined : undefined),
        backgroundName: backgroundName ?? (sourceType === "background" ? row.source ?? undefined : undefined),
      } satisfies Feature;
    })
    .filter((feature) => feature.name)
    .sort((a, b) => a.requiredLevel - b.requiredLevel || a.name.localeCompare(b.name));

  const itemCatalogue: Item[] = itemRows
    .map((row) => ({
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
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const classRules: Record<string, ClassRules> = Object.fromEntries(
    classesRows.map((row) => {
      const raw = row.raw_data && typeof row.raw_data === "object" ? row.raw_data as Record<string, unknown> : {};
      const starting = raw.startingProficiencies;
      const savingThrows = Array.isArray(raw.proficiency)
        ? raw.proficiency
            .map((entry) => abilityKeyFromName(String(entry)))
            .filter((entry): entry is AbilityKey => entry !== null)
        : [];
      const progression = Array.isArray(raw.optionalfeatureProgression)
        ? raw.optionalfeatureProgression.flatMap((entry) => {
            if (!entry || typeof entry !== "object") return [];
            const object = entry as Record<string, unknown>;
            const title = typeof object.name === "string" ? object.name : "Optional Feature";
            const featureTypes = Array.isArray(object.featureType) ? object.featureType.map(String) : [];
            const progressionData = object.progression && typeof object.progression === "object" ? object.progression as Record<string, unknown> : {};
            return Object.entries(progressionData).map(([level, count]) => ({
              title,
              featureTypes,
              count: Math.max(0, Number(count) || 0),
              level: Number(level) || 1,
            }));
          })
        : [];
      return [row.name, {
        savingThrows,
        skills: extractProficiencyRules(starting, "skills"),
        tools: extractProficiencyRules(starting, "tools"),
        languages: extractProficiencyRules(starting, "languages"),
        startingEquipment: extractStartingEquipment(row.raw_data),
        optionalFeatureProgression: progression,
      }];
    }),
  );

  const subclassOptionalFeatureProgression: Record<string, ClassRules["optionalFeatureProgression"]> = Object.fromEntries(
    subclassRows.map((row) => {
      const raw = row.raw_data && typeof row.raw_data === "object" ? row.raw_data as Record<string, unknown> : {};
      const progression = Array.isArray(raw.optionalfeatureProgression)
        ? raw.optionalfeatureProgression.flatMap((entry) => {
            if (!entry || typeof entry !== "object") return [];
            const object = entry as Record<string, unknown>;
            const title = typeof object.name === "string" ? object.name : "Optional Feature";
            const featureTypes = Array.isArray(object.featureType) ? object.featureType.map(String) : [];
            const progressionData = object.progression && typeof object.progression === "object" ? object.progression as Record<string, unknown> : {};
            return Object.entries(progressionData).map(([level, count]) => ({
              title,
              featureTypes,
              count: Math.max(0, Number(count) || 0),
              level: Number(level) || 1,
            }));
          })
        : [];
      return [row.name, progression];
    }),
  );

  const optionalFeatureCatalogue: OptionalFeatureDefinition[] = optionalFeatureRows
    .map((row) => ({
      id: row.id,
      name: row.name,
      description: cleanDisplayText(row.description ?? ""),
      featureTypes: Array.isArray(row.feature_types) ? row.feature_types.map(String) : [],
      source: row.source ?? "",
      contentKey: row.content_key ?? undefined,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const subraces: SubraceDefinition[] = subraceRows.map((row) => ({
    id: row.id,
    name: row.name,
    parentRace: row.race_name ?? raceNameById.get(row.race_id) ?? "",
    description: row.description ?? "",
    source: row.source ?? row.source_code ?? "",
    abilityBonuses: extractAbilityBonuses(row.raw_data),
  })).filter((row) => row.name && row.parentRace);

  const subraceKey = (parentRace: string, name: string) => parentRace.trim().toLowerCase() + "::" + name.trim().toLowerCase();
  const subraceByName = new Map(subraces.map((row) => [subraceKey(row.parentRace, row.name), row.id]));
  const subraceByDbId = new Map(subraces.map((row) => [row.id, row.name]));

  const featCatalogue: Feat[] = featRows
    .map((row) => ({
      id: row.id,
      name: row.name,
      description: cleanDisplayText(row.description ?? ""),
      prerequisite: row.prerequisite,
      ability: row.ability,
      source: row.source ?? "",
      edition: (row.edition === "2024" || row.edition === "custom" ? row.edition : "2014") as Feat["edition"],
      contentKey: row.content_key ?? undefined,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const homebrewCatalogue: HomebrewContent[] = [];

  return {
    classByName: byName(classesRows),
    raceByName: byName(raceRows),
    subclassByName: byName(subclassRows),
    backgroundByName: byName(backgroundRows),
    spellCatalogue,
    featureCatalogue,
    featCatalogue,
    itemCatalogue,
    optionalFeatureCatalogue,
    classRules,
    subclassOptionalFeatureProgression,
    raceRules,
    backgroundRules,
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
    subraceByName,
    subraceByDbId,
    optionalFeatureByDbId: new Map(
      optionalFeatureRows.flatMap((row) =>
        row.content_key ? [[row.id, row.content_key] as const] : [],
      ),
    ),
    subclassByDbId: new Map(subclassRows.map((row: any) => [row.id, row.name])),
    catalogue: {
      classes: uniqueNames(classesRows.map((row) => row.name)),
      races: uniqueNames(raceRows.map((row) => row.name)),