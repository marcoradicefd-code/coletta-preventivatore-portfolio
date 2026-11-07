import { test, expect, type Page } from '@playwright/test'
import { motivoSenzaScrittura } from '../src/test-utils/progettoE2e'

/**
 * E2E del percorso di L21-B, contro un Supabase VERO con le migration 0003 e
 * 0004 applicate: nuovo preventivo → «Genera» senza cliente → crea il cliente
 * dalla scelta → PDF col numero del database → revisione → annulla. Più un
 * viewport mobile (375 × 812) per la barra fissa in basso e il pannello dal
 * basso. Dati SOLO finti: un cliente «Prova E2E …» col telefono di zeri, una
 * voce a valore «Voce di prova E2E».
 *
 * SCRIVE nel database: crea un cliente e due righe di preventivo (rev. 0 e
 * rev. 1, la seconda annullata) e consuma un numero dell'anno. Un utente non le
 * può cancellare; le toglie un admin (prima i preventivi, poi il cliente: le
 * due righe finiscono nel registro delle eliminazioni). Per questo NON parte
 * mai da sé: si auto-skippa, col motivo, se manca una delle tre condizioni
 * (`src/test-utils/progettoE2e.ts`, S5 della revisione L15-L21)
 *  - `E2E_EMAIL` / `E2E_PASSWORD` (in `.env.local`, come l'e2e del gres);
 *  - `E2E_DB_SCRITTURA=si` dalla SHELL, al lancio: da `.env.local` non si legge;
 *  - `VITE_SUPABASE_URL` del progetto coletta-dev: ogni altro progetto (la
 *    produzione compresa) è rifiutato, e il dev server non si riusa.
 * Il test mobile non scrive, ma fa login e legge l'anagrafica: stesse condizioni.
 *
 * Lancio: `E2E_DB_SCRITTURA=si npx playwright test e2e/preventivi-db.spec.ts --workers=1`
 */

const EMAIL = process.env.E2E_EMAIL
const PASSWORD = process.env.E2E_PASSWORD
// S5: credenziali, consenso dalla shell e URL di coletta-dev; altrimenti skip col motivo.
const MOTIVO_SKIP = motivoSenzaScrittura(process.env)

async function login(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.clear()
    } catch {
      /* noop */
    }
  })
  await page.goto('/')
  await page.getByLabel('Email').fill(EMAIL!)
  await page.getByPlaceholder('••••••••').fill(PASSWORD!)
  await page.locator('button[type="submit"]').click()
  await expect(page.getByRole('region', { name: 'Barra del preventivo' })).toBeVisible({ timeout: 20_000 })
}

/** La voce a valore che rende il preventivo non vuoto (Progetto a valore: nessun listino). */
async function unaVoce(page: Page) {
  await page.getByRole('button', { name: 'Progetto a valore' }).first().click()
  await page.getByRole('button', { name: /Aggiungi voce/ }).first().click()
  await page.getByPlaceholder('Descrizione della voce…').fill('Voce di prova E2E')
  await page.getByLabel('Prezzo').fill('100')
}

