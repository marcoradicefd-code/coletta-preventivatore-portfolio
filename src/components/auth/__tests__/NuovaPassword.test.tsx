import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react'
import { spiaConsole } from '@/test-utils/spiaConsole'

// L26: il link dell'email di recupero apre la pagina «Imposta una nuova
// password», non l'app. Supabase è finto: `onAuthStateChange` consegna il
// listener al test, che emette gli eventi come farebbe auth-js.
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
  single: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
      onAuthStateChange: mocks.onAuthStateChange,
      updateUser: mocks.updateUser,
      signOut: mocks.signOut,
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      resetPasswordForEmail: vi.fn(),
    },
    from: () => ({ select: () => ({ eq: () => ({ single: mocks.single }) }) }),
    storage: { from: () => ({}) },
  },
  LISTINI_BUCKET: 'Listini',
}))

import { AuthGuard } from '@/components/auth/AuthGuard'
import { ToastProvider } from '@/components/shared/Toast'
import {
  useAuthStore,
  MSG_LINK_NON_VALIDO,
  MSG_PASSWORD_AGGIORNATA,
} from '@/store/authStore'
import { MSG_ERRORE_RETE } from '@/lib/erroriDb'

type Listener = (event: string, session: unknown) => void

const EMAIL = 'anna.bianchi@example.test'
const TOKEN = 'token-di-recupero-finto'
const SESSIONE = { access_token: TOKEN, user: { id: 'u1', email: EMAIL } }
/** Il ritorno dal link dell'email col flusso PKCE (supabase.ts): il `code` nell'URL. */
const URL_RECUPERO = '/?code=codice-dal-link'
/** Il verifier che `resetPasswordForEmail` ha salvato in questo browser (auth-js, in JSON). */
const CHIAVE_VERIFIER = 'sb-proj-auth-token-code-verifier'
const VERIFIER_RECUPERO = JSON.stringify('verifier-finto/PASSWORD_RECOVERY')
/** Un link forgiato col flusso implicit: i token di un altro account nel frammento (login CSRF). */
const URL_FORGIATO = `/#access_token=${TOKEN}&expires_in=3600&refresh_token=r&token_type=bearer&type=recovery`

const spia = spiaConsole()
let listener: Listener | undefined

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  sessionStorage.clear()
  window.history.replaceState(null, '', '/')
  useAuthStore.setState({
    user: null,
    profile: null,
    isAuthenticated: false,
    isAdmin: false,
    isLoading: true,
    inRecupero: false,
    avvisoAccesso: null,
  })
  mocks.single.mockResolvedValue({ data: { id: 'u1', role: 'user' }, error: null })
  mocks.onAuthStateChange.mockImplementation((cb: Listener) => {
    listener = cb
    return { data: { subscription: { unsubscribe: vi.fn() } } }
  })
  spia.avvia()
})

afterEach(() => {
  cleanup()
  spia.ripristina()
})

function montaApp() {
  return render(
    <ToastProvider>
      <AuthGuard>
        <p>App aperta</p>
      </AuthGuard>
    </ToastProvider>
  )
}

/** Avvio dell'app (o F5): `getSession` rende `sessione`, poi si aspetta la fine del caricamento. */
async function avvia(sessione: unknown) {
  mocks.getSession.mockResolvedValue({ data: { session: sessione }, error: null })
  await act(async () => {
    useAuthStore.getState().initialize()
  })
  await vi.waitFor(() => expect(useAuthStore.getState().isLoading).toBe(false))
}

/** Un F5: lo store riparte da zero, il browser tiene i suoi storage. */
async function ricarica(sessione: unknown) {
  cleanup()
  useAuthStore.setState({
    user: null,
    profile: null,
    isAuthenticated: false,
    isAdmin: false,
    isLoading: true,
    inRecupero: false,
    avvisoAccesso: null,
  })
  montaApp()
  await avvia(sessione)
}

function paginaNuovaPassword() {
  return screen.queryByRole('heading', { name: 'Imposta una nuova password' })
}

function scrivi(nuova: string, ripeti: string) {
  fireEvent.change(screen.getByLabelText('Nuova password'), { target: { value: nuova } })
  fireEvent.change(screen.getByLabelText('Ripeti la password'), { target: { value: ripeti } })
}

