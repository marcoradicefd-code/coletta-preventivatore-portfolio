import type { RilMontScaglione } from '@/types/marmeria'
import { safeFin } from '@/utils/format'

/**
 * ── RILIEVO + MONTAGGIO: la forma del listino, non una tabella nostra ──
 *
 * Il foglio `RIL_MONT` non è una tabella di intervalli: è un IF a cascata,
 * misurato sul file reale (Rev_82 e Rev_83, identici):
 *
 *   E4 = IF($E$2>=A5, CEILING($C$5,5),
 *          IF($E$2>=A4, C4,
 *            IF($E$2>=A3, C3, C2)))
 *   C5 = CEILING(E2*0.15, 1)
 *
 * Tre conseguenze, tutte lette dal file e nessuna decisa a tavolino:
 *
 * 1. Il confronto è `>=` sul solo DA, scandito dal DA PIÙ ALTO al più basso.
 *    **La colonna A non entra nella formula**: non è un limite superiore, è
 *    documentazione. Leggerla come tetto apriva un buco fra 2.000,01 e 2.999,99
 *    — lì il preventivo non trovava nessuna fascia e cadeva sul fallback, che
 *    restituiva l'importo dell'ULTIMO elemento dell'array: la fascia aperta, il
 *    cui importo in cache è 0. Da cui i due bug: 2.500 → 0 invece di 400 e
 *    4.000 → 0 invece di 600.
 *
 * 2. L'ultimo `else` della cascata è `C2`, cioè la fascia PIÙ BASSA. Sotto il
 *    primo DA il listino non dice "niente": dice 300. Quello che è sparito è il
 *    vecchio fallback all'ultimo elemento dell'array, che non era l'else di
 *    nessuno.
 *
 * 3. La fascia aperta non è un importo, è una percentuale con DUE
 *    arrotondamenti per eccesso: prima all'euro (`CEILING(...,1)`), poi al
 *    multiplo di 5 (`CEILING(C5,5)`). Su 4.000 fa 600 e sembra un 15% liscio;
 *    su 4.010 fa 605, non 601,50. La struttura sta qui, il MOLTIPLICATORE si
 *    legge dalla formula (`parseRilMont`) perché è un dato del listino.
 *
 * NIENTE GUARDIE DI ARROTONDAMENTO sul prodotto. Verificato su tutti gli interi
 * da 3.000 a 20.000: zero divergenze fra `Math.ceil(base * 0.15)` e il CEILING
 * di Excel. Una guardia a 2 decimali sarebbe una regressione, non una difesa:
 * su 3.000,01 Excel fa 450,0015 → 451 → 455, la guardia direbbe 450.
 *
 * LA BASE invece si arrotonda al centesimo, ed è un'altra cosa: la base è una
 * somma di importi, e la somma float sfora di un'inezia. 3,25 mq × 332,84 +
 * 16,17 ml × 131 fa 3.200 esatti, in float 3200,0000000000005: il CEILING la
 * porta a 485 invece di 480. 1,88 mq × 1135 + 14,2 ml × 61 fa 3.000 esatti, in
 * float 2999,9999999999995: fascia 400 invece di 450 (review 07/10, O1). Il
 * centesimo è la risoluzione degli importi, quindi 3.000,01 resta 3.000,01.
 *
 * Fonte della specifica: istruzione Antonio, call 31/07/2026 — 15% sempre sopra
 * i 3.000, ribaltato al cliente così com'è; 400 fissi in 2.000-3.000 confermati.
 */

/** Arrotondamento per eccesso al multiplo di `passo`: il CEILING di Excel. */
function ceilAlMultiplo(valore: number, passo: number): number {
  return Math.ceil(valore / passo) * passo
}

/** `CEILING(base*pct, 1)` → all'euro. */
const PASSO_EURO = 1
/** `CEILING(C5, 5)` → al multiplo di 5. */
const PASSO_SCATTO = 5

export function calcRilMont(totaleFloat: number, scaglioni: RilMontScaglione[]): number {
  if (scaglioni.length === 0 || !Number.isFinite(totaleFloat)) return 0
  const totale = Math.round(totaleFloat * 100) / 100

  // Dal DA più alto al più basso: è l'ordine di valutazione dell'IF a cascata.
  // Non mi fido dell'ordine in cui gli scaglioni arrivano dal foglio.
  const dalPiuAlto = [...scaglioni].sort((x, y) => y.da - x.da)

  // `find` = il primo `>=` che risponde. Se nessuno risponde siamo sotto il DA
  // più basso, e lì la cascata cade sul suo ultimo `else`: la fascia più bassa.
  const scelto = dalPiuAlto.find((s) => totale >= s.da) ?? dalPiuAlto[dalPiuAlto.length - 1]

  if (scelto.percentuale === undefined) return safeFin(scelto.importo)

  const allEuro = ceilAlMultiplo(totale * scelto.percentuale, PASSO_EURO)
  return safeFin(ceilAlMultiplo(allEuro, PASSO_SCATTO))
}
