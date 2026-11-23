# NESTA — Couple Finance Platform

**Tagline:** Separate Money. Shared Life.

NESTA is a privacy-first couple finance platform built with Next.js, Tailwind CSS, and Supabase (PostgreSQL + Auth + Row Level Security).

## Architecture & Privacy Model

- **Strict Data Isolation:** Personal financial data (`personal_vaults`) is enforced at the PostgreSQL layer with `auth.uid() = user_id`. It is never joined with `couple_id` or exposed to a partner.
- **Shared Workspace Scoping:** Shared expenses, budgets, bills, settlements, and savings goals are scoped to `couple_id IN (SELECT couple_id FROM couple_members WHERE user_id = auth.uid())`.
- **Automatic Demo Mode:** If `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are not set, NESTA runs in full interactive Demo Mode with Indonesian Rupiah (IDR) sample data.

## Setup & Deployment (Vercel + Supabase)

1. Create a Supabase project and run `supabase/schema.sql` in the SQL Editor.
2. Copy `.env.example` to `.env.local` and fill in your Supabase URL and Anon Key.
3. Run `npm install && npm run dev` locally, or push to GitHub and import into Vercel.
