"use client";

import { useEffect, useMemo, useState } from "react";
import type { AbilityKey, AbilityScores } from "../lib/types";

export type AbilityScoreMethod = "standard" | "pointBuy" | "manual" | "roll";

const ABILITIES: AbilityKey[] = ["str", "dex", "con", "int", "wis", "cha"];
const LABELS: Record<AbilityKey, string> = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
};

const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
const POINT_BUY_COST: Record<number, number> = {
  8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9,
};

function modifier(score: number) {
  const value = Math.floor((score - 10) / 2);
  return value >= 0 ? `+${value}` : String(value);
}

function rollAbilityScore() {
  const dice = Array.from({ length: 4 }, () => 1 + Math.floor(Math.random() * 6));
  dice.sort((a, b) => b - a);
  return dice.slice(0, 3).reduce((sum, die) => sum + die, 0);
}

function rollSet(): AbilityScores {
  const values = Array.from({ length: 6 }, rollAbilityScore);
  return ABILITIES.reduce((result, key, index) => ({ ...result, [key]: values[index] }), {} as AbilityScores);
}

function fromArray(values: number[]): AbilityScores {
  return ABILITIES.reduce((result, key, index) => ({ ...result, [key]: values[index] ?? 10 }), {} as AbilityScores);
}

export function applyAbilityBonuses(base: AbilityScores, bonuses: Partial<AbilityScores>): AbilityScores {
  return ABILITIES.reduce((result, key) => ({
    ...result,
    [key]: Math.min(20, Math.max(1, base[key] + (bonuses[key] ?? 0))),
  }), {} as AbilityScores);
}

export default function AbilityScoreBuilder({
  baseScores,
  onBaseScoresChange,
  raceBonuses = {},
  raceLabel,
  method,
  onMethodChange,
}: {
  baseScores: AbilityScores;
  onBaseScoresChange: (scores: AbilityScores) => void;
  raceBonuses?: Partial<AbilityScores>;
  raceLabel?: string;
  method: AbilityScoreMethod;
  onMethodChange: (method: AbilityScoreMethod) => void;
}) {
  const [rolls, setRolls] = useState<AbilityScores>(() => rollSet());

  const totals = useMemo(() => applyAbilityBonuses(baseScores, raceBonuses), [baseScores, raceBonuses]);
  const pointBuySpent = useMemo(
    () => ABILITIES.reduce((sum, key) => sum + (POINT_BUY_COST[baseScores[key]] ?? 0), 0),
    [baseScores],
  );

  useEffect(() => {
    if (method !== "roll") return;
    onBaseScoresChange(rolls);
  }, [method, rolls]);

  function setScore(key: AbilityKey, value: number) {
    const safe = Math.max(1, Math.min(method === "pointBuy" ? 15 : 20, Math.trunc(value || 0)));
    onBaseScoresChange({ ...baseScores, [key]: safe });
  }

  function setMethod(next: AbilityScoreMethod) {
    onMethodChange(next);
    if (next === "standard") onBaseScoresChange(fromArray(STANDARD_ARRAY));
    if (next === "pointBuy") onBaseScoresChange(fromArray([8, 8, 8, 8, 8, 8]));
    if (next === "roll") {
      const nextRolls = rollSet();
      setRolls(nextRolls);
      onBaseScoresChange(nextRolls);
    }
  }

  function reroll() {
    const next = rollSet();
    setRolls(next);
    onBaseScoresChange(next);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">Generation method</span>
          <select
            value={method}
            onChange={(event) => setMethod(event.target.value as AbilityScoreMethod)}
            className="mt-2 w-full min-w-56 rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-sm text-stone-100 outline-none focus:border-amber-400"
          >
            <option value="standard">Standard Array</option>
            <option value="pointBuy">Point Buy</option>
            <option value="manual">Manual</option>
            <option value="roll">Manual / Rolled (4d6, drop lowest)</option>
          </select>
        </label>
        {method === "pointBuy" && (
          <div className={`rounded-xl border px-4 py-2.5 text-sm ${pointBuySpent <= 27 ? "border-stone-700 text-stone-300" : "border-red-900 text-red-300"}`}>
            Point Buy: <strong>{pointBuySpent}/27</strong>
          </div>
        )}
        {method === "roll" && (
          <button type="button" onClick={reroll} className="rounded-xl border border-stone-700 px-4 py-2.5 text-sm text-stone-300 hover:bg-stone-800">
            Roll 6 new scores
          </button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ABILITIES.map((key) => {
          const bonus = raceBonuses[key] ?? 0;
          return (
            <div key={key} className="rounded-2xl border border-stone-800 bg-stone-950/60 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">{LABELS[key]}</span>
                <span className="text-xs text-stone-600">Mod {modifier(totals[key])}</span>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <input
                  type="number"
                  min={method === "pointBuy" ? 8 : 1}
                  max={method === "pointBuy" ? 15 : 20}
                  value={baseScores[key]}
                  disabled={method === "standard" || method === "roll"}
                  onChange={(event) => setScore(key, Number(event.target.value))}
                  className="w-20 rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-lg font-semibold text-stone-100 outline-none focus:border-amber-400 disabled:opacity-60"
                />
                <span className="text-stone-600">base</span>
                {bonus !== 0 && <span className="text-sm text-amber-300">{bonus > 0 ? `+${bonus}` : bonus} race</span>}
                <span className="ml-auto text-2xl font-bold text-stone-100">{totals[key]}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border border-stone-800 bg-stone-950/40 p-4 text-sm text-stone-400">
        <div className="font-semibold text-stone-200">
          Final scores{raceLabel ? ` • ${raceLabel}` : ""}
        </div>
        <p className="mt-1">
          The displayed totals include the selected race's 2014 ability score increases. Ability modifiers are calculated from the final score.
        </p>
        {method === "pointBuy" && <p className="mt-2 text-xs text-stone-600">2014 Point Buy: scores 8–15, with 27 points available.</p>}
        {method === "roll" && <p className="mt-2 text-xs text-stone-600">Each score is 4d6, dropping the lowest die, repeated six times.</p>}
      </div>
    </div>
  );
}
