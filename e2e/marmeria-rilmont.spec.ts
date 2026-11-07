import { test, expect, type Page } from '@playwright/test'
import * as XLSX from 'xlsx'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * E2E REALE del flusso gres contro il listino LIVE caricato dal bucket Supabase.
 *
 * NON usa dati mockati per il listino: login reale → `AppShell.loadDefaults`
 * scarica il listino dal bucket → worker → parser (RIL_MONT letto per
 * intestazione) → calcolo → riepilogo a schermo.
 *
 * ── ANCORAGGIO ALLA REVISIONE ATTIVA ──
 * La fixture è il **Rev_83** (LUG26), che è il file servito dal bucket dal
 * 18/07/2026: `loadDefaults` ordina per `updated_at desc` e prende il primo
 * marmeria, quindi il Rev_82 (29/06) non viene più letto da nessuno.
 * Prima questo test leggeva i prezzi dal Rev_82 mentre l'app caricava il Rev_83:
 * passava solo perché la riga usata non si era mossa fra le due revisioni —
 * verde per fortuna, non per costruzione. Se cambi il file nel bucket, cambia
 * QUESTA costante.
 *
 * Sensibilità: i prezzi materiali sono letti A RUNTIME dalla fixture
 * (gitignored, identica al file nel bucket), MAI scritti nel codice. Le fasce
 * rilievo+montaggio fisse (350/400) sono costanti, poco sensibili; l'importo
 * della fascia a percentuale è DERIVATO dal prezzo letto, non cablato.
 *
 * Prerequisiti (altrimenti il test si auto-SKIPPA, come i golden):
 *  - `E2E_EMAIL` / `E2E_PASSWORD` in `.env.local` (account esistente, dominio whitelisted)
 *  - fixture Rev_83 in `src/parsers/__tests__/fixtures/`
 * Il test NON salva né invia nulla: genera e legge solo il riepilogo a schermo.
 */

const FIXTURE = resolve(
  process.cwd(),
  'src/parsers/__tests__/fixtures/LUG26 MARMERIA_DE_BARI_INTERNO_Rev_83_sconto_mob.xlsx'
)
const EMAIL = process.env.E2E_EMAIL
const PASSWORD = process.env.E2E_PASSWORD

// Fasce RIL_MONT a importo FISSO (formattate it-IT, come a schermo).
const RILMONT_1000_1500 = '350,00'
const RILMONT_1500_2000 = '400,00'

/**
 * La fascia aperta (≥3.000) del listino: 15% con DUE arrotondamenti per
 * eccesso, all'euro e poi al multiplo di 5. È la formula del foglio RIL_MONT
 * (`CEILING(CEILING(base*0.15,1),5)`), non un 15% liscio.
 */
function rilMontPercentuale(base: number): number {
  return Math.ceil(Math.ceil(base * 0.15) / 5) * 5
}

const GRES_PRODUTTORI = new Set([
  'LAMINAM', 'FLORIM', 'MARAZZI', 'LAMINAM_SELECTION', 'MARAZZI_SELECTION', 'GENERICO',
])

interface GresCand {
  produttore: string
  /** = coloreFinituraCompleto (col 3); scelto UNIVOCO → nessun suffisso di dedup nel parser. */
  coloreKey: string
  /** €/mq spessore 13 fascia ≤62 (col 18) — letto dal listino attivo (Rev_83). */
  prezzoMq: number
}

