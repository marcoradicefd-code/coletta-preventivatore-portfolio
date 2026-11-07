import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react'
import { spiaConsole } from '@/test-utils/spiaConsole'

// L26: «Password dimenticata?» nella LoginPage. Supabase è finto: si guarda
// solo cosa vede l'utente, cosa parte verso `resetPasswordForEmail` e la console.
const mocks = vi.hoisted(() => ({
  resetPasswordForEmail: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      resetPasswordForEmail: mocks.resetPasswordForEmail,
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
    },
    from: () => ({}),
    storage: { from: () => ({}) },
  },
  LISTINI_BUCKET: 'Listini',
}))

import { LoginPage } from '@/components/auth/LoginPage'
import { MSG_LINK_INVIATO, MSG_TROPPE_RICHIESTE } from '@/store/authStore'
import { MSG_ERRORE_RETE } from '@/lib/erroriDb'

const EMAIL = 'mario.rossi@example.test'
/** Un `message` di Supabase che cita l'indirizzo: non deve arrivare né a schermo né in console. */
const MESSAGGIO_SUPABASE = `Email address "${EMAIL}" cannot be used`

const spia = spiaConsole()

beforeEach(() => {
  vi.clearAllMocks()
  spia.avvia()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  spia.ripristina()
})

/** Apre «Password dimenticata?» dopo aver scritto l'email nel form di accesso. */
function apriRecupero() {
  render(<LoginPage />)
  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: EMAIL },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Password dimenticata?' }))
}

function pulsanteInvia(): HTMLButtonElement {
  return screen.getByRole('button', { name: /^Invia il link/ }) as HTMLButtonElement
}

async function invia() {
  await act(async () => {
    fireEvent.click(pulsanteInvia())
  })
}

describe('LoginPage — «Password dimenticata?»', () => {
  it('il form si precompila con l\'email già scritta e chiama Supabase col redirectTo costante', async () => {
    mocks.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null })
    apriRecupero()

    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe(EMAIL)
    await invia()

    expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith(EMAIL, {
      redirectTo: `${window.location.origin}/`,
    })
  })

  // Requisito 1: nessuna differenza fra email registrata, non registrata o fuori whitelist.
  it.each([
    ['invio riuscito', { data: {}, error: null }],
    [
      'errore generico (500)',
      { data: null, error: { name: 'AuthApiError', status: 500, code: 'unexpected_failure', message: MESSAGGIO_SUPABASE } },
    ],
    [
      'utente inesistente (404)',
      { data: null, error: { name: 'AuthApiError', status: 404, code: 'user_not_found', message: MESSAGGIO_SUPABASE } },
    ],
    [
      'indirizzo non autorizzato (400)',
      { data: null, error: { name: 'AuthApiError', status: 400, code: 'email_address_not_authorized', message: MESSAGGIO_SUPABASE } },
    ],
  ])('%s: lo stesso messaggio, senza il testo di Supabase né l\'email in console', async (_caso, risposta) => {
    mocks.resetPasswordForEmail.mockResolvedValue(risposta)
    apriRecupero()
    await invia()

    expect(screen.getByRole('status').textContent).toContain(MSG_LINK_INVIATO)
    expect(MSG_LINK_INVIATO).toMatch(/Apri il link da questo stesso browser\.$/)
    expect(screen.queryByText(/cannot be used/)).toBeNull()
    expect(spia.trovati([EMAIL])).toEqual([])
  })

  // Requisito 2.
  it('un 429 ha il suo messaggio', async () => {
    mocks.resetPasswordForEmail.mockResolvedValue({
      data: null,
      error: { name: 'AuthApiError', status: 429, code: 'over_email_send_rate_limit', message: MESSAGGIO_SUPABASE },
    })
    apriRecupero()
    await invia()

    expect(screen.getByRole('alert').textContent).toContain(MSG_TROPPE_RICHIESTE)
    expect(screen.queryByText(MSG_LINK_INVIATO)).toBeNull()
  })

  it('la rete giù dà il messaggio di rete dell\'app, e il pulsante resta usabile', async () => {
    mocks.resetPasswordForEmail.mockResolvedValue({
      data: null,
      error: { name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' },
    })
    apriRecupero()
    await invia()

    expect(screen.getByRole('alert').textContent).toContain(MSG_ERRORE_RETE)
    expect(pulsanteInvia().disabled).toBe(false)
  })

  // Requisito 3: niente raffiche.
  it('il pulsante è disabilitato durante l\'invio e per 60 secondi dopo, col conto alla rovescia', async () => {
    vi.useFakeTimers()
    let rispondi: (v: unknown) => void = () => undefined
    mocks.resetPasswordForEmail.mockReturnValue(new Promise((r) => (rispondi = r)))
    apriRecupero()
    await invia()

    expect(pulsanteInvia().disabled).toBe(true)
    await act(async () => rispondi({ data: {}, error: null }))

    const pulsante = pulsanteInvia()
    expect(pulsante.disabled).toBe(true)
    expect(pulsante.textContent).toContain('60 s')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(59_000)
    })
    expect(pulsante.disabled).toBe(true)
    expect(pulsante.textContent).toContain('1 s')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000)
    })
    expect(pulsante.disabled).toBe(false)
    expect(mocks.resetPasswordForEmail).toHaveBeenCalledTimes(1)
  })
})
