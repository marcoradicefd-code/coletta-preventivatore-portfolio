import { describe, it, expect } from 'vitest'
import {
  safeString,
  safeFloat,
  safeInt,
  isEmptyRow,
  normLabel,
  findHeaderRow,
  MAX_STRING_LENGTH,
} from '@/parsers/parserUtils'

describe('safeString', () => {
  it('null/undefined → stringa vuota', () => {
    expect(safeString(null)).toBe('')
    expect(safeString(undefined)).toBe('')
  })

  it('numeri e booleani vengono stringificati', () => {
    expect(safeString(42)).toBe('42')
    expect(safeString(0)).toBe('0')
    expect(safeString(true)).toBe('true')
  })

  it('rimuove caratteri di controllo e fa trim', () => {
    expect(safeString('  ciao\x00\x07  ')).toBe('ciao')
    expect(safeString('a\x1Fb')).toBe('ab')
  })

  it('tronca le stringhe oltre MAX_STRING_LENGTH', () => {
    const long = 'x'.repeat(MAX_STRING_LENGTH + 50)
    expect(safeString(long)).toHaveLength(MAX_STRING_LENGTH)
  })
})

describe('safeFloat', () => {
  it('null/undefined/stringa vuota → null', () => {
    expect(safeFloat(null)).toBeNull()
    expect(safeFloat(undefined)).toBeNull()
    expect(safeFloat('')).toBeNull()
  })

  it('numeri finiti passano invariati', () => {
    expect(safeFloat(3.14)).toBe(3.14)
    expect(safeFloat(0)).toBe(0)
    expect(safeFloat(-5)).toBe(-5)
  })

  it('stringhe numeriche vengono parse-ate', () => {
    expect(safeFloat('12.5')).toBe(12.5)
  })

  it('NaN e Infinity → null', () => {
    expect(safeFloat('abc')).toBeNull()
    expect(safeFloat(NaN)).toBeNull()
    expect(safeFloat(Infinity)).toBeNull()
    expect(safeFloat(-Infinity)).toBeNull()
  })
})

describe('safeInt', () => {
  it('arrotonda all\'intero più vicino', () => {
    expect(safeInt(2.4)).toBe(2)
    expect(safeInt(2.6)).toBe(3)
    expect(safeInt('7.9')).toBe(8)
  })

  it('propaga null per input non numerici', () => {
    expect(safeInt('')).toBeNull()
    expect(safeInt('abc')).toBeNull()
  })
})

describe('isEmptyRow', () => {
  it('true se tutte le celle sono vuote/null/undefined', () => {
    expect(isEmptyRow(['', null, undefined])).toBe(true)
    expect(isEmptyRow([])).toBe(true)
  })

  it('false se almeno una cella ha contenuto (anche 0)', () => {
    expect(isEmptyRow(['', 0, ''])).toBe(false)
    expect(isEmptyRow(['x'])).toBe(false)
  })
})

describe('normLabel', () => {
  it('trim, minuscola e collassa gli spazi interni', () => {
    expect(normLabel('  DA ')).toBe('da')
    expect(normLabel('IMPORTO')).toBe('importo')
    expect(normLabel('MINIMO 2   MQ  SPESSORE 13')).toBe('minimo 2 mq spessore 13')
    expect(normLabel(42)).toBe('42')
    expect(normLabel(null)).toBe('')
  })
})

describe('findHeaderRow', () => {
  it('individua header e colonne in riga 0 (match esatto, case-insensitive)', () => {
    const rows = [
      ['DA', 'A', 'IMPORTO'],
      [0, 1000, 300],
    ]
    expect(findHeaderRow(rows, ['DA', 'A', 'IMPORTO'])).toEqual({
      rowIndex: 0,
      cols: { da: 0, a: 1, importo: 2 },
    })
  })

  it('salta una riga-titolo sopra e ignora colonne extra (blocco affiancato)', () => {
    const rows = [
      ['Calcolo Rilievo e Montaggio', '', '', '', '', ''],
      ['DA', 'A', 'IMPORTO', '', 1388, 'Totale Materiali e Lavorazioni'],
      [0, 1000, 300],
    ]
    expect(findHeaderRow(rows, ['DA', 'A', 'IMPORTO'])).toEqual({
      rowIndex: 1,
      cols: { da: 0, a: 1, importo: 2 },
    })
  })

  it('risolve le colonne anche se spostate', () => {
    const rows = [['', 'DA', '', 'A', 'IMPORTO']]
    expect(findHeaderRow(rows, ['DA', 'A', 'IMPORTO'])).toEqual({
      rowIndex: 0,
      cols: { da: 1, a: 3, importo: 4 },
    })
  })

  it('null se mancano etichette o oltre maxScan', () => {
    expect(findHeaderRow([['DA', 'IMPORTO']], ['DA', 'A', 'IMPORTO'])).toBeNull()
    const tardi = [...Array(25).fill(['x']), ['DA', 'A', 'IMPORTO']]
    expect(findHeaderRow(tardi, ['DA', 'A', 'IMPORTO'], 20)).toBeNull()
  })
})
