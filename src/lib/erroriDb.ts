/**
 * Esito di un'operazione sul database: il dato, o un messaggio già pronto per
 * la UI. Il messaggio non contiene MAI dati personali: si costruisce dal solo
 * codice dell'errore, non da `message` né da `details` di PostgREST, che possono
 * citare i valori della riga (es. «Key (codice_gestionale)=(…) already exists»).
 * `codice` è quello di Postgres o PostgREST (mai un testo con dati), `rete` dice
 * che la richiesta non è arrivata: la UI offre «Riprova».
 */
export type Esito<T> =
  | { ok: true; dato: T }
  | { ok: false; errore: string; conflitto?: boolean; rete?: boolean; codice?: string; status?: number }

/** I codici che l'app distingue; tutto il resto è «errore del database». */
const MESSAGGI: Record<string, string> = {
  // RLS o privilegio mancante: utente senza profilo, o operazione non sua.
  '42501': 'Operazione non consentita per questo account.',
  // Unicità: due salvataggi insieme, o un codice gestionale già usato.
  '23505': 'Un altro salvataggio è arrivato prima, o il codice esiste già. Ricarica e riprova.',
  // FK: scrivendo un preventivo, il cliente collegato non c'è più (eliminato
  // da un admin). Eliminando un cliente con preventivi il messaggio è un altro:
  // lo passa `eliminaCliente`.
  '23503': 'Il cliente collegato al preventivo non esiste più: scegline un altro e salva di nuovo.',
  // Check e trigger (numero non assegnato, numero che cambia, stato non ammesso).
  '23514': 'Dati non validi per il database.',
  '22023': 'Dati non validi per il database.',
  // Tabella o funzione assenti: la migration non è ancora applicata.
  '42P01': 'Archivio non disponibile: il database non è ancora pronto.',
  '42883': 'Archivio non disponibile: il database non è ancora pronto.',
  PGRST202: 'Archivio non disponibile: il database non è ancora pronto.',
  PGRST205: 'Archivio non disponibile: il database non è ancora pronto.',
  // JWT scaduto o non valido.
  PGRST301: 'Sessione scaduta: esci e accedi di nuovo.',
  PGRST303: 'Sessione scaduta: esci e accedi di nuovo.',
}

export const MSG_ERRORE_DB = 'Errore del database. Riprova.'
export const MSG_ERRORE_RETE = 'Errore di rete: il server non ha risposto. Verifica la connessione e riprova.'

/** Messaggi propri di una chiamata, per codice (es. il 23503 di `eliminaCliente`). */
export type MessaggiPer = Partial<Record<string, string>>

function codiceDi(errore: unknown): string | undefined {
  const codice = typeof errore === 'object' && errore !== null ? (errore as { code?: unknown }).code : undefined
  return typeof codice === 'string' && codice ? codice : undefined
}

/**
 * Il messaggio per la UI di un errore Supabase (`{ code }`). Mai il testo
 * dell'errore. postgrest-js 2.103 non rigetta sugli errori di rete: risponde
 * `{ error, status: 0 }` (verdetto sulla #96, osservazione 6), quindi è lo
 * status a dire «rete». Un TypeError resta per un `fetch` che rigetta davvero.
 */
export function messaggioErroreDb(errore: unknown, status?: number, propri?: MessaggiPer): string {
  if (status === 0 || errore instanceof TypeError) return MSG_ERRORE_RETE
  const codice = codiceDi(errore)
  return (codice && (propri?.[codice] ?? MESSAGGI[codice])) || MSG_ERRORE_DB
}

/** L'esito di un errore, con `rete` e `codice` per chi decide cosa offrire. */
export function esitoErrore(errore: unknown, status?: number, propri?: MessaggiPer): Esito<never> {
  const rete = status === 0 || errore instanceof TypeError
  const codice = rete ? undefined : codiceDi(errore)
  return {
    ok: false,
    errore: messaggioErroreDb(errore, status, propri),
    ...(rete ? { rete: true } : {}),
    ...(codice ? { codice } : {}),
    // Lo status HTTP di un errore (DB-1 e DB-2 del verdetto sulla #99): un 5xx o un 429 non hanno sempre un codice.
    ...(status !== undefined && status >= 400 ? { status } : {}),
  }
}

/**
 * Esegue una chiamata a Supabase e la riduce a un `Esito`. Non rigetta mai e non
 * logga niente: le righe dei clienti non devono finire nella console, in
 * sviluppo come in produzione (presidio in `clientiDb.test.ts`).
 */
export async function esegui<T>(
  chiamata: () => PromiseLike<{ data: T | null; error: unknown; status?: number }>,
  vuoto?: string,
  propri?: MessaggiPer
): Promise<Esito<T>> {
  try {
    const { data, error, status } = await chiamata()
    if (error) return esitoErrore(error, status, propri)
    if (data === null) return { ok: false, errore: vuoto ?? MSG_ERRORE_DB }
    return { ok: true, dato: data }
  } catch (e) {
    return esitoErrore(e)
  }
}

/**
 * Come `esegui`, per un UPDATE con optimistic lock (`.eq('updated_at', …)` e
 * `.maybeSingle()`): nessuna riga tornata non è un errore del database ma un
 * conflitto (qualcuno ha salvato nel frattempo, o la riga non è più
 * accessibile). Niente sovrascrittura: decide l'utente.
 */
export async function eseguiConLock<T>(
  chiamata: () => PromiseLike<{ data: T | null; error: unknown; status?: number }>,
  msgConflitto: string,
  propri?: MessaggiPer
): Promise<Esito<T>> {
  try {
    const { data, error, status } = await chiamata()
    if (error) return esitoErrore(error, status, propri)
    return data ? { ok: true, dato: data } : { ok: false, errore: msgConflitto, conflitto: true }
  } catch (e) {
    return esitoErrore(e)
  }
}
