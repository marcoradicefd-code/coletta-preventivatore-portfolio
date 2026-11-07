import { describe, it, expect } from 'vitest'
import { safeFin, formatEur, formatDate, formatPercent } from '@/utils/format'

// Forza un fuso a OVEST di UTC: col vecchio formatDate (new Date("YYYY-MM-DD") =
// mezzanotte UTC) la data scivolerebbe al giorno precedente. Eseguito a livello
// di modulo, prima che i test chiamino formatDate.
process.env.TZ = 'America/New_York'

describe('safeFin', () => {
  it('lascia passare i numeri finiti', () => {
    expect(safeFin(12.34)).toBe(12.34)
    expect(safeFin(0)).toBe(0)
    expect(safeFin(-5)).toBe(-5)
  })

  it('NaN / Infinity → 0', () => {
    expect(safeFin(NaN)).toBe(0)
    expect(safeFin(Infinity)).toBe(0)
    expect(safeFin(-Infinity)).toBe(0)
  })
})

describe('formatEur', () => {
  // Sempre 2 decimali con virgola decimale + separatore migliaia col PUNTO.
  it('formatta con 2 decimali e virgola decimale', () => {
    expect(formatEur(5.5)).toBe('5,50')
    expect(formatEur(0)).toBe('0,00')
    expect(formatEur(1234.5)).toBe('1.234,50')
  })

  // Blinda il fix `useGrouping: true` (il default "auto" del CLDR italiano NON
  // raggruppava sotto 10.000 → 1300 usciva "1300,00"). Il separatore deve comparire
  // da 1.000 in su, senza toccare gli importi piccoli o i decimali.
  it('separatore migliaia col punto da 1.000 in su (fascia critica)', () => {
    expect(formatEur(1300)).toBe('1.300,00') // il caso che oggi falliva
    expect(formatEur(999)).toBe('999,00') // sotto 1000: nessun separatore, invariato
    expect(formatEur(10000)).toBe('10.000,00') // già ok prima, resta ok
    expect(formatEur(1234567)).toBe('1.234.567,00') // milioni
    expect(formatEur(1300.5)).toBe('1.300,50') // decimali preservati
  })

  it('valori non finiti → 0,00 (via safeFin)', () => {
    expect(formatEur(NaN)).toBe('0,00')
    expect(formatEur(Infinity)).toBe('0,00')
  })
})

describe('formatDate — timezone-safe (NEW-003)', () => {
  it('il fuso di test è a ovest di UTC (probe: il parsing UTC scivolerebbe)', () => {
    // Conferma che l'ambiente esercita davvero il bug: new Date("YYYY-MM-DD")
    // (mezzanotte UTC) cade nel giorno precedente in un fuso a ovest.
    expect(new Date('2026-05-28').getDate()).toBe(27)
  })

  it('àncora la data al calendario locale: nessuno scivolamento di giorno', () => {
    expect(formatDate('2026-05-28')).toBe('28/05/2026')
    expect(formatDate('2026-01-01')).toBe('01/01/2026')
    expect(formatDate('2026-12-31')).toBe('31/12/2026')
  })

  it('gestisce anche stringhe ISO con orario (usa la parte data)', () => {
    expect(formatDate('2026-03-15T09:30:00Z')).toBe('15/03/2026')
  })
})

// Gli sconti decimali sono ammessi (decisione del 06/10): l'etichetta del PDF
// deve dire 12,5% se lo sconto calcolato è il 12,5%, non 13%.
describe('formatPercent — frazione in percentuale italiana, al massimo due decimali', () => {
  it('decimale quando serve, intero quando basta', () => {
    expect(formatPercent(0.125)).toBe('12,5%')
    expect(formatPercent(0.13)).toBe('13%')
    expect(formatPercent(0.1)).toBe('10%')
  })

  it('nessun rumore dei float', () => {
    expect(formatPercent(0.07)).toBe('7%') // 0.07 × 100 = 7.000000000000001
    expect(formatPercent(0.1234)).toBe('12,34%') // due decimali, come il parser degli sconti
  })
})