async function salva() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Salva la nuova password' }))
  })
}

/**
 * Arrivo dal link dell'email nel browser che l'ha chiesto: `code` nell'URL e
 * verifier di recupero salvato. auth-js scambia il code (qui `getSession`
 * rende la sessione), toglie il verifier e il `code` dall'URL, ed emette
 * SIGNED_IN, non PASSWORD_RECOVERY (`_getSessionFromURL` col PKCE).
 */
async function arrivaDalLink() {
  localStorage.setItem(CHIAVE_VERIFIER, VERIFIER_RECUPERO)
  window.history.replaceState(null, '', URL_RECUPERO)
  montaApp()
  await avvia(SESSIONE)
  localStorage.removeItem(CHIAVE_VERIFIER)
  window.history.replaceState(null, '', '/')
  await act(async () => listener?.('SIGNED_IN', SESSIONE))
}

describe('Recupero password — la sessione di recupero non apre l\'app', () => {
  // Requisito 4.
  it('PASSWORD_RECOVERY mostra la pagina nuova e non l\'app', async () => {
    montaApp()
    await avvia(SESSIONE)
    await act(async () => listener?.('PASSWORD_RECOVERY', SESSIONE))

    expect(paginaNuovaPassword()).not.toBeNull()
    expect(screen.queryByText('App aperta')).toBeNull()
  })

  it('col code del recupero nell\'URL e il suo verifier l\'app non si apre, anche senza PASSWORD_RECOVERY', async () => {
    await arrivaDalLink()

    expect(paginaNuovaPassword()).not.toBeNull()
    expect(screen.queryByText('App aperta')).toBeNull()
  })

  it('un link forgiato coi token nel frammento non porta alla pagina di recupero', async () => {
    window.history.replaceState(null, '', URL_FORGIATO)
    montaApp()
    await avvia(null) // auth-js non lo legge (supabase.ts, PKCE): nessuna sessione

    expect(paginaNuovaPassword()).toBeNull()
    expect(screen.getByRole('alert').textContent).toContain(MSG_LINK_NON_VALIDO)
    expect(window.location.hash).toBe('')
  })

  it('un code che non diventa una sessione (scaduto, già usato) dice che il link non vale', async () => {
    localStorage.setItem(CHIAVE_VERIFIER, VERIFIER_RECUPERO)
    window.history.replaceState(null, '', URL_RECUPERO)
    montaApp()
    await avvia(null)

    expect(paginaNuovaPassword()).toBeNull()
    expect(screen.getByRole('heading', { name: 'Password dimenticata?' })).not.toBeNull()
    expect(screen.getByRole('alert').textContent).toContain(MSG_LINK_NON_VALIDO)
    expect(window.location.search).toBe('')
  })

  it.each([
    ['Ricordami spento', 'false'],
    ['Ricordami acceso', 'true'],
  ])('dopo un nuovo initialize (F5, %s) resta la pagina nuova', async (_caso, ricordami) => {
    localStorage.setItem('coletta-auth-remember', ricordami)
    await arrivaDalLink()

    await ricarica(SESSIONE)

    expect(paginaNuovaPassword()).not.toBeNull()
    expect(screen.queryByText('App aperta')).toBeNull()
  })
})

