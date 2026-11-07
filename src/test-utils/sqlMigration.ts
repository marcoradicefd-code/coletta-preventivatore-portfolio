import { readdirSync, readFileSync } from 'node:fs'
import { perCodice } from '@/utils/impronta'
import { resolve } from 'node:path'

/**
 * Una migration letta per i test di contratto (L21): commenti `--` tolti (la
 * testata ha le query di verifica e il blocco di prova, che nominano anon
 * apposta), spazi compattati, minuscole. Le asserzioni lavorano su questo testo.
 */
export function leggiMigration(nome: string): string {
  return normalizzaSql(readFileSync(resolve(process.cwd(), 'supabase/migrations', nome), 'utf8'))
}

/** Lo stesso trattamento di `leggiMigration` su un testo SQL qualunque (il rollback in testata, N3). */
export function normalizzaSql(testo: string): string {
  return testo
    .split('\n')
    .map((riga) => riga.replace(/--.*$/, ''))
    .join('\n')
    .replace(/\s+/g, ' ')
    .replace(/\( /g, '(')
    .replace(/ \)/g, ')')
    .toLowerCase()
}

export interface Policy {
  nome: string
  tabella: string
  comando: string
  /** TUTTA la lista dei ruoli: `to authenticated, anon` dà due ruoli, non il primo. */
  ruoli: string[]
  /** Da `using`/`with check` al punto e virgola. */
  corpo: string
}

/**
 * Le policy di una migration. Legge anche la forma `as permissive` /
 * `as restrictive` (revisione L15-L21, S4: una policy scritta così sfuggiva al
 * parser e quindi a ogni asserzione). Chi la usa confronta il numero letto con
 * quello dei `create policy` del testo (`contaCreatePolicy`): una forma che il
 * parser non legge fa rosso invece di sparire.
 */
export function policiesDi(sql: string): Policy[] {
  return [...sql.matchAll(/create policy "([^"]+)" on public\.(\w+)(?: as (?:permissive|restrictive))? for (\w+) to (.+?) (using|with check)(.*?);/g)].map((m) => ({
    nome: m[1],
    tabella: m[2],
    comando: m[3],
    ruoli: m[4].split(',').map((r) => r.trim()),
    corpo: `${m[5]}${m[6]}`,
  }))
}

/** Il corpo di una funzione, da `create [or replace] function public.<nome>(` al `$$;` che la chiude. */
export function corpoFunzione(sql: string, nome: string): string {
  const inizio = sql.search(new RegExp(String.raw`create (or replace )?function public\.${nome}\(`))
  if (inizio < 0) throw new Error(`funzione ${nome} non trovata`)
  return sql.slice(inizio, sql.indexOf('$$;', sql.indexOf('$$', inizio) + 2) + 3)
}

/** Il ramo `if tg_op = 'insert' then … else` di una funzione di trigger, e il resto. */
export function ramiTrigger(corpo: string): { insert: string; update: string } {
  const i = corpo.indexOf("if tg_op = 'insert' then")
  const e = corpo.lastIndexOf(' else ')
  if (i < 0 || e < i) throw new Error('rami INSERT/UPDATE non trovati')
  return { insert: corpo.slice(i, e), update: corpo.slice(e) }
}

/** Quante `create policy` ci sono nel testo, in qualunque forma. */
export function contaCreatePolicy(sql: string): number {
  return (sql.match(/create policy /g) ?? []).length
}

/** Le migration dalla 0003 in poi (le prime due sono lo specchio iniziale della produzione). */
export function migrazioniDa0003(): string[] {
  return readdirSync(resolve(process.cwd(), 'supabase/migrations'))
    .filter((f) => /^\d{4}_.+\.sql$/.test(f) && Number(f.slice(0, 4)) >= 3)
    .sort(perCodice)
}
