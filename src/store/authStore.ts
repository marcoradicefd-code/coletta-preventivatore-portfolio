import { create } from 'zustand'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, type Profile } from '@/lib/supabase'
import {
  clearSupabaseAuthStorage,
  isRecuperoInCorso,
  segnaRecupero,
  togliRecupero,
  verifierSalvato,
} from '@/lib/authStorage'
import { useQuoteStore } from '@/store/quoteStore'
import { MSG_ERRORE_RETE } from '@/lib/erroriDb'
import { MSG_PASSWORD_CARATTERI, MSG_PASSWORD_CORTA } from '@/lib/regolaPassword'

/** Esito di «Password dimenticata?»: il solo che cambia il messaggio a schermo. */
export type EsitoInvioLink = 'inviato' | 'troppe-richieste' | 'rete'

/** Cosa la pagina di accesso dice prima di ogni gesto, una volta sola. */
export type AvvisoAccesso = 'link-non-valido' | 'sessione-scaduta'

interface AuthState {
  user: User | null
  profile: Profile | null
  isLoading: boolean
  isAuthenticated: boolean
  isAdmin: boolean
  /**
   * Sessione di recupero password (L26): con una sessione, `AuthGuard` mostra
   * «Imposta una nuova password» e non l'app. Lo accendono il link nell'URL e
   * l'evento PASSWORD_RECOVERY; lo spengono solo `aggiornaPassword` riuscito e
   * l'uscita. Sopravvive al F5 (segno nello store della sessione, authStorage).
   */
  inRecupero: boolean
  avvisoAccesso: AvvisoAccesso | null

  login: (email: string, password: string) => Promise<{ error?: string }>
  /**
   * L'account che esiste già non è un errore (L26): la pagina dice la stessa
   * cosa che per un account creato in attesa di conferma.
   */
  register: (email: string, password: string) => Promise<{ error?: string }>
  /**
   * Non rigetta mai: i dati locali si puliscono comunque. `error` solo se
   * `signOut` rigetta (la revoca sul server non è confermata).
   */
  logout: () => Promise<{ error?: string }>
  /**
   * «Password dimenticata?» (L26). Non rigetta. `inviato` anche per gli errori
   * che non sono 429 né rete: la risposta non dice se l'account esiste.
   */
  inviaLinkRecupero: (email: string) => Promise<EsitoInvioLink>
  /** Nuova password nella sessione di recupero. Non rigetta; `linkNonValido` se la sessione non c'è più. */
  aggiornaPassword: (password: string) => Promise<{ error?: string; linkNonValido?: boolean }>
  /** Dalla pagina di recupero con il link scaduto: esce e riapre «Password dimenticata?». */
  richiediNuovoLink: () => Promise<void>
  chiudiAvvisoAccesso: () => void
  /**
   * Carica la sessione corrente e si iscrive ai cambi di stato.
   * Va chiamata una sola volta all'avvio dell'app (main.tsx).
   */
  initialize: () => void
}

function devLog(...args: unknown[]): void {
  if (import.meta.env.DEV) {
    console.info('[authStore]', ...args)
  }
}

function devWarn(...args: unknown[]): void {
  if (import.meta.env.DEV) {
    console.warn('[authStore]', ...args)
  }
}

function devError(...args: unknown[]): void {
  if (import.meta.env.DEV) {
    console.error('[authStore]', ...args)
  }
}

/**
 * Carica il profilo dalla tabella `profiles`. Non throwa mai: ritorna
 * sempre un oggetto Profile (eventualmente fallback a `role: 'user'`).
 * Questa è una pre-condizione per la robustezza di hydrateFromSession.
 */
async function loadProfile(userId: string): Promise<Profile> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', userId)
      .single()

    if (error) {
      devWarn('loadProfile supabase error, fallback a user:', error.message)
      return { id: userId, role: 'user' }
    }
    return data as Profile
  } catch (e) {
    devError('loadProfile exception, fallback a user:', e)
    return { id: userId, role: 'user' }
  }
}

/** Testo dell'avviso quando `signOut` rigetta: la pulizia locale è avvenuta, la revoca no. */
export const MSG_USCITA_NON_CONFERMATA =
  'Sei uscito da questo dispositivo, ma il server non ha confermato la chiusura della sessione.'