/** Estrae dalla fixture attiva (Rev_83) un materiale gres (spessore 13, prezzo ≥150, chiave univoca). */
function pickGresMaterial(): GresCand | null {
  const wb = XLSX.read(readFileSync(FIXTURE), { sheetRows: 2000 })
  const g = XLSX.utils.sheet_to_json(wb.Sheets['GAMMA_COLORI'], { header: 1, defval: '' }) as unknown[][]

  const keyCount = new Map<string, number>()
  for (let i = 1; i < g.length; i++) {
    const k = String(g[i]?.[3] ?? '').trim()
    if (k) keyCount.set(k, (keyCount.get(k) ?? 0) + 1)
  }

  for (let i = 1; i < g.length; i++) {
    const row = g[i]
    const produttore = String(row?.[0] ?? '').trim()
    if (!GRES_PRODUTTORI.has(produttore)) continue
    const disp13 = Number(row?.[6]) === 1
    const raw = row?.[18]
    const prezzoMq = typeof raw === 'number' ? raw : parseFloat(String(raw))
    const coloreKey = String(row?.[3] ?? '').trim()
    // prezzo ≥150 → 20mq ≥ 3000 (fascia aperta); chiave univoca → match con la dropdown UI.
    if (disp13 && Number.isFinite(prezzoMq) && prezzoMq >= 150 && coloreKey && keyCount.get(coloreKey) === 1) {
      return { produttore, coloreKey, prezzoMq }
    }
  }
  return null
}

const cand = existsSync(FIXTURE) ? pickGresMaterial() : null
const hasPrereqs = !!EMAIL && !!PASSWORD && !!cand

/** Formatta un numero come a schermo (it-IT, 2 decimali). Deve rispecchiare
 *  `formatEur`: `useGrouping:true` per il separatore migliaia (importi qui ≥1000). */
function eur(n: number): string {
  return n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true })
}
const round1 = (n: number) => Math.round(n * 10) / 10
/**
 * Importo all'euro intero come l'engine (D4: pulizia a 15 cifre significative
 * come Excel, poi all'euro, .5 lontano da zero). Riscritto qui apposta, non
 * importato: è l'oracolo del test, e un errore dell'engine non deve passare
 * anche da qui.
 */
const euroIntero = (n: number) => {
  const p = Number(n.toPrecision(15))
  return Math.sign(p) * Math.round(Math.abs(p))
}

async function login(page: Page) {
  await page.addInitScript(() => { try { localStorage.clear() } catch { /* noop */ } })
  await page.goto('/')
  await page.getByLabel('Email').fill(EMAIL!)
  await page.getByPlaceholder('••••••••').fill(PASSWORD!)
  await page.locator('button[type="submit"]').click()
  // AppShell autenticata montata (tab operativi visibili).
  await expect(page.getByRole('button', { name: 'Gres' })).toBeVisible({ timeout: 20_000 })
}

async function openMarmeriaConListino(page: Page) {
  await page.getByRole('button', { name: 'Gres' }).click()
  // loadDefaults popola il listino dal bucket (download + worker parse): può volerci qualche secondo.
  await expect(page.getByText(/materiali disponibili/i)).toBeVisible({ timeout: 30_000 })
}

async function addGresMaterial(page: Page, c: GresCand) {
  await page.locator('select:has(option:text-is("Seleziona produttore..."))').selectOption(c.produttore)
  await page.locator('select:has(option:text-is("Seleziona colore..."))').selectOption(c.coloreKey)
  await page.locator('select:has(option:text-is("Seleziona spessore..."))').selectOption('13')
  await page.getByPlaceholder('es. 60').fill('60') // profondità → fascia ≤62
  await page.getByRole('button', { name: 'Aggiungi riga' }).click()
  await expect(qtaMqInput(page)).toBeVisible()
}

// La riga materiale (Top) è l'unico stepper in MQ → max=20; bordo/varie/alzatine
// usano ML/PZ (max=50). Così distinguo il campo qtà materiale dagli altri ~14.
const qtaMqInput = (page: Page) => page.locator('input.qty-stepper-input[max="20"]')

async function setQta(page: Page, qta: number) {
  const input = qtaMqInput(page)
  await input.fill(String(qta))
  await input.blur()
}

const materialiRow = (page: Page) =>
  page.locator('div.flex.items-center.justify-between').filter({ hasText: 'Materiali' }).first()
const rilMontRow = (page: Page) =>
  page.locator('div.flex.items-center.justify-between').filter({ hasText: 'Rilievo + montaggio' })

