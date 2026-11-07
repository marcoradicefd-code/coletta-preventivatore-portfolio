import { describe, it, expect } from 'vitest'
import { normalizzaRicerca, corrispondeRicerca } from '@/utils/ricerca'

describe('normalizzaRicerca', () => {
  it('minuscole e spazi agli estremi tolti', () => {
    expect(normalizzaRicerca('  LAVELLO Inox ')).toBe('lavello inox')
  })

  it('accenti tolti, sia composti sia scritti come lettera + segno', () => {
    expect(normalizzaRicerca('Più però CAFFÈ')).toBe('piu pero caffe')
    // «e» seguita dall'accento grave combinante: due caratteri, stesso testo a video.
    expect(normalizzaRicerca('caffe' + String.fromCharCode(0x300))).toBe('caffe')
  })

  it('gli spazi interni restano', () => {
    expect(normalizzaRicerca('a  b')).toBe('a  b')
  })
})

describe('corrispondeRicerca', () => {
  it('ignora maiuscole e accenti da entrambe le parti', () => {
    expect(corrispondeRicerca('Cassetto Blum', 'BLUM')).toBe(true)
    expect(corrispondeRicerca('Lavèllo', 'lavello')).toBe(true)
    expect(corrispondeRicerca('Lavello', 'lavèllo')).toBe(true)
  })

  it('ricerca vuota o di soli spazi: trova tutto', () => {
    expect(corrispondeRicerca('qualunque', '')).toBe(true)
    expect(corrispondeRicerca('qualunque', '   ')).toBe(true)
  })

  it('niente corrispondenza: falso', () => {
    expect(corrispondeRicerca('Cassetto', 'anta')).toBe(false)
  })
})
