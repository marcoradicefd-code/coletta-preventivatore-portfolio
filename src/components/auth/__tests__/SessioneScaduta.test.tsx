import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react'
import { spiaConsole } from '@/test-utils/spiaConsole'

// L26: dopo un SIGNED_OUT a sessione aperta (token rifiutato al rinnovo, quindi
// anche i 30 giorni del time-box, o sessione chiusa da un altro dispositivo) la
// pagina di accesso lo dice, una volta. Non dopo il logout, non all'avvio.
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signOut: vi.fn(),
  signInWithPassword: vi.fn(),
  single: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
      onAuthStateChange: mocks.onAuthStateChange,
      signOut: mocks.signOut,
      signInWithPassword: mocks.signInWithPassword,
      signUp: vi.fn(),
      updateUser: vi.fn(),
      resetPasswordForEmail: vi.fn(),
    },
    from: () => ({ select: () => ({ eq: () => ({ single: mocks.single }) }) }),
    storage: { from: () => ({}) },
  },
  LISTINI_BUCKET: 'Listini',
}))

import { AuthGuard } from '@/components/auth/AuthGuard'
import { ToastProvider } from '@/components/shared/Toast'
import { useAuthStore, MSG_SESSIONE_SCADUTA } from '@/store/authStore'

type Listener = (event: string, session: unknown) => void

const EMAIL = 'luca.verdi@example.test'
const TOKEN = 'token-finto-della-sessione'
const SESSIONE = { access_token: TOKEN, user: { id: 'u1', email: EMAIL } }

const spia = spiaConsole()
let listener: Listener | undefined

function statoIniziale() {
  useAuthStore.setState({
    user: null,
    profile: null,
    isAuthenticated: false,
    isAdmin: false,
    isLoading: true,
    inRecupero: false,
    avvisoAccesso: null,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  sessionStorage.clear()
  window.history.replaceState(null, '', '/')
  statoIniziale()
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

/** Avvio dell'app (o F5): lo store riparte da zero, `getSession` rende `sessione`. */
async function avvia(sessione: unknown) {
  cleanup()
  statoIniziale()
  render(
    <ToastProvider>
      <AuthGuard>
        <p>App aperta</p>
      </AuthGuard>
    </ToastProvider>
  )
  mocks.getSession.mockResolvedValue({ data: { session: sessione }, error: null })
  await act(async () => {
    useAuthStore.getState().initialize()
  })
  await vi.waitFor(() => expect(useAuthStore.getState().isLoading).toBe(false))
}

function avvisoVisibile(): boolean {
  return screen.queryAllByRole('status').some((n) => n.textContent?.includes(MSG_SESSIONE_SCADUTA))
}

describe('Avviso di sessione scaduta', () => {
  // Requisito 8.
  it('compare dopo un SIGNED_OUT con utente', async () => {
    await avvia(SESSIONE)
    expect(screen.getByText('App aperta')).not.toBeNull()

    await act(async () => listener?.('SIGNED_OUT', null))

    expect(screen.queryByText('App aperta')).toBeNull()
    expect(avvisoVisibile()).toBe(true)
    expect(spia.trovati([EMAIL, TOKEN])).toEqual([])
  })

  it('non compare dopo il logout, anche se signOut emette SIGNED_OUT con l\'utente ancora presente', async () => {
    await avvia(SESSIONE)
    // Come auth-js: `_removeSession` avvisa i listener prima che `signOut` risolva.
    mocks.signOut.mockImplementation(async () => {
      listener?.('SIGNED_OUT', null)
      return { error: null }
    })

    await act(async () => {
      await useAuthStore.getState().logout()
    })

    expect(screen.queryByText('App aperta')).toBeNull()
    expect(avvisoVisibile()).toBe(false)
  })

  it.each([
    ['getSession senza sessione', null, 'INITIAL_SESSION'],
    ['SIGNED_OUT all\'avvio (refresh token rifiutato, utente ancora nullo)', null, 'SIGNED_OUT'],
  ])('non compare all\'avvio: %s', async (_caso, sessione, evento) => {
    await avvia(sessione)
    await act(async () => listener?.(evento, null))

    expect(avvisoVisibile()).toBe(false)
  })

  it('non si ripete dopo un F5 sulla pagina di accesso', async () => {
    await avvia(SESSIONE)
    await act(async () => listener?.('SIGNED_OUT', null))
    expect(avvisoVisibile()).toBe(true)

    await avvia(null)

    expect(avvisoVisibile()).toBe(false)
  })

  it('va via al primo gesto sulla pagina di accesso', async () => {
    await avvia(SESSIONE)
    await act(async () => listener?.('SIGNED_OUT', null))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Password dimenticata?' }))
    })

    expect(avvisoVisibile()).toBe(false)
  })
})
