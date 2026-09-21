# Supabase setup for Campaign Ledger

## 1. Install the client

From the project root:

```powershell
npm install @supabase/supabase-js
```

## 2. Add environment variables

Copy `.env.local.example` to `.env.local`.

Get the Project URL and **Publishable key** from Supabase Dashboard -> Connect, then put them in `.env.local`:

```text
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Do not put a Supabase secret key or service-role key in this file.

## 3. Seed the database

The initial schema has already been run in the Supabase SQL Editor.

Now open a new SQL Editor query and run:

`supabase/002_seed_and_permissions.sql`

This adds the remaining hierarchy metadata, spell subclass/race relationships, permissions, and the built-in Campaign Ledger catalogue.

## 4. Start the app

```powershell
npm run dev
```

Open http://localhost:3000.

Create an account or sign in.

## 5. Existing local character migration

On the first successful sign-in, if your account has no characters, the app looks for the existing localStorage character data.

If it finds it, it imports those characters into Supabase automatically. If it finds no local data, it imports the built-in Ashe demo character.

The localStorage copy is retained as a safety net.

## Security

The browser uses only the Supabase Publishable key. Character tables have Row Level Security policies that restrict rows to the signed-in user's `auth.uid()`.

Never put a Supabase Secret key or legacy service-role key in browser code or `.env.local` with a `NEXT_PUBLIC_` prefix.
