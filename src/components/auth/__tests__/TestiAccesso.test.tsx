import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react'

// L26, aggiunta di Marco del 15/10: la pagina di accesso non dice quali
// domini sono ammessi né quali account esistono (risposta generica, OWASP).
// I domini e il trigger non cambiano: cambiano solo i testi.
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
import { MSG_REGISTRAZIONE } from '@/store/authStore'

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
})

function vaiARegistrati() {
  fireEvent.click(screen.getAllByRole('button', { name: 'Registrati' })[0])
}

function campoEmail(): HTMLInputElement {
  return screen.getByLabelText('Email') as HTMLInputElement
}

async function registra(email: string, password: string, ripeti = password) {
  fireEvent.change(campoEmail(), { target: { value: email } })
  fireEvent.change(screen.getByPlaceholderText('Minimo 10 caratteri'), { target: { value: password } })
  fireEvent.change(screen.getByPlaceholderText('Ripeti la password'), { target: { value: ripeti } })
  await act(async () => {
    fireEvent.submit(campoEmail().closest('form') as HTMLFormElement)
  })
}

describe('LoginPage — i testi non dicono domini né account', () => {
  it.each([
    ['Accedi', false],
    ['Registrati', true],
  ])('in «%s» il campo email non ha segnaposto e la pagina non nomina i domini', (_modo, registrati) => {
    const { container } = render(<LoginPage />)
    if (registrati) vaiARegistrati()

    expect(campoEmail().hasAttribute('placeholder')).toBe(false)
    expect(container.textContent).not.toContain('@colettaebanisteria.it')
    expect(container.textContent).not.toContain('luxuryacademy')
    expect(container.textContent).toContain('Accesso riservato al personale Coletta Ebanisteria.')
  })

  it.each([
    ['dominio fuori lista (bloccato nel client, nessuna chiamata)', 'mario.rossi@example.test', null],
    [
      'account già esistente',
      'anna.bianchi@colettaebanisteria.it',
      { data: { user: null, session: null }, error: { name: 'AuthApiError', status: 422, code: 'user_already_exists', message: 'User already registered' } },
    ],
    [
      'registrazione con conferma via email (utente senza sessione)',
      'luca.verdi@colettaebanisteria.it',
      { data: { user: { id: 'u-nuovo' }, session: null }, error: null },
    ],
  ])('%s: lo stesso avviso, non un errore rosso', async (_caso, email, risposta) => {
    if (risposta) mocks.signUp.mockResolvedValue(risposta)
    render(<LoginPage />)
    vaiARegistrati()
    await registra(email, 'una-password-lunga7')

    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('status').textContent).toContain(MSG_REGISTRAZIONE)
    expect(mocks.signUp).toHaveBeenCalledTimes(risposta ? 1 : 0)
    // Stesso stato della pagina in tutti e tre i casi: si torna ad «Accedi».
    expect(screen.queryByPlaceholderText('Ripeti la password')).toBeNull()
  })

  it('la password corta dà lo stesso errore che il dominio sia ammesso o no', async () => {
    const errori: string[] = []
    for (const email of ['mario.rossi@example.test', 'anna.bianchi@colettaebanisteria.it']) {
      render(<LoginPage />)
      vaiARegistrati()
      await registra(email, 'corta')
      errori.push(screen.getByRole('alert').textContent ?? '')
      cleanup()
    }

    expect(errori[0]).toContain('La password deve contenere almeno 10 caratteri.')
    expect(errori[1]).toBe(errori[0])
    expect(mocks.signUp).not.toHaveBeenCalled()
  })

  it('L29: senza una cifra la password non parte, col messaggio della regola', async () => {
    render(<LoginPage />)
    vaiARegistrati()
    await registra('anna.bianchi@colettaebanisteria.it', 'soltantolettere')

    expect(screen.getByRole('alert').textContent).toContain('La password deve contenere almeno una lettera e una cifra.')
    expect(mocks.signUp).not.toHaveBeenCalled()
  })
})
