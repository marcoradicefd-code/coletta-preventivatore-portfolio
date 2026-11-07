import { test, expect } from '@playwright/test'
import { STILE_PAGINA_STAMPA } from '../src/hooks/stilePaginaStampa'

/**
 * Lo sfondo del PDF (L24, punto 5), misurato in Chromium con `emulateMedia
 * print` sulla pagina di prova `e2e/stampa/` (dati FINTI, nessun login,
 * solo dev server). Escluso dalla CI come gli altri e2e.
 *
 * Il sospetto: `pageStyle` mette `print-color-adjust: exact` sul `body`, e
 * `index.css` dà al `body` lo sfondo della pagina (#F7F7F8). Nell'iframe di
 * `react-to-print` 3.3.0 arrivano tutti e due, in quest'ordine: prima lo
 * `<style>` del `pageStyle`, poi gli stili della pagina copiati (si legge in
 * `node_modules/react-to-print/dist/react-to-print.mjs`). Qui si mettono nello
 * stesso ordine, `index.css` com'è servito dal dev server.
 *
 * Lancio: `npx playwright test e2e/sfondo-pdf.spec.ts`
 */
test.describe('PDF in stampa: lo sfondo è bianco, gli sfondi voluti restano', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ media: 'print' })
    await page.goto('/e2e/stampa/index.html')
    await expect(page.getByText('PREVENTIVO', { exact: true })).toBeVisible()
    await page.addStyleTag({ content: STILE_PAGINA_STAMPA })
    await page.addStyleTag({ url: '/src/index.css?direct' })
  })

  test('il body in stampa ha sfondo bianco (con print-color-adjust: exact)', async ({ page }) => {
    const body = await page.evaluate(() => {
      const s = getComputedStyle(document.body)
      return { sfondo: s.backgroundColor, adatta: s.printColorAdjust }
    })
    // Presidio della misura: se index.css non arrivasse, il body sarebbe trasparente e il test non direbbe niente.
    const radice = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-surface-primary').trim())
    expect(radice.toLowerCase()).toBe('#f7f7f8')
    expect(body).toEqual({ sfondo: 'rgb(255, 255, 255)', adatta: 'exact' })
  })

  test('il navy del totale resta', async ({ page }) => {
    const navy = await page.evaluate(() =>
      [...document.querySelectorAll('tr, div')].some((el) => getComputedStyle(el).backgroundColor === 'rgb(17, 22, 33)')
    )
    expect(navy).toBe(true)
  })
})
