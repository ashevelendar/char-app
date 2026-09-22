"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Badge, PageHeader, SectionCard } from "../../../../components/AppShell";
import AbilityScoreBuilder, { applyAbilityBonuses, type AbilityScoreMethod } from "../../../../components/AbilityScoreBuilder";
import { useCharacters } from "../../../../context/CharacterContext";
import type { AbilityKey, AbilityScores, Character } from "../../../../lib/types";
import { getExpectedHitDice, getExpectedMaxHp, getNewAbilityScoreImprovementLevels, getProficiencyBonus } from "../../../../lib/rules";

const abilityKeys: AbilityKey[] = ["str", "dex", "con", "int", "wis", "cha"];
const abilityLabels: Record<AbilityKey, string> = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" };

export default function EditCharacterPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const {
    characters,
    updateCharacter,
    catalogue,
    raceRules,
    backgroundRules,
    featureCatalogue,
    featCatalogue,
    classRules,
    subclassOptionalFeatureProgression,
    optionalFeatureCatalogue,
  } = useCharacters();
  const character = characters.find((entry) => entry.id === params.id);

  if (!character) {
    return <div className="mx-auto max-w-5xl px-4 py-12"><SectionCard title="Character not found"><Link href="/characters" className="text-amber-400">Back to Characters</Link></SectionCard></div>;
  }

  return (
    <CharacterEditor
      character={character}
      catalogue={catalogue}
      raceRules={raceRules}
      backgroundRules={backgroundRules}
      featureCatalogue={featureCatalogue}
      featCatalogue={featCatalogue}
      classRules={classRules}
      subclassOptionalFeatureProgression={subclassOptionalFeatureProgression}
      optionalFeatureCatalogue={optionalFeatureCatalogue}
      onSave={async (patch) => { await updateCharacter(character.id, patch); router.push(`/characters/${character.id}`); }}
    />
  );
}

