CAMPAIGN LEDGER - SUPABASE UPDATE

This package updates the existing src folder to use Supabase Auth and PostgreSQL for character persistence.

IMPORTANT:
1. Keep your existing package.json.
2. Run: npm install @supabase/supabase-js
3. Copy .env.local.example to .env.local and fill in the Supabase Project URL and Publishable key.
4. In Supabase SQL Editor, run supabase/002_seed_and_permissions.sql.
5. Replace your existing src folder with the src folder in this ZIP.
6. Start with npm run dev.
7. Create an account or sign in.

The first signed-in session with an empty database will migrate the existing localStorage characters automatically.

The current content catalogue is still bundled in src/lib/data.ts for the UI/rule engine, while the same catalogue is seeded into Supabase. Character ownership, character content, overrides, and the Player/DM setting are database-backed in this update. A later update can make the catalogue pages read directly from Supabase as well.
