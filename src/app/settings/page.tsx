"use client";

import Link from "next/link";
import { PageHeader, SectionCard, Badge } from "../../components/AppShell";
import { useCharacters } from "../../context/CharacterContext";

export default function SettingsPage() {
  const { accessMode, setAccessMode, resetDemoData, databaseStatus } = useCharacters();

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="Settings"
        title="Application Settings"
        description="Your characters are stored in Supabase. The local browser copy is retained as a migration/offline safety net."
      />

      <div className="space-y-6">
        <SectionCard title="Database connection">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={databaseStatus === "connected" ? "good" : databaseStatus === "error" ? "danger" : "neutral"}>
              {databaseStatus === "connected" ? "Connected" : databaseStatus === "error" ? "Error" : "Loading"}
            </Badge>
            <p className="text-sm text-stone-400">
              {databaseStatus === "connected"
                ? "Character changes are being saved to your Supabase account."
                : databaseStatus === "error"
                  ? "The app could not complete a database operation. Check the browser console and Supabase setup."
                  : "Connecting to your Supabase project..."}
            </p>
          </div>
        </SectionCard>

        <SectionCard title="Access mode" description="This controls whether restricted catalogue content can be granted to characters.">
          <div className="grid gap-4 md:grid-cols-2">
            <button onClick={() => setAccessMode("player")} className={`rounded-2xl border p-5 text-left ${accessMode === "player" ? "border-amber-500/70 bg-amber-500/10" : "border-stone-800 bg-stone-950/50 hover:bg-stone-900"}`}>
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-semibold">Player Mode</h2>
                {accessMode === "player" && <Badge tone="good">Active</Badge>}
              </div>
              <p className="mt-2 text-sm leading-6 text-stone-500">Normal content only. Items, spells and features marked as restricted cannot be added.</p>
            </button>

            <button onClick={() => setAccessMode("dm")} className={`rounded-2xl border p-5 text-left ${accessMode === "dm" ? "border-amber-500/70 bg-amber-500/10" : "border-stone-800 bg-stone-950/50 hover:bg-stone-900"}`}>
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-semibold">DM Mode</h2>
                {accessMode === "dm" && <Badge tone="warn">Active</Badge>}
              </div>
              <p className="mt-2 text-sm leading-6 text-stone-500">Adds a DM Grant option for restricted content. The setting is now saved to your Supabase profile.</p>
            </button>
          </div>
        </SectionCard>

        <SectionCard title="What is currently enforced">
          <div className="space-y-3 text-sm leading-6 text-stone-400">
            <p><strong className="text-stone-200">Spells:</strong> class, subclass/racial sources and maximum spell level are checked before normal addition.</p>
            <p><strong className="text-stone-200">Features:</strong> class, subclass, race/background source and required level are checked.</p>
            <p><strong className="text-stone-200">Items:</strong> optional level/class restrictions and explicit DM-restricted metadata are checked. Attunement is shown as information, not automatically enforced.</p>
            <p><strong className="text-stone-200">Overrides:</strong> DM Mode can grant individual exceptions without changing the normal content rules.</p>
            <p><strong className="text-stone-200">Security:</strong> Row Level Security limits character data to the signed-in user. The browser only uses the Supabase publishable key.</p>
          </div>
        </SectionCard>

        <SectionCard title="Demo data" description="This deletes your current characters from Supabase and recreates the built-in Ashe example. Use this only when you intentionally want to reset your character data.">
          <button onClick={() => { if (window.confirm("Delete all your database characters and restore the demo Ashe character?")) void resetDemoData(); }} className="rounded-xl border border-red-950 px-4 py-2.5 text-sm text-red-400 hover:bg-red-950/30">
            Reset Demo Data
          </button>
        </SectionCard>

        <div><Link href="/rules" className="text-sm font-semibold text-amber-400">Read the access hierarchy →</Link></div>
      </div>
    </div>
  );
}
