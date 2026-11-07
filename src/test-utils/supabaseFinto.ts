/**
 * Un client Supabase finto per i test del database (L21): nessuna rete.
 *
 * Ogni `from(tabella)` o `rpc(nome, args)` apre una catena che registra i passi
 * (`select`, `eq`, `insert`…) e, quando la si attende, consuma la prossima
 * risposta della coda `risposte`, nell'ordine. Una risposta `Error` è la rete
 * giù, nella forma vera di postgrest-js 2.103: la catena NON rigetta, risolve
 * `{ data: null, error, status: 0 }` (verdetto sulla #96, osservazione 6; la
 * forma è quella di `PostgrestBuilder.then`, `node_modules/@supabase/postgrest-js`).
 * Coda vuota = errore del test, non un `null` silenzioso.
 *
 * Uso: `vi.mock('@/lib/supabase', async () => ({ supabase: (await
 * import('@/test-utils/supabaseFinto')).supabaseFinto.client, LISTINI_BUCKET:
 * 'Listini' }))`, poi `supabaseFinto.risposte.push(...)` nel test.
 */
export interface Chiamata {
  tabella?: string
  rpc?: string
  args?: unknown
  passi: [string, unknown[]][]
}

type Catena = PromiseLike<unknown> & Record<string, (...args: unknown[]) => Catena>

/** Cosa risponde postgrest-js 2.103 quando `fetch` fallisce: niente rigetto, `status: 0`. */
export function rispostaDiRete(e: Error) {
  return {
    success: false,
    error: { message: `${e.name}: ${e.message}`, details: e.stack ?? '', hint: '', code: '' },
    data: null,
    count: null,
    status: 0,
    statusText: '',
  }
}

export function creaSupabaseFinto() {
  const risposte: unknown[] = []
  const chiamate: Chiamata[] = []

  function catena(ch: Chiamata): Catena {
    const proxy: Catena = new Proxy({} as Catena, {
      get(_t, prop: string) {
        if (prop === 'then') {
          return (ok?: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => {
            if (risposte.length === 0) return Promise.reject(new Error('supabaseFinto: coda delle risposte vuota')).then(ok, ko)
            const r = risposte.shift()
            return Promise.resolve(r instanceof Error ? rispostaDiRete(r) : r).then(ok, ko)
          }
        }
        return (...args: unknown[]) => {
          ch.passi.push([prop, args])
          return proxy
        }
      },
    })
    return proxy
  }

  const client = {
    from: (tabella: string) => {
      const ch: Chiamata = { tabella, passi: [] }
      chiamate.push(ch)
      return catena(ch)
    },
    rpc: (nome: string, args?: unknown) => {
      const ch: Chiamata = { rpc: nome, args, passi: [] }
      chiamate.push(ch)
      return catena(ch)
    },
    storage: { from: () => ({}) },
  }

  return {
    client,
    risposte,
    chiamate,
    reset() {
      risposte.length = 0
      chiamate.length = 0
    },
    /** Il primo argomento del primo passo `nome` della chiamata `i`. */
    arg(i: number, nome: string): unknown {
      return chiamate[i]?.passi.find(([p]) => p === nome)?.[1][0]
    },
  }
}

export const supabaseFinto = creaSupabaseFinto()

/**
 * Un cliente finto, riconoscibile come finto: dominio `example.test`
 * (riservato, RFC 2606), telefono di zeri.
 */
export const EMAIL_FINTA = 'prova@example.test'
export const TELEFONO_FINTO = '000 0000000'
export const RAGIONE_SOCIALE_FINTA = 'Cliente Prova Srl'
/** Ciò che i presidi dei log cercano: email, telefono e ragione sociale finti. */
export const DATI_FINTI = [EMAIL_FINTA, TELEFONO_FINTO, RAGIONE_SOCIALE_FINTA]

export function clienteFinto(over: Record<string, unknown> = {}) {
  return {
    id: 'c-0001',
    codice_gestionale: null,
    ragione_sociale: RAGIONE_SOCIALE_FINTA,
    nome: null,
    cognome: null,
    telefono: TELEFONO_FINTO,
    email: EMAIL_FINTA,
    indirizzo: 'Via di Prova 1',
    cap: '00000',
    localita: 'Paese di Prova',
    provincia: 'XX',
    partita_iva: null,
    note: null,
    updated_at: '2026-10-13T10:00:00.000000+00:00',
    ...over,
  }
}

/**
 * La risposta di `nuovo_numero_preventivo` (0005, S11): anno e numero li sceglie
 * il server. `.single()` la riceve come un oggetto.
 */
export function numeroDalServer(numero: number, anno = 2026) {
  return { data: { anno, numero }, error: null }
}
