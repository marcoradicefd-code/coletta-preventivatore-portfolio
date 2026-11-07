import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ListinoPorte } from '@/types/porte'
import type { RigaPorta } from '@/types/quote'

// quoteStore → pricelistStore → supabase: mock minimale (hermetico).
vi.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: () => ({}) } },
  LISTINI_BUCKET: 'Listini',
}))

import { useQuoteStore } from '@/store/quoteStore'
import { usePricelistStore } from '@/store/pricelistStore'
import { calcPorte } from '@/engine/calcPorte'
import { validatoPerTest } from '@/test-utils/listinoValidato'

/** Il listino di oggi: quello che Antonio ha in mano quando fa il preventivo. */
const OGGI: ListinoPorte = {
  modelli: [
    { nome: 'RAFFAELLA', prezzo2026: 880, h215: 1060, h240: 1150 },
    { nome: 'GIOTTO', prezzo2026: 700, h215: 900, h240: 1000 },
  ],
  optional: [
    { nome: 'STIPITI', unita: 'PORTA', prezzo: 150 },
    { nome: 'BATTISCOPA', unita: 'ML', prezzo: 1.2 },
  ],
  aggiornato: 'PORTE_2026.xlsx',
}

/**
 * Il listino dell'anno prossimo: STESSO prodotto, NOME diverso e prezzo diverso.
 * È il caso reale di E3 — il fornitore rinomina, e i preventivi in corso che
 * referenziavano il nome vecchio non trovano più niente.
 */
const RINOMINATO: ListinoPorte = {
  modelli: [
    { nome: 'RAFFAELLA 2027', prezzo2026: 950, h215: 1100, h240: 1200 },
    { nome: 'GIOTTO', prezzo2026: 700, h215: 900, h240: 1000 },
  ],
  optional: [
    { nome: 'STIPITI 2027', unita: 'PORTA', prezzo: 180 },
    { nome: 'BATTISCOPA', unita: 'ML', prezzo: 1.2 },
  ],
  aggiornato: 'PORTE_2027.xlsx',
}

function caricaListino(l: ListinoPorte) {
  usePricelistStore.setState({ porte: validatoPerTest(l) })
}

function righe(): RigaPorta[] {
  return useQuoteStore.getState().sezioni.porte?.righe ?? []
}

function risultato() {
  const sezione = useQuoteStore.getState().sezioni.porte
  if (!sezione) throw new Error('sezione porte assente')
  return calcPorte(sezione, usePricelistStore.getState().porte)
}

/** Una riga come esce da localStorage v4: nessuno snapshot, solo il nome. */
function rigaLegacy(over: Partial<RigaPorta> = {}): RigaPorta {
  return { id: 'legacy-1', modelloNome: 'RAFFAELLA', altezzaCm: 210, optionals: [], ...over } as RigaPorta
}

function seminaRighe(rs: RigaPorta[]) {
  useQuoteStore.setState((s) => ({
    sezioni: { ...s.sezioni, porte: { sconto: 0, righe: rs } },
  }))
}

