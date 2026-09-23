"use client";

import type { CharacterClassLevel, AbilityScores, SubclassDefinition } from "../lib/types";
import { getMulticlassPrerequisites } from "../lib/rules";

type Props = {
  totalLevel: number;
  primaryClass: string;
  primarySubclass: string;
  classLevels?: CharacterClassLevel[];
  classes: string[];
  subclasses: Array<SubclassDefinition & { description?: string; source?: string }>;
  abilities: AbilityScores;
  onChange: (levels: CharacterClassLevel[] | undefined) => void;
};

function prerequisiteText(className: string, abilities: AbilityScores) {
  if (className === "Fighter") {
    const ok = abilities.str >= 13 || abilities.dex >= 13;
    return ok ? "" : "Requires STR 13 or DEX 13";
  }
  const requirements = getMulticlassPrerequisites(className);
  const missing = Object.entries(requirements)
    .filter(([ability, minimum]) => abilities[ability as keyof AbilityScores] < minimum)
    .map(([ability, minimum]) => ability.toUpperCase() + " " + minimum);
  return missing.length ? "Requires " + missing.join(" and ") : "";
}

export default function MulticlassEditor({
  totalLevel,
  primaryClass,
  primarySubclass,
  classLevels,
  classes,
  subclasses,
  abilities,
  onChange,
}: Props) {
  const secondary = (classLevels ?? []).slice(1);
  const secondaryTotal = secondary.reduce((sum, entry) => sum + entry.level, 0);
  const primaryLevel = totalLevel - secondaryTotal;
  const canAdd = primaryLevel > 1 && secondary.length < 3 && totalLevel - secondaryTotal - 1 >= 1;

  function updateSecondary(index: number, patch: Partial<CharacterClassLevel>) {
    const next = secondary.map((entry, entryIndex) => entryIndex === index ? { ...entry, ...patch } : entry);
    const usedByOthers = next.reduce((sum, entry, entryIndex) => entryIndex === index ? sum : sum + entry.level, 0);
    const maxLevel = Math.max(1, totalLevel - usedByOthers - 1);
    next[index] = { ...next[index], level: Math.max(1, Math.min(maxLevel, next[index].level)) };
    onChange([
      { className: primaryClass, level: totalLevel - next.reduce((sum, entry) => sum + entry.level, 0), subclass: primarySubclass || undefined },
      ...next,
    ]);
  }

  function addSecondary() {
    const available = classes.find((className) => className !== primaryClass && !secondary.some((entry) => entry.className === className));
    if (!available || !canAdd) return;
    onChange([
      { className: primaryClass, level: primaryLevel - 1, subclass: primarySubclass || undefined },
      ...secondary,
      { className: available, level: 1, subclass: undefined },
    ]);
  }

  function removeSecondary(index: number) {
    const next = secondary.filter((_, entryIndex) => entryIndex !== index);
    onChange(next.length
      ? [{ className: primaryClass, level: totalLevel - next.reduce((sum, entry) => sum + entry.level, 0), subclass: primarySubclass || undefined }, ...next]
      : undefined);
  }

  const rows = [
    { className: primaryClass, level: primaryLevel, subclass: primarySubclass, primary: true },
    ...secondary.map((entry, index) => ({ ...entry, primary: false, index })),
  ];

  return (
    <section className="rounded-2xl border border-stone-800 bg-stone-950/60 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">Multiclassing</h3>
          <p className="mt-1 text-sm leading-6 text-stone-500">
            Total character level is {totalLevel}. Add class levels here without creating a second character level.
          </p>
        </div>
        <button
          type="button"
          disabled={!canAdd}
          onClick={addSecondary}
          className="rounded-xl border border-amber-700 px-4 py-2 text-sm text-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
        >
          + Add class
        </button>
      </div>

      <div className="mt-4 space-y-3">
        {rows.map((entry) => {
          const requirement = prerequisiteText(entry.className, abilities);
          const options = subclasses.filter((subclass) => subclass.className === entry.className);
          return (
            <div key={(entry as { className: string }).className + ":" + (entry as { index?: number }).index} className="rounded-xl border border-stone-800 p-4">
              <div className="grid gap-3 sm:grid-cols-[1fr_120px_1fr_auto] sm:items-end">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-stone-500">{entry.primary ? "Primary class" : "Additional class"}</div>
                  <div className="mt-2 font-medium text-stone-100">{entry.className}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-stone-500">Class level</div>
                  <div className="mt-2 rounded-xl border border-stone-800 px-3 py-2.5 text-sm text-stone-200">{entry.level}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-stone-500">Subclass</div>
                  {entry.primary ? (
                    <div className="mt-2 rounded-xl border border-stone-800 px-3 py-2.5 text-sm text-stone-400">{entry.subclass || "None yet"}</div>
                  ) : (
                    <select
                      value={entry.subclass ?? ""}
                      onChange={(event) => updateSecondary((entry as { index: number }).index, { subclass: event.target.value || undefined })}
                      className="mt-2 w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-sm text-stone-100"
                    >
                      <option value="">Choose when unlocked...</option>
                      {options.map((subclass) => <option key={subclass.id} value={subclass.name}>{subclass.name}</option>)}
                    </select>
                  )}
                </div>
                {!entry.primary && (
                  <button type="button" onClick={() => removeSecondary((entry as { index: number }).index)} className="rounded-xl border border-stone-700 px-3 py-2.5 text-sm text-stone-400 hover:bg-stone-900">
                    Remove
                  </button>
                )}
              </div>
              {requirement && !entry.primary && <p className="mt-3 text-xs text-amber-400">{requirement}</p>}
            </div>
          );
        })}
      </div>

      {secondary.length > 0 && (
        <p className="mt-4 text-xs leading-5 text-stone-500">
          Multiclass prerequisites are checked when the character is saved. Secondary classes gain their class-level features, while the primary class remains the builder's starting class.
        </p>
      )}
    </section>
  );
}
