"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Badge, PageHeader, SectionCard } from "../../../../components/AppShell";
import { useCharacters } from "../../../../context/CharacterContext";
import type { AbilityKey, AbilityScores, Character } from "../../../../lib/types";
import { getNewAbilityScoreImprovementLevels } from "../../../../lib/rules";

const abilityKeys: AbilityKey[] = ["str", "dex", "con", "int", "wis", "cha"];
const abilityLabels: Record<AbilityKey, string> = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" };

export default function EditCharacterPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { characters, updateCharacter, catalogue, featureCatalogue, featCatalogue } = useCharacters();
  const character = characters.find((entry) => entry.id === params.id);
  if (!character) return <div className="mx-auto max-w-5xl px-4 py-12"><SectionCard title="Character not found"><Link href="/characters" className="text-amber-400">Back to Characters</Link></SectionCard></div>;
  return <CharacterEditor character={character} catalogue={catalogue} featureCatalogue={featureCatalogue} featCatalogue={featCatalogue} onSave={(patch) => { updateCharacter(character.id, patch); router.push(`/characters/${character.id}`); }} />;
}

function CharacterEditor({ character, catalogue, featureCatalogue, featCatalogue, onSave }: { character: Character; catalogue: ReturnType<typeof useCharacters>["catalogue"]; featureCatalogue: ReturnType<typeof useCharacters>["featureCatalogue"]; featCatalogue: ReturnType<typeof useCharacters>["featCatalogue"]; onSave: (patch: Partial<Character>) => void }) {
  const [form, setForm] = useState({ name: character.name, race: character.race, className: character.className, subclass: character.subclass, level: character.level, background: character.background, alignment: character.alignment, playerName: character.playerName, hp: character.hp, maxHp: character.maxHp, tempHp: character.tempHp, ac: character.ac, speed: character.speed, hitDice: character.hitDice, proficiencyBonus: character.proficiencyBonus, notes: character.notes });
  const [abilities, setAbilities] = useState<AbilityScores>(character.abilities);
  const [savingThrows, setSavingThrows] = useState<AbilityKey[]>(character.savingThrows);
  const [skills, setSkills] = useState(character.skills.join(", "));
  const [languages, setLanguages] = useState(character.languages.join(", "));
  const [feats, setFeats] = useState<string[]>(character.feats ?? []);
  const [selectedFeatId, setSelectedFeatId] = useState("");
  const subclassOptions = catalogue.subclasses.filter((entry) => entry.className === form.className);
  const selectedSubclass = subclassOptions.find((entry) => entry.name === form.subclass);
  const newlyUnlockedFeatures = featureCatalogue.filter((feature) =>
    feature.requiredLevel > character.level &&
    feature.requiredLevel <= form.level &&
    feature.className === form.className &&
    (!feature.subclassName || feature.subclassName === form.subclass)
  );
  const asiLevels = getNewAbilityScoreImprovementLevels(character.className, character.level, form.level);
  const selectedFeat = featCatalogue.find((feat) => feat.id === selectedFeatId);

  useEffect(() => {
    if (!catalogue.classes.length) return;
    setForm((current) => {
      const className = catalogue.classes.includes(current.className) ? current.className : catalogue.classes[0];
      const race = catalogue.races.includes(current.race) ? current.race : catalogue.races[0] ?? "";
      const background = catalogue.backgrounds.includes(current.background) ? current.background : catalogue.backgrounds[0] ?? "";
      const options = catalogue.subclasses.filter((entry) => entry.className === className);
      const subclass = options.some((entry) => entry.name === current.subclass) ? current.subclass : options[0]?.name ?? "";
      return { ...current, className, race, background, subclass };
    });
  }, [catalogue]);

  function setClass(value: string) {
    const nextSubclasses = catalogue.subclasses.filter((entry) => entry.className === value);
    setForm((current) => ({ ...current, className: value, subclass: nextSubclasses.some((entry) => entry.name === current.subclass) ? current.subclass : nextSubclasses[0]?.name ?? "" }));
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const unlockedFeatureIds = featureCatalogue
      .filter((feature) =>
        feature.requiredLevel <= form.level &&
        feature.className === form.className &&
        (!feature.subclassName || feature.subclassName === form.subclass)
      )
      .map((feature) => feature.id);
    onSave({
      ...form,
      feats,
      features: Array.from(new Set([...(character.features ?? []), ...unlockedFeatureIds])),
      abilities,
      savingThrows,
      skills: splitList(skills),
      languages: splitList(languages),
    });
  }
  return <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8"><PageHeader eyebrow="Character Editor" title={`Edit ${character.name}`} description="Change the information stored on this character. Hierarchy checks use the values you save here." actions={<Link href={`/characters/${character.id}`} className="rounded-xl border border-stone-700 px-4 py-2.5 text-sm text-stone-300 hover:bg-stone-800">Cancel</Link>} /><form onSubmit={submit} className="space-y-6"><SectionCard title="Identity"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Field label="Character name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} required /><SelectField label="Race" value={form.race} options={catalogue.races} onChange={(value) => setForm({ ...form, race: value })} /><SelectField label="Class" value={form.className} options={catalogue.classes} onChange={setClass} /><SelectField label="Subclass" value={form.subclass} options={subclassOptions.map((entry) => entry.name)} onChange={(value) => setForm({ ...form, subclass: value })} /><Field label="Background" value={form.background} onChange={(value) => setForm({ ...form, background: value })} /><Field label="Player name" value={form.playerName} onChange={(value) => setForm({ ...form, playerName: value })} /><NumberField label="Level" value={form.level} onChange={(value) => setForm({ ...form, level: value })} min={1} max={20} /><Field label="Alignment" value={form.alignment} onChange={(value) => setForm({ ...form, alignment: value })} /></div>{selectedSubclass && <div className="mt-5 rounded-2xl border border-stone-800 bg-stone-950/60 p-5"><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-semibold">{selectedSubclass.name}</h3>{selectedSubclass.source && <Badge>{selectedSubclass.source}</Badge>}</div><p className="mt-3 whitespace-pre-line text-sm leading-7 text-stone-400">{selectedSubclass.description || "No subclass description is available for this entry."}</p></div>}</SectionCard><SectionCard title="Core stats"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><NumberField label="Current HP" value={form.hp} onChange={(value) => setForm({ ...form, hp: value })} min={0} /><NumberField label="Maximum HP" value={form.maxHp} onChange={(value) => setForm({ ...form, maxHp: value })} min={1} /><NumberField label="Temporary HP" value={form.tempHp} onChange={(value) => setForm({ ...form, tempHp: value })} min={0} /><NumberField label="Armor Class" value={form.ac} onChange={(value) => setForm({ ...form, ac: value })} min={0} /><NumberField label="Speed" value={form.speed} onChange={(value) => setForm({ ...form, speed: value })} min={0} /><Field label="Hit Dice" value={form.hitDice} onChange={(value) => setForm({ ...form, hitDice: value })} /><NumberField label="Proficiency Bonus" value={form.proficiencyBonus} onChange={(value) => setForm({ ...form, proficiencyBonus: value })} min={0} /></div></SectionCard><SectionCard title="Ability scores"><div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">{abilityKeys.map((key) => <div key={key}><label className="text-xs font-semibold uppercase tracking-wider text-stone-500">{abilityLabels[key]}</label><input type="number" value={abilities[key]} onChange={(event) => setAbilities((current) => ({ ...current, [key]: Number(event.target.value) }))} className="mt-2 w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-center text-lg font-semibold text-stone-100 outline-none focus:border-amber-400" /></div>)}</div></SectionCard><SectionCard title="Saving throws"><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">{abilityKeys.map((key) => <label key={key} className={`flex items-center gap-2 rounded-xl border p-3 text-sm ${savingThrows.includes(key) ? "border-amber-500/60 bg-amber-500/10 text-stone-100" : "border-stone-800 bg-stone-950/60 text-stone-400"}`}><input type="checkbox" checked={savingThrows.includes(key)} onChange={() => setSavingThrows((current) => current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key])} />{abilityLabels[key]}</label>)}</div></SectionCard><SectionCard title="Skills and languages"><div className="grid gap-4 lg:grid-cols-2"><TextAreaField label="Skills" value={skills} onChange={setSkills} placeholder="Perception, Survival, Nature" /><TextAreaField label="Languages" value={languages} onChange={setLanguages} placeholder="Common, Draconic" /></div></SectionCard><SectionCard title="Level Progression" description="Class and subclass features are unlocked automatically when you save a higher level. Ability Score Improvement levels can be used for an ability increase or a feat."><div className="space-y-4">{newlyUnlockedFeatures.length ? newlyUnlockedFeatures.map((feature) => <article key={feature.id} className="rounded-xl border border-stone-800 bg-stone-950/60 p-4"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{feature.name}</h3><Badge>Level {feature.requiredLevel}</Badge><Badge tone="warn">{feature.sourceType === "subclass" ? "Subclass" : "Class"}</Badge></div><p className="mt-3 whitespace-pre-line text-sm leading-6 text-stone-400">{feature.description}</p></article>) : <p className="text-sm text-stone-500">No new class or subclass features are unlocked between level {character.level} and level {form.level}.</p>}{asiLevels.length > 0 && <div className="rounded-xl border border-amber-900/60 bg-amber-950/20 p-4"><h3 className="font-semibold text-amber-300">Ability Score Improvement / Feat</h3><p className="mt-2 text-sm leading-6 text-stone-400">This class reaches an Ability Score Improvement at level {asiLevels.join(", ")}. Choose an ability increase or a feat. Feats are optional under the 2014 rules.</p></div>}</div></SectionCard>

<SectionCard title="Feats" description="Select a feat to add it to the character. Selecting a feat immediately shows its description, like the D&D Beyond builder."><div className="space-y-5">{feats.length > 0 && <div className="space-y-3">{feats.map((id) => { const feat = featCatalogue.find((entry) => entry.id === id); return feat ? <article key={id} className="rounded-2xl border border-stone-800 bg-stone-950/60 p-4"><div className="flex items-start justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{feat.name}</h3>{feat.source && <Badge>{feat.source}</Badge>}</div><p className="mt-3 whitespace-pre-line text-sm leading-7 text-stone-400">{feat.description}</p>{feat.prerequisite !== undefined && feat.prerequisite !== null && <p className="mt-3 text-xs text-stone-600">Prerequisite: {formatPrerequisite(feat.prerequisite)}</p>}</div><button type="button" onClick={() => setFeats((current) => current.filter((entry) => entry !== id))} className="rounded-xl border border-red-950 px-3 py-2 text-sm text-red-400">Remove</button></div></article> : null; })}</div>}<div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]"><select value={selectedFeatId} onChange={(event) => setSelectedFeatId(event.target.value)} className="rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-sm text-stone-100"><option value="">Choose a feat...</option>{featCatalogue.filter((feat) => !feats.includes(feat.id)).map((feat) => <option key={feat.id} value={feat.id}>{feat.name}</option>)}</select><button type="button" disabled={!selectedFeatId} onClick={() => { if (selectedFeatId) { setFeats((current) => [...current, selectedFeatId]); setSelectedFeatId(""); } }} className="rounded-xl bg-stone-100 px-4 py-2.5 text-sm font-semibold text-stone-950 disabled:opacity-40">Add Feat</button></div>{selectedFeat && <div className="rounded-xl border border-amber-900/60 bg-amber-950/20 p-4"><div className="font-semibold text-amber-300">{selectedFeat.name}</div><p className="mt-2 whitespace-pre-line text-sm leading-7 text-stone-300">{selectedFeat.description}</p></div>}{featCatalogue.length === 0 && <p className="text-sm text-stone-500">No imported 2014 feats are available. Run the feats importer if the catalogue is empty.</p>}</div></SectionCard>

<SectionCard title="Character notes"><textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} rows={10} className="w-full rounded-xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm leading-6 text-stone-100 outline-none focus:border-amber-400" placeholder="Backstory, reminders, campaign notes..." /></SectionCard><div className="flex justify-end"><button type="submit" className="rounded-xl bg-stone-100 px-5 py-3 text-sm font-semibold text-stone-950 hover:bg-amber-300">Save Character</button></div></form></div>;
}
function formatPrerequisite(value: unknown) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
function splitList(value: string) { return value.split(",").map((entry) => entry.trim()).filter(Boolean); }
function Field({ label, value, onChange, required = false }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) { return <label><span className="text-xs font-semibold uppercase tracking-wider text-stone-500">{label}</span><input required={required} value={value} onChange={(e) => onChange(e.target.value)} className="mt-2 w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-sm outline-none focus:border-amber-400" /></label>; }
function NumberField({ label, value, onChange, min, max }: { label: string; value: number; onChange: (value: number) => void; min?: number; max?: number }) { return <label><span className="text-xs font-semibold uppercase tracking-wider text-stone-500">{label}</span><input type="number" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-2 w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-sm outline-none focus:border-amber-400" /></label>; }
function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) { return <label><span className="text-xs font-semibold uppercase tracking-wider text-stone-500">{label}</span><select value={value} onChange={(e) => onChange(e.target.value)} className="mt-2 w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-sm outline-none focus:border-amber-400">{options.length ? options.map((option) => <option key={option}>{option}</option>) : <option value="">None</option>}</select></label>; }
function TextAreaField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) { return <label><span className="text-xs font-semibold uppercase tracking-wider text-stone-500">{label}</span><textarea value={value} onChange={(e) => onChange(e.target.value)} rows={5} placeholder={placeholder} className="mt-2 w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-sm leading-6 outline-none focus:border-amber-400" /></label>; }
