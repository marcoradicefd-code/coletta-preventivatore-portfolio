import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, act, fireEvent, within } from '@testing-library/react'
import { spiaConsole } from '@/test-utils/spiaConsole'

// L29: la barra della robustezza e l'elenco dei requisiti in «Registrati» e
// in «Imposta una nuova password». Supabase è finto e non viene mai chiamato:
// si guarda cosa vede e cosa sente chi scrive. Password inventate.
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signUp: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      updateUser: vi.fn(),
    },
    from: () => ({ select: () => ({ eq: () => ({ single: vi.fn() }) }) }),
    storage: { from: () => ({}) },
  },
  LISTINI_BUCKET: 'Listini',
}))

import { LoginPage } from '@/components/auth/LoginPage'
import { NuovaPasswordPage } from '@/components/auth/NuovaPasswordPage'
import { ToastProvider } from '@/components/shared/Toast'
import { RITARDO_ANNUNCIO_MS } from '@/components/auth/IndicatorePassword'
import { useAuthStore } from '@/store/authStore'

const EMAIL = 'mario.rossi@example.test'
const spia = spiaConsole()

beforeEach(() => {
  useAuthStore.setState({ user: null, avvisoAccesso: null })
  spia.avvia()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  spia.ripristina()
})

function apriRegistrati() {
  render(<LoginPage />)
  fireEvent.click(screen.getAllByRole('button', { name: 'Registrati' })[0])
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: EMAIL } })
}

const campoPassword = () => screen.getByPlaceholderText('Minimo 10 caratteri') as HTMLInputElement
const scrivi = (valore: string, campo = campoPassword()) => fireEvent.change(campo, { target: { value: valore } })
const barra = () => screen.getByRole('meter', { name: 'Robustezza della password' })
const pieni = () => barra().querySelectorAll('[data-pieno="true"]').length
const regioneLive = () => document.querySelector('[aria-live="polite"]') as HTMLElement
/** Il pulsante d'invio del form di registrazione (il primo «Registrati» è la scheda). */
const pulsanteRegistrati = () => screen.getAllByRole('button', { name: /^Registrati/ })[1] as HTMLButtonElement

function voce(elenco: string, testo: string) {
  const lista = screen.getByRole('list', { name: elenco })
  return within(lista).getByText(testo).closest('li') as HTMLElement
}

