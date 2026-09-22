# 5e.tools importer

This importer runs as a local/server-side Node script, not in the browser. The Supabase secret key therefore never reaches Next.js.

## v1.17 catalogue support

The importer supports:

- `spells`
- `classes`
- `subclasses`
- `races`
- `subraces`
- `backgrounds`
- `features` (class and subclass features)
- `feats` (feat catalogue)
- `optionalfeatures` (Fighting Styles, Maneuvers, Eldritch Invocations, and other selectable options)
- `items`

The v1.17 changes are: the spell importer now reads 5e.tools canonical class-list associations from `data/spells/sources.json`, matches classes by name + source when available, excludes optional/variant class lists from the main `spell_classes` table, reports spell/class diagnostics, and refuses to delete existing spell links when class-link resolution is incomplete. `--help` is also handled before any import work.

The v1.15 changes are: 2014 imports use the dedicated `5etools-2014-src` repository, `--sources all` discovers every source code available for the selected entity/edition, and race data now has a first-class `subraces` import with a foreign key to its parent race. Duplicate transformed records now ignore `raw_data` differences while still rejecting conflicts in imported fields or relationship metadata.

## Editions

`--edition 2014` uses `5etools-mirror-3/5etools-2014-src`.

`--edition 2024` uses `5etools-mirror-3/5etools-src`.

A custom `FIVEETOOLS_BASE_URL` can override the raw GitHub base for either edition.

## Source selection

Use a single source, e.g. `--sources PHB`, or let the importer discover all source codes with:

```powershell
node --env-file=tools/.env.importer tools/5etools-importer.mjs --entity races --edition 2014 --sources all --dry-run
```

The same `--sources all` mechanism works for spells, classes, subclasses, subraces, backgrounds, features, items, and feats.

## 2014 race catalogue

The 2014 `data/races.json` contains race and subrace arrays. The importer keeps them separate:

- `races` imports base race records.
- `subraces` imports named subraces and resolves `raceName` + `raceSource` to the parent race UUID.

Unnamed `subrace` records in the source are skipped because they are template/version metadata rather than selectable subraces.

## Suggested 2014 import order

Run the catalogue in this order so parent relationships and spell/class links resolve cleanly:

1. `classes --sources all`
2. `races --sources all`
3. `subraces --sources all`
4. `backgrounds --sources all`
5. `subclasses --sources all`
6. `spells --sources all`
7. `features --sources all`
8. `items --sources all`
9. `optionalfeatures --sources all`
10. `feats --sources all`

All imports are upserts on `content_key`, so rerunning them is safe. Rerun spells after the full class catalogue is present so class links are rebuilt against all imported classes. The importer now uses the canonical `data/spells/sources.json` mapping for normal class spell lists; optional/variant spell-list metadata remains in each spell's `raw_data` for a future optional-feature table.

## Example commands

```powershell
node --env-file=tools/.env.importer tools/5etools-importer.mjs --entity classes --edition 2014 --sources all --dry-run
node --env-file=tools/.env.importer tools/5etools-importer.mjs --entity races --edition 2014 --sources all --dry-run
node --env-file=tools/.env.importer tools/5etools-importer.mjs --entity subraces --edition 2014 --sources all --dry-run
node --env-file=tools/.env.importer tools/5etools-importer.mjs --entity backgrounds --edition 2014 --sources all --dry-run
node --env-file=tools/.env.importer tools/5etools-importer.mjs --entity subclasses --edition 2014 --sources all --dry-run
node --env-file=tools/.env.importer tools/5etools-importer.mjs --entity spells --edition 2014 --sources all --dry-run
node --env-file=tools/.env.importer tools/5etools-importer.mjs --entity features --edition 2014 --sources all --dry-run

node --env-file=tools/.env.importer tools/5etools-importer.mjs --entity optionalfeatures --edition 2014 --sources all --dry-run
node --env-file=tools/.env.importer tools/5etools-importer.mjs --entity feats --edition 2014 --sources all --dry-run
node --env-file=tools/.env.importer tools/5etools-importer.mjs --entity items --edition 2014 --sources all --dry-run
```

After each dry run looks correct, remove `--dry-run` to write to Supabase.

## Fixture testing

`--source-file` can be used with one source or with `--sources all` when the fixture contains several source codes.

## Database migration

Run `supabase/004_subraces.sql` once after the existing 003 migration. It adds the `public.subraces` table, parent-race foreign key, indexes, and authenticated read access. No existing character/catalogue table is recreated.

## Stable identity

Imported records use:

```text
<edition>:<entity>:<source>:<slugified name>
```

Examples:

```text
2014:class:phb:druid
2014:subclass:phb:circle-of-the-moon
2014:race:phb:dwarf
2014:subrace:phb:hill
2014:background:phb:acolyte
2014:spell:phb:fireball
```

## Secrets

Create `tools/.env.importer` from the example and keep the Supabase secret key local. Never put it in `.env.local`, `NEXT_PUBLIC_*`, or GitHub.

## Current phase boundary

v1.16 adds the 5e.tools feat catalogue importer. Feats are read from `data/feats.json`, stored in `feats`, and keyed by edition/source/name. Prerequisites, ability-score choices, and additional spell metadata are preserved as JSONB, while the complete original record remains in `raw_data`.


### v1.17

Spell/class associations now use the canonical 5e.tools `data/spells/sources.json` lookup for both editions. The importer reports how many normal class-list references were found and resolved, and will not delete existing `spell_classes` rows if any required class reference is unresolved. `--help` now exits cleanly without running an import.

### v1.16

2014 feat imports are supported from the top-level `data/feats.json` catalogue. A dedicated `006_feats.sql` migration creates the catalogue table and stable content-key index.

### v1.15

Class file discovery is cached and falls back to the canonical 5e.tools class filenames when the GitHub Contents API returns HTTP 403/429 rate-limit responses. Item imports are supported from the top-level 2014 `data/items.json` catalogue.