/**
 * Pulisce tutto ciò che la sessione lascia nel browser. Sincrona e senza
 * Supabase, così gira anche quando il server non risponde.
 *
 * - `clearSupabaseAuthStorage`: token `sb-*` da entrambi gli store, log dei
 *   crash, flag Ricordami a OFF.
 * - Preventivo (PII del cliente): `resetAll` in memoria, poi il toggle spento,
 *   per ultimo `persist.clearStorage()`, così `persist` non riscrive il blob
 *   dopo averlo tolto. La copia del blob illeggibile la tolgono `resetAll` e
 *   `clearStorage` (quoteStore): qui non si duplica.
 */
function pulisciDatiLocali(): void {
  clearSupabaseAuthStorage()
  pulisciPreventivoLocale()
}

/** La parte di `pulisciDatiLocali` che tocca solo il preventivo, non la sessione. */
function pulisciPreventivoLocale(): void {
  const quote = useQuoteStore.getState()
  quote.resetAll()
  quote.setRicordaPreventivo(false)
  useQuoteStore.persist.clearStorage()
}

/**
 * La bozza nel browser è di chi l'ha scritta (L21-B, osservazione 4 del
 * verdetto sulla #96). Va chiamata con l'utente che entra, PRIMA che lo store
 * dica «autenticato»: l'app non si monta finché non lo dice, quindi chi entra
 * non vede mai il preventivo di un altro. Copre «Ricordami OFF, browser
 * chiuso», dove nessun `SIGNED_OUT` pulisce.
 *
 * Un autore diverso, o nessun autore (una bozza di prima di L21-B: non si sa di
 * chi è), fa scartare il preventivo come al logout. La sessione no: è quella di
 * chi entra, e toglierla (`clearSupabaseAuthStorage`) lo farebbe uscire al
 * prossimo avvio e gli spegnerebbe «Ricordami».
 */
function legaBozzaAllUtente(userId: string): void {
  if (useQuoteStore.getState().autore !== userId) pulisciPreventivoLocale()
  useQuoteStore.getState().impostaAutore(userId)
}

/**
 * Dove riporta il link dell'email di recupero: l'origine della pagina più
 * questo percorso. UNA costante: il valore intero (es.
 * `https://preventivi.colettaebanisteria.it/`) va fra i Redirect URLs di
 * Supabase. La radice perché `vercel.json` non ha rewrite: un altro percorso
 * darebbe 404 in produzione.
 */
export const PERCORSO_RITORNO_RECUPERO = '/'

/** Il messaggio dopo l'invio, uguale che l'account esista o no (nessuna enumerazione). */
export const MSG_LINK_INVIATO =
  "Se l'indirizzo è registrato, ti arriva un'email con il link per scegliere una nuova password. Controlla anche lo spam. Apri il link da questo stesso browser."
/**
 * Registrazione (aggiunta L26 di Marco): dominio fuori lista, account già
 * esistente e account creato in attesa di conferma dicono la stessa cosa.
 */
export const MSG_REGISTRAZIONE =
  "Se l'indirizzo è abilitato, ti arriva un'email per confermare l'account. Apri il link da questo stesso browser."
export const MSG_TROPPE_RICHIESTE = 'Troppe richieste: riprova tra qualche minuto'
export const MSG_LINK_NON_VALIDO = 'Il link non è più valido: chiedine uno nuovo'
export const MSG_PASSWORD_AGGIORNATA = 'Password aggiornata'
export const MSG_SESSIONE_SCADUTA = 'La sessione è scaduta o è stata chiusa: accedi di nuovo'
export const MSG_REGISTRAZIONE_SPENTA = "La registrazione non è attiva: chiedi all'amministratore."

/**
 * Vero mentre `logout` aspetta `signOut`: auth-js avvisa i listener con
 * SIGNED_OUT prima di risolvere, con l'utente ancora nello store, e
 * quell'uscita è voluta, non una sessione scaduta.
 */
let uscitaVoluta = false

