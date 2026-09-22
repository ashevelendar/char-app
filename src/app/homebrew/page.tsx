"use client";

import { useMemo, useState } from "react";
import { Badge, PageHeader, SectionCard } from "../../components/AppShell";
import { useCharacters } from "../../context/CharacterContext";
import { supabase } from "../../lib/supabase";

type HomebrewType = "spell" | "feature" | "feat" | "item" | "race" | "subrace" | "class" | "subclass" | "background" | "other";
type Edition = "2014" | "2024" | "custom";

type HomebrewRow = {
  id: string;
  name: string;
  content_type: HomebrewType;
  description: string;
  source: string;
  edition: Edition;
  class_name: string | null;
  subclass_name: string | null;
  race_name: string | null;
  background_name: string | null;
  required_level: number | null;
  is_published: boolean;
};

const types: HomebrewType[] = ["spell", "feature", "feat", "item", "race", "subrace", "class", "subclass", "background", "other"];

export default function HomebrewPage() {
  const { characters, homebrewCatalogue, addHomebrew, removeHomebrew, accessMode } = useCharacters();
  const [selectedCharacterId, setSelectedCharacterId] = useState("");
  const [createdRows, setCreatedRows] = useState<HomebrewRow[]>([]);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<HomebrewType>("feature");
  const [edition, setEdition] = useState<Edition>("custom");
  const [source, setSource] = useState("Homebrew");
  const [description, setDescription] = useState("");
  const [requiredLevel, setRequiredLevel] = useState("");
  const [className, setClassName] = useState("");
  const [subclassName, setSubclassName] = useState("");
  const [raceName, setRaceName] = useState("");
  const [backgroundName, setBackgroundName] = useState("");
  const [published, setPublished] = useState(false);

  const selectedCharacter = characters.find((character) => character.id === selectedCharacterId) ?? characters[0];

  const rows = useMemo<HomebrewRow[]>(() => [
    ...homebrewCatalogue.map((row) => ({
      id: row.id,
      name: row.name,
      content_type: row.contentType,
      description: row.description,
      source: row.source,
      edition: row.edition,
      class_name: row.className ?? null,
      subclass_name: row.subclassName ?? null,
      race_name: row.raceName ?? null,
      background_name: row.backgroundName ?? null,
      required_level: row.requiredLevel ?? null,
      is_published: row.isPublished,
    })),
    ...createdRows.filter((created) => !homebrewCatalogue.some((row) => row.id === created.id)),
  ], [homebrewCatalogue, createdRows]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => [
      row.name, row.description, row.source, row.content_type,
      row.class_name ?? "", row.subclass_name ?? "", row.race_name ?? "", row.background_name ?? "",
    ].join(" ").toLowerCase().includes(needle));
  }, [rows, search]);

  async function createHomebrew() {
    if (!supabase || !name.trim()) return;
    setError("");
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      setError("You must be signed in to create homebrew.");
      return;
    }

    const payload = {
      owner_id: authData.user.id,
      name: name.trim(),
      content_type: type,
      description: description.trim(),
      source: source.trim() || "Homebrew",
      edition,
      required_level: requiredLevel ? Number(requiredLevel) : null,
      class_name: className.trim() || null,
      subclass_name: subclassName.trim() || null,
      race_name: raceName.trim() || null,
      background_name: backgroundName.trim() || null,
      is_published: published,
    };

    const { data, error: insertError } = await supabase
      .from("homebrew_content")
      .insert(payload)
      .select("id,name,content_type,description,source,edition,class_name,subclass_name,race_name,background_name,required_level,is_published")
      .single();

    if (insertError) {
      setError(insertError.message);
      return;
    }

    if (data) setCreatedRows((current) => [...current, data as HomebrewRow]);
    setName("");
    setDescription("");
    setRequiredLevel("");
    setClassName("");
    setSubclassName("");
    setRaceName("");
    setBackgroundName("");
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader eyebrow="Content Library" title="Homebrew Library" description="Create and reuse your own spells, features, feats, items, species, classes and other campaign content without modifying the imported catalogue." />
      <div className="grid gap-6 lg:grid-cols-[1.05fr_1fr]">
        <SectionCard title="Create homebrew" description="Homebrew is owned by your account and stored separately from imported rules content.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" value={name} onChange={setName} className="sm:col-span-2" />
            <Select label="Type" value={type} options={types} onChange={(value) => setType(value as HomebrewType)} />
            <Select label="Edition" value={edition} options={["2014", "2024", "custom"]} onChange={(value) => setEdition(value as Edition)} />
            <Field label="Source" value={source} onChange={setSource} />
            <Field label="Required level" value={requiredLevel} onChange={setRequiredLevel} type="number" />
            <Field label="Class" value={className} onChange={setClassName} />
            <Field label="Subclass" value={subclassName} onChange={setSubclassName} />
            <Field label="Race / Species" value={raceName} onChange={setRaceName} />
            <Field label="Background" value={backgroundName} onChange={setBackgroundName} />
          </div>
          <label className="mt-4 block">
            <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">Description</span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={8} className="mt-2 w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-3 text-sm leading-6" placeholder="Rules text, prerequisites, interactions, notes..." />
          </label>
          <label className="mt-4 flex items-center gap-2 text-sm text-stone-400">
            <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
            Publish this homebrew
          </label>
          {error && <p className="mt-4 rounded-xl border border-red-900 bg-red-950/30 px-4 py-3 text-sm text-red-300">{error}</p>}
          <button onClick={() => void createHomebrew()} disabled={!name.trim()} className="mt-5 rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-semibold text-stone-950 disabled:opacity-40">Create Homebrew</button>
        </SectionCard>

        <SectionCard title="Library" description={`${filtered.length} matching record${filtered.length === 1 ? "" : "s"}`}>
          {characters.length > 0 && (
            <label className="mb-4 block">
              <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">Character</span>
              <select value={selectedCharacter?.id ?? ""} onChange={(e) => setSelectedCharacterId(e.target.value)} className="mt-2 w-full rounded-xl border border-stone-800 bg-stone-950 px-4 py-3 text-sm">
                {characters.map((character) => <option key={character.id} value={character.id}>{character.name}</option>)}
              </select>
            </label>
          )}
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search homebrew..." className="w-full rounded-xl border border-stone-800 bg-stone-950 px-4 py-3 text-sm" />
          <div className="mt-4 space-y-3">
            {filtered.map((row) => (
              <article key={row.id} className="rounded-2xl border border-stone-800 bg-stone-950/60 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-stone-100">{row.name}</h2>
                    <p className="mt-1 text-xs uppercase tracking-wider text-stone-600">{row.content_type} • {row.source} • {row.edition}</p>
                  </div>
                  <Badge tone={row.is_published ? "good" : "neutral"}>{row.is_published ? "Published" : "Private"}</Badge>
                </div>
                {row.description && <p className="mt-3 whitespace-pre-line text-sm leading-6 text-stone-400">{row.description}</p>}
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-stone-500">
                  {row.required_level && <span>Level {row.required_level}+</span>}
                  {row.class_name && <span>Class: {row.class_name}</span>}
                  {row.subclass_name && <span>Subclass: {row.subclass_name}</span>}
                  {row.race_name && <span>Race: {row.race_name}</span>}
                  {row.background_name && <span>Background: {row.background_name}</span>}
                </div>
                {selectedCharacter && row.id && (
                  <button
                    onClick={() => void (selectedCharacter.homebrew.includes(row.id)
                      ? removeHomebrew(selectedCharacter.id, row.id)
                      : addHomebrew(selectedCharacter.id, row.id, accessMode === "dm"))}
                    className="mt-4 rounded-lg border border-stone-700 px-3 py-1.5 text-xs font-semibold text-stone-300"
                  >
                    {selectedCharacter.homebrew.includes(row.id) ? "Remove from character" : "Add to character"}
                  </button>
                )}
              </article>
            ))}
            {!filtered.length && <p className="py-8 text-center text-sm text-stone-600">No homebrew records yet.</p>}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", className = "" }: { label: string; value: string; onChange: (value: string) => void; type?: string; className?: string }) {
  return <label className={className}><span className="text-xs font-semibold uppercase tracking-wider text-stone-500">{label}</span><input type={type} min={type === "number" ? 1 : undefined} max={type === "number" ? 20 : undefined} value={value} onChange={(e) => onChange(e.target.value)} className="mt-2 w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-sm" /></label>;
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <label><span className="text-xs font-semibold uppercase tracking-wider text-stone-500">{label}</span><select value={value} onChange={(e) => onChange(e.target.value)} className="mt-2 w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-sm">{options.map((option) => <option key={option}>{option}</option>)}</select></label>;
}
