import { describe, it, expect } from 'vitest'
import {
  ALIQUOTE_IVA,
  aliquotaIvaValida,
  calcIva,
  ripartisciSezione,
  sezioneIvaArredi,
  sezioneIvaPorte,
  type AliquotaIva,
} from '@/engine/iva'
import { calcSuMisuraArticoli } from '@/engine/calcSuMisura'
import { calcPorte } from '@/engine/calcPorte'
import { articoloPZ } from '@/test-utils/articoli'
import type { ListinoPorte } from '@/types/porte'
import type { RigaPorta } from '@/types/quote'

// Importi sintetici, tondi: nessun prezzo di un listino vero.

const articolo = (id: string, prezzoUnitario: number, aliquotaIva?: AliquotaIva) => ({
  ...articoloPZ,
  id,
  prezzoUnitario,
  aliquotaIva,
})

describe('aliquote ammesse', () => {
  it('solo 4, 10 e 22; un valore fuori elenco vale come assente', () => {
    expect(ALIQUOTE_IVA).toEqual([4, 10, 22])
    expect(aliquotaIvaValida(10)).toBe(10)
    for (const v of [21, '22', 0, null, undefined, Number.NaN, 22.0001]) expect(aliquotaIvaValida(v)).toBeUndefined()
    // Una sezione con un'aliquota fuori elenco va al 22%, la predefinita.
    expect(calcIva([{ totale: 100, aliquota: 21 }]).righe).toEqual([{ aliquota: 22, imponibile: 100, imposta: 22 }])
  })
})