function CharacterEditor({
  character,
  catalogue,
  raceRules,
  backgroundRules,
  featureCatalogue,
  featCatalogue,
  classRules,
  subclassOptionalFeatureProgression,
  optionalFeatureCatalogue,
  onSave,
}: {
  character: Character;
  catalogue: ReturnType<typeof useCharacters>["catalogue"];
  raceRules: ReturnType<typeof useCharacters>["raceRules"];
  backgroundRules: ReturnType<typeof useCharacters>["backgroundRules"];
  featureCatalogue: ReturnType<typeof useCharacters>["featureCatalogue"];
  featCatalogue: ReturnType<typeof useCharacters>["featCatalogue"];
  classRules: ReturnType<typeof useCharacters>["classRules"];
  subclassOptionalFeatureProgression: ReturnType<typeof useCharacters>["subclassOptionalFeatureProgression"];
  optionalFeatureCatalogue: ReturnType<typeof useCharacters>["optionalFeatureCatalogue"];
  onSave: (patch: Partial<Character>) => void | Promise<void>;
}) {
  const [form, setForm] = useState({
    name: character.name,
    race: character.race,
    subrace: character.subrace,
    className: character.className,
    subclass: character.subclass,
    level: character.level,
    background: character.background,
    alignment: character.alignment,
    playerName: character.playerName,
    hp: character.hp,
    maxHp: character.maxHp,
    tempHp: character.tempHp,
    ac: character.ac,
    speed: character.speed,
    hitDice: character.hitDice,
    proficiencyBonus: character.proficiencyBonus,
    notes: character.notes,
  });

  const [baseAbilities, setBaseAbilities] = useState<AbilityScores>(() => ({
    str: Math.max(1, character.abilities.str - (raceRules[character.race]?.abilityBonuses.str ?? 0) - (catalogue.subraces.find((entry) => entry.name === character.subrace && entry.parentRace === character.race)?.abilityBonuses.str ?? 0)),
    dex: Math.max(1, character.abilities.dex - (raceRules[character.race]?.abilityBonuses.dex ?? 0) - (catalogue.subraces.find((entry) => entry.name === character.subrace && entry.parentRace === character.race)?.abilityBonuses.dex ?? 0)),
    con: Math.max(1, character.abilities.con - (raceRules[character.race]?.abilityBonuses.con ?? 0) - (catalogue.subraces.find((entry) => entry.name === character.subrace && entry.parentRace === character.race)?.abilityBonuses.con ?? 0)),
    int: Math.max(1, character.abilities.int - (raceRules[character.race]?.abilityBonuses.int ?? 0) - (catalogue.subraces.find((entry) => entry.name === character.subrace && entry.parentRace === character.race)?.abilityBonuses.int ?? 0)),
    wis: Math.max(1, character.abilities.wis - (raceRules[character.race]?.abilityBonuses.wis ?? 0) - (catalogue.subraces.find((entry) => entry.name === character.subrace && entry.parentRace === character.race)?.abilityBonuses.wis ?? 0)),
    cha: Math.max(1, character.abilities.cha - (raceRules[character.race]?.abilityBonuses.cha ?? 0) - (catalogue.subraces.find((entry) => entry.name === character.subrace && entry.parentRace === character.race)?.abilityBonuses.cha ?? 0)),
  }));
  const [abilities, setAbilities] = useState<AbilityScores>(character.abilities);
  const [abilityMethod, setAbilityMethod] = useState<AbilityScoreMethod>("manual");
  const [skills, setSkills] = useState<string[]>(character.skills);
  const [tools, setTools] = useState<string[]>(character.tools);
  const [languages, setLanguages] = useState<string[]>(character.languages);
  const [feats, setFeats] = useState<string[]>(character.feats ?? []);
  const [optionalFeatures, setOptionalFeatures] = useState<string[]>(character.optionalFeatures ?? []);
  const [classSkillSelections, setClassSkillSelections] = useState<string[]>([]);
  const [backgroundSkillSelections, setBackgroundSkillSelections] = useState<string[]>([]);
  const [backgroundToolSelections, setBackgroundToolSelections] = useState<string[]>([]);
  const [backgroundLanguageSelections, setBackgroundLanguageSelections] = useState<string[]>([]);

  const subclassOptions = catalogue.subclasses.filter((entry) => entry.className === form.className);
  const selectedSubclass = subclassOptions.find((entry) => entry.name === form.subclass);
  const selectedSubrace = catalogue.subraces.find((entry) => entry.name === form.subrace && entry.parentRace === form.race);
  const selectedBackgroundRules = backgroundRules[form.background];
  const selectedClassRules = classRules[form.className];

  useEffect(() => {
    const nextMaxHp = getExpectedMaxHp(form.className, form.level, abilities.con);
    const nextHitDice = getExpectedHitDice(form.className, form.level);
    const nextProficiencyBonus = getProficiencyBonus(form.level);
    setForm((current) => {
      if (current.maxHp === nextMaxHp && current.hitDice === nextHitDice && current.proficiencyBonus === nextProficiencyBonus) return current;
      const hpDelta = nextMaxHp - current.maxHp;
      return { ...current, maxHp: nextMaxHp, hp: Math.max(0, Math.min(nextMaxHp, current.hp + hpDelta)), hitDice: nextHitDice, proficiencyBonus: nextProficiencyBonus };
    });
  }, [form.className, form.level, abilities.con]);

  useEffect(() => {
    const classChoices = selectedClassRules?.skills.choices ?? [];
    const classOptions = new Set(classChoices.flatMap((choice) => choice.options));
    const classSelected = character.skills.filter((skill) => classOptions.has(skill)).slice(0, classChoices.reduce((sum, choice) => sum + choice.count, 0));
    setClassSkillSelections(classSelected);
    setBackgroundSkillSelections([]);
    setBackgroundToolSelections([]);
    setBackgroundLanguageSelections([]);
  }, [form.className, character.skills, selectedClassRules]);

  useEffect(() => {
    if (!catalogue.classes.length) return;
    setForm((current) => {
      const className = catalogue.classes.includes(current.className) ? current.className : catalogue.classes[0];
      const race = catalogue.races.includes(current.race) ? current.race : catalogue.races[0] ?? "";
      const background = catalogue.backgrounds.includes(current.background) ? current.background : catalogue.backgrounds[0] ?? "";
      const options = catalogue.subclasses.filter((entry) => entry.className === className);
      const subclass = options.some((entry) => entry.name === current.subclass) ? current.subclass : options[0]?.name ?? "";
      const subraces = catalogue.subraces.filter((entry) => entry.parentRace === race);
      const subrace = subraces.some((entry) => entry.name === current.subrace) ? current.subrace : "";
      return { ...current, className, race, background, subclass, subrace };
    });
  }, [catalogue]);

  const selectedSkills = useMemo(() => [...new Set([
    ...(selectedClassRules?.skills.fixed ?? []),
    ...classSkillSelections.filter(Boolean),
    ...(selectedBackgroundRules?.skills ?? []),
    ...backgroundSkillSelections.filter(Boolean),
  ])], [selectedClassRules, classSkillSelections, selectedBackgroundRules, backgroundSkillSelections]);

  const selectedTools = useMemo(() => [...new Set([
    ...(selectedClassRules?.tools.fixed ?? []),
    ...(selectedBackgroundRules?.tools ?? []),
    ...backgroundToolSelections.filter(Boolean),
  ])], [selectedClassRules, selectedBackgroundRules, backgroundToolSelections]);

  const selectedLanguages = useMemo(() => [...new Set([
    ...(raceRules[form.race]?.languages.fixed ?? []),
    ...(selectedClassRules?.languages.fixed ?? []),
    ...(selectedBackgroundRules?.languages ?? []),
    ...backgroundLanguageSelections.filter(Boolean),
  ])], [selectedClassRules, selectedBackgroundRules, backgroundLanguageSelections]);

  const optionalChoiceGroups = useMemo(() => {
    const entries = [
      ...(selectedClassRules?.optionalFeatureProgression ?? []),
      ...(subclassOptionalFeatureProgression[form.subclass] ?? []),
    ].filter((entry) => entry.level <= form.level && entry.count > 0);
    const grouped = new Map<string, { id: string; title: string; count: number; featureTypes: string[] }>();
    for (const entry of entries) {
      const key = entry.title + "::" + entry.featureTypes.join("|");
      const current = grouped.get(key);
      if (current) current.count += entry.count;
      else grouped.set(key, { id: key, title: entry.title, count: entry.count, featureTypes: entry.featureTypes });
    }
    return [...grouped.values()];
  }, [selectedClassRules, subclassOptionalFeatureProgression, form.subclass, form.level]);

  const asiLevels = getNewAbilityScoreImprovementLevels(character.className, character.level, form.level);

  function setRace(value: string) {
    const subrace = "";
    const abilitiesNext = applyAbilityBonuses(baseAbilities, raceRules[value]?.abilityBonuses ?? {});
    setForm((current) => ({ ...current, race: value, subrace }));
    setAbilities(abilitiesNext);
  }

  function setSubrace(value: string) {
    const subraceRules = catalogue.subraces.find((entry) => entry.name === value && entry.parentRace === form.race);
    setForm((current) => ({ ...current, subrace: value }));
    setAbilities(applyAbilityBonuses(applyAbilityBonuses(baseAbilities, raceRules[form.race]?.abilityBonuses ?? {}), subraceRules?.abilityBonuses ?? {}));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const unlockedFeatureIds = featureCatalogue
      .filter((feature) => feature.requiredLevel <= form.level && feature.className === form.className && (!feature.subclassName || feature.subclassName === form.subclass))
      .map((feature) => feature.id);

    onSave({
      ...form,
      abilities,
      skills: selectedSkills,
      tools: selectedTools,
      languages: selectedLanguages,
      feats,
      optionalFeatures,
      features: Array.from(new Set([...(character.features ?? []), ...unlockedFeatureIds])),
    });
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader eyebrow="Character Editor" title={`Edit ${character.name}`} description="Change the information stored on this character." actions={<Link href={`/characters/${character.id}`} className="rounded-xl border border-stone-700 px-4 py-2.5 text-sm text-stone-300 hover:bg-stone-800">Cancel</Link>} />
      <form onSubmit={submit} className="space-y-6">
        <SectionCard title="Identity">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Character name" value={form.name} onChange={(value) => setForm((current) => ({ ...current, name: value }))} required />
            <SelectField label="Race" value={form.race} options={catalogue.races} onChange={setRace} />
            {catalogue.subraces.filter((entry) => entry.parentRace === form.race).length > 0 && <SelectField label="Subrace" value={form.subrace} options={catalogue.subraces.filter((entry) => entry.parentRace === form.race).map((entry) => entry.name)} onChange={setSubrace} />}
            <SelectField label="Class" value={form.className} options={catalogue.classes} onChange={(value) => {
              const next = catalogue.subclasses.filter((entry) => entry.className === value);
              setForm((current) => ({ ...current, className: value, subclass: next[0]?.name ?? "" }));
            }} />
            <SelectField label="Subclass" value={form.subclass} options={subclassOptions.map((entry) => entry.name)} onChange={(value) => setForm((current) => ({ ...current, subclass: value }))} />
            <SelectField label="Background" value={form.background} options={catalogue.backgrounds} onChange={(value) => setForm((current) => ({ ...current, background: value }))} />
            <Field label="Player name" value={form.playerName} onChange={(value) => setForm((current) => ({ ...current, playerName: value }))} />
            <NumberField label="Level" value={form.level} onChange={(value) => setForm((current) => ({ ...current, level: value }))} min={1} max={20} />
            <Field label="Alignment" value={form.alignment} onChange={(value) => setForm((current) => ({ ...current, alignment: value }))} />
          </div>
          {selectedSubrace && <InfoBox title={selectedSubrace.name} badge={selectedSubrace.source} text={selectedSubrace.description || "No subrace description is available."} />}
          {selectedSubclass && <InfoBox title={selectedSubclass.name} badge={selectedSubclass.source} text={selectedSubclass.description || "No subclass description is available."} />}
        </SectionCard>

        <SectionCard title="Proficiencies">
          {selectedClassRules && <div className="rounded-2xl border border-stone-800 bg-stone-950/60 p-5">
            <h3 className="font-semibold">Class proficiencies</h3>
            {selectedClassRules.savingThrows.length > 0 && <p className="mt-2 text-sm text-stone-300"><b>Saving Throws:</b> {selectedClassRules.savingThrows.join(", ")}</p>}
            {selectedClassRules.skills.fixed.length > 0 && <p className="mt-2 text-sm text-stone-300"><b>Fixed Skills:</b> {selectedClassRules.skills.fixed.join(", ")}</p>}
            <ChoiceGroup title="Choose class skills" choices={selectedClassRules.skills.choices} value={classSkillSelections} onChange={setClassSkillSelections} />
          </div>}
          {selectedBackgroundRules && <div className="mt-5 rounded-2xl border border-stone-800 bg-stone-950/60 p-5">
            <h3 className="font-semibold">Background proficiencies</h3>
            {selectedBackgroundRules.skills.length > 0 && <p className="mt-2 text-sm text-stone-300"><b>Fixed Skills:</b> {selectedBackgroundRules.skills.join(", ")}</p>}
            <ChoiceGroup title="Choose background skills" choices={selectedBackgroundRules.skillChoices} value={backgroundSkillSelections} onChange={setBackgroundSkillSelections} exclude={[...(selectedClassRules?.skills.fixed ?? []), ...classSkillSelections]} />
            {selectedBackgroundRules.tools.length > 0 && <p className="mt-2 text-sm text-stone-300"><b>Fixed Tools:</b> {selectedBackgroundRules.tools.join(", ")}</p>}
            <ChoiceGroup title="Choose background tools" choices={selectedBackgroundRules.toolChoices} value={backgroundToolSelections} onChange={setBackgroundToolSelections} />
            {selectedBackgroundRules.languages.length > 0 && <p className="mt-2 text-sm text-stone-300"><b>Fixed Languages:</b> {selectedBackgroundRules.languages.join(", ")}</p>}
            <ChoiceGroup title="Choose background languages" choices={selectedBackgroundRules.languageChoices} value={backgroundLanguageSelections} onChange={setBackgroundLanguageSelections} />
          </div>}
          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            <ProficiencySummary title="Skills" values={selectedSkills} />
            <ProficiencySummary title="Tools" values={selectedTools} />
            <ProficiencySummary title="Languages" values={selectedLanguages} />
          </div>
        </SectionCard>

        <SectionCard title="Class Options">
          {optionalChoiceGroups.length ? optionalChoiceGroups.map((group) => <OptionalFeatureGroup key={group.id} title={group.title} count={group.count} featureTypes={group.featureTypes} catalogue={optionalFeatureCatalogue} selected={optionalFeatures} onChange={setOptionalFeatures} />) : <p className="text-sm text-stone-500">No selectable class options were found for this level.</p>}
        </SectionCard>

        <SectionCard title="Core stats">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <NumberField label="Current HP" value={form.hp} onChange={(value) => setForm((current) => ({ ...current, hp: value }))} min={0} />
            <NumberField label="Maximum HP" value={form.maxHp} onChange={() => undefined} min={1} />
            <NumberField label="Temporary HP" value={form.tempHp} onChange={(value) => setForm((current) => ({ ...current, tempHp: value }))} min={0} />
            <NumberField label="Armor Class" value={form.ac} onChange={() => undefined} min={0} />
            <NumberField label="Speed" value={form.speed} onChange={(value) => setForm((current) => ({ ...current, speed: value }))} min={0} />
            <Field label="Hit Dice" value={form.hitDice} onChange={() => undefined} />
            <NumberField label="Proficiency Bonus" value={form.proficiencyBonus} onChange={() => undefined} min={0} />
          </div>
        </SectionCard>

        <SectionCard title="Ability scores">
          <AbilityScoreBuilder
            baseScores={baseAbilities}
            onBaseScoresChange={(next) => {
              setBaseAbilities(next);
              setAbilities(applyAbilityBonuses(applyAbilityBonuses(next, raceRules[form.race]?.abilityBonuses ?? {}), selectedSubrace?.abilityBonuses ?? {}));
            }}
            raceBonuses={{ ...(raceRules[form.race]?.abilityBonuses ?? {}), ...(selectedSubrace?.abilityBonuses ?? {}) }}
            raceLabel={[form.race, form.subrace].filter(Boolean).join(" / ")}
            method={abilityMethod}
            onMethodChange={setAbilityMethod}
          />
        </SectionCard>

        <SectionCard title="Level Progression">
          <div className="space-y-4">
            {featureCatalogue.filter((feature) => feature.requiredLevel > character.level && feature.requiredLevel <= form.level && feature.className === form.className && (!feature.subclassName || feature.subclassName === form.subclass)).map((feature) => (
              <article key={feature.id} className="rounded-xl border border-stone-800 bg-stone-950/60 p-4"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{feature.name}</h3><Badge>Level {feature.requiredLevel}</Badge><Badge tone="warn">{feature.sourceType === "subclass" ? "Subclass" : "Class"}</Badge></div><p className="mt-3 whitespace-pre-line text-sm leading-6 text-stone-400">{feature.description}</p></article>
            ))}
            {asiLevels.length > 0 && <div className="rounded-xl border border-amber-900/60 bg-amber-950/20 p-4"><h3 className="font-semibold text-amber-300">Ability Score Improvement / Feat</h3><p className="mt-2 text-sm text-stone-400">ASI levels reached: {asiLevels.join(", ")}.</p></div>}
          </div>
        </SectionCard>

        <SectionCard title="Feats">
          <div className="space-y-4">
            {feats.map((id) => {
              const feat = featCatalogue.find((entry) => entry.id === id);
              return feat ? <article key={id} className="rounded-2xl border border-stone-800 bg-stone-950/60 p-4"><div className="flex items-start justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{feat.name}</h3>{feat.source && <Badge>{feat.source}</Badge>}</div><p className="mt-3 whitespace-pre-line text-sm leading-7 text-stone-400">{feat.description}</p></div><button type="button" onClick={() => setFeats((current) => current.filter((entry) => entry !== id))} className="rounded-xl border border-red-950 px-3 py-2 text-sm text-red-400">Remove</button></div></article> : null;
            })}
            <select onChange={(event) => { if (event.target.value) { setFeats((current) => [...current, event.target.value]); event.target.value = ""; } }} className="w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-sm text-stone-100">
              <option value="">Add a feat...</option>
              {featCatalogue.filter((feat) => !feats.includes(feat.id)).map((feat) => <option key={feat.id} value={feat.id}>{feat.name}</option>)}
            </select>
          </div>
        </SectionCard>

        <SectionCard title="Character notes">
          <textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} rows={10} className="w-full rounded-xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm leading-6 text-stone-100 outline-none focus:border-amber-400" />
        </SectionCard>

        <div className="flex justify-end"><button type="submit" className="rounded-xl bg-stone-100 px-5 py-3 text-sm font-semibold text-stone-950 hover:bg-amber-300">Save Character</button></div>
      </form>
    </div>
  );
}