describe('Pagina «Imposta una nuova password»', () => {
  // Requisito 5.
  it('due password diverse bloccano il salvataggio', async () => {
    await arrivaDalLink()
    scrivi('una-password-lunga7', 'un-altra-password')
    await salva()

    expect(screen.getByRole('alert').textContent).toContain('Le due password non sono uguali.')
    expect(mocks.updateUser).not.toHaveBeenCalled()
  })

  // Requisito 6.
  it('il link scaduto ha il suo messaggio e riporta a «Password dimenticata?»', async () => {
    mocks.updateUser.mockResolvedValue({
      data: { user: null },
      error: { name: 'AuthSessionMissingError', status: 400, message: 'Auth session missing!' },
    })
    mocks.signOut.mockResolvedValue({ error: null })
    await arrivaDalLink()
    scrivi('una-password-lunga7', 'una-password-lunga7')
    await salva()

    expect(screen.getByRole('alert').textContent).toContain(MSG_LINK_NON_VALIDO)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Chiedi un nuovo link' }))
    })

    expect(mocks.signOut).toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Password dimenticata?' })).not.toBeNull()
    expect(screen.getByRole('alert').textContent).toContain(MSG_LINK_NON_VALIDO)
  })

  it.each([
    ['nella query', '/?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'],
    ['nel frammento', '/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'],
    ['code aperto in un altro browser, senza verifier', URL_RECUPERO],
  ])('link non valido all\'arrivo (%s): «Password dimenticata?» aperto col messaggio, URL ripulito', async (_caso, url) => {
    window.history.replaceState(null, '', url)
    montaApp()
    await avvia(null)

    expect(screen.getByRole('heading', { name: 'Password dimenticata?' })).not.toBeNull()
    expect(screen.getByRole('alert').textContent).toContain(MSG_LINK_NON_VALIDO)
    expect(window.location.search + window.location.hash).toBe('')
  })

  it.each([
    ['password rubata', { name: 'AuthWeakPasswordError', status: 422, code: 'weak_password', reasons: ['pwned'] }, 'fra quelle rubate'],
    ['troppo corta', { name: 'AuthWeakPasswordError', status: 422, code: 'weak_password', reasons: ['length'], message: 'Password should be at least 12 characters.' }, 'almeno 12 caratteri'],
    ['uguale alla vecchia', { name: 'AuthApiError', status: 422, code: 'same_password' }, 'diversa da quella di prima'],
    ['rete giù', { name: 'AuthRetryableFetchError', status: 0 }, MSG_ERRORE_RETE],
  ])('%s: errore in italiano dal codice, mai il message', async (_caso, errore, atteso) => {
    mocks.updateUser.mockResolvedValue({ data: { user: null }, error: { message: 'Supabase dice qualcosa', ...errore } })
    await arrivaDalLink()
    scrivi('una-password-lunga7', 'una-password-lunga7')
    await salva()

    expect(screen.getByRole('alert').textContent).toContain(atteso)
    expect(screen.queryByText(/Supabase dice|should be/)).toBeNull()
    expect(paginaNuovaPassword()).not.toBeNull()
  })

  // Requisito 7: la strada scelta è entrare nell'app con l'avviso.
  it('dopo updateUser riuscito si entra nell\'app con «Password aggiornata», Ricordami com\'era', async () => {
    localStorage.setItem('coletta-auth-remember', 'true')
    mocks.updateUser.mockResolvedValue({ data: { user: SESSIONE.user }, error: null })
    await arrivaDalLink()
    scrivi('una-password-lunga7', 'una-password-lunga7')
    await salva()

    expect(mocks.updateUser).toHaveBeenCalledWith({ password: 'una-password-lunga7' })
    expect(screen.getByText('App aperta')).not.toBeNull()
    expect(screen.getByText(MSG_PASSWORD_AGGIORNATA)).not.toBeNull()
    expect(localStorage.getItem('coletta-auth-remember')).toBe('true')

    // E un F5 dopo non riporta alla pagina di recupero.
    await ricarica(SESSIONE)
    expect(screen.getByText('App aperta')).not.toBeNull()
  })

  it('«Torna all\'accesso» fa il logout e mostra la pagina di accesso', async () => {
    mocks.signOut.mockResolvedValue({ error: null })
    await arrivaDalLink()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: "Torna all'accesso" }))
    })

    expect(mocks.signOut).toHaveBeenCalled()
    expect(paginaNuovaPassword()).toBeNull()
    expect(screen.queryByText('App aperta')).toBeNull()
    expect(screen.getByRole('button', { name: 'Password dimenticata?' })).not.toBeNull()
  })

  it('in tutto il flusso la console non vede email né token', async () => {
    mocks.updateUser.mockResolvedValueOnce({ data: { user: null }, error: { name: 'AuthApiError', status: 422, code: 'same_password', message: EMAIL } })
    mocks.updateUser.mockResolvedValueOnce({ data: { user: SESSIONE.user }, error: null })
    await arrivaDalLink()
    scrivi('una-password-lunga7', 'una-password-lunga7')
    await salva()
    await salva()

    expect(screen.getByText('App aperta')).not.toBeNull()
    expect(spia.trovati([EMAIL, TOKEN])).toEqual([])
  })
})
