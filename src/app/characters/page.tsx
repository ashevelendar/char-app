"use client";

import Link from "next/link";
import { useCharacters } from "../../context/CharacterContext";
import { PageHeader, SectionCard, Badge } from "../../components/AppShell";
import { getMaxSpellLevel, getSpellcastingMode } from "../../lib/rules";

export default function CharactersPage() {
  const { characters } = useCharacters();
  return <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
    <PageHeader eyebrow="Characters" title="My Characters" description="Each character has its own spells, inventory, features, notes and access overrides." actions={<Link href="/characters/new" className="rounded-xl bg-stone-100 px-4 py-2.5 text-sm font-semibold text-stone-950 hover:bg-amber-300">+ New Character</Link>} />
    <div className="grid gap-4 md:grid-cols-2">
      {characters.map((character) => <article key={character.id} className="rounded-2xl border border-stone-800 bg-stone-900/70 p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-2xl font-bold">{character.name}</h2><p className="mt-1 text-sm text-stone-500">{character.race} • {character.className} • {character.subclass || "No subclass"}</p></div><Badge tone="good">Level {character.level}</Badge></div><div className="mt-4 flex flex-wrap gap-2"><Badge>{getSpellcastingMode(character) === "none" ? "No spellcasting" : `${getSpellcastingMode(character)} spellcasting`}</Badge>{getMaxSpellLevel(character) > 0 && <Badge>{getMaxSpellLevel(character)} max spell level</Badge>}{character.accessOverrides.length > 0 && <Badge tone="warn">{character.accessOverrides.length} override{character.accessOverrides.length === 1 ? "" : "s"}</Badge>}</div><div className="mt-6 grid grid-cols-3 gap-2 text-center text-xs text-stone-500"><div className="rounded-xl border border-stone-800 bg-stone-950 p-3"><div className="text-lg font-bold text-stone-100">{character.spells.length}</div>Spells</div><div className="rounded-xl border border-stone-800 bg-stone-950 p-3"><div className="text-lg font-bold text-stone-100">{character.inventory.length}</div>Items</div><div className="rounded-xl border border-stone-800 bg-stone-950 p-3"><div className="text-lg font-bold text-stone-100">{character.features.length}</div>Features</div></div><div className="mt-5 flex flex-wrap gap-2"><Link href={`/characters/${character.id}`} className="rounded-xl bg-stone-100 px-4 py-2.5 text-sm font-semibold text-stone-950 hover:bg-amber-300">Open Character</Link><Link href={`/characters/${character.id}/edit`} className="rounded-xl border border-stone-700 px-4 py-2.5 text-sm font-medium text-stone-300 hover:bg-stone-800">Edit</Link></div></article>)}
    </div>
  </div>;
}
