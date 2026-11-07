import { describe, it, expect } from 'vitest'
import {
  calcArticolo,
  calcSuMisuraArticoli,
  prezzoUnitarioConQuota,
  quantitaArticolo,
  raggruppaPerArredo,
  ripartisciQuota,
} from '@/engine/calcSuMisura'
import type { ArticoloSuMisura } from '@/types/sumisura'

/** Articolo base per i test, override con i campi pertinenti. */
function articolo(over: Partial<ArticoloSuMisura>): ArticoloSuMisura {
  return {
    id: 'a1',
    origine: 'listino',
    descrizione: 'Test',
    prezzoUnitario: 0,
    um: 'PZ',
    larghezzaCm: null,
    altezzaCm: null,
    lunghezzaMl: null,
    quantita: null,
    profonditaOltre65: false,
    finituraInterna: '',
    finituraEsterna: '',
    codiceFinitura: '',
    note: '',
    ...over,
  }
}

describe('quantitaArticolo', () => {
  it('MQ = larghezza×altezza/10000', () => {
    expect(quantitaArticolo(articolo({ um: 'MQ', larghezzaCm: 200, altezzaCm: 100 }))).toBe(2)
    expect(quantitaArticolo(articolo({ um: 'MQ', larghezzaCm: 300, altezzaCm: 100 }))).toBe(3)
  })
  it('ML = lunghezza, PZ = quantità', () => {
    expect(quantitaArticolo(articolo({ um: 'ML', lunghezzaMl: 4.5 }))).toBe(4.5)
    expect(quantitaArticolo(articolo({ um: 'PZ', quantita: 7 }))).toBe(7)
  })
  it('dimensioni mancanti → 0', () => {
    expect(quantitaArticolo(articolo({ um: 'MQ' }))).toBe(0)
  })
})

describe('calcArticolo', () => {
  it('MQ < 3 → maggiorazione +20% sulla base', () => {
    const r = calcArticolo(articolo({ um: 'MQ', prezzoUnitario: 350, larghezzaCm: 200, altezzaCm: 100 }))
    // 2mq × 350 = 700, +20% = 140
    expect(r.quantitaCalcolata).toBe(2)
    expect(r.base).toBe(700)
    expect(r.applica20).toBe(true)
    expect(r.maggiorazione20).toBe(140)
    expect(r.totale).toBe(840)
  })

  it('MQ ≥ 3 → nessuna maggiorazione 20%', () => {
    const r = calcArticolo(articolo({ um: 'MQ', prezzoUnitario: 350, larghezzaCm: 300, altezzaCm: 100 }))
    expect(r.quantitaCalcolata).toBe(3)
    expect(r.applica20).toBe(false)
    expect(r.maggiorazione20).toBe(0)
    expect(r.totale).toBe(1050)
  })

  it('profondità > 65cm → +15%; coesiste con +20% (additive sulla base)', () => {
    const r = calcArticolo(articolo({
      um: 'MQ', prezzoUnitario: 350, larghezzaCm: 200, altezzaCm: 100, profonditaOltre65: true,
    }))
    // base 700, +20% = 140, +15% = 105, totale = 945
    expect(r.applica20).toBe(true)
    expect(r.applica15).toBe(true)
    expect(r.maggiorazione15).toBe(105)
    expect(r.totale).toBe(945)
  })

  it('ML e PZ non ricevono mai la maggiorazione <3mq', () => {
    const ml = calcArticolo(articolo({ um: 'ML', prezzoUnitario: 30, lunghezzaMl: 2 }))
    expect(ml.applica20).toBe(false)
    expect(ml.totale).toBe(60)
    const pz = calcArticolo(articolo({ um: 'PZ', prezzoUnitario: 250, quantita: 1 }))
    expect(pz.applica20).toBe(false)
    expect(pz.totale).toBe(250)
  })
})

