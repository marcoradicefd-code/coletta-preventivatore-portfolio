import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

/**
 * L26 — il client VERO di `src/lib/supabase.ts` (auth-js installato), con la
 * sola `fetch` finta: nessuna richiesta esce. Il link di recupero apre una
 * sessione solo nel browser che l'ha chiesto (PKCE: `code` nell'URL più il
 * code_verifier salvato qui). Un link con i token nel frammento (flusso
 * implicit), che chiunque può costruire con un suo account e mandare a un
 * collega, non apre niente: niente login CSRF, niente password scelta per
 * l'account di un altro.
 */

const URL_SUPABASE = import.meta.env.VITE_SUPABASE_URL || 'https://env-supabase-mancanti.invalid'
/** Come supabase-js (`dist/index.mjs`, `defaultStorageKey`). */
const CHIAVE_VERIFIER = `sb-${new URL(URL_SUPABASE).hostname.split('.')[0]}-auth-token-code-verifier`

const UTENTE = { id: 'u-recupero', aud: 'authenticated', email: 'gianni.neri@example.test', app_metadata: {}, user_metadata: {} }
const SESSIONE = { access_token: 'at-finto', refresh_token: 'rt-finto', expires_in: 3600, token_type: 'bearer', user: UTENTE }

const risposta = (corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status: 200, headers: { 'content-type': 'application/json' } })

let fetchFinta: ReturnType<typeof vi.fn>

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  localStorage.setItem('coletta-auth-migrated', '1')
  localStorage.setItem('coletta-auth-remember', 'false') // Ricordami spento: sessione in sessionStorage
  fetchFinta = vi.fn(async (url: string) => (String(url).includes('/token') ? risposta(SESSIONE) : risposta(UTENTE)))
  vi.stubGlobal('fetch', fetchFinta)
  vi.resetModules()
})

afterEach(() => {
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

/** Apre l'app su `percorso`: il client nasce all'import e legge l'URL da sé. */
async function apriApp(percorso: string) {
  window.history.replaceState(null, '', percorso)
  const { supabase } = await import('@/lib/supabase')
  const { data } = await supabase.auth.getSession()
  return { supabase, sessione: data.session }
}

describe('supabase.ts — il ritorno dal link di recupero', () => {
  it('un link coi token nel frammento (flusso implicit, forgiabile) non apre una sessione e non chiama Supabase', async () => {
    const { sessione } = await apriApp(
      '/#access_token=at-altrui&expires_in=3600&refresh_token=rt-altrui&token_type=bearer&type=recovery'
    )

    expect(sessione).toBeNull()
    expect(fetchFinta).not.toHaveBeenCalled()
  })

  it('il code del link, nel browser che ha chiesto il recupero, apre la sessione col verifier salvato (anche in una scheda nuova)', async () => {
    // Il verifier sta in localStorage anche con Ricordami spento: il link si apre in un'altra scheda.
    localStorage.setItem(CHIAVE_VERIFIER, JSON.stringify('verifier-di-questo-browser/PASSWORD_RECOVERY'))

    const { sessione } = await apriApp('/?code=codice-dal-link')

    expect(sessione?.user.id).toBe(UTENTE.id)
    const [url, init] = fetchFinta.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/token?grant_type=pkce')
    expect(JSON.parse(String(init.body))).toMatchObject({ auth_code: 'codice-dal-link', code_verifier: 'verifier-di-questo-browser' })
    expect(window.location.search).toBe('')
    // La sessione va nello store scelto da Ricordami, come sempre.
    expect(Object.keys({ ...sessionStorage }).some((k) => k.endsWith('-auth-token'))).toBe(true)
  })

  it('lo stesso code in un browser senza verifier (link inoltrato o forgiato) non apre niente', async () => {
    const { sessione } = await apriApp('/?code=codice-dal-link')

    expect(sessione).toBeNull()
    expect(fetchFinta).not.toHaveBeenCalled()
  })

  it('resetPasswordForEmail manda il code_challenge e salva il verifier in localStorage, con Ricordami spento', async () => {
    const { supabase } = await apriApp('/')

    await supabase.auth.resetPasswordForEmail('gianni.neri@example.test', { redirectTo: 'http://localhost:3000/' })

    const [, init] = fetchFinta.mock.calls.at(-1) as [string, RequestInit]
    expect(JSON.parse(String(init.body)).code_challenge).toBeTruthy()
    expect(JSON.parse(localStorage.getItem(CHIAVE_VERIFIER) ?? '""')).toMatch(/\/PASSWORD_RECOVERY$/)
    expect(sessionStorage.getItem(CHIAVE_VERIFIER)).toBeNull()
  })
})
