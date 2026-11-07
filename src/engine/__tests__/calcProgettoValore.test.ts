import { describe, it, expect } from 'vitest'
import { calcProgettoValore, importoRigaValore } from '@/engine/calcProgettoValore'
import type { RigaProgettoValore } from '@/types/quote'

const riga = (descrizione: string, prezzo: number): RigaProgettoValore => ({
  id: descrizione,
  descrizione,
  prezzo,
})

describe('calcProgettoValore', () => {
  it('righe vuote → tutto 0', () => {
    expect(calcProgettoValore([])).toEqual({ subtotale: 0, sconto: 0, totale: 0 })
  })

  it('somma i prezzi delle righe, ognuna all\'euro intero (nessuno sconto)', () => {
    // 250,5 → 251 (.5 lontano da zero): il subtotale è la somma delle righe arrotondate.
    const righe = [riga('a', 1000), riga('b', 250.5)]
    expect(calcProgettoValore(righe)).toEqual({ subtotale: 1251, sconto: 0, totale: 1251 })
  })

  it('arrotonda riga per riga, mai il subtotale: 0,4 + 0,4 fa 0, non 1', () => {
    expect(calcProgettoValore([riga('a', 0.4), riga('b', 0.4)])).toEqual({ subtotale: 0, sconto: 0, totale: 0 })
  })

  it('lo sconto è un importo intero e il totale torna: 12,5% su 1001 → 125', () => {
    // 1001 × 0,125 = 125,125 → 125; totale 1001 − 125 = 876.
    expect(calcProgettoValore([riga('a', 1001)], 0.125)).toEqual({ subtotale: 1001, sconto: 125, totale: 876 })
  })

  it('importoRigaValore è l\'importo che il subtotale somma', () => {
    expect(importoRigaValore({ prezzo: 99.5 })).toBe(100)
    expect(importoRigaValore({ prezzo: Number.NaN })).toBe(0)
  })

  it('scontoFrac omesso equivale a nessuno sconto', () => {
    expect(calcProgettoValore([riga('a', 500)])).toEqual({ subtotale: 500, sconto: 0, totale: 500 })
  })

  it('applica lo sconto sul subtotale (25% su 1000 → 250, totale 750)', () => {
    const righe = [riga('a', 800), riga('b', 200)] // subtotale 1000
    expect(calcProgettoValore(righe, 0.25)).toEqual({ subtotale: 1000, sconto: 250, totale: 750 })
  })

  it('clampa lo sconto in [0,1]: >1 → 1 (totale 0), <0 → 0', () => {
    const righe = [riga('a', 1000)]
    expect(calcProgettoValore(righe, 1.5)).toEqual({ subtotale: 1000, sconto: 1000, totale: 0 })
    expect(calcProgettoValore(righe, -0.5)).toEqual({ subtotale: 1000, sconto: 0, totale: 1000 })
  })

  it('sconto non-finito (NaN/∞) → 0', () => {
    const righe = [riga('a', 1000)]
    expect(calcProgettoValore(righe, NaN)).toEqual({ subtotale: 1000, sconto: 0, totale: 1000 })
    expect(calcProgettoValore(righe, Infinity)).toEqual({ subtotale: 1000, sconto: 0, totale: 1000 })
  })

  it('prezzo non-finito (NaN/∞) conta 0 (difensivo)', () => {
    const righe = [riga('a', 500), riga('b', NaN), riga('c', Infinity)]
    expect(calcProgettoValore(righe)).toEqual({ subtotale: 500, sconto: 0, totale: 500 })
  })
})