describe('calcArticolo — profondità sotto 40 cm, −10% (L20)', () => {
  it('−10% della base, senza +20% (3 mq)', () => {
    const r = calcArticolo(articolo({ um: 'MQ', prezzoUnitario: 400, larghezzaCm: 300, altezzaCm: 100, profonditaSotto40: true }))
    // base 1.200, −10% = 120, totale 1.080
    expect(r.applica10).toBe(true)
    expect(r.riduzione10).toBe(120)
    expect(r.totale).toBe(1080)
  })

  it('−10% con il +20% sotto 3 mq: tutte e due sulla base, additive', () => {
    const r = calcArticolo(articolo({ um: 'MQ', prezzoUnitario: 400, larghezzaCm: 200, altezzaCm: 100, profonditaSotto40: true }))
    // base 800, +20% = 160, −10% = 80, totale 880
    expect([r.base, r.maggiorazione20, r.riduzione10, r.totale]).toEqual([800, 160, 80, 880])
  })

  it('+15% e −10% si escludono: con entrambi i flag vale solo il +15%; senza flag niente', () => {
    const entrambi = calcArticolo(articolo({
      um: 'MQ', prezzoUnitario: 400, larghezzaCm: 300, altezzaCm: 100, profonditaOltre65: true, profonditaSotto40: true,
    }))
    expect([entrambi.applica15, entrambi.applica10, entrambi.riduzione10, entrambi.totale]).toEqual([true, false, 0, 1380])
    const nessuno = calcArticolo(articolo({ um: 'MQ', prezzoUnitario: 400, larghezzaCm: 300, altezzaCm: 100 }))
    expect([nessuno.applica10, nessuno.riduzione10, nessuno.totale]).toEqual([false, 0, 1200])
  })
})

describe('calcSuMisuraArticoli', () => {
  it('somma i totali e applica la quota progettazione 8% sul subtotale', () => {
    const articoli: ArticoloSuMisura[] = [
      articolo({ id: '1', um: 'PZ', prezzoUnitario: 250, quantita: 2 }), // 500
      articolo({ id: '2', um: 'ML', prezzoUnitario: 30, lunghezzaMl: 10 }), // 300
    ]
    const r = calcSuMisuraArticoli(articoli, true)
    expect(r.subtotale).toBe(800)
    expect(r.quotaProgettazione).toBeCloseTo(64) // 800 × 0.08
    expect(r.totale).toBeCloseTo(864)
  })

  it('senza quota progettazione il totale = subtotale', () => {
    const r = calcSuMisuraArticoli([articolo({ um: 'PZ', prezzoUnitario: 100, quantita: 1 })], false)
    expect(r.quotaProgettazione).toBe(0)
    expect(r.totale).toBe(100)
  })

  it('nessun articolo → subtotale e totale 0', () => {
    const r = calcSuMisuraArticoli([], true)
    expect(r.subtotale).toBe(0)
    expect(r.totale).toBe(0)
  })

  it('applica lo sconto sezione sul LORDO; progettazione resta sul lordo (non scontata)', () => {
    const articoli: ArticoloSuMisura[] = [
      articolo({ id: '1', um: 'PZ', prezzoUnitario: 250, quantita: 2 }), // 500
      articolo({ id: '2', um: 'ML', prezzoUnitario: 30, lunghezzaMl: 10 }), // 300
    ]
    // subtotale 800; sconto 10% sul lordo = 80; scontato 720;
    // progettazione 8% sul LORDO 800 = 64 (NON scontata); totale 720 + 64 = 784.
    const r = calcSuMisuraArticoli(articoli, true, 0.1)
    expect(r.subtotale).toBe(800)
    expect(r.sconto).toBeCloseTo(80)
    expect(r.scontato).toBeCloseTo(720)
    expect(r.quotaProgettazione).toBeCloseTo(64)
    expect(r.totale).toBeCloseTo(784)
  })

  it('scontoFrac fuori [0,1] o NaN → clampato', () => {
    const a = [articolo({ um: 'PZ', prezzoUnitario: 100, quantita: 1 })] // 100
    expect(calcSuMisuraArticoli(a, false, 1.5).scontato).toBe(0) // clamp 1 → sconto 100
    expect(calcSuMisuraArticoli(a, false, -0.5).scontato).toBe(100) // clamp 0
    expect(calcSuMisuraArticoli(a, false, NaN).scontato).toBe(100) // NaN → 0
  })
})

