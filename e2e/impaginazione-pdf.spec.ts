import { test, expect } from '@playwright/test'

/**
 * Impaginazione del PDF in Chromium, in modalità stampa (C4, C5, C6 della
 * revisione L15-L21). jsdom non impagina: qui si misura. La pagina
 * `e2e/stampa/index.html` (dev server di Vite, mai nel build) monta il solo
 * `PreventivoPrint` con dati FINTI e importi da 4 e 5 cifre: nessun login,
 * nessuna scrittura nel database. Escluso dalla CI come gli altri e2e.
 *
 * Lancio: `npx playwright test e2e/impaginazione-pdf.spec.ts`
 */
test.describe('PDF in stampa: importi su una riga, titoli e riepiloghi interi', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ media: 'print' })
    await page.goto('/e2e/stampa/index.html')
    await expect(page.getByText('PREVENTIVO', { exact: true })).toBeVisible()
  })

  test('C4: ogni importo «€ …» sta su una riga e dentro la sua cella', async ({ page }) => {
    const misure = await page.evaluate(() => {
      const foglie = [...document.querySelectorAll('td, span')].filter(
        (el) => el.children.length === 0 && /^-? ?€\s/.test(el.textContent ?? '')
      )
      return foglie.map((el) => {
        const r = document.createRange()
        r.selectNodeContents(el)
        const righe = new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size
        return { testo: el.textContent, righe, fuori: el.scrollWidth > el.clientWidth + 1 }
      })
    })
    expect(misure.length).toBeGreaterThan(8)
    expect(misure.some((m) => m.testo === '€ 99.999,00')).toBe(true)
    expect(misure.filter((m) => m.righe !== 1 || m.fuori)).toEqual([])
  })

  test('C5: «Subtotale <nome lungo>»: va a capo l’etichetta, l’importo resta su una riga', async ({ page }) => {
    const etichetta = page.getByText('Subtotale Parete attrezzata soggiorno e boiserie con tanti altri elementi')
    const righe = await etichetta.evaluate((el) => {
      const valore = el.nextElementSibling as HTMLElement
      const r = document.createRange()
      r.selectNodeContents(valore)
      return new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size
    })
    expect(righe).toBe(1)
  })

  test('C6: in stampa il titolo di sezione evita l’interruzione dopo, il riepilogo dentro, il subtotale prima', async ({ page }) => {
    const stili = await page.evaluate(() => {
      const titolo = [...document.querySelectorAll('div')].find((d) => d.textContent === 'Falegnameria Su Misura')!
      const riepilogo = document.querySelector('[data-riepilogo]')!
      const subtotale = document.querySelector('[data-subtotale-arredo]')!
      return {
        titolo: getComputedStyle(titolo).breakAfter,
        riepilogo: getComputedStyle(riepilogo).breakInside,
        subtotale: getComputedStyle(subtotale).breakBefore,
      }
    })
    expect(stili).toEqual({ titolo: 'avoid', riepilogo: 'avoid', subtotale: 'avoid' })
  })
})