describe('Registrati — la barra della robustezza', () => {
  it('si aggiorna mentre si scrive, dal rosso al verde', () => {
    apriRegistrati()

    scrivi('abc')
    expect(barra().getAttribute('aria-valuenow')).toBe('0')
    expect(pieni()).toBe(1)
    expect(barra().querySelector('[data-pieno="true"]')?.className).toContain('bg-error-su-navy')

    scrivi('abcdefghij')
    expect(barra().getAttribute('aria-valuenow')).toBe('1')

    scrivi('Coletta2026!x')
    expect(barra().getAttribute('aria-valuenow')).toBe('4')
    expect(pieni()).toBe(4)
    expect(barra().querySelector('[data-pieno="true"]')?.className).toContain('bg-success-su-navy')
    // Colore e larghezza non si animano con prefers-reduced-motion.
    expect(barra().querySelector('[data-pieno]')?.className).toContain('motion-reduce:transition-none')
  })

  it('è un role="meter" da 0 a 4 col livello in parole, collegato al campo', () => {
    apriRegistrati()
    scrivi('Mariolino27')

    const m = barra()
    expect(m.getAttribute('aria-valuemin')).toBe('0')
    expect(m.getAttribute('aria-valuemax')).toBe('4')
    expect(m.getAttribute('aria-valuenow')).toBe('3')
    expect(m.getAttribute('aria-valuetext')).toBe('Buona')
    // Il colore non è l'unico segnale: l'etichetta è scritta accanto.
    expect(m.textContent).toContain('Buona')
    expect(campoPassword().getAttribute('aria-describedby')?.split(' ')).toContain(m.id)
  })

  it('la regione live annuncia solo al cambio di livello, dopo una pausa', () => {
    vi.useFakeTimers()
    apriRegistrati()
    const avanti = () => act(() => vi.advanceTimersByTime(RITARDO_ANNUNCIO_MS))

    scrivi('abc')
    avanti()
    expect(regioneLive().textContent).toBe('') // stesso livello di partenza: niente

    scrivi('abcdefghij')
    expect(regioneLive().textContent).toBe('') // non a ogni tasto
    avanti()
    expect(regioneLive().textContent).toBe('Robustezza della password: Debole')

    // Un livello toccato e lasciato prima della pausa non si annuncia.
    scrivi('Coletta2026!x')
    act(() => vi.advanceTimersByTime(RITARDO_ANNUNCIO_MS / 2))
    scrivi('abcdefghijk')
    avanti()
    expect(regioneLive().textContent).toBe('Robustezza della password: Debole')

    scrivi('Coletta2026!x')
    avanti()
    expect(regioneLive().textContent).toBe('Robustezza della password: Ottima')
  })

  it('il pulsante resta disattivato senza gli obbligatori, col motivo scritto accanto', () => {
    apriRegistrati()
    scrivi('abcdefghij')

    expect(pulsanteRegistrati().disabled).toBe(true)
    const motivo = screen.getByText(/^Per registrarti manca:/)
    expect(motivo.textContent).toBe('Per registrarti manca: almeno una lettera e una cifra.')
    expect(pulsanteRegistrati().getAttribute('aria-describedby')).toBe(motivo.id)

    // I suggerimenti non bloccano: «abcdefgh12» ne manca quattro e si può inviare.
    scrivi('abcdefgh12')
    expect(pulsanteRegistrati().disabled).toBe(false)
    expect(screen.queryByText(/^Per registrarti manca:/)).toBeNull()
  })

  it('l’elenco dice «fatto» e «da fare», e separa «Richiesto» da «Consigliato»', () => {
    apriRegistrati()
    scrivi('abcdefghij')

    expect(voce('Richiesto', 'Almeno 10 caratteri').textContent).toContain('fatto')
    expect(voce('Richiesto', 'Almeno una lettera e una cifra').textContent).toContain('da fare')
    expect(voce('Consigliato', 'Maiuscole e minuscole').textContent).toContain('da fare')
    expect(voce('Consigliato', 'Nessun carattere ripetuto 3 volte di fila').textContent).toContain('fatto')
    // Con l'email scritta compare il suggerimento del nome dell'email.
    expect(voce('Consigliato', 'Non contiene il nome della tua email')).not.toBeNull()
  })

  it('in «Accedi» non c’è né la barra né l’elenco', () => {
    render(<LoginPage />)
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'abc' } })

    expect(screen.queryByRole('meter')).toBeNull()
    expect(screen.queryByRole('list', { name: 'Richiesto' })).toBeNull()
  })

  it('la valutazione non scrive in console né la password né l’email', () => {
    vi.useFakeTimers()
    apriRegistrati()
    for (const p of ['abc', 'abcdefghij', 'Coletta2026!x']) {
      scrivi(p)
      act(() => vi.advanceTimersByTime(RITARDO_ANNUNCIO_MS))
    }

    expect(spia.trovati(['Coletta2026!x', 'abcdefghij', EMAIL])).toEqual([])
  })
})

describe('Imposta una nuova password — la stessa barra', () => {
  function apriNuovaPassword() {
    useAuthStore.setState({ user: { id: 'u1', email: EMAIL } as never })
    render(
      <ToastProvider>
        <NuovaPasswordPage />
      </ToastProvider>
    )
  }
  const pulsanteSalva = () => screen.getByRole('button', { name: 'Salva la nuova password' }) as HTMLButtonElement

  it('barra, elenco e pulsante si comportano come in «Registrati»', () => {
    apriNuovaPassword()
    const campo = screen.getByLabelText('Nuova password') as HTMLInputElement

    scrivi('abc', campo)
    expect(barra().getAttribute('aria-valuetext')).toBe('Molto debole')
    expect(campo.getAttribute('aria-describedby')?.split(' ')).toContain(barra().id)
    expect(pulsanteSalva().disabled).toBe(true)
    expect(screen.getByText(/^Per salvare manca:/).textContent).toBe(
      'Per salvare manca: almeno 10 caratteri; almeno una lettera e una cifra.'
    )
    expect(voce('Richiesto', 'Almeno 10 caratteri').textContent).toContain('da fare')

    scrivi('Coletta2026!x', campo)
    expect(barra().getAttribute('aria-valuetext')).toBe('Ottima')
    expect(pulsanteSalva().disabled).toBe(false)
    // L'email dell'account aperto vale per il suggerimento del nome.
    expect(voce('Consigliato', 'Non contiene il nome della tua email').textContent).toContain('fatto')
  })
})
