import { describe, it, expect } from 'vitest'
import { calcPorte, calcRigaPorta, calcRigaBattiscopa, prezzoFascia, costoOptional, manigliaInclusa } from '@/engine/calcPorte'
import type { ListinoPorte, ModelloPorta } from '@/types/porte'
import type { SezionePorte, RigaPorta, RigaBattiscopa, OptionalScelto } from '@/types/quote'

const modello: ModelloPorta = { nome: 'RAFFAELLA', prezzo2026: 880, h215: 1060, h240: 1150 }

const listino: ListinoPorte = {
  modelli: [modello],
  optional: [
    { nome: 'STIPITI', unita: 'PORTA', prezzo: 150 },
    { nome: 'SPECCHIO', unita: 'MQ', prezzo: 40 },
    { nome: 'PIVOT', unita: 'PEZZO', prezzo: 1500 },
    { nome: 'BATTISCOPA', unita: 'ML', prezzo: 1.2 },
    { nome: 'BATTISCOPA_EXTRA', unita: 'ML', prezzo: 1.44 },
    { nome: 'IMPIALL', unita: 'MANUALE', prezzo: null },
  ],
  aggiornato: 'test',
}

const opt = (o: Partial<OptionalScelto> & Pick<OptionalScelto, 'nome' | 'unita'>): OptionalScelto => ({
  id: o.nome,
  quantita: 1,
  prezzoManuale: null,
  ...o,
})

const riga = (altezzaCm: number, optionals: OptionalScelto[] = []): RigaPorta => ({
  id: 'r1',
  modelloNome: 'RAFFAELLA',
  altezzaCm,
  optionals,
})
const sezione = (righe: RigaPorta[], sconto = 0): SezionePorte => ({ righe, sconto })

describe('prezzoFascia — fasce ALTERNATIVE (sostituzione, non somma)', () => {
  it('la STESSA porta cambia il prezzo PIENO in base all\'altezza', () => {
    expect(prezzoFascia(modello, 200)).toEqual({ fascia: 'base', prezzo: 880 }) // ≤215
    expect(prezzoFascia(modello, 215)).toEqual({ fascia: 'base', prezzo: 880 }) // confine ≤215
    expect(prezzoFascia(modello, 216)).toEqual({ fascia: 'h215', prezzo: 1060 }) // (215,240]
    expect(prezzoFascia(modello, 240)).toEqual({ fascia: 'h215', prezzo: 1060 }) // confine =240
    expect(prezzoFascia(modello, 241)).toEqual({ fascia: 'h240', prezzo: 1150 }) // >240
    expect(prezzoFascia(modello, 300)).toEqual({ fascia: 'h240', prezzo: 1150 })
  })
})

describe('costoOptional — per unità', () => {
  it('PORTA: fisso, ignora la quantità', () => {
    expect(costoOptional(opt({ nome: 'STIPITI', unita: 'PORTA', quantita: 5 }), listino)).toBe(150)
  })
  it('MQ: rate × quantità', () => {
    expect(costoOptional(opt({ nome: 'SPECCHIO', unita: 'MQ', quantita: 2 }), listino)).toBe(80)
  })
  it('PEZZO: rate × quantità', () => {
    expect(costoOptional(opt({ nome: 'PIVOT', unita: 'PEZZO', quantita: 2 }), listino)).toBe(3000)
  })
  it('ML battiscopa 1,2 €/cm × cm', () => {
    expect(costoOptional(opt({ nome: 'BATTISCOPA', unita: 'ML', quantita: 100 }), listino)).toBeCloseTo(120, 6)
  })
  it('ML variante +20% (1,44 €/cm) × cm', () => {
    expect(costoOptional(opt({ nome: 'BATTISCOPA_EXTRA', unita: 'ML', quantita: 100 }), listino)).toBeCloseTo(144, 6)
  })
  it('MANUALE: usa prezzoManuale (non il listino); null → 0', () => {
    expect(costoOptional(opt({ nome: 'IMPIALL', unita: 'MANUALE', prezzoManuale: 500 }), listino)).toBe(500)
    expect(costoOptional(opt({ nome: 'IMPIALL', unita: 'MANUALE', prezzoManuale: null }), listino)).toBe(0)
  })
  it('rate assente / listino null → 0 (difensivo); MANUALE resta valorizzato', () => {
    expect(costoOptional(opt({ nome: 'IGNOTO', unita: 'MQ', quantita: 3 }), null)).toBe(0)
    expect(costoOptional(opt({ nome: 'X', unita: 'MANUALE', prezzoManuale: 99 }), null)).toBe(99)
  })
})

