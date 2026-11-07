import { test, expect, type Page } from '@playwright/test'

/**
 * L26 — recupero password dall'inizio alla fine, con Supabase FINTO: ogni
 * richiesta a `/auth/v1`, `/rest/v1` e `/storage/v1` la risponde `page.route`,
 * quindi nessuna chiamata arriva al progetto di `.env.local`. Escluso dalla CI
 * come gli altri e2e; si lancia a mano: `npx playwright test e2e/recupero-password.spec.ts`.
 *
 * Il flusso: «Password dimenticata?», invio, messaggio; ritorno col link di
 * recupero (flusso PKCE: `?code=` scambiato col verifier salvato da questo
 * browser all'invio), F5 che non apre l'app, nuova password, ingresso con
 * «Password aggiornata». In più: un link forgiato coi token nel frammento
 * (login CSRF) non apre niente.
 */

const EMAIL = 'mario.rossi@example.test'
const NUOVA_PASSWORD = 'una-password-nuova-e2e-7'
const UTENTE = {
  id: '00000000-0000-4000-8000-000000000126',
  aud: 'authenticated',
  role: 'authenticated',
  email: EMAIL,
  app_metadata: { provider: 'email' },
  user_metadata: {},
  created_at: '2026-10-15T00:00:00Z',
}

/** Un JWT dalla forma giusta e dalla firma finta: nessuno lo verifica, il server è il route qui sotto. */
function tokenFinto(scadenza: number): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UTENTE.id, exp: scadenza, role: 'authenticated', aud: 'authenticated' })}.firma-finta`
}

interface Chiamata {
  metodo: string
  percorso: string
  query: URLSearchParams
  corpo: string | null
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
}

/** Sul CONTESTO, non sulla pagina: copre anche la scheda nuova del link (un route di pagina non la vede). */
async function supabaseFinto(page: Page, chiamate: Chiamata[]) {
  await page.context().route(/\/(auth|rest|storage)\/v1\//, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    chiamate.push({ metodo: req.method(), percorso: url.pathname, query: url.searchParams, corpo: req.postData() })
    const json = (body: unknown) =>
      route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(body) })
    if (url.pathname.endsWith('/auth/v1/recover')) return json({})
    if (url.pathname.endsWith('/auth/v1/token')) {
      const ora = Math.floor(Date.now() / 1000)
      return json({
        access_token: tokenFinto(ora + 3600),
        refresh_token: 'rt-finto',
        expires_in: 3600,
        expires_at: ora + 3600,
        token_type: 'bearer',
        user: UTENTE,
      })
    }
    if (url.pathname.endsWith('/auth/v1/user')) return json(UTENTE) // GET dal link, PUT della password
    if (url.pathname.includes('/rest/v1/profiles')) return json({ id: UTENTE.id, role: 'user' })
    return json([]) // listini, clienti, preventivi: vuoti
  })
}

test('recupero password: link, form, messaggio, ritorno col link, F5, nuova password, ingresso', async ({ page: primaPagina }) => {
  let page = primaPagina
  const chiamate: Chiamata[] = []
  const console_: string[] = []
  page.on('console', (m) => console_.push(m.text()))
  await supabaseFinto(page, chiamate)

  // 1. «Password dimenticata?» con l'email già scritta.
  await page.goto('/')
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByRole('button', { name: 'Password dimenticata?' }).click()
  await expect(page.getByLabel('Email')).toHaveValue(EMAIL)
  await page.getByRole('button', { name: /^Invia il link/ }).click()

  await expect(page.getByRole('status')).toContainText("Se l'indirizzo è registrato")
  await expect(page.getByRole('button', { name: /^Invia il link/ })).toBeDisabled()
  const recover = chiamate.find((c) => c.percorso.endsWith('/auth/v1/recover'))
  expect(recover?.query.get('redirect_to')).toBe('http://localhost:5173/')
  const corpoRecover = JSON.parse(recover?.corpo ?? '{}')
  expect(corpoRecover.email).toBe(EMAIL)
  expect(corpoRecover.code_challenge).toBeTruthy() // PKCE

  // 2. Ritorno col link dell'email in una scheda nuova dello stesso browser:
  // il verifier è in localStorage, quindi la scheda nuova lo trova.
  const scheda = await page.context().newPage()
  scheda.on('console', (m) => console_.push(m.text()))
  await scheda.goto('/?code=codice-dal-link')
  await page.close()
  page = scheda
  const titolo = page.getByRole('heading', { name: 'Imposta una nuova password' })
  await expect(titolo).toBeVisible()
  await expect(page.getByRole('button', { name: 'Esci' })).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => window.location.search)).toBe('')
  const scambio = chiamate.find((c) => c.percorso.endsWith('/auth/v1/token'))
  expect(scambio?.query.get('grant_type')).toBe('pkce')
  expect(JSON.parse(scambio?.corpo ?? '{}').auth_code).toBe('codice-dal-link')
  const token = (await page.evaluate(() => JSON.stringify({ ...sessionStorage, ...localStorage }))).match(/eyJ[\w-]+\.[\w-]+\.firma-finta/)?.[0] ?? 'token-mancante'

  // 3. F5: si resta sulla pagina di recupero, l'app non si apre.
  await page.reload()
  await expect(titolo).toBeVisible()
  await expect(page.getByRole('button', { name: 'Esci' })).toHaveCount(0)

  // 4. Nuova password, ingresso con l'avviso.
  await page.getByLabel('Nuova password').fill(NUOVA_PASSWORD)
  await page.getByLabel('Ripeti la password').fill(NUOVA_PASSWORD)
  await page.getByRole('button', { name: 'Salva la nuova password' }).click()

  await expect(page.getByText('Password aggiornata')).toBeVisible()
  await expect(titolo).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Esci' })).toBeVisible()
  const put = chiamate.find((c) => c.metodo === 'PUT' && c.percorso.endsWith('/auth/v1/user'))
  expect(JSON.parse(put?.corpo ?? '{}').password).toBe(NUOVA_PASSWORD)

  // 5. E un F5 adesso apre l'app, non il recupero.
  await page.reload()
  await expect(page.getByRole('button', { name: 'Esci' })).toBeVisible()
  await expect(titolo).toHaveCount(0)

  // Nessuna email, token o password nella console del browser.
  expect(console_.filter((t) => t.includes(EMAIL) || t.includes(token) || t.includes(NUOVA_PASSWORD))).toEqual([])
})

test('un link forgiato coi token di un altro account nel frammento non apre niente (login CSRF)', async ({ page }) => {
  const chiamate: Chiamata[] = []
  await supabaseFinto(page, chiamate)
  const ora = Math.floor(Date.now() / 1000)
  await page.goto(
    `/#access_token=${tokenFinto(ora + 3600)}&expires_at=${ora + 3600}&expires_in=3600&refresh_token=rt-altrui&token_type=bearer&type=recovery`
  )

  await expect(page.getByRole('heading', { name: 'Password dimenticata?' })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('Il link non è più valido')
  await expect(page.getByRole('heading', { name: 'Imposta una nuova password' })).toHaveCount(0)
  expect(chiamate.filter((c) => c.percorso.startsWith('/auth/v1/'))).toEqual([])
  expect(await page.evaluate(() => window.location.hash)).toBe('')
})