test.describe('Preventivi nel database — il percorso di L21-B (dati finti)', () => {
  test('nuovo → «Genera» senza cliente → crea il cliente → PDF col numero → revisione → annulla', async ({ page }) => {
    test.skip(MOTIVO_SKIP !== null, MOTIVO_SKIP ?? '')
    test.setTimeout(90_000)
    const nome = `Prova E2E ${Date.now()}`

    await login(page)
    const barra = page.getByRole('region', { name: 'Barra del preventivo' })

    await test.step('un preventivo nuovo con una voce: «Non ancora salvato»', async () => {
      await unaVoce(page)
      await expect(barra.getByText('Non ancora salvato')).toBeVisible()
      await expect(barra.getByText('Modifiche non salvate')).toBeVisible()
    })

    let numero = ''
    await test.step('«Genera» senza cliente: si sceglie (si crea) il cliente, si salva e si stampa nello stesso gesto', async () => {
      await barra.getByRole('button', { name: /Genera Preventivo/ }).click()
      const scelta = page.getByRole('dialog', { name: 'Scegli il cliente per generare il preventivo' })
      await scelta.getByRole('combobox').fill(nome)
      await scelta.getByRole('option', { name: `+ Crea "${nome}"` }).click()
      await scelta.getByLabel('Telefono').fill('000 0000000')
      await scelta.getByRole('button', { name: 'Crea e usa questo cliente' }).click()
      const salvato = page.getByText(/^Salvato come N\. \d{4}-\d{3,}$/)
      await expect(salvato).toBeVisible({ timeout: 15_000 })
      numero = (await salvato.textContent())!.match(/\d{4}-\d{3,}/)![0]
      await expect(barra.getByText(`N. ${numero} · Bozza`)).toBeVisible()
      await expect(barra.getByText(/^Salvato alle \d{2}:\d{2}$/)).toBeVisible()
      // Il PDF (montato fuori schermo per la stampa) ha il numero del database.
      await expect(page.getByText(`Preventivo N. ${numero}`)).toBeAttached()
    })

    await test.step('revisione dalla pagina Preventivi: stesso numero, rev. 1', async () => {
      await page.getByRole('button', { name: 'Preventivi', exact: true }).click()
      await page.getByRole('region', { name: 'Preventivo aperto' }).getByRole('button', { name: 'Nuova revisione' }).click()
      await expect(page.getByText(`Salvata la revisione N. ${numero} rev. 1.`)).toBeVisible({ timeout: 15_000 })
    })

    await test.step('annulla la revisione: la conferma coi verbi, il numero resta, lo stato è annullato', async () => {
      await page.getByRole('button', { name: `Annulla il preventivo ${numero} rev. 1` }).click()
      await page.getByRole('alertdialog').getByRole('button', { name: 'Annulla il preventivo' }).click()
      await expect(page.getByText(`Preventivo N. ${numero} rev. 1 annullato.`)).toBeVisible({ timeout: 15_000 })
      await expect(barra.getByText(`N. ${numero} rev. 1 · Annullato`)).toBeVisible()
    })
  })
})

test.describe('Mobile 375 × 812 — barra fissa in basso e pannello dal basso', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true })

  test('la barra sta in fondo e non copre i campi; la scelta del cliente è un pannello dal basso', async ({ page }) => {
    test.skip(MOTIVO_SKIP !== null, MOTIVO_SKIP ?? '')
    test.setTimeout(60_000)
    await login(page)
    const barra = page.getByRole('region', { name: 'Barra del preventivo' })

    const box = (await barra.boundingBox())!
    expect(Math.round(box.y + box.height)).toBe(812)
    expect(Math.round(box.width)).toBe(375)
    // I pulsanti della barra sono bersagli da 44 px.
    for (const nome of ['Salva', /Genera Preventivo/]) {
      expect((await barra.getByRole('button', { name: nome }).boundingBox())!.height).toBeGreaterThanOrEqual(44)
    }

    // In fondo alla pagina l'ultimo campo resta sopra la barra.
    await unaVoce(page)
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    const ultimo = (await page.locator('main input, main textarea, main select').last().boundingBox())!
    expect(ultimo.y + ultimo.height).toBeLessThanOrEqual((await barra.boundingBox())!.y)

    // La scelta del cliente: a tutta larghezza, attaccata al fondo.
    await barra.getByRole('button', { name: 'Scegli il cliente' }).click()
    const scelta = page.getByRole('dialog', { name: 'Scegli il cliente' })
    await expect(scelta).toBeVisible()
    const pannello = (await scelta.boundingBox())!
    expect(Math.round(pannello.width)).toBe(375)
    expect(Math.round(pannello.y + pannello.height)).toBe(812)
    await page.keyboard.press('Escape')
    await expect(scelta).toBeHidden()
  })
})