describe('calcRigaPorta — prezzo di fascia + somma optional', () => {
  it('altezza 230 → h215 (1060) + STIPITI 150 + SPECCHIO 40×2 = totale 1290', () => {
    const r = calcRigaPorta(
      riga(230, [opt({ nome: 'STIPITI', unita: 'PORTA' }), opt({ nome: 'SPECCHIO', unita: 'MQ', quantita: 2 })]),
      listino
    )
    expect(r.fascia).toBe('h215')
    expect(r.prezzoBase).toBe(1060)
    expect(r.optionalTotale).toBe(230)
    expect(r.totale).toBe(1290)
  })
  it('modello non nel listino → prezzoBase 0, totale 0', () => {
    const r = calcRigaPorta({ id: 'x', modelloNome: 'INESISTENTE', altezzaCm: 200, optionals: [] }, listino)
    expect(r.prezzoBase).toBe(0)
    expect(r.totale).toBe(0)
  })
})

describe('calcPorte — sezione + sconto', () => {
  it('subtotale = Σ righe (2 × 880 = 1760), niente sconto', () => {
    expect(calcPorte(sezione([riga(200), riga(200)]), listino)).toMatchObject({
      subtotale: 1760,
      sconto: 0,
      totale: 1760,
    })
  })
  it('applica sconto 25% (440) → totale 1320', () => {
    const res = calcPorte(sezione([riga(200), riga(200)], 0.25), listino)
    expect(res.subtotale).toBe(1760)
    expect(res.sconto).toBe(440)
    expect(res.totale).toBe(1320)
  })
  it('clampa lo sconto [0,1] e gestisce NaN', () => {
    expect(calcPorte(sezione([riga(200)], 1.5), listino).totale).toBe(0) // 100%
    expect(calcPorte(sezione([riga(200)], -0.5), listino).totale).toBe(880)
    expect(calcPorte(sezione([riga(200)], NaN), listino).totale).toBe(880)
  })
  it('sezione vuota → tutto 0', () => {
    expect(calcPorte(sezione([]), listino)).toMatchObject({ subtotale: 0, sconto: 0, totale: 0 })
  })
})

// ── Quantità e maniglia (PR B) ──
// L'engine cambia un CALCOLO, quindi la regola "nessun engine toccato" della PR
// precedente qui non vale e va sostituita da un presidio più forte: il primo
// test di questo blocco pinna che un preventivo GIÀ SALVATO non si muove di un
// centesimo. Se quello diventa rosso, la PR è da buttare, non da aggiustare.

describe('PRESIDIO — le righe legacy (senza quantita) non cambiano prezzo', () => {
  it('riga senza `quantita`: fascia, base, optional e totale IDENTICI a prima', () => {
    // Stessi numeri del test storico "altezza 230 → h215 + STIPITI + SPECCHIO×2".
    const r = calcRigaPorta(
      riga(230, [opt({ nome: 'STIPITI', unita: 'PORTA' }), opt({ nome: 'SPECCHIO', unita: 'MQ', quantita: 2 })]),
      listino
    )
    expect(r.fascia).toBe('h215')
    expect(r.prezzoBase).toBe(1060)
    expect(r.optionalTotale).toBe(230)
    expect(r.totale).toBe(1290)
  })

  it('riga senza `quantita`: la quantità ESPOSTA è 1 (assente ⇒ una porta)', () => {
    const r = calcRigaPorta(riga(200), listino)
    expect(r.quantita).toBe(1)
    expect(r.prezzoUnitarioRiga).toBe(880)
    expect(r.totale).toBe(880)
  })

  it('riga senza `maniglia`: nessun contributo, totale invariato', () => {
    const r = calcRigaPorta(riga(200), listino)
    expect(r.totaleManiglia).toBe(0)
    expect(r.totale).toBe(880)
  })

  it('sezione di righe legacy: subtotale IDENTICO (2 × 880 = 1760)', () => {
    expect(calcPorte(sezione([riga(200), riga(200)]), listino)).toMatchObject({
      subtotale: 1760,
      sconto: 0,
      totale: 1760,
    })
  })

  it('`quantita: 1` esplicita === quantità assente (nessuna differenza di prezzo)', () => {
    const senza = calcRigaPorta(riga(230, [opt({ nome: 'STIPITI', unita: 'PORTA' })]), listino)
    const con = calcRigaPorta(
      { ...riga(230, [opt({ nome: 'STIPITI', unita: 'PORTA' })]), quantita: 1 },
      listino
    )
    expect(con.totale).toBe(senza.totale)
  })
})

