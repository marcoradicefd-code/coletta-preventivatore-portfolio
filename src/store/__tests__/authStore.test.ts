import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { User } from '@supabase/supabase-js'

// Mock di Supabase: auth (login/logout/sessione) + from('profiles') per loadProfile.
const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  single: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: mocks.signInWithPassword,
      signUp: mocks.signUp,
      signOut: mocks.signOut,
      getSession: mocks.getSession,
      onAuthStateChange: mocks.onAuthStateChange,
    },
    from: () => ({ select: () => ({ eq: () => ({ single: mocks.single }) }) }),
    storage: { from: () => ({}) },
  },
  LISTINI_BUCKET: 'Listini',
}))

import { useAuthStore } from '@/store/authStore'
import { useQuoteStore } from '@/store/quoteStore'

beforeEach(() => {
  vi.clearAllMocks()
  useAuthStore.setState({
    user: null,
    profile: null,
    isAuthenticated: false,
    isAdmin: false,
    isLoading: true,
  })
})

describe('authStore.login', () => {
  it('login ok con profilo admin → isAuthenticated + isAdmin', async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    mocks.single.mockResolvedValue({ data: { id: 'u1', role: 'admin' }, error: null })

    const res = await useAuthStore.getState().login('admin@colettaebanisteria.it', 'pw')

    expect(res.error).toBeUndefined()
    const s = useAuthStore.getState()
    expect(s.isAuthenticated).toBe(true)
    expect(s.isAdmin).toBe(true)
  })

  it('profilo assente (errore supabase) → fallback role user, isAdmin false', async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: { user: { id: 'u2' } }, error: null })
    mocks.single.mockResolvedValue({ data: null, error: { message: 'no rows' } })

    await useAuthStore.getState().login('user@colettaebanisteria.it', 'pw')

    const s = useAuthStore.getState()
    expect(s.isAuthenticated).toBe(true)
    expect(s.isAdmin).toBe(false)
    expect(s.profile?.role).toBe('user')
  })

  it('loadProfile che solleva eccezione → fallback user (non throwa mai)', async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: { user: { id: 'u3' } }, error: null })
    mocks.single.mockRejectedValue(new Error('boom'))

    const res = await useAuthStore.getState().login('user@colettaebanisteria.it', 'pw')

    expect(res.error).toBeUndefined()
    expect(useAuthStore.getState().profile?.role).toBe('user')
  })

  it('credenziali errate → messaggio tradotto, nessuna autenticazione', async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: {},
      error: { message: 'Invalid login credentials' },
    })

    const res = await useAuthStore.getState().login('x@y.it', 'pw')

    expect(res.error).toMatch(/non corretti/i)
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })
})

describe('authStore.logout', () => {
  it('azzera auth e pulisce la PII del preventivo (resetAll + clearStorage)', async () => {
    mocks.signOut.mockResolvedValue({ error: null })
    useQuoteStore.getState().setCliente({ nome: 'Mario', email: 'mario@x.it' })
    useAuthStore.setState({ isAuthenticated: true, isAdmin: true })
    const clearSpy = vi.spyOn(useQuoteStore.persist, 'clearStorage')

    await useAuthStore.getState().logout()

    const a = useAuthStore.getState()
    expect(a.isAuthenticated).toBe(false)
    expect(a.isAdmin).toBe(false)
    expect(a.user).toBeNull()
    expect(useQuoteStore.getState().preventivo.cliente.nome).toBe('')
    expect(useQuoteStore.getState().preventivo.cliente.email).toBe('')
    expect(clearSpy).toHaveBeenCalled()
  })

  it('rimuove i token di sessione da localStorage E sessionStorage', async () => {
    mocks.signOut.mockResolvedValue({ error: null })
    localStorage.setItem('sb-proj-auth-token', 'tok')
    sessionStorage.setItem('sb-proj-auth-token', 'tok')
    useAuthStore.setState({ isAuthenticated: true })

    await useAuthStore.getState().logout()

    expect(localStorage.getItem('sb-proj-auth-token')).toBeNull()
    expect(sessionStorage.getItem('sb-proj-auth-token')).toBeNull()
  })

  it('signOut che rigetta: non rigetta, pulisce tutto e restituisce il messaggio', async () => {
    sessioneConPreventivo()
    expect(localStorage.getItem('coletta-quote-v1')).toContain('Sentinella')
    mocks.signOut.mockRejectedValue(new Error('lock timeout'))

    const res = await useAuthStore.getState().logout()

    expect(res).toEqual({
      error:
        'Sei uscito da questo dispositivo, ma il server non ha confermato la chiusura della sessione.',
    })
    verificaPulito()
  })

  it('signOut con { error } (rete giù): pulisce tutto, nessun messaggio', async () => {
    sessioneConPreventivo()
    mocks.signOut.mockResolvedValue({ error: { message: 'Failed to fetch' } })

    const res = await useAuthStore.getState().logout()

    expect(res).toEqual({})
    verificaPulito()
  })

  it('signOut parte quando token e flag Ricordami sono ancora in storage', async () => {
    sessioneConPreventivo()
    let alMomento: { token: string | null; ricordami: string | null } | undefined
    mocks.signOut.mockImplementation(async () => {
      alMomento = {
        token: localStorage.getItem('sb-proj-auth-token'),
        ricordami: localStorage.getItem('coletta-auth-remember'),
      }
      return { error: null }
    })

    await useAuthStore.getState().logout()

    expect(alMomento).toEqual({ token: 'tok', ricordami: 'true' })
  })
})