/** Forma minima di un errore di auth-js: si legge solo dal nome, dallo status e dal codice, mai dal `message`. */
interface ErroreAuth {
  name?: string
  status?: number
  code?: string
  /** Solo `AuthWeakPasswordError`: 'length', 'characters', 'pwned'. */
  reasons?: string[]
  message?: string
}

/** Codici di auth-js (`lib/error-codes.d.ts`) che vogliono dire: la sessione di recupero non c'è più. */
const CODICI_LINK_NON_VALIDO = new Set([
  'session_not_found',
  'session_expired',
  'bad_jwt',
  'refresh_token_not_found',
  'refresh_token_already_used',
  'user_not_found',
  'otp_expired',
])

/**
 * L'errore di `updateUser({ password })` in italiano, dal nome, dal codice e
 * dalle `reasons`. Dal `message` si legge solo il numero della lunghezza
 * minima, che decide Supabase: il testo non va mai a schermo.
 */
function erroreNuovaPassword(e: ErroreAuth): { error: string; linkNonValido?: boolean } {
  if (erroreDiRete(e)) return { error: MSG_ERRORE_RETE }
  if (e.name === 'AuthSessionMissingError' || (e.code && CODICI_LINK_NON_VALIDO.has(e.code)) || e.status === 401) {
    return { error: MSG_LINK_NON_VALIDO, linkNonValido: true }
  }
  if (troppeRichieste(e)) return { error: MSG_TROPPE_RICHIESTE }
  if (e.code === 'same_password') return { error: 'La nuova password deve essere diversa da quella di prima.' }
  if (e.code === 'weak_password') return { error: messaggioPasswordDebole(e) }
  return { error: 'Non è stato possibile salvare la password. Riprova.' }
}

/**
 * `weak_password` dalle sue `reasons`, uguale per la nuova password e per la
 * registrazione (L29). Dal `message` si legge solo il numero della lunghezza
 * minima, che decide Supabase.
 */
function messaggioPasswordDebole(e: ErroreAuth): string {
  const motivi = e.reasons ?? []
  if (motivi.includes('pwned')) return "Questa password compare fra quelle rubate in altri siti: scegline un'altra."
  if (motivi.includes('length')) {
    const minimo = /\d+/.exec(e.message ?? '')?.[0]
    return minimo ? `La password deve avere almeno ${minimo} caratteri.` : MSG_PASSWORD_CORTA
  }
  // I caratteri richiesti sono quelli di `regolaPassword.ts`, uguali a Supabase.
  if (motivi.includes('characters')) return MSG_PASSWORD_CARATTERI
  return 'La password è troppo debole: scegline una più lunga o più varia.'
}

/**
 * L'errore di `signUp` in italiano (L29), da nome, status e codice come
 * `erroreNuovaPassword`. L'account già esistente non arriva qui (è neutro,
 * L26); un errore sconosciuto resta generico, senza dire niente dell'account.
 */
function erroreRegistrazione(e: ErroreAuth): string {
  if (erroreDiRete(e)) return MSG_ERRORE_RETE
  if (troppeRichieste(e)) return MSG_TROPPE_RICHIESTE
  if (e.code === 'signup_disabled') return MSG_REGISTRAZIONE_SPENTA
  if (e.code === 'weak_password') return messaggioPasswordDebole(e)
  return 'Si è verificato un errore. Riprova.'
}

/** Toglie dall'URL `code`, errori e frammento del link: un F5 non li rilegge. */
function ripulisciUrl(): void {
  window.history.replaceState(window.history.state, '', window.location.pathname)
}

/**
 * Il ritorno dal link dell'email (PKCE, `supabase.ts`), letto PRIMA che
 * auth-js scambi il `code`. È un recupero se c'è il `code` e, in questo
 * browser, il verifier che auth-js ha salvato con `/PASSWORD_RECOVERY`: il
 * recupero si accende già qui. Serve, non è prudenza: col flusso PKCE auth-js
 * 2.103 dopo lo scambio dall'URL emette SIGNED_IN e non PASSWORD_RECOVERY
 * (`_getSessionFromURL` rende `redirectType: null`), e `getSession` aprirebbe
 * l'app. Un `code` senza verifier (link aperto in un altro browser o
 * forgiato), un errore nell'URL (link scaduto o già usato) o i token nel
 * frammento (flusso implicit, che non si accetta più) = link non valido: si
 * ripulisce l'URL, così un F5 non lo ripete. Un `code` con un verifier non di
 * recupero (conferma della registrazione) lo gestisce auth-js.
 */