describe('calcRigaPorta — la quantità moltiplica base E optional', () => {
  it('qta 2: (1060 base + 150 stipiti) × 2 = 2420', () => {
    // Gli stipiti sono `unita: PORTA`, cioè PER OGNI PORTA: due porte, due set.
    // Moltiplicare il solo prezzo base darebbe due porte con un set di stipiti.
    const r = calcRigaPorta(
      { ...riga(230, [opt({ nome: 'STIPITI', unita: 'PORTA' })]), quantita: 2 },
      listino
    )
    expect(r.prezzoUnitarioRiga).toBe(1210)
    expect(r.quantita).toBe(2)
    expect(r.totale).toBe(2420)
  })

  it('qta 3 su porta nuda: 880 × 3 = 2640', () => {
    const r = calcRigaPorta({ ...riga(200), quantita: 3 }, listino)
    expect(r.totale).toBe(2640)
  })

  it('la quantità NON tocca prezzoBase e optionalTotale (restano unitari)', () => {
    // Sono i numeri che il PDF stampa nella colonna "prezzo unitario": se li
    // moltiplicassimo qui, l'importo verrebbe elevato al quadrato a valle.
    const r = calcRigaPorta(
      { ...riga(230, [opt({ nome: 'SPECCHIO', unita: 'MQ', quantita: 2 })]), quantita: 4 },
      listino
    )
    expect(r.prezzoBase).toBe(1060)
    expect(r.optionalTotale).toBe(80)
    expect(r.totale).toBe(4560)
  })

  it('difensivo: qta 0, negativa, NaN e non finita ⇒ 1 (mai una riga a zero muta)', () => {
    const base = calcRigaPorta(riga(200), listino).totale
    for (const q of [0, -3, NaN, Infinity, -Infinity]) {
      expect(calcRigaPorta({ ...riga(200), quantita: q }, listino).totale).toBe(base)
      expect(calcRigaPorta({ ...riga(200), quantita: q }, listino).quantita).toBe(1)
    }
  })

  it('difensivo: quantità frazionaria ⇒ troncata all intero (mezze porte non esistono)', () => {
    const r = calcRigaPorta({ ...riga(200), quantita: 2.7 }, listino)
    expect(r.quantita).toBe(2)
    expect(r.totale).toBe(1760)
  })
})

