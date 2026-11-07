/**
 * Gli e2e che scrivono nel database (revisione L15-L21, S5). Il consenso
 * `E2E_DB_SCRITTURA=si` da solo non bastava: con `.env.local` puntato alla
 * produzione l'e2e creava clienti e consumava numeri della serie vera. Ora
 * servono tre cose, tutte:
 *  - `E2E_EMAIL` ed `E2E_PASSWORD` (in `.env.local`);
 *  - `E2E_DB_SCRITTURA=si` dall'ambiente della shell, messo a mano al lancio:
 *    da `.env.local` non si legge (`leggiEnvLocale` lo salta), così non resta
 *    acceso per sempre;
 *  - `VITE_SUPABASE_URL` del progetto coletta-dev. Il riferimento del progetto
 *    non è un segreto: è nell'URL pubblico dell'app.
 * Usato da `playwright.config.ts` e dagli spec; puro, quindi lo prova vitest.
 */
export const REF_COLETTA_DEV = 'uwpmkoghkwosdayavaxh'

/** Chiavi che `.env.local` non può accendere: il consenso a scrivere si dà a mano, al lancio. */
const SOLO_DALLA_SHELL = ['E2E_DB_SCRITTURA']

type Env = Record<string, string | undefined>

/** Il riferimento del progetto Supabase dall'URL (`https://<ref>.supabase.co`), o null. */
export function refProgetto(url: string | undefined): string | null {
  try {
    const host = new URL(url ?? '').hostname
    return host.endsWith('.supabase.co') ? host.slice(0, -'.supabase.co'.length) : null
  } catch {
    return null
  }
}

/** Perché un e2e che scrive NON deve partire; null = può partire. */
export function motivoSenzaScrittura(env: Env): string | null {
  if (!env.E2E_EMAIL || !env.E2E_PASSWORD) return 'Scrive nel database: servono E2E_EMAIL ed E2E_PASSWORD in .env.local'
  if (env.E2E_DB_SCRITTURA !== 'si') return 'Scrive nel database: serve E2E_DB_SCRITTURA=si dalla shell, al lancio (vedi testata)'
  const ref = refProgetto(env.VITE_SUPABASE_URL)
  if (ref !== REF_COLETTA_DEV) {
    return `Scrive nel database solo su coletta-dev (${REF_COLETTA_DEV}): VITE_SUPABASE_URL punta a ${ref ?? 'un URL non riconosciuto'}`
  }
  return null
}

/**
 * Le righe `CHIAVE=valore` di `.env.local` in `env`, senza sovrascrivere ciò
 * che c'è già (la shell vince) e senza le chiavi che si danno solo dalla
 * shell. Restituisce le chiavi saltate per questo motivo.
 */
export function leggiEnvLocale(testo: string, env: Env): string[] {
  const saltate: string[] = []
  for (const raw of testo.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    let val = line.slice(eq + 1).trim()
    if (val.length >= 2 && ((val[0] === '"' && val.endsWith('"')) || (val[0] === "'" && val.endsWith("'")))) {
      val = val.slice(1, -1)
    }
    if (SOLO_DALLA_SHELL.includes(key)) {
      saltate.push(key)
      continue
    }
    if (env[key] === undefined) env[key] = val
  }
  return saltate
}