describe('E3 — le righe porte congelano il prezzo alla scelta', () => {
  beforeEach(() => {
    useQuoteStore.getState().resetAll()
    usePricelistStore.setState({ porte: null })
  })

  it('IL CASO: modello rinominato nel listino nuovo → il preventivo MANTIENE il prezzo', () => {
    // Oggi questa riga vale 0 € in silenzio: nessun errore, nessun toast, solo il
    // prezzo che sparisce. È il preventivo di un cliente, già promesso.
    caricaListino(OGGI)
    useQuoteStore.getState().addRigaPorta({ modelloNome: 'RAFFAELLA', altezzaCm: 210 })

    caricaListino(RINOMINATO)

    expect(risultato().righe[0].prezzoBase).toBe(880)
    expect(risultato().totale).toBe(880)
    expect(risultato().righe[0].origine).toBe('snapshot')
  })

  it('una riga nuova congela la TERNA di fascia del listino corrente', () => {
    caricaListino(OGGI)
    useQuoteStore.getState().addRigaPorta({ modelloNome: 'RAFFAELLA', altezzaCm: 210 })

    expect(righe()[0].prezziModello).toEqual({ prezzo2026: 880, h215: 1060, h240: 1150 })
  })

  it('perché la TERNA e non un prezzo solo: cambiare altezza dopo il rename', () => {
    // `updateRigaPorta` accetta patch su altezzaCm, e la fascia si deriva
    // dall'altezza a ogni calcolo. Congelando un prezzo solo, alzare la porta a
    // 230 chiederebbe un prezzo (h215) che non abbiamo mai salvato.
    caricaListino(OGGI)
    useQuoteStore.getState().addRigaPorta({ modelloNome: 'RAFFAELLA', altezzaCm: 210 })
    const id = righe()[0].id

    caricaListino(RINOMINATO)
    useQuoteStore.getState().updateRigaPorta(id, { altezzaCm: 230 })

    expect(risultato().righe[0].fascia).toBe('h215')
    expect(risultato().righe[0].prezzoBase).toBe(1060)
  })

  it('anche gli OPTIONAL congelano il rate (chiude calcPorte.ts:59)', () => {
    caricaListino(OGGI)
    useQuoteStore.getState().addRigaPorta({ modelloNome: 'RAFFAELLA', altezzaCm: 210 })
    const id = righe()[0].id
    useQuoteStore
      .getState()
      .addOptionalPorta(id, { nome: 'STIPITI', unita: 'PORTA', quantita: 1, prezzoManuale: null })

    caricaListino(RINOMINATO)

    expect(risultato().righe[0].optionalTotale).toBe(150)
    expect(risultato().righe[0].totale).toBe(1030)
  })

  it('cambiare modello ri-congela la terna del modello NUOVO', () => {
    caricaListino(OGGI)
    useQuoteStore.getState().addRigaPorta({ modelloNome: 'RAFFAELLA', altezzaCm: 210 })
    const id = righe()[0].id

    useQuoteStore.getState().updateRigaPorta(id, { modelloNome: 'GIOTTO' })

    expect(righe()[0].prezziModello).toEqual({ prezzo2026: 700, h215: 900, h240: 1000 })
    expect(risultato().righe[0].prezzoBase).toBe(700)
  })

  it('optional MANUALE: il prezzo è già sulla riga, nessun rate da congelare', () => {
    caricaListino(OGGI)
    useQuoteStore.getState().addRigaPorta({ modelloNome: 'RAFFAELLA', altezzaCm: 210 })
    const id = righe()[0].id
    useQuoteStore
      .getState()
      .addOptionalPorta(id, { nome: 'FUORI LISTINO', unita: 'MANUALE', quantita: 1, prezzoManuale: 99 })

    caricaListino(RINOMINATO)

    expect(risultato().righe[0].optionalTotale).toBe(99)
  })
})