describe('calcRigaPorta — maniglia a quantità INDIPENDENTE, fuori dal moltiplicatore', () => {
  const maniglia = { qta: 2, prezzoUnitario: 45, modello: 'Olivari Rio', finitura: 'cromo satinato' }

  it('somma qta × prezzo, senza passare dal moltiplicatore porte', () => {
    // 6 porte / 4 maniglie è un caso reale (scorrevoli senza maniglia, doppie
    // ante con due): se la maniglia entrasse nel ×qta non sarebbe esprimibile.
    const r = calcRigaPorta({ ...riga(200), quantita: 3, maniglia }, listino)
    expect(r.totaleManiglia).toBe(90) // 2 × 45, NON 2 × 45 × 3
    expect(r.totale).toBe(880 * 3 + 90)
  })

  it('maniglia sola, senza moltiplicatore porte', () => {
    const r = calcRigaPorta({ ...riga(200), maniglia }, listino)
    expect(r.totale).toBe(970)
  })

  it('difensivo: qta o prezzo maniglia non finiti / negativi ⇒ contributo 0', () => {
    for (const m of [
      { ...maniglia, qta: NaN },
      { ...maniglia, prezzoUnitario: NaN },
      { ...maniglia, qta: -2 },
      { ...maniglia, prezzoUnitario: -10 },
    ]) {
      expect(calcRigaPorta({ ...riga(200), maniglia: m }, listino).totaleManiglia).toBe(0)
    }
  })

  it('la maniglia NON rende la riga irrisolvibile (è un prezzo a mano, non di listino)', () => {
    const r = calcRigaPorta({ ...riga(200), maniglia }, listino)
    expect(r.origine).not.toBe('irrisolvibile')
  })

  it('riga irrisolvibile con maniglia: resta fuori dal subtotale, maniglia compresa', () => {
    // Un pezzo non ricostruibile sporca l'intera riga: sommarne solo la maniglia
    // darebbe un totale corto che sembra giusto.
    const s = sezione([{ ...riga(200), modelloNome: 'INESISTENTE', maniglia }])
    expect(calcPorte(s, listino)).toMatchObject({ subtotale: 0, daDefinire: 1 })
  })
})

// Regola di Antonio (06/10): prezzo VUOTO = maniglia inclusa (standard), prezzo
// valorizzato = modello extra che si somma. Il totale lo faceva già (un prezzo
// assente o 0 contribuisce 0): qui si pinna, e si pinna il predicato che testo,
// PDF e UI leggono per dire "inclusa".
describe('maniglia inclusa: prezzo vuoto ⇒ nessun costo, e lo si dichiara', () => {
  const inclusa = { qta: 2, modello: 'Olivari Rio', finitura: 'cromo satinato' }

  it('manigliaInclusa: vero senza prezzo, con 0 o con un valore non valido; falso con un prezzo', () => {
    expect(manigliaInclusa(inclusa)).toBe(true)
    expect(manigliaInclusa({ ...inclusa, prezzoUnitario: 0 })).toBe(true)
    expect(manigliaInclusa({ ...inclusa, prezzoUnitario: NaN })).toBe(true)
    expect(manigliaInclusa({ ...inclusa, prezzoUnitario: -10 })).toBe(true)
    expect(manigliaInclusa({ ...inclusa, prezzoUnitario: 45 })).toBe(false)
  })

  it('maniglia inclusa: il totale della riga è IDENTICO a quello senza maniglia', () => {
    const senza = calcRigaPorta({ ...riga(200), quantita: 3 }, listino)
    const con = calcRigaPorta({ ...riga(200), quantita: 3, maniglia: inclusa }, listino)
    expect(con.totaleManiglia).toBe(0)
    expect(con.totale).toBe(senza.totale)
  })

  it('forward-compat: una riga salvata senza `prezzoUnitario` si calcola come inclusa', () => {
    const daBlob = JSON.parse(JSON.stringify({ ...riga(200), maniglia: inclusa })) as RigaPorta
    expect(daBlob.maniglia).not.toHaveProperty('prezzoUnitario')
    expect(calcRigaPorta(daBlob, listino).totale).toBe(880)
  })
})

describe('calcPorte — sezione con quantità e maniglie', () => {
  it('subtotale somma gli IMPORTI di riga, non i prezzi unitari', () => {
    const s = sezione([
      { ...riga(200), quantita: 2 }, // 1760
      { ...riga(200), maniglia: { qta: 1, prezzoUnitario: 50, modello: 'M', finitura: 'F' } }, // 930
    ])
    expect(calcPorte(s, listino)).toMatchObject({ subtotale: 2690, totale: 2690 })
  })

  it('lo sconto sezione si applica DOPO quantità e maniglie', () => {
    const s = sezione([{ ...riga(200), quantita: 2, maniglia: { qta: 2, prezzoUnitario: 45, modello: 'M', finitura: 'F' } }], 0.5)
    // (880 × 2) + 90 = 1850 → sconto 925 → 925
    expect(calcPorte(s, listino)).toMatchObject({ subtotale: 1850, sconto: 925, totale: 925 })
  })
})

