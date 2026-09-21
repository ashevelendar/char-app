#!/usr/bin/env node
/**
 * Offline smoke test for the catalogue importer.
 * Does not require Supabase credentials or internet access.
 */

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const toolsDir = resolve(fileURLToPath(new URL(".", import.meta.url)));
const importer = resolve(toolsDir, "5etools-importer.mjs");
const fixture = resolve(toolsDir, "fixtures", "spell-sample.json");
const subraceFixture = resolve(toolsDir, "fixtures", "subrace-same-name-different-parent.json");
const itemFixture = resolve(toolsDir, "fixtures", "item-sample.json");
const featFixture = resolve(toolsDir, "fixtures", "feat-sample.json");

function run(args, options = {}) {
  const result = spawnSync(process.execPath, [importer, ...args], {
    encoding: "utf8",
    ...options,
  });
  if ((result.status ?? 1) !== 0) {
    process.stdout.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    process.exit(result.status ?? 1);
  }
  return result;
}

run([
  "--entity", "spells", "--edition", "2014", "--sources", "PHB",
  "--source-file", fixture, "--dry-run",
], { stdio: "inherit" });

run([
  "--entity", "subraces", "--edition", "2014", "--sources", "ERLW",
  "--source-file", subraceFixture, "--dry-run",
], { stdio: "inherit" });

run([
  "--entity", "items", "--edition", "2014", "--sources", "PHB",
  "--source-file", itemFixture, "--dry-run",
], { stdio: "inherit" });

run([
  "--entity", "feats", "--edition", "2014", "--sources", "PHB",
  "--source-file", featFixture, "--dry-run",
], { stdio: "inherit" });

// v1.17 regression check: canonical 5e.tools spell/class lookup adds class
// associations which are not present in the raw spell record.
const canonicalRoot = resolve(tmpdir(), `dnd-importer-v117-${process.pid}`);
const spellDir = resolve(canonicalRoot, "data/spells");
await mkdir(spellDir, { recursive: true });
const spellLookupFixture = JSON.parse(await readFile(resolve(toolsDir, "fixtures", "spell-source-lookup-test.json"), "utf8"));
await writeFile(resolve(spellDir, "index.json"), JSON.stringify({ PHB: "spells-phb.json" }), "utf8");
await writeFile(resolve(spellDir, "spells-phb.json"), JSON.stringify(spellLookupFixture), "utf8");
await writeFile(
  resolve(spellDir, "sources.json"),
  JSON.stringify({
    PHB: {
      "Test Ember": {
        class: [
          { name: "Cleric", source: "PHB" },
          { name: "Druid", source: "PHB" },
        ],
      },
    },
  }),
  "utf8",
);

const lookupResult = run([
  "--entity", "spells", "--edition", "2014", "--sources", "PHB",
  "--data-dir", canonicalRoot, "--dry-run",
]);

if (!(lookupResult.stdout ?? "").includes('"Cleric (PHB)"') || !(lookupResult.stdout ?? "").includes('"Druid (PHB)"')) {
  console.error(lookupResult.stdout ?? "");
  console.error("v1.17 canonical spell/class lookup regression check failed.");
  process.exit(1);
}
console.log("v1.17 canonical spell/class lookup regression check passed.");

// v1.17 CLI regression check: --help must not run the importer.
const helpResult = run(["--help"]);
if (!(helpResult.stdout ?? "").includes("Usage:") || (helpResult.stdout ?? "").includes("Import complete:")) {
  console.error(helpResult.stdout ?? "");
  console.error("v1.17 --help regression check failed.");
  process.exit(1);
}
console.log("v1.17 --help regression check passed.");

// Source-level checks retained from earlier importer versions.
const importerText = await readFile(new URL("./5etools-importer.mjs", import.meta.url), "utf8");
if (!importerText.includes("canonical class file list") || !importerText.includes("response.status === 403")) {
  throw new Error("v1.13 API fallback regression check failed");
}
console.log("v1.13 API fallback regression check passed.");
console.log("v1.15 item importer smoke test passed.");
console.log("v1.16 feat importer smoke test passed.");

await rm(canonicalRoot, { recursive: true, force: true });