test.describe('Marmeria gres — RIL_MONT Rev_83 (end-to-end reale)', () => {
  test('fasce 350/400, fascia aperta a percentuale, prezzo materiale dal Rev_83', async ({ page }) => {
    test.skip(!hasPrereqs, 'Richiede E2E_EMAIL/E2E_PASSWORD in .env.local e la fixture Rev_83')
    // Catena reale: login + download bucket + worker parse + 3 scenari → oltre i 30s di default.
    test.setTimeout(90_000)
    const c = cand!

    await login(page)
    await openMarmeriaConListino(page)
    await addGresMaterial(page, c)

    // Abilito rilievo + montaggio (unica checkbox nel riepilogo marmeria).
    await page.locator('label:has-text("Includi rilievo e montaggio") input[type="checkbox"]').check()

    await test.step('imponibile 1000-1500 → ril+mont 350 + prezzo materiale torna col listino', async () => {
      const qta = round1(1250 / c.prezzoMq)
      await setQta(page, qta)
      // Il totale materiali (= imponibile) deve corrispondere al prezzo del listino × qtà,
      // all'euro intero (D4).
      await expect(materialiRow(page)).toContainText(eur(euroIntero(qta * c.prezzoMq)))
      await expect(rilMontRow(page)).toContainText(RILMONT_1000_1500)
      // Log non sensibili (no prezzi): confermo i punti verificati.
      console.log('[e2e] ✓ prezzo materiale gres coerente col listino attivo (totale = qtà × €/mq del listino)')
      console.log('[e2e] ✓ imponibile 1000–1500 → rilievo+montaggio = 350')
    })

    await test.step('imponibile 1500-2000 → ril+mont 400', async () => {
      const qta = round1(1750 / c.prezzoMq)
      await setQta(page, qta)
      await expect(materialiRow(page)).toContainText(eur(euroIntero(qta * c.prezzoMq)))
      await expect(rilMontRow(page)).toContainText(RILMONT_1500_2000)
      console.log('[e2e] ✓ imponibile 1500–2000 → rilievo+montaggio = 400')
    })

    await test.step('imponibile ≥3000 (fascia aperta) → 15% con doppio arrotondamento', async () => {
      // Questo step asseriva `ril+mont = 0` e la riga ASSENTE dal riepilogo:
      // pinnava il bug. Lo zero non era una regola commerciale, era il valore
      // in cache della formula `CEILING(E2*0.15,1)` in un file salvato con il
      // preventivo vuoto. Istruzione Antonio, call 31/07/2026: sopra i 3.000 si
      // applica il 15%, ribaltato al cliente così com'è.
      const qta = 20
      await setQta(page, qta) // 20 mq × (≥150 €/mq) ≥ 3000
      // La base è l'importo intero dei materiali (D4): lo scaglione si sceglie su
      // quello che il riepilogo stampa.
      const base = euroIntero(qta * c.prezzoMq)
      // DERIVATO dal prezzo del listino, non cablato. Col candidato che il
      // picker trova oggi nel Rev_83 (FLORIM "CEMENT_Dark Grey_MAT_Soft",
      // 332,84 €/mq): 6.656,80 → 6.657 all'euro → ×0,15 = 998,55 → 999 → 1.000.
      // Il numero cambia se cambia il primo gres utile del listino: per questo
      // si deriva. Prima del Rev_83 il picker cadeva su GENERICO "C50" (157
      // €/mq), che dava 3.140,00 → 471 → 475: un altro materiale e un altro
      // importo, ennesima ragione per ancorare il test alla revisione attiva.
      const atteso = rilMontPercentuale(base)

      await expect(materialiRow(page)).toContainText(eur(base))
      await expect(rilMontRow(page)).toHaveCount(1)
      await expect(rilMontRow(page)).toContainText(eur(atteso))
      console.log(`[e2e] ✓ imponibile ≥3000 → rilievo+montaggio = ${atteso} (15% + CEILING euro + CEILING 5)`)
    })
  })
})