// ── Battiscopa a corpo (PR C) ──
// Il battiscopa esce dagli optional e diventa una LISTA SUA nella sezione porte,
// fuori dal moltiplicatore delle porte. Ma i preventivi già salvati ce l'hanno
// ancora dentro `optionals`, e lì deve continuare a valere ESATTAMENTE quanto
// valeva ieri — moltiplicatore compreso. Le due strade convivono per questo, e
// il primo blocco qui sotto è ciò che impedisce di "sistemare" anche il passato.

describe('PRESIDIO — il battiscopa già salvato fra gli optional non cambia prezzo', () => {
  const battLegacy = opt({ nome: 'BATTISCOPA', unita: 'ML', quantita: 210 })

  it('riga legacy con battiscopa optional: 880 + (1,2 × 210) = 1.132', () => {
    const r = calcRigaPorta(riga(200, [battLegacy]), listino)
    expect(r.optionalTotale).toBeCloseTo(252, 6)
    expect(r.totale).toBeCloseTo(1132, 6)
  })

  it('col ×qta della PR B resta moltiplicato COME OGGI: 1.132 × 3 = 3.396', () => {
    // Deliberato: cambiarlo qui riscriverebbe preventivi già consegnati. Le righe
    // NUOVE nascono nella lista `battiscopa`, che il moltiplicatore non tocca.
    const r = calcRigaPorta({ ...riga(200, [battLegacy]), quantita: 3 }, listino)
    expect(r.totale).toBeCloseTo(3396, 6)
  })

  it('la variante +20% legacy resta a 1,44 €/cm', () => {
    const r = calcRigaPorta(
      riga(200, [opt({ nome: 'BATTISCOPA_EXTRA', unita: 'ML', quantita: 100 })]),
      listino
    )
    expect(r.optionalTotale).toBeCloseTo(144, 6)
  })

  it('una sezione di sole righe legacy col battiscopa somma come prima', () => {
    expect(calcPorte(sezione([riga(200, [battLegacy])]), listino).subtotale).toBeCloseTo(1132, 6)
  })
})

