import { test, expect, type BrowserContext } from '@playwright/test'

/**
 * L29 — «Registrati» con la barra della password, con Supabase FINTO. Il route
 * sta sul CONTESTO ed è messo prima di ogni navigazione, e prende OGNI
 * richiesta che non va a localhost: quelle di Supabase (qualunque percorso)
 * hanno una risposta finta, le altre si abortiscono. Così nessuna richiesta
 * arriva al progetto di `.env.local` (in L26 un e2e ne aveva mandata una per
 * sbaglio). Escluso dalla CI come gli altri e2e; si lancia a mano:
 * `npx playwright test e2e/registrazione.spec.ts`.
 *
 * Il flusso: una password debole che diventa buona, la barra e l'elenco che
 * seguono, il pulsante che parte solo coi due obbligatori, l'invio, l'avviso
 * neutro e il conto alla rovescia.
 */

const EMAIL = 'luca.verdi@colettaebanisteria.it'
const PASSWORD_BUONA = 'Coletta2026!x'

interface Chiamata {
  metodo: string
  url: URL
  corpo: string | null
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
}

async function soloSupabaseFinto(context: BrowserContext, chiamate: Chiamata[]) {
  await context.route(
    (url) => url.hostname !== 'localhost',
    async (route) => {
      const req = route.request()
      const url = new URL(req.url())
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
      chiamate.push({ metodo: req.method(), url, corpo: req.postData() })
      if (!/\/(auth|rest|storage|realtime|functions)\/v1\//.test(url.pathname)) return route.abort()
      const json = (body: unknown) =>
        route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(body) })
      // Registrazione con «Confirm email»: l'utente c'è, la sessione no.
      if (url.pathname.endsWith('/auth/v1/signup')) {
        return json({
          id: '00000000-0000-4000-8000-000000000129',
          aud: 'authenticated',
          role: '',
          email: EMAIL,
          app_metadata: { provider: 'email' },
          user_metadata: {},
          identities: [],
          created_at: '2026-10-16T00:00:00Z',
        })
      }
      return json([])
    }
  )
}

test('Registrati: password debole che diventa buona, invio e avviso neutro', async ({ page }) => {
  const chiamate: Chiamata[] = []
  const console_: string[] = []
  page.on('console', (m) => console_.push(m.text()))
  await soloSupabaseFinto(page.context(), chiamate)

  await page.goto('/')
  await page.getByRole('button', { name: 'Registrati', exact: true }).click()
  await page.getByLabel('Email').fill(EMAIL)

  const campo = page.getByPlaceholder('Minimo 10 caratteri')
  const barra = page.getByRole('meter', { name: 'Robustezza della password' })
  const invia = page.getByRole('button', { name: /^Registrati/ }).nth(1)

  // Debole: il pulsante non parte e dice perché.
  await campo.fill('abc')
  await expect(barra).toHaveAttribute('aria-valuetext', 'Molto debole')
  await expect(invia).toBeDisabled()
  await expect(page.getByText(/^Per registrarti manca:/)).toBeVisible()

  await campo.fill('abcdefghij')
  await expect(barra).toHaveAttribute('aria-valuetext', 'Debole')
  await expect(invia).toBeDisabled()

  // Buona: la barra arriva al verde, l'elenco si spunta, il pulsante parte.
  await campo.fill(PASSWORD_BUONA)
  await expect(barra).toHaveAttribute('aria-valuetext', 'Ottima')
  await expect(page.getByRole('list', { name: 'Richiesto' }).getByText('da fare')).toHaveCount(0)
  await expect(page.locator('[aria-live="polite"]')).toHaveText('Robustezza della password: Ottima')
  await page.getByPlaceholder('Ripeti la password').fill(PASSWORD_BUONA)
  await expect(invia).toBeEnabled()
  await invia.click()

  // L'avviso neutro di L26, e si torna ad «Accedi».
  await expect(page.getByRole('status')).toContainText("Se l'indirizzo è abilitato")
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByPlaceholder('Ripeti la password')).toHaveCount(0)

  // «Registrati» resta spento col conto alla rovescia.
  await page.getByRole('button', { name: 'Registrati', exact: true }).click()
  await expect(page.getByRole('button', { name: /^Registrati \(\d+ s\)$/ })).toBeDisabled()

  const signup = chiamate.filter((c) => c.url.pathname.endsWith('/auth/v1/signup'))
  expect(signup).toHaveLength(1)
  expect(JSON.parse(signup[0].corpo ?? '{}').email).toBe(EMAIL)
  // Né la password né l'email nella console del browser.
  expect(console_.filter((t) => t.includes(EMAIL) || t.includes(PASSWORD_BUONA))).toEqual([])
})