/** Browser con Ricordami ON e preventivo «ricordato» con un cliente sintetico; nessun utente nello store. */
function preventivoRicordato() {
  localStorage.clear()
  sessionStorage.clear()
  localStorage.setItem('coletta-auth-remember', 'true')
  localStorage.setItem('sb-proj-auth-token', 'tok')
  localStorage.setItem('coletta-error-log', '[]')
  useQuoteStore.getState().setRicordaPreventivo(true)
  useQuoteStore.getState().setCliente({ nome: 'Sentinella', email: 'sentinella@x.it' })
}

/** Lo stesso browser, con la sessione aperta: utente e profilo nello store, bozza scritta da lui. */
function sessioneConPreventivo() {
  preventivoRicordato()
  useQuoteStore.getState().impostaAutore('u1')
  useAuthStore.setState({
    user: { id: 'u1' } as User,
    profile: { id: 'u1', role: 'admin' },
    isAuthenticated: true,
    isAdmin: true,
  })
}

/** Niente del preventivo, della sessione né del log dei crash; stato auth azzerato. */
function verificaPulito() {
  const q = useQuoteStore.getState()
  expect(q.preventivo.cliente.nome).toBe('')
  expect(q.ricordaPreventivo).toBe(false)
  expect(localStorage.getItem('coletta-quote-v1')).toBeNull()
  expect(localStorage.getItem('coletta-quote-v1-illeggibile')).toBeNull()
  expect(localStorage.getItem('sb-proj-auth-token')).toBeNull()
  expect(localStorage.getItem('coletta-error-log')).toBeNull()
  expect(localStorage.getItem('coletta-auth-remember')).toBe('false')
  const a = useAuthStore.getState()
  expect(a.user).toBeNull()
  expect(a.profile).toBeNull()
  expect(a.isAuthenticated).toBe(false)
  expect(a.isAdmin).toBe(false)
}

describe('authStore.initialize', () => {
  it('senza sessione sblocca sempre isLoading (invariante anti-spinner eterno)', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null })
    mocks.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })

    useAuthStore.getState().initialize()

    await vi.waitFor(() => {
      expect(useAuthStore.getState().isLoading).toBe(false)
    })
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(mocks.onAuthStateChange).toHaveBeenCalled()
  })
})

describe('authStore.initialize, fine sessione nel listener', () => {
  type Listener = (event: string, session: unknown) => void
  const SESSIONE_U1 = { user: { id: 'u1' } }

  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    useQuoteStore.getState().resetAll()
    useQuoteStore.getState().setRicordaPreventivo(false)
  })

  /** Avvia con `getSession` che rende `sessione`; ritorna il callback di `onAuthStateChange`. */
  async function avvia(sessione: unknown): Promise<Listener> {
    let listener: Listener | undefined
    mocks.getSession.mockResolvedValue({ data: { session: sessione }, error: null })
    mocks.onAuthStateChange.mockImplementation((cb: Listener) => {
      listener = cb
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    })
    useAuthStore.getState().initialize()
    await vi.waitFor(() => expect(useAuthStore.getState().isLoading).toBe(false))
    if (!listener) throw new Error('onAuthStateChange non chiamato')
    return listener
  }

  function verificaIntatto() {
    expect(useQuoteStore.getState().preventivo.cliente.nome).toBe('Sentinella')
    expect(useQuoteStore.getState().ricordaPreventivo).toBe(true)
    expect(localStorage.getItem('coletta-quote-v1')).toContain('Sentinella')
    expect(localStorage.getItem('coletta-auth-remember')).toBe('true')
  }

  it('SIGNED_OUT con utente presente: pulisce come il logout, copia illeggibile compresa', async () => {
    sessioneConPreventivo()
    localStorage.setItem('coletta-quote-v1-illeggibile', '{rotto')
    const listener = await avvia(SESSIONE_U1)

    listener('SIGNED_OUT', null)

    await vi.waitFor(() => expect(useAuthStore.getState().user).toBeNull())
    verificaPulito()
  })

  it('SIGNED_OUT con utente nullo (avvio, token revocato): preventivo e flag intatti', async () => {
    preventivoRicordato()
    const listener = await avvia(null)

    listener('SIGNED_OUT', null)

    expect(useAuthStore.getState().isLoading).toBe(false)
    verificaIntatto()
  })

  it('getSession e INITIAL_SESSION senza sessione (Ricordami OFF, browser chiuso): preventivo intatto', async () => {
    preventivoRicordato()
    const listener = await avvia(null)

    listener('INITIAL_SESSION', null)

    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    verificaIntatto()
  })

  it('SIGNED_IN e TOKEN_REFRESHED con utente presente: preventivo intatto', async () => {
    sessioneConPreventivo()
    const listener = await avvia(SESSIONE_U1)

    listener('SIGNED_IN', SESSIONE_U1)
    listener('TOKEN_REFRESHED', SESSIONE_U1)

    expect(useAuthStore.getState().user?.id).toBe('u1')
    verificaIntatto()
  })
})