// Specifica di Antonio (06/10): il "1,2 €/cm" del listino è per centimetro
// D'ALTEZZA. prezzoMl = altezzaCm × €/cm (+20% solo sul prodotto),
// prodotto = prezzoMl × metriLineari, posa = prezzoPosaMl × metriLineari.
// Una riga = un modello, un'altezza, una lunghezza totale. Le righe della #33
// (quantitaCm = lunghezza) non sono convertibili: manca l'altezza.
describe('calcBattiscopa — altezza × €/cm = €/ml, × metri lineari, più la posa', () => {
  const batt = (over: Partial<RigaBattiscopa> = {}): RigaBattiscopa => ({
    id: 'b1',
    nome: 'BATTISCOPA',
    prezzoUnitario: 1.2,
    altezzaCm: 5,
    metriLineari: 5.5,
    prezzoPosaMl: 4,
    ...over,
  })

  it('H 5 cm × 1,2 €/cm = 6 €/ml; × 5,5 ml = 33; posa 4 × 5,5 = 22; totale 55', () => {
    const b = calcRigaBattiscopa(batt(), listino)
    expect(b.rate).toBe(1.2)
    expect(b.prezzoMl).toBeCloseTo(6, 10)
    expect(b.prodotto).toBeCloseTo(33, 10)
    expect(b.posa).toBeCloseTo(22, 10)
    expect(b.totale).toBeCloseTo(55, 10)
    expect(b.origine).toBe('snapshot')
  })

  it('+20% solo sul prodotto, prezzi unitari interi solo all\'importo: 1,44 × 5 × 5,5 = 39,60 → 40; + posa 22 = 62', () => {
    const b = calcRigaBattiscopa(batt({ extra: true }), listino)
    expect(b.rate).toBeCloseTo(1.44, 10) // prezzo unitario: resta coi centesimi
    expect(b.prezzoMl).toBeCloseTo(7.2, 10) // idem, nessun arrotondamento intermedio
    expect(b.prodotto).toBe(40) // importo stampato: all'euro intero (D4)
    expect(b.posa).toBe(22) // la posa NON prende il +20%
    expect(b.totale).toBe(62) // somma dei due importi stampati
  })

  it('senza prezzo di posa: posa 0, totale = prodotto', () => {
    const b = calcRigaBattiscopa(batt({ prezzoPosaMl: undefined }), listino)
    expect(b.posa).toBe(0)
    expect(b.totale).toBeCloseTo(33, 10)
  })

  it('la quantità (vani) della #33 non entra nel calcolo della forma nuova', () => {
    expect(calcRigaBattiscopa(batt({ quantita: 3 }), listino).totale).toBeCloseTo(55, 10)
  })

  it('senza snapshot ripiega sul listino vivo (origine live)', () => {
    const b = calcRigaBattiscopa(batt({ prezzoUnitario: undefined }), listino)
    expect(b.rate).toBe(1.2)
    expect(b.origine).toBe('live')
  })

  it('né snapshot né listino → irrisolvibile, totale 0, anche se le misure ci sono', () => {
    const b = calcRigaBattiscopa(batt({ nome: 'SPARITO', prezzoUnitario: undefined }), listino)
    expect(b.origine).toBe('irrisolvibile')
    expect(b.totale).toBe(0)
  })

  it('riga della #33 (quantitaCm, senza metri lineari) → da completare, totale 0', () => {
    const legacy: RigaBattiscopa = { id: 'b1', nome: 'BATTISCOPA', quantitaCm: 500, prezzoUnitario: 1.2 }
    const b = calcRigaBattiscopa(legacy, listino)
    expect(b.origine).toBe('da-completare')
    expect(b.totale).toBe(0)
    expect(b.prodotto).toBe(0)
  })

  it('altezza o metri a 0, assenti o assurdi → da completare, nessuna riga da 0,00', () => {
    for (const over of [
      { altezzaCm: 0 },
      { metriLineari: 0 },
      { altezzaCm: undefined },
      { metriLineari: undefined },
      { altezzaCm: -5 },
      { metriLineari: NaN },
    ]) {
      const b = calcRigaBattiscopa(batt(over), listino)
      expect(b.origine).toBe('da-completare')
      expect(b.totale).toBe(0)
    }
  })

  it('forward-compat: un blob della #33 si calcola senza essere riscritto', () => {
    const blob = { id: 'b1', nome: 'BATTISCOPA', quantitaCm: 500, quantita: 2, prezzoUnitario: 1.2, extra: true }
    const riga = JSON.parse(JSON.stringify(blob)) as RigaBattiscopa
    calcRigaBattiscopa(riga, listino)
    expect(riga).toEqual(blob)
  })
})

describe('calcPorte — il battiscopa entra nel subtotale, lo sconto viene DOPO', () => {
  // H 5 cm × 1,2 €/cm = 6 €/ml × 100 ml = 600, senza posa.
  const battiscopa: RigaBattiscopa[] = [
    { id: 'b1', nome: 'BATTISCOPA', prezzoUnitario: 1.2, altezzaCm: 5, metriLineari: 100 },
  ]

  it('porte + battiscopa: 880 + 600 = 1.480', () => {
    const r = calcPorte({ ...sezione([riga(200)]), battiscopa }, listino)
    expect(r.subtotale).toBeCloseTo(1480, 6)
    expect(r.totale).toBeCloseTo(1480, 6)
  })

  it('lo sconto si applica al subtotale COMPRENSIVO di battiscopa', () => {
    const r = calcPorte({ ...sezione([riga(200)], 0.5), battiscopa }, listino)
    expect(r.sconto).toBeCloseTo(740, 6)
    expect(r.totale).toBeCloseTo(740, 6)
  })

  it('il ×qta delle porte NON tocca il battiscopa: 880×3 + 600 = 3.240', () => {
    const r = calcPorte({ ...sezione([{ ...riga(200), quantita: 3 }]), battiscopa }, listino)
    expect(r.subtotale).toBeCloseTo(3240, 6)
  })

  it('battiscopa irrisolvibile: fuori dal subtotale e contato in daDefinire', () => {
    const r = calcPorte(
      { ...sezione([riga(200)]), battiscopa: [{ ...battiscopa[0], nome: 'SPARITO', prezzoUnitario: undefined }] },
      listino
    )
    expect(r.subtotale).toBeCloseTo(880, 6)
    expect(r.daDefinire).toBe(1)
  })

  it('battiscopa da completare (riga #33): fuori dal subtotale e contato in daDefinire', () => {
    const r = calcPorte(
      { ...sezione([riga(200)]), battiscopa: [{ id: 'b1', nome: 'BATTISCOPA', quantitaCm: 500, prezzoUnitario: 1.2 }] },
      listino
    )
    expect(r.subtotale).toBeCloseTo(880, 6)
    expect(r.daDefinire).toBe(1)
  })

  it('sezione di SOLO battiscopa (nessuna porta): il totale è il battiscopa', () => {
    const r = calcPorte({ righe: [], sconto: 0, battiscopa }, listino)
    expect(r.subtotale).toBeCloseTo(600, 6)
  })

  it('sezione senza la chiave `battiscopa` (blob v4 vecchio): invariata', () => {
    expect(calcPorte(sezione([riga(200)]), listino).subtotale).toBe(880)
  })
})

