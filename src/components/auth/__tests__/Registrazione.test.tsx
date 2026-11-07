import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react'
import { spiaConsole } from '@/test-utils/spiaConsole'

// L29: gli errori di «Registrati» in italiano, letti da nome, status e codice
// (mai dal `message`), e il pulsante che non permette raffiche. Il 16/10 la
// registrazione era spenta su Supabase e ogni invio diceva «Si è verificato un
// errore»: ora `signup_disabled` ha il suo messaggio. I casi neutri di L26
// (dominio fuori lista, account già esistente, attesa di conferma) restano in
// TestiAccesso.test.tsx, invariati; qui si guarda che anche il conto alla
// rovescia sia uguale per tutti e tre. Supabase è finto.
const mocks = vi.hoisted(() => ({
  signUp: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signUp: mocks.signUp,
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
      resetPasswordForEmail: vi.fn(),
    },
    from: () => ({ select: () => ({ eq: () => ({ single: vi.fn() }) }) }),
    storage: { from: () => ({}) },
  },
  LISTINI_BUCKET: 'Listini',
}))

import { LoginPage } from '@/components/auth/LoginPage'
import { MSG_REGISTRAZIONE, MSG_TROPPE_RICHIESTE, useAuthStore } from '@/store/authStore'
import { MSG_ERRORE_RETE } from '@/lib/erroriDb'

const EMAIL = 'anna.bianchi@colettaebanisteria.it'
const PASSWORD = 'Coletta2026!x'
/** Un `message` di Supabase che cita l'indirizzo: non deve arrivare né a schermo né in console. */
const MESSAGGIO_SUPABASE = `Signups not allowed for ${EMAIL}`

const spia = spiaConsole()

beforeEach(() => {
  vi.clearAllMocks()
  useAuthStore.setState({ user: null, avvisoAccesso: null })
  spia.avvia()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  spia.ripristina()
})

const tab = (nome: 'Accedi' | 'Registrati') => screen.getAllByRole('button', { name: nome })[0]
/** Il pulsante d'invio: il secondo pulsante che comincia con «Registrati» (il primo è la scheda). */
const pulsanteRegistrati = () => screen.getAllByRole('button', { name: /^Registrati/ })[1] as HTMLButtonElement

function compila(email = EMAIL, password = PASSWORD) {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } })
  fireEvent.change(screen.getByPlaceholderText('Minimo 10 caratteri'), { target: { value: password } })
  fireEvent.change(screen.getByPlaceholderText('Ripeti la password'), { target: { value: password } })
}

async function registra(email = EMAIL, password = PASSWORD) {
  render(<LoginPage />)
  fireEvent.click(tab('Registrati'))
  compila(email, password)
  await act(async () => {
    fireEvent.click(pulsanteRegistrati())
  })
}

describe('Registrati — gli errori in italiano', () => {
  it.each([
    [
      'registrazione spenta su Supabase (signup_disabled)',
      { name: 'AuthApiError', status: 422, code: 'signup_disabled' },
      "La registrazione non è attiva: chiedi all'amministratore.",
    ],
    [
      'password rubata (weak_password, pwned)',
      { name: 'AuthWeakPasswordError', status: 422, code: 'weak_password', reasons: ['pwned'] },
      "Questa password compare fra quelle rubate in altri siti: scegline un'altra.",
    ],
    [
      'password corta per il server (weak_password, length)',
      { name: 'AuthWeakPasswordError', status: 422, code: 'weak_password', reasons: ['length'], message: 'Password should be at least 12 characters.' },
      'La password deve avere almeno 12 caratteri.',
    ],
    [
      'caratteri mancanti per il server (weak_password, characters)',
      { name: 'AuthWeakPasswordError', status: 422, code: 'weak_password', reasons: ['characters'] },
      'La password deve contenere almeno una lettera e una cifra.',
    ],
    ['429', { name: 'AuthApiError', status: 429, code: 'over_request_rate_limit' }, MSG_TROPPE_RICHIESTE],
    ['limite delle email (over_email_send_rate_limit)', { name: 'AuthApiError', status: 400, code: 'over_email_send_rate_limit' }, MSG_TROPPE_RICHIESTE],
    ['rete giù', { name: 'AuthRetryableFetchError', status: 0 }, MSG_ERRORE_RETE],
    ['errore sconosciuto', { name: 'AuthApiError', status: 500, code: 'unexpected_failure' }, 'Si è verificato un errore. Riprova.'],
  ])('%s: il suo messaggio, mai quello di Supabase', async (_caso, errore, atteso) => {
    mocks.signUp.mockResolvedValue({ data: { user: null, session: null }, error: { message: MESSAGGIO_SUPABASE, ...errore } })
    await registra()

    expect(screen.getByRole('alert').textContent).toContain(atteso)
    expect(screen.queryByText(/Signups not allowed|should be/)).toBeNull()
    expect(spia.trovati([EMAIL, PASSWORD])).toEqual([])
  })

  it('un signUp che rigetta dà il messaggio di rete', async () => {
    mocks.signUp.mockRejectedValue(new TypeError('Failed to fetch'))
    await registra()

    expect(screen.getByRole('alert').textContent).toContain(MSG_ERRORE_RETE)
  })
})

describe('Registrati — il pulsante e le raffiche', () => {
  it('è disattivato durante l’invio, con lo spinner', async () => {
    let rispondi: (v: unknown) => void = () => undefined
    mocks.signUp.mockReturnValue(new Promise((r) => (rispondi = r)))
    await registra()

    expect(pulsanteRegistrati().disabled).toBe(true)
    expect(pulsanteRegistrati().querySelector('.animate-spin')).not.toBeNull()
    await act(async () => rispondi({ data: { user: { id: 'u-nuovo' }, session: null }, error: null }))
  })

  it.each([
    ['attesa di conferma', 'luca.verdi@colettaebanisteria.it', { data: { user: { id: 'u-nuovo' }, session: null }, error: null }],
    [
      'account già esistente',
      EMAIL,
      { data: { user: null, session: null }, error: { name: 'AuthApiError', status: 422, code: 'user_already_exists', message: 'User already registered' } },
    ],
    ['dominio fuori lista', 'mario.rossi@example.test', null],
  ])('dopo un invio riuscito (%s) resta disattivato 60 secondi col conto alla rovescia', async (_caso, email, risposta) => {
    vi.useFakeTimers()
    if (risposta) mocks.signUp.mockResolvedValue(risposta)
    await registra(email)
    expect(screen.getByRole('status').textContent).toContain(MSG_REGISTRAZIONE)

    // Si torna ad «Accedi», che resta usabile; «Registrati» no, anche con tutto in regola.
    expect((screen.getAllByRole('button', { name: 'Accedi' })[1] as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(tab('Registrati'))
    compila(email)
    expect(pulsanteRegistrati().disabled).toBe(true)
    expect(pulsanteRegistrati().textContent).toContain('(60 s)')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(59_000)
    })
    expect(pulsanteRegistrati().disabled).toBe(true)
    expect(pulsanteRegistrati().textContent).toContain('(1 s)')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000)
    })
    expect(pulsanteRegistrati().disabled).toBe(false)
    expect(mocks.signUp).toHaveBeenCalledTimes(risposta ? 1 : 0)
  })

  it('dopo un errore che non ha mandato niente (signup_disabled) si può riprovare subito', async () => {
    mocks.signUp.mockResolvedValue({ data: { user: null, session: null }, error: { name: 'AuthApiError', status: 422, code: 'signup_disabled' } })
    await registra()

    expect(pulsanteRegistrati().disabled).toBe(false)
  })
})