function ChoiceGroup({ title, choices, value, onChange, exclude = [] }: { title: string; choices: Array<{ count: number; options: string[] }>; value: string[]; onChange: (value: string[]) => void; exclude?: string[] }) {
  if (!choices.length) return null;
  let offset = 0;
  return <div className="mt-4 space-y-3"><h4 className="text-sm font-semibold text-stone-200">{title}</h4>{choices.flatMap((choice) => Array.from({ length: choice.count }, () => {
    const slot = offset++;
    const options = choice.options.filter((option) => !exclude.includes(option) || value[slot] === option);
    return <select key={`${title}-${slot}`} value={value[slot] ?? ""} onChange={(event) => { const next = [...value]; next[slot] = event.target.value; onChange(next); }} className="w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-sm text-stone-100"><option value="">Choose an option...</option>{options.map((option) => <option key={option}>{option}</option>)}</select>;
  }))}</div>;
}

function OptionalFeatureGroup({ title, count, featureTypes, catalogue, selected, onChange }: { title: string; count: number; featureTypes: string[]; catalogue: Array<{ id: string; name: string; description: string; featureTypes: string[]; source: string }>; selected: string[]; onChange: (value: string[]) => void }) {
  const options = catalogue.filter((entry) => entry.featureTypes.some((type) => featureTypes.includes(type)));
  const slots = Array.from({ length: count }, (_, index) => selected.filter((id) => options.some((option) => option.id === id))[index] ?? "");
  return <div className="mt-4 rounded-2xl border border-stone-800 bg-stone-950/60 p-5"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{title}</h3><Badge>{count} choice{count === 1 ? "" : "s"}</Badge></div>{slots.map((slot, index) => <select key={index} value={slot} onChange={(event) => { const groupIds = selected.filter((id) => options.some((option) => option.id === id)); const nextGroupIds = [...groupIds]; if (event.target.value) nextGroupIds[index] = event.target.value; else nextGroupIds.splice(index, 1); const otherIds = selected.filter((id) => !options.some((option) => option.id === id)); onChange([...otherIds, ...nextGroupIds.filter(Boolean)]); }} className="mt-3 w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-sm text-stone-100"><option value="">Choose an option...</option>{options.filter((option) => !selected.includes(option.id) || option.id === slot).map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select>)}{slots.map((slot) => { const feature = options.find((option) => option.id === slot); return feature ? <article key={feature.id} className="mt-3 rounded-xl border border-amber-900/50 bg-amber-950/20 p-4"><div className="font-semibold text-amber-300">{feature.name}</div><p className="mt-2 whitespace-pre-line text-sm leading-6 text-stone-300">{feature.description}</p></article> : null; })}{!options.length && <p className="mt-3 text-sm text-stone-500">No imported options match this choice group.</p>}</div>;
}

function ProficiencySummary({ title, values }: { title: string; values: string[] }) { return <div className="rounded-xl border border-stone-800 bg-stone-950/60 p-4"><h4 className="text-xs font-semibold uppercase tracking-wider text-stone-500">{title}</h4><p className="mt-2 text-sm text-stone-200">{values.length ? values.join(", ") : "None"}</p></div>; }
function InfoBox({ title, badge, text }: { title: string; badge?: string; text: string }) { return <div className="mt-5 rounded-2xl border border-stone-800 bg-stone-950/60 p-5"><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-semibold">{title}</h3>{badge && <Badge>{badge}</Badge>}</div><p className="mt-3 whitespace-pre-line text-sm leading-7 text-stone-400">{text}</p></div>; }
function Field({ label, value, onChange, required = false }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) { return <label><span className="text-xs font-semibold uppercase tracking-wider text-stone-500">{label}</span><input required={required} value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-sm outline-none focus:border-amber-400" /></label>; }
function NumberField({ label, value, onChange, min, max }: { label: string; value: number; onChange: (value: number) => void; min?: number; max?: number }) { return <label><span className="text-xs font-semibold uppercase tracking-wider text-stone-500">{label}</span><input type="number" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-2 w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-sm outline-none focus:border-amber-400" /></label>; }
function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) { return <label><span className="text-xs font-semibold uppercase tracking-wider text-stone-500">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-sm outline-none focus:border-amber-400">{options.length ? options.map((option) => <option key={option}>{option}</option>) : <option value="">None</option>}</select></label>; }