describe('calcArticolo — edge difensivi', () => {
  it('prezzo NaN → base e totale 0 (safeFin)', () => {
    const r = calcArticolo(articolo({ um: 'PZ', prezzoUnitario: NaN, quantita: 2 }))
    expect(r.base).toBe(0)
    expect(r.totale).toBe(0)
  })

  it('esattamente 3mq → nessuna maggiorazione <3mq', () => {
    const r = calcArticolo(articolo({ um: 'MQ', prezzoUnitario: 100, larghezzaCm: 300, altezzaCm: 100 }))
    expect(r.quantitaCalcolata).toBe(3)
    expect(r.applica20).toBe(false)
  })

  it('quantità 0 → nessuna maggiorazione, totale 0', () => {
    const r = calcArticolo(articolo({ um: 'MQ', prezzoUnitario: 100, larghezzaCm: 0, altezzaCm: 0 }))
    expect(r.applica20).toBe(false)
    expect(r.totale).toBe(0)
  })
})

describe('importi all\'euro intero (D4)', () => {
  it('base, +20% e +15% interi; il totale è la loro somma', () => {
    // 1,5 mq × 333,33 = 499,995 → 500; +20% = 100; +15% = 75; totale 675.
    const r = calcArticolo(articolo({
      um: 'MQ', prezzoUnitario: 333.33, larghezzaCm: 150, altezzaCm: 100, profonditaOltre65: true,
    }))
    expect(r.base).toBe(500)
    expect(r.maggiorazione20).toBe(100)
    expect(r.maggiorazione15).toBe(75)
    expect(r.totale).toBe(r.base + r.maggiorazione20 + r.maggiorazione15)
  })

  it('le maggiorazioni si calcolano sulla base arrotondata: 702,5 → 703, +20% = 141', () => {
    const r = calcArticolo(articolo({ um: 'MQ', prezzoUnitario: 351.25, larghezzaCm: 200, altezzaCm: 100 }))
    expect(r.base).toBe(703)
    expect(r.maggiorazione20).toBe(141) // 140,6
    expect(r.totale).toBe(844)
  })

  it('subtotale, sconto, progettazione e totale sono interi e tornano fra loro', () => {
    const articoli = [
      articolo({ id: '1', um: 'PZ', prezzoUnitario: 99.6, quantita: 1 }), // 100
      articolo({ id: '2', um: 'ML', prezzoUnitario: 33.3, lunghezzaMl: 3 }), // 99,9 → 100
    ]
    const r = calcSuMisuraArticoli(articoli, true, 0.125)
    expect(r.subtotale).toBe(200)
    expect(r.sconto).toBe(25)
    expect(r.scontato).toBe(175)
    expect(r.quotaProgettazione).toBe(16)
    expect(r.totale).toBe(r.scontato + r.quotaProgettazione)
    for (const v of [r.subtotale, r.sconto, r.scontato, r.quotaProgettazione, r.totale]) {
      expect(Number.isInteger(v)).toBe(true)
    }
  })
})

