# Preventivatore Coletta

Web app per **Coletta Ebanisteria Italiana** (Bari): chi lavora in azienda compone un preventivo su cinque sezioni — **Cucine, Arredi, Porte, Progetto a valore, Gres** — e lo stampa in un PDF pronto per il cliente.

**Online:** [preventivi.colettaebanisteria.it](https://preventivi.colettaebanisteria.it) (accesso riservato al personale)

> Progetto progettato e sviluppato da **Marco Radice** per Luxury Academy, con Claude Code.
> Questa è una **copia pubblica per portfolio**: lo storico dei commit originale (oltre 600 commit, aprile–ottobre 2026), i dati di produzione, gli audit e le note interne sono stati rimossi. I listini reali non sono inclusi.

## Cosa fa

- **Accesso con email e password**, limitato ai domini aziendali. Comprende registrazione, conferma via email e recupero della password.
- **Listini da Excel**: un amministratore carica i file `.xlsx` e l'app li legge (SheetJS) e li salva su Supabase.
- **Composizione del preventivo** sezione per sezione, con **calcolo dei prezzi nel browser**.
- **Stampa in PDF** con grafica aziendale.
- **Sicurezza sul database**: Row Level Security e trigger su Supabase (vedi `supabase/migrations/`).

## Stack

| | |
|---|---|
| Interfaccia | React 19 · TypeScript · Vite · Tailwind CSS 4 · Motion |
| Stato e form | Zustand · React Hook Form · Zod |
| Backend | Supabase (autenticazione, database Postgres con RLS) |
| Excel | SheetJS (xlsx) |
| Test | Vitest + Testing Library · Playwright (e2e: accesso, registrazione, recupero password, stampa) |
| Deploy | Vercel |

## Struttura

```
src/                  app React
e2e/                  test end-to-end Playwright
supabase/migrations/  schema, policy RLS e trigger
supabase/templates/   email di autenticazione
docs/                 mappa del codice e guide
```

## Avvio in locale

```bash
npm ci
# crea .env.local con VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY di un tuo progetto Supabase
npm run dev
```

Controlli prima di un commit: `npx tsc -b && npm run lint && npm run build && npm test`.

Le email `@colettaebanisteria.it` che compaiono nei test sono indirizzi di prova.