describe('E3 — backfill delle righe legacy (snapshottaPortePendenti)', () => {
  beforeEach(() => {
    useQuoteStore.getState().resetAll()
    usePricelistStore.setState({ porte: null })
  })

  it('congela le righe senza snapshot dal listino caricato', () => {
    caricaListino(OGGI)
    seminaRighe([rigaLegacy()])

    useQuoteStore.getState().snapshottaPortePendenti()

    expect(righe()[0].prezziModello).toEqual({ prezzo2026: 880, h215: 1060, h240: 1150 })
  })

  it('IDEMPOTENTE: due esecuzioni = stesso risultato', () => {
    caricaListino(OGGI)
    seminaRighe([rigaLegacy()])

    useQuoteStore.getState().snapshottaPortePendenti()
    const dopoUno = righe()
    useQuoteStore.getState().snapshottaPortePendenti()
    const dopoDue = righe()

    expect(dopoDue).toEqual(dopoUno)
    // Punto fisso vero: nessun oggetto nuovo al secondo giro, quindi nessun
    // re-render e nessuna scrittura su localStorage.
    expect(dopoDue).toBe(dopoUno)
  })

  it('NON tocca le righe già snapshottate: uno snapshot è una promessa', () => {
    // Il listino ora dice 950, la riga fu promessa a 880. Vince la promessa.
    caricaListino(OGGI)
    useQuoteStore.getState().addRigaPorta({ modelloNome: 'RAFFAELLA', altezzaCm: 210 })
    caricaListino({
      ...RINOMINATO,
      modelli: [{ nome: 'RAFFAELLA', prezzo2026: 950, h215: 1100, h240: 1200 }],
    })

    useQuoteStore.getState().snapshottaPortePendenti()

    expect(righe()[0].prezziModello).toEqual({ prezzo2026: 880, h215: 1060, h240: 1150 })
    expect(risultato().righe[0].prezzoBase).toBe(880)
  })

  it('modello GIÀ sparito: non inventa un prezzo, e la riga si dichiara irrisolvibile', () => {
    // Il prezzo non è mai stato salvato: non è recuperabile. Congelare 0 sarebbe
    // pietrificare il bug e farlo sembrare un dato.
    caricaListino(RINOMINATO)
    seminaRighe([rigaLegacy()])

    useQuoteStore.getState().snapshottaPortePendenti()

    expect(righe()[0].prezziModello).toBeUndefined()
    expect(risultato().righe[0].origine).toBe('irrisolvibile')
  })

  it('si auto-ripara: se il nome torna nel listino, il giro dopo si congela', () => {
    caricaListino(RINOMINATO)
    seminaRighe([rigaLegacy()])
    useQuoteStore.getState().snapshottaPortePendenti()
    expect(righe()[0].prezziModello).toBeUndefined()

    caricaListino(OGGI)
    useQuoteStore.getState().snapshottaPortePendenti()

    expect(righe()[0].prezziModello).toEqual({ prezzo2026: 880, h215: 1060, h240: 1150 })
  })

  it('senza listino non fa niente (gira anche prima di loadDefaults)', () => {
    seminaRighe([rigaLegacy()])
    const prima = righe()

    useQuoteStore.getState().snapshottaPortePendenti()

    expect(righe()).toBe(prima)
  })
})

describe('E3 — il totale esclude le righe irrisolvibili', () => {
  beforeEach(() => {
    useQuoteStore.getState().resetAll()
    usePricelistStore.setState({ porte: null })
  })

  it('una riga senza prezzo NON entra nel subtotale, e viene contata', () => {
    // Oggi entra come 0 € e abbassa il totale in silenzio: il cliente riceve un
    // preventivo che vale meno del dovuto, e nessuno se ne accorge.
    caricaListino(OGGI)
    useQuoteStore.getState().addRigaPorta({ modelloNome: 'GIOTTO', altezzaCm: 210 })
    seminaRighe([...righe(), rigaLegacy({ id: 'persa', modelloNome: 'MODELLO SPARITO' })])

    const r = risultato()

    expect(r.subtotale).toBe(700)
    expect(r.totale).toBe(700)
    expect(r.daDefinire).toBe(1)
  })

  it('nessuna riga irrisolvibile → daDefinire = 0', () => {
    caricaListino(OGGI)
    useQuoteStore.getState().addRigaPorta({ modelloNome: 'GIOTTO', altezzaCm: 210 })

    expect(risultato().daDefinire).toBe(0)
  })
})