describe('raggruppaPerArredo (L19)', () => {
  const ingresso = { id: 'ing', nome: 'Ingresso' }
  const matrimoniale = { id: 'mat', nome: 'Matrimoniale' }
  // Importi tondi e uno con le maggiorazioni (+20% sotto i 3 mq, +15% profondità).
  const articoli = [
    articolo({ id: 'giorno', prezzoUnitario: 300, quantita: 1, arredoId: 'ing' }),
    articolo({ id: 'armadio-m', prezzoUnitario: 999.99, quantita: 2, arredoId: 'mat' }),
    articolo({ id: 'armadio-i', um: 'MQ', larghezzaCm: 120, altezzaCm: 200, prezzoUnitario: 333.33, profonditaOltre65: true, arredoId: 'ing' }),
    articolo({ id: 'sciolto', prezzoUnitario: 50, quantita: 3 }),
    articolo({ id: 'orfano', prezzoUnitario: 80, quantita: 1, arredoId: 'arredo-tolto' }),
  ]
  const somma = (ids: string[]) => ids.reduce((s, id) => s + calcArticolo(articoli.find((a) => a.id === id)!).totale, 0)

  it('un gruppo per arredo, nell\'ordine degli arredi, con i suoi articoli nell\'ordine della sezione e il loro subtotale', () => {
    const gruppi = raggruppaPerArredo(articoli, [matrimoniale, ingresso])
    expect(gruppi.map((g) => g.arredo?.nome ?? null)).toEqual(['Matrimoniale', 'Ingresso', null])
    expect(gruppi[0].articoli.map((a) => a.id)).toEqual(['armadio-m'])
    expect(gruppi[1].articoli.map((a) => a.id)).toEqual(['giorno', 'armadio-i'])
    expect(gruppi[0].subtotale).toBe(somma(['armadio-m']))
    expect(gruppi[1].subtotale).toBe(somma(['giorno', 'armadio-i']))
    expect(gruppi.every((g) => Number.isInteger(g.subtotale))).toBe(true)
  })

  it('«Altre voci» in fondo: senza arredoId o con un id che non c\'è più', () => {
    const altre = raggruppaPerArredo(articoli, [ingresso, matrimoniale]).at(-1)!
    expect(altre.arredo).toBeNull()
    expect(altre.articoli.map((a) => a.id)).toEqual(['sciolto', 'orfano'])
    expect(altre.subtotale).toBe(somma(['sciolto', 'orfano']))
  })

  it('un arredo vuoto ha il suo gruppo a 0; «Altre voci» vuota non c\'è', () => {
    const studio = { id: 'stu', nome: 'Studio' }
    const gruppi = raggruppaPerArredo(articoli.slice(0, 3), [ingresso, studio, matrimoniale])
    expect(gruppi.map((g) => [g.arredo?.nome ?? null, g.articoli.length, g.subtotale])).toEqual([
      ['Ingresso', 2, somma(['giorno', 'armadio-i'])],
      ['Studio', 0, 0],
      ['Matrimoniale', 1, somma(['armadio-m'])],
    ])
    expect(raggruppaPerArredo([], [studio])).toEqual([{ arredo: studio, articoli: [], subtotale: 0 }])
  })

  it('senza arredi (un preventivo di prima di L19) è un gruppo solo, «Altre voci», con tutti gli articoli', () => {
    const senza = articoli.map((a) => ({ ...a, arredoId: undefined }))
    const gruppi = raggruppaPerArredo(senza)
    expect(gruppi).toHaveLength(1)
    expect(gruppi[0].arredo).toBeNull()
    expect(gruppi[0].articoli).toEqual(senza)
    expect(gruppi[0].subtotale).toBe(calcSuMisuraArticoli(senza, false).subtotale)
    expect(raggruppaPerArredo([])).toEqual([])
  })

  it('presidio dei totali: Σ subtotali = subtotale di sezione, e sconto, progettazione e totale non cambiano', () => {
    for (const arredi of [[], [ingresso], [matrimoniale, ingresso], [ingresso, { id: 'vuoto', nome: 'Vuoto' }]]) {
      const gruppi = raggruppaPerArredo(articoli, arredi)
      const r = calcSuMisuraArticoli(articoli, true, 0.125)
      expect(gruppi.reduce((s, g) => s + g.subtotale, 0)).toBe(r.subtotale)
      // Ogni articolo sta in un gruppo e in uno solo.
      expect(gruppi.flatMap((g) => g.articoli.map((a) => a.id)).sort()).toEqual(articoli.map((a) => a.id).sort())
      // Il raggruppamento non entra nel calcolo: l'arredoId non sposta niente.
      expect(r).toEqual(calcSuMisuraArticoli(articoli.map((a) => ({ ...a, arredoId: undefined })), true, 0.125))
    }
  })
})

