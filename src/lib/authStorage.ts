// Storage della sessione Supabase + flag "Ricordami su questo dispositivo".
//
// L'opzione `storage` del client Supabase si fissa alla creazione del client,
// ma la scelta "Ricordami" avviene al login (dopo). Per questo l'adapter è un
// ROUTER DINAMICO: fissato a createClient, ma ad ogni operazione legge un flag
// persistente e instrada su localStorage (remember ON) o sessionStorage (OFF).
//
// Questo modulo è PURO: non importa il client Supabase né le env var, così è
// testabile in isolamento. Nota: è diverso dal flag "Ricorda preventivo"
// (quoteStore, chiave coletta-quote-v1), che riguarda i DATI del preventivo,
// non la sessione di login.

const REMEMBER_KEY = 'coletta-auth-remember'
const MIGRATION_KEY = 'coletta-auth-migrated'
/** Ring buffer dei crash scritto da `ErrorBoundary`: si cancella al logout. */
export const ERROR_LOG_KEY = 'coletta-error-log'

/** True se l'utente ha scelto di restare connesso tra le sessioni del browser. */
export function isRememberSession(): boolean {
  try {
    return localStorage.getItem(REMEMBER_KEY) === 'true'
  } catch {
    return false
  }
}

/**
 * Imposta la preferenza "Ricordami". Va chiamata PRIMA del login così la
 * sessione che Supabase sta per scrivere finisce nello store giusto. La
 * preferenza vive sempre in localStorage (sopravvive alla chiusura del browser)
 * anche quando è `false`, così al boot l'adapter sa dove cercare la sessione.
 */
export function setRememberSession(remember: boolean): void {
  try {
    localStorage.setItem(REMEMBER_KEY, remember ? 'true' : 'false')
  } catch {
    /* storage non disponibile: no-op */
  }
}

/** Store su cui vive la sessione, in base al flag. */
function backingStore(): Storage {
  return isRememberSession() ? localStorage : sessionStorage
}

/** La chiave del code_verifier PKCE di auth-js: `<storageKey>-code-verifier`. */
const SUFFISSO_VERIFIER = '-code-verifier'

/**
 * Il code_verifier PKCE (L26) sta sempre in localStorage: il link dell'email si
 * apre in una scheda nuova, e sessionStorage è per scheda. Non è una sessione:
 * senza il `code` dell'email non vale niente, auth-js lo toglie dopo lo
 * scambio, e il logout lo toglie con le altre chiavi `sb-*`.
 */
function storePer(key: string): Storage {
  return key.endsWith(SUFFISSO_VERIFIER) ? localStorage : backingStore()
}

/**
 * Il code_verifier salvato in questo browser, se c'è. Per il recupero password
 * auth-js lo salva come `verifier/PASSWORD_RECOVERY`, in JSON
 * (`getCodeChallengeAndMethod` e `setItemAsync` in
 * `@supabase/auth-js/dist/module/lib/helpers.js`): si legge come `getItemAsync`.
 */
export function verifierSalvato(): string | null {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k?.startsWith('sb-') || !k.endsWith(SUFFISSO_VERIFIER)) continue
      const v = localStorage.getItem(k)
      try {
        return v === null ? null : String(JSON.parse(v))
      } catch {
        return v
      }
    }
  } catch {
    /* storage non disponibile */
  }
  return null
}

/**
 * Storage adapter custom per `createClient(..., { auth: { storage } })`.
 * Instrada dinamicamente get/set/remove sullo store scelto dal flag, senza
 * dover ricreare il client quando l'utente cambia la preferenza al login.
 */
export const authStorageAdapter = {
  getItem: (key: string): string | null => {
    try {
      return storePer(key).getItem(key)
    } catch {
      return null
    }
  },
  setItem: (key: string, value: string): void => {
    try {
      storePer(key).setItem(key, value)
    } catch {
      /* no-op */
    }
  },
  removeItem: (key: string): void => {
    try {
      storePer(key).removeItem(key)
    } catch {
      /* no-op */
    }
  },
}

/**
 * Recupero password in corso (L26): segnato nello STESSO store della sessione
 * (passa dall'adapter), così vive quanto lei. Un F5 sulla pagina di recupero
 * lo ritrova e l'app non si apre; con Ricordami spento sparisce col browser
 * chiuso, insieme alla sessione di recupero.
 */
const RECUPERO_KEY = 'coletta-auth-recupero'

export function segnaRecupero(): void {
  authStorageAdapter.setItem(RECUPERO_KEY, '1')
}

export function isRecuperoInCorso(): boolean {
  return authStorageAdapter.getItem(RECUPERO_KEY) === '1'
}

/** Da entrambi gli store: il flag Ricordami può essere cambiato nel frattempo. */
export function togliRecupero(): void {
  try {
    localStorage.removeItem(RECUPERO_KEY)
    sessionStorage.removeItem(RECUPERO_KEY)
  } catch {
    /* storage non disponibile: no-op */
  }
}

/** Rimuove tutte le chiavi token Supabase (prefisso `sb-`) da uno Storage. */
function removeSupabaseKeys(store: Storage): void {
  const toRemove: string[] = []
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i)
    if (k && k.startsWith('sb-')) toRemove.push(k)
  }
  for (const k of toRemove) store.removeItem(k)
}

/**
 * Logout: rimuove la sessione da ENTRAMBI gli store (nessun token riutilizzabile
 * residuo, requisito di sicurezza su postazioni condivise) e riporta il flag al
 * default sicuro (OFF). Via anche il log dei crash: oggi non contiene dati
 * personali, ma su una postazione condivisa non deve passare all'utente dopo
 * (review 07/10, O27).
 */
export function clearSupabaseAuthStorage(): void {
  try {
    removeSupabaseKeys(localStorage)
    removeSupabaseKeys(sessionStorage)
    localStorage.removeItem(ERROR_LOG_KEY)
    togliRecupero()
    setRememberSession(false)
  } catch {
    /* no-op */
  }
}

/**
 * Pulizia one-time al primo boot dopo l'introduzione del flag "Ricordami".
 * Prima la sessione viveva in localStorage (default Supabase); col nuovo default
 * OFF vive in sessionStorage, quindi eventuali token `sb-*` rimasti in
 * localStorage sono leftover legacy mai più letti → li rimuovo una sola volta
 * (marker `coletta-auth-migrated`). Da chiamare PRIMA di createClient.
 */
export function migrateLegacyAuthStorage(): void {
  try {
    if (localStorage.getItem(MIGRATION_KEY) === '1') return
    removeSupabaseKeys(localStorage)
    localStorage.setItem(MIGRATION_KEY, '1')
  } catch {
    /* no-op */
  }
}
