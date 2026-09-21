"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, PageHeader, SectionCard } from "../../../components/AppShell";
import { useCharacters } from "../../../context/CharacterContext";
import type { AbilityScores } from "../../../lib/types";
import { getExpectedHitDice, getExpectedMaxHp, getProficiencyBonus } from "../../../lib/rules";

const defaults: AbilityScores = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
const labels: Record<keyof AbilityScores, string> = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" };

export default function NewCharacterPage() {
  const router = useRouter();
  const { createCharacter, catalogue, featCatalogue } = useCharacters();
  const [form, setForm] = useState({ name: "", race: "", className: "", subclass: "", background: "", alignment: "Unaligned", playerName: "", level: 1, hp: 0, maxHp: 0, ac: 10, speed: 30, hitDice: "", proficiencyBonus: 2, abilities: defaults, notes: "", feats: [] as string[] });
  const options = catalogue.subclasses.filter((entry) => entry.className === form.className);
  const selectedSubclass = options.find((entry) => entry.name === form.subclass);

  useEffect(() => {
    const nextMaxHp = getExpectedMaxHp(form.className, form.level, form.abilities.con);
    const nextHitDice = getExpectedHitDice(form.className, form.level);
    const nextProficiencyBonus = getProficiencyBonus(form.level);

    setForm((current) => {
      const hpDelta = nextMaxHp - current.maxHp;
      if (
        current.maxHp === nextMaxHp &&
        current.hitDice === nextHitDice &&
        current.proficiencyBonus === nextProficiencyBonus
      ) {
        return current;
      }
      return {
        ...current,
        maxHp: nextMaxHp,
        hp: Math.max(0, Math.min(nextMaxHp, current.hp + hpDelta)),
        hitDice: nextHitDice,
        proficiencyBonus: nextProficiencyBonus,
      };
    });
  }, [form.className, form.level, form.abilities.con]);

  useEffect(() => {
    if (!catalogue.classes.length) return;
    setForm((current) => {
      const className = catalogue.classes.includes(current.className) ? current.className : catalogue.classes[0];
      const race = catalogue.races.includes(current.race) ? current.race : catalogue.races[0] ?? "";
      const background = catalogue.backgrounds.includes(current.background) ? current.background : catalogue.backgrounds[0] ?? "";
      const subclassOptions = catalogue.subclasses.filter((entry) => entry.className === className);
      const subclass = subclassOptions.some((entry) => entry.name === current.subclass) ? current.subclass : subclassOptions[0]?.name ?? "";
      return { ...current, className, race, background, subclass };
    });
  }, [catalogue]);

  function setField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) { setForm((current) => ({ ...current, [key]: value })); }
  async function submit() {
    const maxHp = getExpectedMaxHp(form.className, form.level, form.abilities.con);
    const character = {
      ...form,
      maxHp,
      hp: Math.max(0, Math.min(maxHp, form.hp || maxHp)),
      hitDice: getExpectedHitDice(form.className, form.level),
      proficiencyBonus: getProficiencyBonus(form.level),
    };
    const id = await createCharacter(character);
    router.push(`/characters/${id}`);
  }
  return <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8"><PageHeader eyebrow="Character Builder" title="Create Character" description="This creates a character in your Supabase account. The hierarchy controls what content appears as normally available." actions={<Link href="/characters" className="rounded-xl border border-stone-700 px-4 py-2.5 text-sm text-stone-300 hover:bg-stone-800">Cancel</Link>} /><div className="space-y-6"><SectionCard title="Identity"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Field label="Character name" value={form.name} required onChange={(value) => setField("name", value)} /><Select label="Race" value={form.race} options={catalogue.races} onChange={(value) => setField("race", value)} disabled={catalogue.races.length === 0} /><Select label="Class" value={form.className} options={catalogue.classes} onChange={(value) => { const next = catalogue.subclasses.filter((entry) => entry.className === value); setForm((current) => ({ ...current, className: value, subclass: next[0]?.name ?? "" })); }} disabled={catalogue.classes.length === 0} /><Select label="Subclass" value={form.subclass} options={options.map((o) => o.name)} onChange={(value) => setField("subclass", value)} disabled={options.length === 0} /><Select label="Background" value={form.background} options={catalogue.backgrounds} onChange={(value) => setField("background", value)} disabled={catalogue.backgrounds.length === 0} /><Field label="Player name" value={form.playerName} onChange={(value) => setField("playerName", value)} /><NumberField label="Level" value={form.level} min={1} max={20} onChange={(value) => setField("level", value)} /><Field label="Alignment" value={form.alignment} onChange={(value) => setField("alignment", value)} /></div>{selectedSubclass && <div className="mt-5 rounded-2xl border border-stone-800 bg-stone-950/60 p-5"><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-semibold">{selectedSubclass.name}</h3>{selectedSubclass.source && <Badge>{selectedSubclass.source}</Badge>}</div><p className="mt-3 whitespace-pre-line text-sm leading-7 text-stone-400">{selectedSubclass.description || "No subclass description is available for this entry."}</p></div>}</SectionCard><SectionCard title="Core stats"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><NumberField label="Current HP" value={form.hp} min={0} onChange={(value) => setField("hp", value)} /><NumberField label="Maximum HP" value={form.maxHp} min={1} onChange={() => undefined} /><NumberField label="Armor Class" value={form.ac} min={0} onChange={(value) => setField("ac", value)} /><NumberField label="Speed" value={form.speed} min={0} onChange={(value) => setField("speed", value)} /><Field label="Hit Dice" value={form.hitDice} onChange={() => undefined} /><NumberField label="Proficiency Bonus" value={form.proficiencyBonus} min={0} onChange={() => undefined} /></div></SectionCard><SectionCard title="Ability scores"><div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">{(Object.keys(defaults) as (keyof AbilityScores)[]).map((key) => <div key={key}><label className="text-xs font-semibold uppercase tracking-wider text-stone-500">{labels[key]}</label><input type="number" min={1} max={30} value={form.abilities[key]} onChange={(e) => setForm((c) => ({ ...c, abilities: { ...c.abilities, [key]: Number(e.target.value) } }))} className="mt-2 w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-sm text-stone-100 outline-none focus:border-amber-400" /></div>)}</div></SectionCard><SectionCard title="Feats" description="If this character starts at a level with an Ability Score Improvement or a feat choice, you can select the feat here. The description appears immediately after selection."><div className="space-y-4"><div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]"><select value={form.feats[0] ?? ""} onChange={(event) => setForm((current) => ({ ...current, feats: event.target.value ? [event.target.value] : [] }))} className="rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-sm text-stone-100"><option value="">Choose a feat...</option>{featCatalogue.map((feat) => <option key={feat.id} value={feat.id}>{feat.name}</option>)}</select></div>{form.feats.map((id) => { const feat = featCatalogue.find((entry) => entry.id === id); return feat ? <article key={id} className="rounded-2xl border border-amber-900/60 bg-amber-950/20 p-5"><div className="flex items-center gap-2"><h3 className="font-semibold text-amber-300">{feat.name}</h3>{feat.source && <Badge>{feat.source}</Badge>}</div><p className="mt-3 whitespace-pre-line text-sm leading-7 text-stone-300">{feat.description}</p></article> : null; })}{featCatalogue.length === 0 && <p className="text-sm text-stone-500">No imported 2014 feats are available.</p>}</div></SectionCard>

