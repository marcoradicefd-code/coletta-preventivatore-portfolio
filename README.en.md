**English** · [Italiano](README.md)

# Coletta quote builder

Web app for **Coletta Ebanisteria Italiana**, a cabinet maker in Bari (Italy): staff put together a quote across five sections — **Kitchens, Furniture, Doors, Value-based project, Porcelain tiles** — and print it as a client-ready PDF.

**Live:** [preventivi.colettaebanisteria.it](https://preventivi.colettaebanisteria.it) (staff-only access)

> Designed and developed by **Marco Radice** for Luxury Academy, with Claude Code.
> This is a **public portfolio copy**: the original commit history (over 600 commits, April–October 2026), production data, audits and internal notes have been removed. Real price lists are not included.

## What it does

- **Email and password sign-in**, restricted to company domains, with sign-up, email confirmation and password recovery.
- **Price lists from Excel**: an administrator uploads `.xlsx` files, the app parses them (SheetJS) and stores them in Supabase.
- **Quote building** section by section, with **prices calculated in the browser**.
- **PDF printing** with company branding.
- **Database security**: Row Level Security and triggers on Supabase (see `supabase/migrations/`).

## Stack

| | |
|---|---|
| UI | React 19 · TypeScript · Vite · Tailwind CSS 4 · Motion |
| State and forms | Zustand · React Hook Form · Zod |
| Backend | Supabase (auth, Postgres with RLS) |
| Excel | SheetJS (xlsx) |
| Testing | Vitest + Testing Library · Playwright (e2e: sign-in, sign-up, password recovery, printing) |
| Hosting | Vercel |

## Structure

```
src/                  React app
e2e/                  Playwright end-to-end tests
supabase/migrations/  schema, RLS policies and triggers
supabase/templates/   auth emails
docs/                 code map and guides
```

## Running locally

```bash
npm ci
# create .env.local with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from your own Supabase project
npm run dev
```

Checks before a commit: `npx tsc -b && npm run lint && npm run build && npm test`.

The interface is in Italian. The `@colettaebanisteria.it` addresses in the tests are test fixtures.