// L21-B (verdetto sulla #96, osservazione 4): la bozza «ricordata» è di chi
// l'ha scritta. Al login di un altro utente si scarta prima che l'app si monti
// («Ricordami OFF, browser chiuso»: nessun SIGNED_OUT l'aveva pulita).
describe('authStore — la bozza nel browser è legata all\'utente', () => {
  type Listener = (event: string, session: unknown) => void

  beforeEach(() => {
    useQuoteStore.getState().resetAll()
    useQuoteStore.getState().setRicordaPreventivo(false)
    mocks.single.mockResolvedValue({ data: { id: 'x', role: 'user' }, error: null })
  })

  /** La bozza di u1 nel browser, nessun utente nello store (browser chiuso e riaperto). */
  function bozzaDi(autore: string | null) {
    preventivoRicordato()
    if (autore) useQuoteStore.getState().impostaAutore(autore)
    expect(localStorage.getItem('coletta-quote-v1')).toContain('Sentinella')
  }

  function verificaScartata(nuovo: string) {
    const q = useQuoteStore.getState()
    expect(q.preventivo.cliente.nome).toBe('')
    expect(q.ricordaPreventivo).toBe(false)
    expect(q.autore).toBe(nuovo)
    expect(localStorage.getItem('coletta-quote-v1') ?? '').not.toContain('Sentinella')
    // La sessione di chi entra resta: niente uscita al prossimo avvio.
    expect(localStorage.getItem('sb-proj-auth-token')).toBe('tok')
    expect(localStorage.getItem('coletta-auth-remember')).toBe('true')
  }

  async function avvia(sessione: unknown): Promise<Listener> {
    let listener: Listener | undefined
    mocks.getSession.mockResolvedValue({ data: { session: sessione }, error: null })
    mocks.onAuthStateChange.mockImplementation((cb: Listener) => {
      listener = cb
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    })
    useAuthStore.getState().initialize()
    await vi.waitFor(() => expect(useAuthStore.getState().isLoading).toBe(false))
    if (!listener) throw new Error('onAuthStateChange non chiamato')
    return listener
  }

  it('all\'avvio con la sessione di un altro utente: la bozza si scarta prima di «autenticato»', async () => {
    bozzaDi('u1')
    let vistaDaAutenticato: string | null = null
    const stop = useAuthStore.subscribe((a) => {
      if (a.isAuthenticated && vistaDaAutenticato === null) vistaDaAutenticato = useQuoteStore.getState().preventivo.cliente.nome
    })
    await avvia({ user: { id: 'u2' } })
    stop()
    expect(vistaDaAutenticato).toBe('')
    verificaScartata('u2')
  })

  it('login di un altro utente (SIGNED_IN e login()): la bozza si scarta', async () => {
    bozzaDi('u1')
    mocks.signInWithPassword.mockResolvedValue({ data: { user: { id: 'u2' } }, error: null })
    await useAuthStore.getState().login('altro@colettaebanisteria.it', 'pw')
    verificaScartata('u2')
  })

  it('stesso utente: la bozza resta, con il suo autore', async () => {
    bozzaDi('u1')
    await avvia({ user: { id: 'u1' } })
    expect(useQuoteStore.getState().preventivo.cliente.nome).toBe('Sentinella')
    expect(useQuoteStore.getState().autore).toBe('u1')
    expect(localStorage.getItem('coletta-quote-v1')).toContain('"autore":"u1"')
  })

  it('bozza senza autore (scritta prima di L21-B): non si sa di chi è, si scarta', async () => {
    bozzaDi(null)
    await avvia({ user: { id: 'u1' } })
    verificaScartata('u1')
  })
})