function leggiRitornoDaEmail(): 'recupero' | AvvisoAccesso | null {
  const query = new URLSearchParams(window.location.search)
  const frammento = new URLSearchParams(window.location.hash.slice(1))
  const verifier = verifierSalvato()
  if (query.has('code') && verifier) {
    return verifier.endsWith('/PASSWORD_RECOVERY') ? 'recupero' : null
  }
  if (query.has('code') || query.has('error_code') || frammento.has('error_code') || frammento.has('access_token')) {
    ripulisciUrl()
    return 'link-non-valido'
  }
  return null
}

/** Rete giù: auth-js la rende come `AuthRetryableFetchError` con status 0 (`lib/fetch.js`). */
function erroreDiRete(e: ErroreAuth): boolean {
  return e.name === 'AuthRetryableFetchError' && e.status === 0
}

function troppeRichieste(e: ErroreAuth): boolean {
  return e.status === 429 || e.code === 'over_email_send_rate_limit' || e.code === 'over_request_rate_limit'
}

function translateAuthError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid login') || m.includes('invalid credentials')) {
    return 'Email o password non corretti.'
  }
  if (m.includes('email not confirmed')) {
    return 'Email non confermata. Controlla la tua casella di posta.'
  }
  if (m.includes('password should be') || m.includes('password is too short')) {
    return MSG_PASSWORD_CORTA
  }
  if (m.includes('rate') || m.includes('too many')) {
    return 'Troppi tentativi. Riprova tra qualche minuto.'
  }
  if (m.includes('network') || m.includes('fetch')) {
    return 'Errore di rete. Verifica la connessione e riprova.'
  }
  return 'Si è verificato un errore. Riprova.'
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  profile: null,
  isLoading: true,
  isAuthenticated: false,
  isAdmin: false,
  inRecupero: false,
  avvisoAccesso: null,

  login: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error: translateAuthError(error.message) }
    if (data.user) {
      legaBozzaAllUtente(data.user.id)
      // Chi entra con la password non è in recupero: un segno rimasto si toglie.
      togliRecupero()
      const profile = await loadProfile(data.user.id)
      set({
        user: data.user,
        profile,
        isAuthenticated: true,
        isAdmin: profile?.role === 'admin',
        inRecupero: false,
        avvisoAccesso: null,
      })
    }
    return {}
  },

  register: async (email, password) => {
    let risposta: Awaited<ReturnType<typeof supabase.auth.signUp>>
    try {
      risposta = await supabase.auth.signUp({ email, password })
    } catch (e) {
      devError('signUp rigettata:', (e as ErroreAuth)?.name)
      return { error: MSG_ERRORE_RETE }
    }
    const { data, error } = risposta
    if (error) {
      // L'account esiste già: lo stesso esito di una registrazione in attesa di conferma.
      if (error.code === 'user_already_exists' || /already (been )?registered/i.test(error.message)) {
        return {}
      }
      // Mai `error.message` nel log: il messaggio di Supabase può citare l'indirizzo.
      devWarn('signUp con errore:', error.status, error.code)
      return { error: erroreRegistrazione(error) }
    }
    // Con conferma email abilitata, data.user esiste ma la sessione no —
    // l'utente dovrà comunque loggarsi dopo aver confermato l'email.
    if (data.user && data.session) {
      legaBozzaAllUtente(data.user.id)
      const profile = await loadProfile(data.user.id)
      set({
        user: data.user,
        profile,
        isAuthenticated: true,
        isAdmin: profile?.role === 'admin',
      })
    }
    return {}
  },

  logout: async () => {
    let esito: { error?: string } = {}
    // `signOut` PER PRIMO: `clearSupabaseAuthStorage` rimette il flag Ricordami
    // a OFF, e l'adapter cercherebbe il token in sessionStorage. Con Ricordami
    // ON la revoca sul server salterebbe.
    uscitaVoluta = true
    try {
      const { error } = await supabase.auth.signOut()
      // Rete giù, 5xx: il token resta valido sul server fino a scadenza, ma in
      // locale non c'è più. Nessun avviso (review 10/2026, O26).
      if (error) devWarn('signOut con errore, pulizia locale comunque:', error.message)
    } catch (e) {
      // Rigetto (es. timeout del lock di auth-js): l'utente lo deve sapere.
      devError('signOut rigettata, pulizia locale comunque:', e)
      esito = { error: MSG_USCITA_NON_CONFERMATA }
    } finally {
      uscitaVoluta = false
      // Postazioni condivise: niente token né dati del cliente al prossimo utente.
      pulisciDatiLocali()
      set({
        user: null,
        profile: null,
        isAuthenticated: false,
        isAdmin: false,
        inRecupero: false,
      })
    }
    return esito
  },

  inviaLinkRecupero: async (email) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}${PERCORSO_RITORNO_RECUPERO}`,
      })
      if (!error) return 'inviato'
      // Mai `error.message` nel log: il messaggio di Supabase può citare l'indirizzo.
      devWarn('resetPasswordForEmail con errore:', error.status, error.code)
      if (troppeRichieste(error)) return 'troppe-richieste'
      if (erroreDiRete(error)) return 'rete'
      return 'inviato'
    } catch (e) {
      devError('resetPasswordForEmail rigettata:', (e as ErroreAuth)?.name)
      return 'rete'
    }
  },

  aggiornaPassword: async (password) => {
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) {
        devWarn('updateUser con errore:', error.status, error.code)
        return erroreNuovaPassword(error)
      }
      // La sessione resta quella di adesso, nel suo store: Ricordami non cambia.
      togliRecupero()
      set({ inRecupero: false })
      return {}
    } catch (e) {
      devError('updateUser rigettata:', (e as ErroreAuth)?.name)
      return { error: MSG_ERRORE_RETE }
    }
  },

  richiediNuovoLink: async () => {
    // Prima dell'uscita: la pagina di accesso si monta già con l'avviso.
    set({ avvisoAccesso: 'link-non-valido' })
    await get().logout()
  },

  chiudiAvvisoAccesso: () => set({ avvisoAccesso: null }),

  initialize: () => {
    devLog('initialize() start')

    const ritorno = leggiRitornoDaEmail()
    if (ritorno === 'recupero') segnaRecupero()
    if (ritorno === 'link-non-valido') set({ avvisoAccesso: ritorno })
    // Il segno c'è anche dopo un F5 sulla pagina di recupero, senza più il link nell'URL.
    if (isRecuperoInCorso()) set({ inRecupero: true })

    // Safety net: qualunque cosa accada, dopo 10s sblocchiamo lo spinner.
    // Copre i casi patologici (lock di auth-js che non rilascia, fetch
    // appeso per sempre, ecc.) dove preferiamo mostrare la LoginPage
    // piuttosto che lasciare l'utente su uno spinner eterno.
    const safetyTimeout = window.setTimeout(() => {
      if (get().isLoading) {
        devError('safety timeout: forcing isLoading=false after 10s')
        set({ isLoading: false })
      }
    }, 10_000)

    /**
     * Unico percorso di hydration post-auth. Gestisce sia il risultato di
     * getSession() (primo caricamento / reload) sia gli eventi di
     * onAuthStateChange (SIGNED_IN, TOKEN_REFRESHED, SIGNED_OUT, ecc.).
     *
     * Garantisce SEMPRE un `set({ isLoading: false })` prima di ritornare,
     * anche in caso di errori imprevisti.
     *
     * Il ramo senza sessione NON pulisce i dati locali: è lo stesso
     * dell'avvio senza sessione (Ricordami OFF, browser chiuso), dove il
     * preventivo «ricordato» resta. La pulizia di fine sessione sta nel
     * listener, su `SIGNED_OUT` con un utente presente.
     */
    const hydrateFromSession = async (session: Session | null): Promise<void> => {
      try {
        if (!session?.user) {
          devLog('hydrateFromSession: no session → logged out')
          // Senza sessione non c'è recupero: si toglie solo il segno, il
          // preventivo «ricordato» resta (vedi sopra).
          togliRecupero()
          set({
            user: null,
            profile: null,
            isAuthenticated: false,
            isAdmin: false,
            isLoading: false,
            inRecupero: false,
          })
          return
        }

        // Prima di «autenticato»: la bozza di un altro utente non si vede mai.
        legaBozzaAllUtente(session.user.id)

        // Fast path: stesso utente già caricato con profilo → niente re-fetch.
        // Importante: settiamo comunque isLoading=false per sbloccare eventuali
        // spinner residui (fix trappola "fast path senza isLoading").
        const current = get()
        if (current.user?.id === session.user.id && current.profile) {
          devLog('hydrateFromSession: fast path (same user, profile cached)')
          set({
            user: session.user,
            isAuthenticated: true,
            isLoading: false,
          })
          return
        }

        devLog('hydrateFromSession: loading profile for', session.user.id)
        const profile = await loadProfile(session.user.id)
        set({
          user: session.user,
          profile,
          isAuthenticated: true,
          isAdmin: profile?.role === 'admin',
          isLoading: false,
        })
      } catch (e) {
        devError('hydrateFromSession unexpected error:', e)
        // Fallback: se abbiamo un user lato token lo lasciamo passare con
        // ruolo 'user'. Meglio un admin temporaneamente declassato che
        // un'app bloccata.
        if (session?.user) {
          set({
            user: session.user,
            profile: { id: session.user.id, role: 'user' },
            isAuthenticated: true,
            isAdmin: false,
            isLoading: false,
          })
        } else {
          set({ isLoading: false })
        }
      }
    }

    // Path A: getSession (rehydration da localStorage)
    supabase.auth
      .getSession()
      .then(({ data: { session }, error }) => {
        if (error) {
          devError('getSession error:', error.message)
          set({ isLoading: false })
          return
        }
        devLog('getSession resolved:', session ? 'session present' : 'no session')
        // Il `code` del recupero non è diventato una sessione (scaduto, già
        // usato): auth-js lo lascia nell'URL e toglie il verifier.
        if (ritorno === 'recupero' && !session) {
          ripulisciUrl()
          set({ avvisoAccesso: 'link-non-valido' })
        }
        return hydrateFromSession(session)
      })
      .catch((e) => {
        devError('getSession chain rejected:', e)
        set({ isLoading: false })
      })
      .finally(() => {
        window.clearTimeout(safetyTimeout)
      })

    // Path B: listener eventi auth (SIGNED_IN, INITIAL_SESSION, TOKEN_REFRESHED, SIGNED_OUT, ...)
    supabase.auth.onAuthStateChange((event, session) => {
      devLog('onAuthStateChange event:', event, session ? 'with session' : 'no session')
      // Fine sessione a sessione aperta (token revocato da un altro dispositivo
      // o da un'altra scheda, utente rimosso): si pulisce come al logout. La
      // guardia sull'utente va letta QUI, prima di `hydrateFromSession(null)`
      // che lo azzera: un `SIGNED_OUT` all'avvio (Ricordami ON, refresh token
      // non valido) trova `user` nullo e lascia il preventivo «ricordato».
      // Da L26 la pagina di accesso lo dice, una volta (lo stato è in memoria:
      // un F5 non lo ripete); non dopo `logout`, non all'avvio (utente nullo).
      if (event === 'SIGNED_OUT' && get().user) {
        pulisciDatiLocali()
        if (!uscitaVoluta) set({ avvisoAccesso: 'sessione-scaduta' })
      }
      // Niente app finché non si sceglie la password nuova. Col PKCE il segnale
      // vero è `leggiRitornoDaEmail` (vedi lì); l'evento resta per gli altri
      // percorsi di auth-js (`verifyOtp`, flusso implicit).
      if (event === 'PASSWORD_RECOVERY') {
        segnaRecupero()
        set({ inRecupero: true })
      }
      hydrateFromSession(session).catch((e) => {
        devError('onAuthStateChange handler rejected:', e)
        set({ isLoading: false })
      })
    })
  },
}))
