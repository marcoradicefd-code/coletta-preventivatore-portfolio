import { describe, it, expect } from 'vitest'
import { arrotondaEuro } from '@/engine/arrotondaEuro'

describe('arrotondaEuro — euro intero al più vicino, .5 lontano da zero (D4)', () => {
  it('al più vicino', () => {
    expect(arrotondaEuro(1234.49)).toBe(1234)
    expect(arrotondaEuro(1234.51)).toBe(1235)
    expect(arrotondaEuro(1000)).toBe(1000)
  })

  it('.5 positivo va su, come il ROUND di Excel', () => {
    expect(arrotondaEuro(0.5)).toBe(1)
    expect(arrotondaEuro(2.5)).toBe(3)
  })

  it('.5 negativo va giù (lontano da zero): Math.round darebbe -2', () => {
    expect(arrotondaEuro(-0.5)).toBe(-1)
    expect(arrotondaEuro(-2.5)).toBe(-3)
    expect(arrotondaEuro(-2.49)).toBe(-2)
  })

  it('niente doppio arrotondamento: da ,495 a ,4999999 si scende, non si sale', () => {
    // Al centesimo prima, 2,495 diventava 2,50 e poi 3: scarto 0,505, non «al più vicino».
    expect(arrotondaEuro(0.5 * 4.99)).toBe(2)
    expect(arrotondaEuro(2.495)).toBe(2)
    expect(arrotondaEuro(2.4999999)).toBe(2)
    expect(arrotondaEuro(-2.4999999)).toBe(-2)
  })

  it('il rumore dei float si toglie a 15 cifre significative, come Excel', () => {
    expect(0.29 * 50).toBe(14.499999999999998) // il rumore c'è davvero
    expect(arrotondaEuro(0.29 * 50)).toBe(15) // è un 14,5
    expect(arrotondaEuro(-0.29 * 50)).toBe(-15)
    expect(arrotondaEuro(1.15 * 100)).toBe(115) // 114,99999999999999
    expect(arrotondaEuro(1.88 * 1135 + 14.2 * 61)).toBe(3000) // 2.999,9999999999995 (O1)
  })

  it('0 è 0, mai -0', () => {
    expect(Object.is(arrotondaEuro(0), 0)).toBe(true)
    expect(Object.is(arrotondaEuro(-0), 0)).toBe(true)
    expect(Object.is(arrotondaEuro(-0.4), 0)).toBe(true)
  })

  it('non finiti → 0', () => {
    expect(arrotondaEuro(Number.NaN)).toBe(0)
    expect(arrotondaEuro(Number.POSITIVE_INFINITY)).toBe(0)
    expect(arrotondaEuro(Number.NEGATIVE_INFINITY)).toBe(0)
  })

  it('il risultato è sempre un intero', () => {
    for (const v of [0.01, 0.49, 0.5, 99.995, 12345.675, -7.5, 1e6 + 0.5]) {
      expect(Number.isInteger(arrotondaEuro(v))).toBe(true)
    }
  })
})