<SectionCard title="Notes"><textarea value={form.notes} onChange={(e) => setField("notes", e.target.value)} rows={8} className="w-full rounded-xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm leading-6 text-stone-100 outline-none focus:border-amber-400" placeholder="Backstory, campaign notes, reminders..." /></SectionCard><div className="flex justify-end"><button type="button" onClick={() => void submit()} disabled={!form.name.trim() || !form.race || !form.className || !form.background} className="rounded-xl bg-stone-100 px-5 py-3 text-sm font-semibold text-stone-950 hover:bg-amber-300">Create Character</button></div></div></div>;
}

function Field({ label, value, onChange, required = false }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) { return <label><span className="text-xs font-semibold uppercase tracking-wider text-stone-500">{label}</span><input required={required} value={value} onChange={(e) => onChange(e.target.value)} className="mt-2 w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-sm text-stone-100 outline-none focus:border-amber-400" /></label>; }
function NumberField({ label, value, min, max, onChange }: { label: string; value: number; min?: number; max?: number; onChange: (value: number) => void }) { return <label><span className="text-xs font-semibold uppercase tracking-wider text-stone-500">{label}</span><input type="number" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-2 w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-sm text-stone-100 outline-none focus:border-amber-400" /></label>; }
function Select({ label, value, options, onChange, disabled = false }: { label: string; value: string; options: string[]; onChange: (value: string) => void; disabled?: boolean }) { return <label><span className="text-xs font-semibold uppercase tracking-wider text-stone-500">{label}</span><select disabled={disabled} value={value} onChange={(e) => onChange(e.target.value)} className="mt-2 w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-sm text-stone-100 outline-none focus:border-amber-400">{options.length === 0 ? <option value="">None</option> : options.map((option) => <option key={option}>{option}</option>)}</select></label>; }