describe('quantità: editabile, NON entra nella promessa (PR B)', () => {
  // La promessa di #22 è il PREZZO UNITARIO congelato alla scelta, non il
  // conteggio. Cambiare quantità è come cambiare altezza: non ri-congela nulla.
  beforeEach(() => {
    useQuoteStore.getState().resetAll()
    caricaListino(OGGI)
  })

  it('cambiare quantità NON ri-congela prezziModello', () => {
    useQuoteStore.getState().addRigaPorta({ modelloNome: 'GIOTTO', altezzaCm: 210 })
    const id = righe()[0].id
    const primaSnapshot = righe()[0].prezziModello

    // Il listino cambia SOTTO la riga: se la quantità ri-congelasse, il prezzo
    // promesso al cliente si muoverebbe da solo.
    caricaListino({
      ...OGGI,
      modelli: [{ nome: 'GIOTTO', prezzo2026: 9999, h215: 9999, h240: 9999 }],
    })
    useQuoteStore.getState().updateRigaPorta(id, { quantita: 4 })

    expect(righe()[0].quantita).toBe(4)
    expect(righe()[0].prezziModello).toEqual(primaSnapshot)
  })

  it('cambiare modello ri-congela ma PRESERVA la quantità', () => {
    useQuoteStore.getState().addRigaPorta({ modelloNome: 'GIOTTO', altezzaCm: 210 })
    const id = righe()[0].id
    useQuoteStore.getState().updateRigaPorta(id, { quantita: 3 })
    useQuoteStore.getState().updateRigaPorta(id, { modelloNome: 'RAFFAELLA' })
    expect(righe()[0].quantita).toBe(3)
    expect(righe()[0].prezziModello).toEqual({ prezzo2026: 880, h215: 1060, h240: 1150 })
  })

  it('la maniglia è un prezzo A MANO: non si snapshotta e sopravvive al cambio modello', () => {
    useQuoteStore.getState().addRigaPorta({ modelloNome: 'GIOTTO', altezzaCm: 210 })
    const id = righe()[0].id
    useQuoteStore.getState().setManigliaPorta(id, { qta: 2, prezzoUnitario: 45, modello: 'Olivari Rio', finitura: 'cromo satinato' })
    useQuoteStore.getState().updateRigaPorta(id, { modelloNome: 'RAFFAELLA' })
    expect(righe()[0].maniglia).toEqual({ qta: 2, prezzoUnitario: 45, modello: 'Olivari Rio', finitura: 'cromo satinato' })
  })

  it('setManigliaPorta(null) rimuove la maniglia', () => {
    useQuoteStore.getState().addRigaPorta({ modelloNome: 'GIOTTO', altezzaCm: 210 })
    const id = righe()[0].id
    useQuoteStore.getState().setManigliaPorta(id, { qta: 1, prezzoUnitario: 30, modello: 'M', finitura: 'F' })
    useQuoteStore.getState().setManigliaPorta(id, null)
    expect(righe()[0].maniglia).toBeUndefined()
  })

  it('addRigaPorta non inventa quantità né maniglia (assenti = default in lettura)', () => {
    useQuoteStore.getState().addRigaPorta({ modelloNome: 'GIOTTO', altezzaCm: 210 })
    expect(righe()[0].quantita).toBeUndefined()
    expect(righe()[0].maniglia).toBeUndefined()
  })
})

