"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, PageHeader, SectionCard } from "../../../components/AppShell";
import AbilityScoreBuilder, { applyAbilityBonuses, type AbilityScoreMethod } from "../../../components/AbilityScoreBuilder";
import { useCharacters } from "../../../context/CharacterContext";
import type { AbilityScores } from "../../../lib/types";
import { getExpectedHitDice, getExpectedMaxHp, getProficiencyBonus } from "../../../lib/rules";

const defaults: AbilityScores = { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 };

export default function NewCharacterPage() {
  const router = useRouter();
  const {
    createCharacter,
    catalogue,
    raceRules,
    backgroundRules,
    classRules,
    subclassOptionalFeatureProgression,
    optionalFeatureCatalogue,
    featCatalogue,
  } = useCharacters();

  const [form, setForm] = useState({
    name: "",
    race: "",
    subrace: "",
    className: "",
    subclass: "",
    background: "",
    alignment: "Unaligned",
    playerName: "",
    level: 1,
    hp: 0,
    maxHp: 0,
    ac: 10,
    speed: 30,
    hitDice: "",
    proficiencyBonus: 2,
    abilities: defaults,
    notes: "",
    feats: [] as string[],
    skills: [] as string[],
    tools: [] as string[],
    languages: [] as string[],
    savingThrows: [] as ("str" | "dex" | "con" | "int" | "wis" | "cha")[],
    optionalFeatures: [] as string[],
  });

  const [baseAbilities, setBaseAbilities] = useState<AbilityScores>(defaults);
  const [abilityMethod, setAbilityMethod] = useState<AbilityScoreMethod>("standard");
  const [classSkillSelections, setClassSkillSelections] = useState<string[]>([]);
  const [backgroundSkillSelections, setBackgroundSkillSelections] = useState<string[]>([]);
  const [backgroundToolSelections, setBackgroundToolSelections] = useState<string[]>([]);
  const [backgroundLanguageSelections, setBackgroundLanguageSelections] = useState<string[]>([]);

  const subclassOptions = catalogue.subclasses.filter((entry) => entry.className === form.className);
  const selectedSubclass = subclassOptions.find((entry) => entry.name === form.subclass);
  const selectedRaceRules = raceRules[form.race];
  const selectedSubrace = catalogue.subraces.find((entry) => entry.name === form.subrace && entry.parentRace === form.race);
  const selectedBackgroundRules = backgroundRules[form.background];
  const selectedClassRules = classRules[form.className];

  const selectedSkills = useMemo(
    () => [...new Set([
      ...(selectedClassRules?.skills.fixed ?? []),
      ...classSkillSelections.filter(Boolean),
      ...(selectedBackgroundRules?.skills ?? []),
      ...backgroundSkillSelections.filter(Boolean),
    ])],
    [selectedClassRules, classSkillSelections, selectedBackgroundRules, backgroundSkillSelections],
  );

  const selectedTools = useMemo(
    () => [...new Set([
      ...(selectedClassRules?.tools.fixed ?? []),
      ...(selectedBackgroundRules?.tools ?? []),
      ...backgroundToolSelections.filter(Boolean),
    ])],
    [selectedClassRules, selectedBackgroundRules, backgroundToolSelections],
  );

  const selectedLanguages = useMemo(
    () => [...new Set([
      ...(selectedRaceRules?.languages.fixed ?? []),
      ...(selectedClassRules?.languages.fixed ?? []),
      ...(selectedBackgroundRules?.languages ?? []),
      ...backgroundLanguageSelections.filter(Boolean),
    ])],
    [selectedClassRules, selectedBackgroundRules, backgroundLanguageSelections],
  );

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

  useEffect(() => {
    const nextMaxHp = getExpectedMaxHp(form.className, form.level, form.abilities.con);
    const nextHitDice = getExpectedHitDice(form.className, form.level);
    const nextProficiencyBonus = getProficiencyBonus(form.level);
    setForm((current) => {
      const hpDelta = nextMaxHp - current.maxHp;
      if (current.maxHp === nextMaxHp && current.hitDice === nextHitDice && current.proficiencyBonus === nextProficiencyBonus) return current;
      return { ...current, maxHp: nextMaxHp, hp: Math.max(0, Math.min(nextMaxHp, current.hp + hpDelta)), hitDice: nextHitDice, proficiencyBonus: nextProficiencyBonus };
    });
  }, [form.className, form.level, form.abilities.con]);

  useEffect(() => {
    if (!catalogue.classes.length) return;
    setForm((current) => {
      const className = catalogue.classes.includes(current.className) ? current.className : catalogue.classes[0];
      const race = catalogue.races.includes(current.race) ? current.race : catalogue.races[0] ?? "";
      const background = catalogue.backgrounds.includes(current.background) ? current.background : catalogue.backgrounds[0] ?? "";
      const nextSubclasses = catalogue.subclasses.filter((entry) => entry.className === className);
      const subclass = nextSubclasses.some((entry) => entry.name === current.subclass) ? current.subclass : nextSubclasses[0]?.name ?? "";
      const raceSubraces = catalogue.subraces.filter((entry) => entry.parentRace === race);
      const subrace = raceSubraces.some((entry) => entry.name === current.subrace) ? current.subrace : "";
      const abilities = applyAbilityBonuses(
        applyAbilityBonuses(baseAbilities, raceRules[race]?.abilityBonuses ?? {}),
        catalogue.subraces.find((entry) => entry.name === subrace && entry.parentRace === race)?.abilityBonuses ?? {},
      );
      return { ...current, className, race, subrace, background, subclass, abilities, savingThrows: classRules[className]?.savingThrows ?? [] };
    });
  }, [catalogue, raceRules, baseAbilities, classRules]);

  useEffect(() => {
    setClassSkillSelections([]);
  }, [form.className]);

  useEffect(() => {
    setBackgroundSkillSelections([]);
    setBackgroundToolSelections([]);
    setBackgroundLanguageSelections([]);
  }, [form.background]);

  function selectRace(race: string, subrace = "") {
    const subraceRules = catalogue.subraces.find((entry) => entry.name === subrace && entry.parentRace === race);
    setForm((current) => ({ ...current, race, subrace, abilities: applyAbilityBonuses(applyAbilityBonuses(baseAbilities, raceRules[race]?.abilityBonuses ?? {}), subraceRules?.abilityBonuses ?? {}) }));
  }

  function setSubrace(value: string) {
    setForm((current) => ({
      ...current,
      subrace: value,
      abilities: applyAbilityBonuses(
        applyAbilityBonuses(baseAbilities, raceRules[current.race]?.abilityBonuses ?? {}),
        catalogue.subraces.find((entry) => entry.name === value && entry.parentRace === current.race)?.abilityBonuses ?? {},
      ),
    }));
  }

  function setBackground(value: string) {
    setForm((current) => ({ ...current, background: value }));
  }

  function submit() {
    const maxHp = getExpectedMaxHp(form.className, form.level, form.abilities.con);
    void createCharacter({
      ...form,
      abilities: applyAbilityBonuses(
        applyAbilityBonuses(baseAbilities, raceRules[form.race]?.abilityBonuses ?? {}),
        selectedSubrace?.abilityBonuses ?? {},
      ),
      skills: selectedSkills,
      tools: selectedTools,
      languages: selectedLanguages,
      maxHp,
      hp: Math.max(0, Math.min(maxHp, form.hp || maxHp)),
      hitDice: getExpectedHitDice(form.className, form.level),
      proficiencyBonus: getProficiencyBonus(form.level),
    }).then((id) => router.push(`/characters/${id}`));
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="Character Builder"
        title="Create Character"
        description="Choose your 2014 race, class, background and the proficiencies/options those choices grant."
        actions={<Link href="/characters" className="rounded-xl border border-stone-700 px-4 py-2.5 text-sm text-stone-300 hover:bg-stone-800">Cancel</Link>}
      />

      <div className="space-y-6">
        <SectionCard title="Identity">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Character name" value={form.name} required onChange={(value) => setForm((current) => ({ ...current, name: value }))} />
            <div className="sm:col-span-2 lg:col-span-3"><RacePicker races={catalogue.races} subraces={catalogue.subraces} selectedRace={form.race} selectedSubrace={form.subrace} onSelect={selectRace} /></div>
            <Select label="Class" value={form.className} options={catalogue.classes} onChange={(value) => {
              const next = catalogue.subclasses.filter((entry) => entry.className === value);
              setForm((current) => ({ ...current, className: value, subclass: next[0]?.name ?? "" }));
            }} />
            <Select label="Subclass" value={form.subclass} options={subclassOptions.map((entry) => entry.name)} onChange={(value) => setForm((current) => ({ ...current, subclass: value }))} />
            <Select label="Background" value={form.background} options={catalogue.backgrounds} onChange={setBackground} />
            <Field label="Player name" value={form.playerName} onChange={(value) => setForm((current) => ({ ...current, playerName: value }))} />
            <NumberField label="Level" value={form.level} min={1} max={20} onChange={(value) => setForm((current) => ({ ...current, level: value }))} />
            <Field label="Alignment" value={form.alignment} onChange={(value) => setForm((current) => ({ ...current, alignment: value }))} />
          </div>

          {selectedSubrace && (
            <InfoBox title={selectedSubrace.name} badge={selectedSubrace.source} text={selectedSubrace.description || "No subrace description is available for this entry."} />
          )}
          {selectedSubclass && (
            <InfoBox title={selectedSubclass.name} badge={selectedSubclass.source} text={selectedSubclass.description || "No subclass description is available for this entry."} />
          )}
          {selectedBackgroundRules && (
            <div className="mt-5 rounded-2xl border border-stone-800 bg-stone-950/60 p-5">
              <div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-semibold">Background benefits</h3><Badge>{form.background}</Badge></div>
              {selectedBackgroundRules.skills.length > 0 && <p className="mt-3 text-sm text-stone-300"><b>Fixed skills:</b> {selectedBackgroundRules.skills.join(", ")}</p>}
              <ChoiceGroup title="Background skill choices" choices={selectedBackgroundRules.skillChoices} value={backgroundSkillSelections} onChange={setBackgroundSkillSelections} exclude={selectedClassRules?.skills.fixed ?? []} />
              {selectedBackgroundRules.tools.length > 0 && <p className="mt-3 text-sm text-stone-300"><b>Fixed tools:</b> {selectedBackgroundRules.tools.join(", ")}</p>}
              <ChoiceGroup title="Background tool choices" choices={selectedBackgroundRules.toolChoices} value={backgroundToolSelections} onChange={setBackgroundToolSelections} />
              {selectedBackgroundRules.languages.length > 0 && <p className="mt-3 text-sm text-stone-300"><b>Fixed languages:</b> {selectedBackgroundRules.languages.join(", ")}</p>}
              <ChoiceGroup title="Background language choices" choices={selectedBackgroundRules.languageChoices} value={backgroundLanguageSelections} onChange={setBackgroundLanguageSelections} />
              {selectedBackgroundRules.featureName && <><h4 className="mt-4 font-semibold text-amber-300">{selectedBackgroundRules.featureName}</h4><p className="mt-2 whitespace-pre-line text-sm leading-6 text-stone-400">{selectedBackgroundRules.featureDescription}</p></>}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Proficiencies">
          {selectedClassRules && (
            <div className="rounded-2xl border border-stone-800 bg-stone-950/60 p-5">
              <h3 className="font-semibold">Class proficiencies</h3>
              {selectedClassRules.savingThrows.length > 0 && <p className="mt-2 text-sm text-stone-300"><b>Saving Throws:</b> {selectedClassRules.savingThrows.join(", ")}</p>}
              {selectedClassRules.skills.fixed.length > 0 && <p className="mt-2 text-sm text-stone-300"><b>Fixed Skills:</b> {selectedClassRules.skills.fixed.join(", ")}</p>}
              <ChoiceGroup title="Choose class skills" choices={selectedClassRules.skills.choices} value={classSkillSelections} onChange={setClassSkillSelections} />
              {selectedClassRules.tools.fixed.length > 0 && <p className="mt-2 text-sm text-stone-300"><b>Tools:</b> {selectedClassRules.tools.fixed.join(", ")}</p>}
            </div>
          )}

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <ProficiencySummary title="Skills" values={selectedSkills} />
            <ProficiencySummary title="Tools" values={selectedTools} />
            <ProficiencySummary title="Languages" values={selectedLanguages} />
            <ProficiencySummary title="Saving Throws" values={selectedClassRules?.savingThrows ?? []} />
          </div>
        </SectionCard>

        <SectionCard title="Class Options">
          {optionalChoiceGroups.length > 0 ? optionalChoiceGroups.map((group) => (
            <OptionalFeatureGroup
              key={group.id}
              title={group.title}
              count={group.count}
              featureTypes={group.featureTypes}
              catalogue={optionalFeatureCatalogue}
              selected={form.optionalFeatures}
              onChange={(next) => setForm((current) => ({ ...current, optionalFeatures: next }))}
            />
          )) : <p className="text-sm text-stone-500">No selectable class options were found for this level. If the class has options such as Fighting Style, import the 2014 optional-feature catalogue.</p>}
        </SectionCard>

        <SectionCard title="Core stats">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <NumberField label="Current HP" value={form.hp} min={0} onChange={(value) => setForm((current) => ({ ...current, hp: value }))} />
            <NumberField label="Maximum HP" value={form.maxHp} min={1} onChange={() => undefined} />
            <NumberField label="Armor Class" value={form.ac} min={0} onChange={(value) => setForm((current) => ({ ...current, ac: value }))} />
            <NumberField label="Speed" value={form.speed} min={0} onChange={(value) => setForm((current) => ({ ...current, speed: value }))} />
            <Field label="Hit Dice" value={form.hitDice} onChange={() => undefined} />
            <NumberField label="Proficiency Bonus" value={form.proficiencyBonus} min={0} onChange={() => undefined} />
          </div>
        </SectionCard>

        <SectionCard title="Ability scores" description="Race and subrace ability bonuses are applied automatically to the final scores.">
          <AbilityScoreBuilder
            baseScores={baseAbilities}
            onBaseScoresChange={(next) => {
              setBaseAbilities(next);
              setForm((current) => ({
                ...current,
                abilities: applyAbilityBonuses(
                  applyAbilityBonuses(next, raceRules[current.race]?.abilityBonuses ?? {}),
                  catalogue.subraces.find((entry) => entry.name === current.subrace && entry.parentRace === current.race)?.abilityBonuses ?? {},
                ),
              }));
            }}
            raceBonuses={{
              ...(selectedRaceRules?.abilityBonuses ?? {}),
              ...(selectedSubrace?.abilityBonuses ?? {}),
            }}
            raceLabel={[form.race, form.subrace].filter(Boolean).join(" / ")}
            method={abilityMethod}
            onMethodChange={setAbilityMethod}
          />
        </SectionCard>

        <SectionCard title="Feats">
          <div className="space-y-4">
            <select value={form.feats[0] ?? ""} onChange={(event) => setForm((current) => ({ ...current, feats: event.target.value ? [event.target.value] : [] }))} className="w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-sm text-stone-100">
              <option value="">Choose a feat...</option>
              {featCatalogue.map((feat) => <option key={feat.id} value={feat.id}>{feat.name}</option>)}
            </select>
            {form.feats.map((id) => {
              const feat = featCatalogue.find((entry) => entry.id === id);
              return feat ? <article key={id} className="rounded-2xl border border-amber-900/60 bg-amber-950/20 p-5"><div className="flex items-center gap-2"><h3 className="font-semibold text-amber-300">{feat.name}</h3>{feat.source && <Badge>{feat.source}</Badge>}</div><p className="mt-3 whitespace-pre-line text-sm leading-7 text-stone-300">{feat.description}</p></article> : null;
            })}
          </div>
        </SectionCard>

        <SectionCard title="Notes">
          <textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} rows={8} className="w-full rounded-xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm leading-6 text-stone-100 outline-none focus:border-amber-400" placeholder="Backstory, campaign notes, reminders..." />
        </SectionCard>

        <div className="flex justify-end">
          <button type="button" onClick={submit} disabled={!form.name.trim() || !form.race || !form.className || !form.background} className="rounded-xl bg-stone-100 px-5 py-3 text-sm font-semibold text-stone-950 hover:bg-amber-300 disabled:opacity-40">Create Character</button>
        </div>
      </div>
    </div>
  );
}

function RacePicker({ races, subraces, selectedRace, selectedSubrace, onSelect }: { races: string[]; subraces: Array<{ name: string; parentRace: string }>; selectedRace: string; selectedSubrace: string; onSelect: (race: string, subrace?: string) => void }) {
  const [expanded, setExpanded] = useState(selectedRace);
  return <div>
    <div className="text-xs font-semibold uppercase tracking-wider text-stone-500">Race</div>
    <div className="mt-2 space-y-2">
      {races.map((race) => {
        const children = subraces.filter((entry) => entry.parentRace === race);
        const open = expanded === race;
        const selected = selectedRace === race && !selectedSubrace;
        return <div key={race} className="rounded-xl border border-stone-800 bg-stone-950/60 overflow-hidden">
          <button type="button" onClick={() => { setExpanded(open ? "" : race); onSelect(race); }} className={`flex w-full items-center justify-between px-4 py-3 text-left ${selected ? "bg-stone-800 text-stone-100" : "text-stone-300"}`}>
            <span className="font-semibold">{race}</span>
            {children.length > 0 && <span className="text-xs text-stone-500">{children.length} subrace{children.length === 1 ? "" : "s"} {open ? "▴" : "▾"}</span>}
          </button>
          {open && children.length > 0 && <div className="border-t border-stone-800 p-2">
            {children.map((entry) => <button key={entry.name} type="button" onClick={() => onSelect(race, entry.name)} className={`block w-full rounded-lg px-4 py-2 text-left text-sm ${selectedSubrace === entry.name ? "bg-amber-500/10 text-amber-300" : "text-stone-400 hover:bg-stone-900 hover:text-stone-200"}`}>{entry.name}</button>)}
          </div>}
        </div>;
      })}
    </div>
  </div>;
}

function ChoiceGroup({ title, choices, value, onChange, exclude = [] }: { title: string; choices: Array<{ count: number; options: string[] }>; value: string[]; onChange: (value: string[]) => void; exclude?: string[] }) {
  if (!choices.length) return null;
  let offset = 0;
  return <div className="mt-4 space-y-3">
    <h4 className="text-sm font-semibold text-stone-200">{title}</h4>
    {choices.flatMap((choice) => Array.from({ length: choice.count }, (_, index) => {
      const slot = offset++;
      const options = choice.options.filter((option) => !exclude.includes(option) || value[slot] === option);
      return <select key={`${title}-${slot}`} value={value[slot] ?? ""} onChange={(event) => {
        const next = [...value];
        next[slot] = event.target.value;
        onChange(next);
      }} className="w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-sm text-stone-100">
        <option value="">Choose an option...</option>
        {options.map((option) => <option key={option}>{option}</option>)}
      </select>;
    }))}
  </div>;
}

function OptionalFeatureGroup({ title, count, featureTypes, catalogue, selected, onChange }: { title: string; count: number; featureTypes: string[]; catalogue: Array<{ id: string; name: string; description: string; featureTypes: string[]; source: string }>; selected: string[]; onChange: (value: string[]) => void }) {
  const options = catalogue.filter((entry) => entry.featureTypes.some((type) => featureTypes.includes(type)));
  const slots = Array.from({ length: count }, (_, index) => selected.filter((id) => options.some((option) => option.id === id))[index] ?? "");
  return <div className="mt-4 rounded-2xl border border-stone-800 bg-stone-950/60 p-5">
    <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{title}</h3><Badge>{count} choice{count === 1 ? "" : "s"}</Badge></div>
    <div className="mt-3 space-y-3">
      {slots.map((slot, index) => <select key={index} value={slot} onChange={(event) => {
        const currentGroupIds = selected.filter((id) => options.some((option) => option.id === id));
        const nextGroupIds = [...currentGroupIds];
        if (event.target.value) nextGroupIds[index] = event.target.value; else nextGroupIds.splice(index, 1);
        const otherIds = selected.filter((id) => !options.some((option) => option.id === id));
        onChange([...otherIds, ...nextGroupIds.filter(Boolean)]);
      }} className="w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-sm text-stone-100">
        <option value="">Choose an option...</option>
        {options.filter((option) => !selected.includes(option.id) || option.id === slot).map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
      </select>)}
    </div>
    {slots.map((slot) => {
      const feature = options.find((option) => option.id === slot);
      return feature ? <article key={feature.id} className="mt-3 rounded-xl border border-amber-900/50 bg-amber-950/20 p-4"><div className="font-semibold text-amber-300">{feature.name}</div><p className="mt-2 whitespace-pre-line text-sm leading-6 text-stone-300">{feature.description}</p></article> : null;
    })}
    {!options.length && <p className="mt-3 text-sm text-stone-500">No imported options match this choice group.</p>}
  </div>;
}

function ProficiencySummary({ title, values }: { title: string; values: string[] }) {
  return <div className="rounded-xl border border-stone-800 bg-stone-950/60 p-4"><h4 className="text-xs font-semibold uppercase tracking-wider text-stone-500">{title}</h4><p className="mt-2 text-sm text-stone-200">{values.length ? values.join(", ") : "None"}</p></div>;
}

function InfoBox({ title, badge, text }: { title: string; badge?: string; text: string }) {
  return <div className="mt-5 rounded-2xl border border-stone-800 bg-stone-950/60 p-5"><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-semibold">{title}</h3>{badge && <Badge>{badge}</Badge>}</div><p className="mt-3 whitespace-pre-line text-sm leading-7 text-stone-400">{text}</p></div>;
}

function Field({ label, value, onChange, required = false }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  return <label><span className="text-xs font-semibold uppercase tracking-wider text-stone-500">{label}</span><input required={required} value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-sm text-stone-100 outline-none focus:border-amber-400" /></label>;
}

function NumberField({ label, value, min, max, onChange }: { label: string; value: number; min?: number; max?: number; onChange: (value: number) => void }) {
  return <label><span className="text-xs font-semibold uppercase tracking-wider text-stone-500">{label}</span><input type="number" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-2 w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-sm text-stone-100 outline-none focus:border-amber-400" /></label>;
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <label><span className="text-xs font-semibold uppercase tracking-wider text-stone-500">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-sm text-stone-100 outline-none focus:border-amber-400">{options.length === 0 ? <option value="">None</option> : options.map((option) => <option key={option}>{option}</option>)}</select></label>;
}