describe('calcPorte — importi all\'euro intero (D4)', () => {
  it('porte e maniglia si arrotondano ciascuna; la riga è la somma; il prezzo unitario resta coi centesimi', () => {
    const r = calcRigaPorta(
      {
        ...riga(200, [opt({ nome: 'BATTISCOPA', unita: 'ML', quantita: 0.5 })]), // optional 0,60
        quantita: 3,
        maniglia: { qta: 3, prezzoUnitario: 12.5, modello: 'M', finitura: 'F' },
      },
      listino
    )
    expect(r.prezzoUnitarioRiga).toBeCloseTo(880.6, 10) // unitario, coi centesimi
    expect(r.totaleManiglia).toBe(38) // 37,50 → 38
    expect(r.totale).toBe(2642 + 38) // 880,6 × 3 = 2.641,80 → 2.642
  })

  it('lo sconto è un importo intero e il totale torna col subtotale', () => {
    const s = { ...sezione([riga(200)]), sconto: 0.125 } // 880 × 12,5% = 110
    const p = calcPorte(s, listino)
    expect(p.sconto).toBe(110)
    expect(p.totale).toBe(p.subtotale - p.sconto)
    const d = calcPorte({ ...sezione([riga(200)]), sconto: 0.0333 }, listino) // 29,30 → 29
    expect(d.sconto).toBe(29)
    expect(d.totale).toBe(851)
  })
})

// O4 (decisione di Marco, 09/10): una porta senza altezza non si prezza in fascia
// base con un'altezza inventata. È da completare, come il battiscopa senza misure.
describe('calcRigaPorta — porta senza altezza: da completare', () => {
  it('altezza 0, negativa, NaN, null o assente ⇒ da-completare, altezza normalizzata a 0', () => {
    const assente = { id: 'r1', modelloNome: 'RAFFAELLA', optionals: [] } as unknown as RigaPorta
    const casi: RigaPorta[] = [riga(0), riga(-5), riga(Number.NaN), riga(null as unknown as number), assente]
    for (const r of casi) {
      expect(calcRigaPorta(r, listino), `altezzaCm ${String(r.altezzaCm)}`).toMatchObject({
        origine: 'da-completare',
        altezzaCm: 0,
      })
    }
  })

  it('il prezzo che manca vince: modello sparito e altezza 0 ⇒ irrisolvibile', () => {
    const r = calcRigaPorta({ ...riga(0), modelloNome: 'INESISTENTE' }, listino)
    expect(r.origine).toBe('irrisolvibile')
  })

  it('calcPorte: la porta da completare esce dal subtotale e dallo sconto, e conta in daDefinire', () => {
    const s = sezione([riga(210), { ...riga(0), id: 'r2' }], 0.1)
    // Solo la porta con l'altezza: 880, sconto 10% = 88, totale 792.
    expect(calcPorte(s, listino)).toMatchObject({ subtotale: 880, sconto: 88, totale: 792, daDefinire: 1 })
  })
})
