"use client";

import Link from "next/link";
import { PageHeader, SectionCard, StatTile, Badge } from "../components/AppShell";
import { getAvailableFeatures, getAvailableItems, getAvailableSpells, getMaxSpellLevel } from "../lib/rules";
import { features, items, spells } from "../lib/data";
import { useCharacters } from "../context/CharacterContext";

export default function DashboardPage() {
  const { characters, accessMode } = useCharacters();
  const totalInventoryTypes = characters.reduce((sum, character) => sum + character.inventory.length, 0);
  const totalKnownSpells = characters.reduce((sum, character) => sum + character.spells.length, 0);
  const totalFeatures = characters.reduce((sum, character) => sum + character.features.length, 0);
  const primary = characters[0];

  return <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
    <PageHeader eyebrow="Campaign Ledger" title="D&D Character Manager" description="An online character manager backed by Supabase, with hierarchy-aware access. No rolls, combat engine or automatic combat calculations are attached." actions={<Link href="/characters/new" className="rounded-xl bg-stone-100 px-4 py-2.5 text-sm font-semibold text-stone-950 hover:bg-amber-300">+ New Character</Link>} />

    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatTile label="Characters" value={characters.length} />
      <StatTile label="Known Spells" value={totalKnownSpells} />
      <StatTile label="Features" value={totalFeatures} />
      <StatTile label="Inventory Types" value={totalInventoryTypes} />
    </section>

    <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
      <SectionCard title="How access works" description={accessMode === "player" ? "Player Mode is currently active. Restricted content cannot be added." : "DM Mode is active. Restricted content can be granted manually as an override."} actions={<Link href="/rules" className="rounded-xl border border-stone-700 px-3 py-2 text-sm text-stone-300 hover:bg-stone-800">View Rules</Link>}>
        <div className="grid gap-3 md:grid-cols-2">
          {[
            ["Class + level", "Controls the normal spell pool and class features."],
            ["Subclass", "Adds subclass features and can grant extra spells."],
            ["Race / background", "Can grant their own features or spells."],
            ["DM overrides", "Permit campaign-specific exceptions without changing the normal rules."],
          ].map(([title, text]) => <div key={title} className="rounded-xl border border-stone-800 bg-stone-950/60 p-4"><h3 className="font-semibold text-stone-100">{title}</h3><p className="mt-1 text-sm leading-6 text-stone-500">{text}</p></div>)}
        </div>
      </SectionCard>

      {primary && <SectionCard title="Current demo character" description="This character is stored in your Supabase account." actions={<Link href={`/characters/${primary.id}`} className="rounded-xl bg-stone-100 px-3 py-2 text-sm font-semibold text-stone-950 hover:bg-amber-300">Open Sheet</Link>}>
        <div className="flex flex-wrap items-center gap-3">
          <div><p className="text-2xl font-bold text-stone-100">{primary.name}</p><p className="mt-1 text-sm text-stone-500">{primary.race} • {primary.className} • {primary.subclass}</p></div>
          <Badge tone="good">Level {primary.level}</Badge>
          <Badge>{getMaxSpellLevel(primary)}th-level spell ceiling</Badge>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-3 text-center text-sm"><div className="rounded-xl border border-stone-800 bg-stone-950 p-3"><div className="text-2xl font-bold">{getAvailableSpells(primary).length}</div><div className="text-stone-500">accessible spells in catalogue</div></div><div className="rounded-xl border border-stone-800 bg-stone-950 p-3"><div className="text-2xl font-bold">{getAvailableFeatures(primary).length}</div><div className="text-stone-500">accessible features</div></div><div className="rounded-xl border border-stone-800 bg-stone-950 p-3"><div className="text-2xl font-bold">{getAvailableItems(primary).length}</div><div className="text-stone-500">normally addable items</div></div></div>
      </SectionCard>}
    </div>

    <div className="mt-6 grid gap-6 md:grid-cols-3">
      <SectionCard title="Content library" description={`${spells.length} sample spells currently included.`}><Link href="/spells" className="text-sm font-semibold text-amber-400 hover:text-amber-300">Browse spells →</Link></SectionCard>
      <SectionCard title="Feature library" description={`${features.length} sample features with class, subclass, race and level metadata.`}><Link href="/features" className="text-sm font-semibold text-amber-400 hover:text-amber-300">Browse features →</Link></SectionCard>
      <SectionCard title="Item library" description={`${items.length} sample items, including DM-restricted legendary demos.`}><Link href="/inventory" className="text-sm font-semibold text-amber-400 hover:text-amber-300">Browse equipment →</Link></SectionCard>
    </div>
  </div>;
}