describe('calcIva', () => {
  it('un\'aliquota sola: tutto al 22%, IVA in centesimi', () => {
    // 1.234 € al 22% = 271,48 €: imponibile × aliquota sono già centesimi.
    expect(calcIva([{ totale: 1000 }, { totale: 234 }])).toEqual({
      righe: [{ aliquota: 22, imponibile: 1234, imposta: 271.48 }],
      totaleImponibile: 1234,
      totaleIva: 271.48,
      totaleIvato: 1505.48,
    })
  })

  it('tre aliquote: una riga per aliquota, in ordine, e i totali tornano', () => {
    const r = calcIva([
      { totale: 2000, aliquota: 22 },
      { totale: 1001, aliquota: 10 },
      { totale: 503, aliquota: 4 },
    ])
    expect(r.righe).toEqual([
      { aliquota: 4, imponibile: 503, imposta: 20.12 },
      { aliquota: 10, imponibile: 1001, imposta: 100.1 },
      { aliquota: 22, imponibile: 2000, imposta: 440 },
    ])
    expect(r.totaleImponibile).toBe(3504)
    expect(r.totaleIva).toBe(560.22)
    expect(r.totaleIvato).toBe(4064.22)
  })

  it('ripartizione con uno sconto che non divide in parti intere: il resto va all\'aliquota maggiore', () => {
    // Tre articoli da 100 € a 4, 10 e 22%; sconto 12,5% su 300 = 37,5 → 38; totale 262.
    // 262 / 3 = 87,33 → 87 per aliquota, 261 in tutto: l'euro che manca va al 22%
    // (basi pari: vince la più alta), e la somma delle quote è il totale di sezione.
    const articoli = [articolo('a', 100, 4), articolo('b', 100, 10), articolo('c', 100, 22)]
    const result = calcSuMisuraArticoli(articoli, false, 0.125)
    expect(result.totale).toBe(262)
    const quote = ripartisciSezione(sezioneIvaArredi({ articoli }, result))
    expect([...quote.entries()]).toEqual([[4, 87], [10, 87], [22, 88]])
    const r = calcIva([sezioneIvaArredi({ articoli }, result)])
    expect(r.righe.map((x) => x.imponibile).reduce((a, b) => a + b, 0)).toBe(262)
    expect(r.totaleImponibile).toBe(262)
    expect(r.totaleIva).toBe(31.54) // 348 + 870 + 1.936 centesimi
  })

  it('ripartizione col resto negativo: le quote arrotondate per eccesso tornano al totale', () => {
    // 101 su tre basi pari: 33,67 → 34 ciascuna, 102; il 22% ne restituisce uno.
    const quote = ripartisciSezione({ totale: 101, righe: [{ importo: 1, aliquota: 4 }, { importo: 1, aliquota: 10 }, { importo: 1 }] })
    expect([...quote.entries()]).toEqual([[4, 34], [10, 34], [22, 33]])
  })

  it('la riga senza aliquota prende quella della sezione, la riga con l\'aliquota la sua', () => {
    // Sezione al 10%, una riga al 22%: 300 + 100 → 300 al 10%, 100 al 22%.
    const articoli = [articolo('a', 300), articolo('b', 100, 22)]
    const result = calcSuMisuraArticoli(articoli, false, 0)
    expect(calcIva([sezioneIvaArredi({ aliquotaIva: 10, articoli }, result)]).righe).toEqual([
      { aliquota: 10, imponibile: 300, imposta: 30 },
      { aliquota: 22, imponibile: 100, imposta: 22 },
    ])
  })

  it('progettazione 8% sulla sola sezione Arredi: si divide fra le sue aliquote, non tocca il gres', () => {
    // Arredi 1.000 al 10% + 1.000 al 22%, progettazione 160 → 2.160, metà per aliquota.
    const articoli = [articolo('a', 1000, 10), articolo('b', 1000, 22)]
    const result = calcSuMisuraArticoli(articoli, true, 0)
    expect(result.quotaProgettazione).toBe(160)
    const r = calcIva([sezioneIvaArredi({ articoli }, result), { totale: 500, aliquota: 22 }])
    expect(r.righe).toEqual([
      { aliquota: 10, imponibile: 1080, imposta: 108 },
      { aliquota: 22, imponibile: 1580, imposta: 347.6 },
    ])
    expect(r.totaleImponibile).toBe(2660)
  })

  it('sezione vuota: nessuna riga IVA e totali a zero', () => {
    expect(calcIva([])).toEqual({ righe: [], totaleImponibile: 0, totaleIva: 0, totaleIvato: 0 })
    // Una sezione a zero non porta la sua aliquota nel riepilogo.
    const r = calcIva([{ totale: 0, aliquota: 4 }, { totale: 100, aliquota: 10 }])
    expect(r.righe).toEqual([{ aliquota: 10, imponibile: 100, imposta: 10 }])
    // Righe che sommano a zero: tutto all'aliquota di sezione.
    expect([...ripartisciSezione({ totale: 0, aliquota: 4, righe: [{ importo: 0, aliquota: 22 }] })]).toEqual([[4, 0]])
  })

  it('totale parziale: la porta da completare non pesa, l\'IVA è quella del parziale', () => {
    const listino: ListinoPorte = {
      modelli: [{ nome: 'GIOTTO', prezzo2026: 700, h215: 900, h240: 1000 }],
      optional: [],
      aggiornato: '',
    }
    const prezzata: RigaPorta = { id: 'a', modelloNome: 'GIOTTO', altezzaCm: 210, optionals: [], aliquotaIva: 10 }
    // Altezza 0: da completare, fuori dal totale. La sua aliquota non deve comparire.
    const daCompletare: RigaPorta = { id: 'b', modelloNome: 'GIOTTO', altezzaCm: 0, optionals: [], aliquotaIva: 4 }
    const sezione = { righe: [prezzata, daCompletare], sconto: 0.1 }
    const result = calcPorte(sezione, listino)
    expect(result.daDefinire).toBe(1)
    expect(result.totale).toBe(630)
    const r = calcIva([sezioneIvaPorte(sezione, result)])
    expect(r.righe).toEqual([{ aliquota: 10, imponibile: 630, imposta: 63 }])
    expect(r.totaleIvato).toBe(693)
  })
})