describe('ripartisciQuota (L25, quota progettazione spalmata nel PDF)', () => {
  const somma = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0)

  it('proporzionale al totale della riga: quota esatta all\'8%, nessun resto', () => {
    // 300 + 1.200 + 2.000 = 3.500, quota 280: l'8% di ogni riga, intero.
    expect(ripartisciQuota([300, 1200, 2000], 280)).toEqual([324, 1296, 2160])
  })

  it('resti maggiori: la somma è ESATTAMENTE totali + quota, e il resto va ai resti più grandi', () => {
    // 100/300 di 10 = 3,33 · 100/300 = 3,33 · 100/300 = 3,33: tre resti uguali,
    // 1 € da dare, vince la prima riga (ordine delle righe).
    expect(ripartisciQuota([100, 100, 100], 10)).toEqual([104, 103, 103])
    // 50/350 di 28 = 4 · 100/350 = 8 · 200/350 = 16: nessun resto.
    expect(ripartisciQuota([50, 100, 200], 28)).toEqual([54, 108, 216])
    // 7 su [1, 2, 4] (somma 7): quote 1, 2, 4 esatte.
    expect(ripartisciQuota([1, 2, 4], 7)).toEqual([2, 4, 8])
    // 5 su [3, 3, 1]: 2,142… · 2,142… · 0,714… → 2, 2, 0 e 1 € di resto alla terza (0,714 è il resto maggiore).
    expect(ripartisciQuota([3, 3, 1], 5)).toEqual([5, 5, 2])
    for (const [totali, quota] of [
      [[333, 99, 1, 1000, 7], 115],
      [[100, 100, 100], 1],
      [[100, 100, 100], 2],
      [[17, 23, 41, 59], 11],
    ] as const) {
      const out = ripartisciQuota(totali, quota)
      expect(somma(out)).toBe(somma(totali) + quota)
      out.forEach((v, i) => expect(Number.isInteger(v) && v >= totali[i]).toBe(true))
    }
  })

  it('a resti uguali vince l\'ordine delle righe, e lo stesso input dà lo stesso output', () => {
    expect(ripartisciQuota([100, 100, 100], 2)).toEqual([101, 101, 100])
    expect(ripartisciQuota([100, 100, 100], 2)).toEqual(ripartisciQuota([100, 100, 100], 2))
  })

  it('una riga a 0 resta a 0, anche quando il resto andrebbe distribuito', () => {
    expect(ripartisciQuota([0, 100, 0, 100], 9)).toEqual([0, 105, 0, 104])
  })

  it('una riga sola prende tutta la quota', () => {
    expect(ripartisciQuota([1234], 99)).toEqual([1333])
  })

  it('quota 0: le righe restano quelle di prima, identiche', () => {
    const totali = [300, 0, 1200]
    expect(ripartisciQuota(totali, 0)).toEqual(totali)
    expect(ripartisciQuota([], 0)).toEqual([])
  })

  it('nessuna riga negativa: una riga negativa (stato manomesso, O14) non prende quota e non scende', () => {
    const out = ripartisciQuota([-50, 100, 100], 16)
    expect(out).toEqual([-50, 108, 108])
  })

  it('senza righe positive la quota non ha dove andare: le righe restano come sono', () => {
    expect(ripartisciQuota([0, 0], 10)).toEqual([0, 0])
  })
})

describe('prezzoUnitarioConQuota (L25)', () => {
  it('senza quota (totale mostrato = totale) è il prezzo unitario, identico', () => {
    expect(prezzoUnitarioConQuota(333.33, 667, 667)).toBe(333.33)
  })

  it('con la quota cresce nella stessa proporzione del totale della riga, al centesimo', () => {
    // 2 × 150 = 300 → 324: +8% → 162.
    expect(prezzoUnitarioConQuota(150, 300, 324)).toBe(162)
    // 99,95 × 1 = 100 → 108: 99,95 × 1,08 = 107,946 → 107,95.
    expect(prezzoUnitarioConQuota(99.95, 100, 108)).toBe(107.95)
  })

  it('una riga a 0 tiene il suo prezzo unitario', () => {
    expect(prezzoUnitarioConQuota(100, 0, 0)).toBe(100)
  })
})
