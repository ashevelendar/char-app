# 5e.tools catalogue design

The existing character system stays intact. This migration adds the pieces needed for a real 5e.tools importer.

## Core approach

`5e.tools JSON -> importer -> Supabase catalogue -> character manager`

The database keeps two representations:

1. Normalised fields used by the UI and filters.
2. `raw_data` containing the original structured 5e.tools object.

This avoids throwing away nested information such as spell entries, higher-level entries, material component metadata, class progression, prerequisite structures, and other 5e.tools-specific fields.

## Edition separation

Every catalogue entity now has:

- `edition`: `2014`, `2024`, or `custom`
- `source_code`: the 5e.tools source identifier, such as `PHB`, `XGE`, `TCE`, `XPHB`
- `content_key`: a stable importer-generated identity
- `raw_data`: original JSON object

The app must filter by edition before presenting catalogue choices. This prevents 2014 and 2024 versions of the same named content from being accidentally treated as one record.

## Why content_key exists

Names are not unique enough. A spell, item, subclass, or feature can be reprinted or revised under another source. The app therefore should never use the display name as its database identity.

Recommended importer key format:

`<edition>:<entity-type>:<source>:<name>`

Examples:

`2014:spell:PHB:Fireball`
`2014:spell:XGE:Absorb Elements`
`2024:spell:XPHB:Fireball`

The importer can later add a more precise internal key when 5e.tools provides one.

## Spell fields

The existing searchable columns remain available:

- name
- level
- school
- casting_time
- range
- duration
- components
- material_component
- description
- higher_levels
- concentration
- ritual
- source/source_code
- page

`raw_data` preserves the full original object, including arrays such as damageInflict, savingThrow, miscTags, areaTags, affectsCreatureType, entries, entriesHigherLevel, and other metadata.

5e.tools spell JSON demonstrably uses nested `time`, `range`, `components`, `duration`, `entries`, and optional metadata fields, so flattening everything into text would lose useful structure. citeturn0search3turn0search6

## Class/subclass/feature model

The relational links already in the database remain:

- class -> features
- subclass -> features
- race -> features
- background -> features
- spell -> class

The imported 5e.tools object is retained in `raw_data` so we can later expose detailed progression, proficiencies, equipment choices, spell progression, subclass progression, and similar rules data without another schema rewrite.

## Items

The existing `weight` and `value` columns should remain text because 5e.tools-style values are not always numeric. Examples can contain units and text such as `3 lb`, `15 gp`, or `Priceless`.

## Import bookkeeping

`content_imports` records each imported source file. This lets us answer:

- Which source files are installed?
- Which edition do they belong to?
- How many records were imported?
- Did an import partially fail?
- When was a source last imported?

## What this migration does not do

It does not import the actual 5e.tools catalogue yet.

That is deliberate. The next step is an importer that reads the source repository's index files and entity JSON, converts the structured records, and upserts them using `content_key`.

The current 5e.tools source exposes an index for spell files and separate JSON files per source, rather than one monolithic spell file. citeturn0search0turn0search2
