import { describe, it, expect } from 'vitest'
import { vistaPrezzi } from '@/engine/vistaPrezzi'
import { impronta, jsonCanonico, perCodice } from '@/utils/impronta'
import { catalogoCucinaFinto } from '@/test-utils/catalogoCucinaFinto'
import { FALLBACK_CUCINE, FALLBACK_PROGETTO_VALORE, INITIAL_SEZIONI } from '@/store/quoteFallbacks'

/** Strada A: la vista dei prezzi va in `dati` (jsonb) e torna indietro uguale. Solo il catalogo finto (D7). */
const SEZIONI = {
  ...INITIAL_SEZIONI,
  cucine: { ...FALLBACK_CUCINE, voci: [{ voceId: 'base-pensile-laminato', quantita: 3 }] },
  progettoValore: { ...FALLBACK_PROGETTO_VALORE, righe: [{ id: 'v1', descrizione: 'Voce di prova', prezzo: 1234 }] },
}

describe('vistaPrezzi e impronta (strada A)', () => {
  it('la vista è JSON puro: dopo il giro nel database è la stessa, con la stessa impronta', () => {
    const vista = vistaPrezzi(SEZIONI, { gres: null, porte: null, catalogoCucina: catalogoCucinaFinto })
    const tornata = JSON.parse(JSON.stringify(vista)) as typeof vista
    expect(tornata).toEqual(vista)
    expect(impronta(tornata)).toBe(impronta(vista))
    expect(vista.calcolo.iva.totaleImponibile).toBeGreaterThan(1234)
    expect(vista.listinoCucine).toBe(true)
    expect(vista.listinoGres).toBe(false)
  })

  it('l’impronta non dipende dall’ordine delle chiavi (jsonb le riordina) ma cambia col contenuto', () => {
    expect(jsonCanonico({ b: 1, a: { d: [1, { z: 1, y: 2 }], c: 2 } })).toBe('{"a":{"c":2,"d":[1,{"y":2,"z":1}]},"b":1}')
    expect(impronta({ a: 1, b: 2 })).toBe(impronta({ b: 2, a: 1 }))
    expect(impronta({ a: 1, b: 2 })).not.toBe(impronta({ a: 1, b: 3 }))
    expect(impronta({ a: undefined, b: 2 })).toBe(impronta({ b: 2 }))
  })

  it('senza listini la vista dice «da definire» per gres e cucina, mai un prezzo inventato', () => {
    const vista = vistaPrezzi(SEZIONI, { gres: null, porte: null, catalogoCucina: null })
    expect(vista.calcolo.resultCucine).toBeNull()
    expect(vista.listinoCucine).toBe(false)
    expect(vista.giornoRateCucina).toBeNull()
    expect(vista.calcolo.iva.totaleImponibile).toBe(1234)
  })
})

// Revisione di Marco sulla #98: la forma canonica non dipende dalla lingua del
// browser. Ordine per unità di codice, scritto a mano: Z (5A) < a (61) < e (65)
// < È (C8) < à (E0). Con `localeCompare` in italiano sarebbe a, à, e, È, Z.
describe('jsonCanonico: ordine delle chiavi indipendente dalla lingua', () => {
  it('chiavi accentate e maiuscole nell’ordine delle unità di codice', () => {
    expect(['e', 'È', 'Z', 'a', 'à'].sort(perCodice)).toEqual(['Z', 'a', 'e', 'È', 'à'])
    expect(jsonCanonico({ e: 1, È: 2, Z: 3, a: 4, à: 5 })).toBe('{"Z":3,"a":4,"e":1,"È":2,"à":5}')
  })
})