describe('battiscopa a corpo: snapshot alla scelta, come gli optional (PR C)', () => {
  beforeEach(() => {
    useQuoteStore.getState().resetAll()
    caricaListino(OGGI)
  })

  const battiscopa = () => useQuoteStore.getState().sezioni.porte?.battiscopa ?? []

  it('addBattiscopa congela il €/cm d altezza e nasce nella forma nuova, da completare', () => {
    useQuoteStore.getState().addBattiscopa('BATTISCOPA')
    expect(battiscopa()).toHaveLength(1)
    const riga = battiscopa()[0]
    expect(riga.prezzoUnitario).toBe(1.2)
    expect(riga.nome).toBe('BATTISCOPA')
    // Le misure non si inventano: le scrive l'utente. Le chiavi della #33 non
    // nascono più.
    expect(riga.altezzaCm).toBeUndefined()
    expect(riga.metriLineari).toBeUndefined()
    expect(riga).not.toHaveProperty('quantitaCm')
    expect(riga).not.toHaveProperty('quantita')
  })

  it('il rate congelato NON segue il listino che cambia sotto', () => {
    useQuoteStore.getState().addBattiscopa('BATTISCOPA')
    caricaListino({ ...OGGI, optional: [{ nome: 'BATTISCOPA', unita: 'ML', prezzo: 99 }] })
    expect(battiscopa()[0].prezzoUnitario).toBe(1.2)
  })

  it('voce non nel listino: riga creata SENZA rate (la dichiarerà irrisolvibile)', () => {
    useQuoteStore.getState().addBattiscopa('INESISTENTE')
    expect(battiscopa()[0].prezzoUnitario).toBeUndefined()
  })

  it('updateBattiscopa cambia altezza, metri, posa ed extra senza toccare il rate', () => {
    useQuoteStore.getState().addBattiscopa('BATTISCOPA')
    const id = battiscopa()[0].id
    useQuoteStore.getState().updateBattiscopa(id, { altezzaCm: 5, metriLineari: 5.5, prezzoPosaMl: 4, extra: true })
    expect(battiscopa()[0]).toMatchObject({
      altezzaCm: 5,
      metriLineari: 5.5,
      prezzoPosaMl: 4,
      extra: true,
      prezzoUnitario: 1.2,
    })
  })

  it('completare una riga della #33 (altezza e metri) toglie quantitaCm e quantita', () => {
    useQuoteStore.setState((st) => ({
      sezioni: {
        ...st.sezioni,
        porte: {
          righe: [],
          sconto: 0,
          battiscopa: [{ id: 'b1', nome: 'BATTISCOPA', quantitaCm: 500, quantita: 2, prezzoUnitario: 1.2 }],
        },
      },
    }))
    useQuoteStore.getState().updateBattiscopa('b1', { altezzaCm: 5 })
    // Solo l'altezza: la riga è ancora da completare, la lunghezza vecchia resta
    // leggibile nell'avviso.
    expect(battiscopa()[0].quantitaCm).toBe(500)
    useQuoteStore.getState().updateBattiscopa('b1', { metriLineari: 5 })
    expect(battiscopa()[0]).toEqual({ id: 'b1', nome: 'BATTISCOPA', prezzoUnitario: 1.2, altezzaCm: 5, metriLineari: 5 })
  })

  it('removeBattiscopa toglie solo la sua riga', () => {
    const s = useQuoteStore.getState()
    s.addBattiscopa('BATTISCOPA')
    s.addBattiscopa('BATTISCOPA')
    const id = battiscopa()[0].id
    useQuoteStore.getState().removeBattiscopa(id)
    expect(battiscopa()).toHaveLength(1)
    expect(battiscopa()[0].id).not.toBe(id)
  })

  it('le righe porta non vengono toccate dall aggiunta di un battiscopa', () => {
    useQuoteStore.getState().addRigaPorta({ modelloNome: 'GIOTTO', altezzaCm: 210 })
    const prima = righe()[0]
    useQuoteStore.getState().addBattiscopa('BATTISCOPA')
    expect(righe()[0]).toEqual(prima)
  })

  it('setDescrizioneBattiscopa: tri-stato come le porte (vuoto ⇒ null)', () => {
    useQuoteStore.getState().addBattiscopa('BATTISCOPA')
    const id = battiscopa()[0].id
    useQuoteStore.getState().setDescrizioneBattiscopa(id, 'Battiscopa su misura')
    expect(battiscopa()[0].descrizione).toBe('Battiscopa su misura')
    useQuoteStore.getState().setDescrizioneBattiscopa(id, '   ')
    expect(battiscopa()[0].descrizione).toBeNull()
  })

  it('resetPorte azzera anche i battiscopa', () => {
    useQuoteStore.getState().addBattiscopa('BATTISCOPA')
    useQuoteStore.getState().resetPorte()
    expect(useQuoteStore.getState().sezioni.porte?.battiscopa ?? []).toHaveLength(0)
  })
})
