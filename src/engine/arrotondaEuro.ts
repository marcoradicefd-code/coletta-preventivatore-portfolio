import { safeFin } from '@/utils/format'

/**
 * Importo all'euro intero, al più vicino (risposta di Antonio, 08/10: D4). Ogni
 * importo che il preventivo mostra nasce qui, riga per riga, e i totali sono
 * SOMME di questi interi: mai un totale arrotondato per conto suo, che smetterebbe
 * di tornare con le righe stampate sopra di lui.
 *
 * Due passi:
 * 1. pulizia a 15 cifre significative, come fa Excel: toglie il rumore dei float
 *    (0,29 × 50 fa 14,499999999999998, cioè 14,5; 3.000 esatti diventano
 *    2.999,9999999999995, O1) senza spostare un valore vero. NON al centesimo:
 *    il doppio arrotondamento portava 2,495 a 2,50 e poi a 3, uno scarto di
 *    0,505 che non è «al più vicino»;
 * 2. all'euro, con il .5 LONTANO DA ZERO come il ROUND di Excel. `Math.round` da
 *    solo manda il .5 verso +∞ (-2,5 → -2), quindi si arrotonda il valore
 *    assoluto e si rimette il segno: simmetrica su sconti e negativi.
 *
 * Non finiti → 0, come `safeFin`. Mai -0: nel PDF non deve uscire «-€ 0,00».
 */
export function arrotondaEuro(importo: number): number {
  const pulito = Number(safeFin(importo).toPrecision(15))
  const allEuro = Math.round(Math.abs(pulito))
  return allEuro === 0 ? 0 : Math.sign(pulito) * allEuro
}
