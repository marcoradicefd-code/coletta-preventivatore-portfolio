import { describe, it, expect } from 'vitest'
import {
  validateFiniture,
  coloriFiniture,
  laminatiAbet,
  coloriPerSistema,
  trovaColorePerCodice,
  cercaColore,
  cercaLaminato,
  etichettaColore,
  etichettaLaminato,
  cercaFiniture,
} from '@/data/finiture'

/**
 * Pin dei dati finiture statici (RAL/NCS/Sikkens + laminati ABET), generati dai
 * listini di Antonio. Sono dati commerciali NON sensibili (codici colore pubblici),
 * quindi restano nel repo (a differenza dei listini prezzi gitignorati).
 */
describe('finiture — dati statici', () => {
  it('validateFiniture() non lancia (fail-loud sui dati statici)', () => {
    expect(() => validateFiniture()).not.toThrow()
  })

  it('357 colori totali: 216 RAL + 83 NCS + 58 Sikkens', () => {
    expect(coloriFiniture).toHaveLength(357)
    expect(coloriPerSistema('RAL')).toHaveLength(216)
    expect(coloriPerSistema('NCS')).toHaveLength(83)
    expect(coloriPerSistema('Sikkens')).toHaveLength(58)
  })

  it('51 laminati ABET', () => {
    expect(laminatiAbet).toHaveLength(51)
  })

  it('ogni hex matcha /^#[0-9A-F]{6}$/ e rgb è coerente con hex', () => {
    const HEX = /^#[0-9A-F]{6}$/
    for (const c of coloriFiniture) {
      expect(c.hex).toMatch(HEX)
      const r = parseInt(c.hex.slice(1, 3), 16)
      const g = parseInt(c.hex.slice(3, 5), 16)
      const b = parseInt(c.hex.slice(5, 7), 16)
      expect(c.rgb).toEqual([r, g, b])
    }
  })

  it('lookup: trovaColorePerCodice / cercaColore / cercaLaminato', () => {
    expect(trovaColorePerCodice('RAL', 'RAL 1000')).toBeDefined()
    // case-insensitive sul codice
    expect(trovaColorePerCodice('RAL', 'ral 1000')).toBeDefined()
    expect(cercaColore('beige').length).toBeGreaterThan(0)
    expect(cercaLaminato('magnolia').length).toBeGreaterThan(0)
  })
})

describe('finiture — opzioni combobox', () => {
  it('etichetta ricca = codice + nome/descrizione', () => {
    const c = trovaColorePerCodice('RAL', 'RAL 1000')!
    expect(etichettaColore(c)).toBe('RAL 1000 — Beige verdastro')
    const mag = laminatiAbet.find((l) => l.descrizione === 'MAGNOLIA')!
    expect(etichettaLaminato(mag)).toBe('ABET 1813 — MAGNOLIA')
  })

  it('cercaFiniture("") = catalogo completo, rispettando il cap', () => {
    const TOT = 357 + 51
    const tutte = cercaFiniture('', Infinity)
    expect(tutte.totale).toBe(TOT)
    expect(tutte.opzioni).toHaveLength(TOT)

    const capped = cercaFiniture('', 10)
    expect(capped.opzioni).toHaveLength(10)
    expect(capped.totale).toBe(TOT) // totale = match prima del cap → messaggio "+X altri"
  })

  it('filtra colori e laminati; hex valorizzato solo sui colori', () => {
    const beige = cercaFiniture('beige', Infinity)
    expect(beige.totale).toBeGreaterThan(0)
    expect(beige.opzioni.every((o) => o.value.toLowerCase().includes('beige'))).toBe(true)

    const ral = cercaFiniture('RAL 1000')
    expect(ral.opzioni[0].gruppo).toBe('RAL')
    expect(ral.opzioni[0].hex).toMatch(/^#[0-9A-F]{6}$/)

    const mag = cercaFiniture('magnolia')
    const lam = mag.opzioni.find((o) => o.gruppo === 'Laminati ABET')
    expect(lam).toBeDefined()
    expect(lam!.hex).toBeNull()
  })
})
