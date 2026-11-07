import { describe, it, expect } from 'vitest'
import { migrateQuoteState } from '@/store/quoteMigrations'
import { descrizionePortaDi } from '@/store/quoteSelectors'
import { calcRigaPorta } from '@/engine/calcPorte'
import type { Preventivo } from '@/types/common'
import type { QuoteSuMisura, ArticoloSuMisura } from '@/types/sumisura'
import type { QuoteMarmeria } from '@/types/marmeria'

// migrateQuoteState è PURA: nessun localStorage/zustand, solo input → output.
// È il test gate della migrazione persist v3→v4 (FASE 1): NO SHIP senza verde.

const articolo: ArticoloSuMisura = {
  id: 'a1',
  origine: 'manuale',
  descrizione: 'Mobile',
  prezzoUnitario: 100,
  um: 'PZ',
  larghezzaCm: null,
  altezzaCm: null,
  lunghezzaMl: null,
  quantita: 2,
  profonditaOltre65: false,
  finituraInterna: '',
  finituraEsterna: '',
  codiceFinitura: '',
  note: '',
}

const preventivoV3: Preventivo = {
  numero: '2026-001',
  data: '2026-06-29',
  validitaGiorni: 30,
  cliente: { nome: 'Mario', cognome: 'Rossi', indirizzo: '', citta: '', telefono: '', email: '' },
  oggettoPreventivo: '',
  note: '',
  includiCondizioni: false, // valore esplicito: NON deve essere sovrascritto dal backfill
}

const suMisuraV3: QuoteSuMisura = {
  articoli: [articolo],
  quotaProgettazione: true,
  noteGenerali: 'note generali',
  includiNotePagamento: false,
  mostraMqInPdf: true,
}

const marmeriaV3: QuoteMarmeria = {
  tipologiaMateriale: 'LAPITEC',
  righeMateriali: [
    { id: 'm1', materialeKey: 'k', spessore: 20, fascia: 'fino62', profonditaCm: 60, qtaMq: 2, prezzoMq: 100, totale: 200 },
  ],
  righeAlzatine: [],
  righeLavorazioniBordo: [],
  righeVarie: [],
  sconto: 0.2,
  includiRilMont: true,
}

describe('migrateQuoteState — v3 completo → v4', () => {
  const blobV3 = {
    preventivo: preventivoV3,
    suMisura: suMisuraV3,
    marmeria: marmeriaV3,
    ricordaPreventivo: true,
  }

  it('mappa suMisura → sezioni.arredi aggiungendo sconto:0', () => {
    const out = migrateQuoteState(blobV3, 3)
    expect(out.sezioni.arredi).toBeDefined()
    expect(out.sezioni.arredi!.articoli).toEqual([articolo])
    expect(out.sezioni.arredi!.quotaProgettazione).toBe(true)
    expect(out.sezioni.arredi!.noteGenerali).toBe('note generali')
    expect(out.sezioni.arredi!.mostraMqInPdf).toBe(true)
    // Su Misura non aveva sconto → inizializzato a 0.
    expect(out.sezioni.arredi!.sconto).toBe(0)
  })

  it('mappa marmeria → sezioni.gres preservando sconto e includiRilMont', () => {
    const out = migrateQuoteState(blobV3, 3)
    expect(out.sezioni.gres).toBeDefined()
    expect(out.sezioni.gres!.tipologiaMateriale).toBe('LAPITEC')
    expect(out.sezioni.gres!.sconto).toBe(0.2)
    expect(out.sezioni.gres!.includiRilMont).toBe(true)
    expect(out.sezioni.gres!.righeMateriali).toHaveLength(1)
  })

  it('lascia undefined le sezioni nuove (cucine/porte/progettoValore)', () => {
    const out = migrateQuoteState(blobV3, 3)
    expect(out.sezioni.cucine).toBeUndefined()
    expect(out.sezioni.porte).toBeUndefined()
    expect(out.sezioni.progettoValore).toBeUndefined()
  })

  it('non lascia residui suMisura/marmeria nello stato migrato', () => {
    const out = migrateQuoteState(blobV3, 3) as unknown as Record<string, unknown>
    expect(out.suMisura).toBeUndefined()
    expect(out.marmeria).toBeUndefined()
  })

  it('preserva preventivo (incl. includiCondizioni esplicito) e ricordaPreventivo', () => {
    const out = migrateQuoteState(blobV3, 3)
    expect(out.preventivo?.numero).toBe('2026-001')
    expect(out.preventivo?.includiCondizioni).toBe(false)
    expect(out.ricordaPreventivo).toBe(true)
  })

  it('non muta il blob di input', () => {
    const snapshot = JSON.parse(JSON.stringify(blobV3))
    migrateQuoteState(blobV3, 3)
    expect(blobV3).toEqual(snapshot)
  })
})

describe('migrateQuoteState — backfill includiCondizioni', () => {
  it('aggiunge includiCondizioni=true se assente nel preventivo (v2)', () => {
    const preventivoSenzaFlag: Partial<Preventivo> = { ...preventivoV3 }
    delete preventivoSenzaFlag.includiCondizioni
    const out = migrateQuoteState(
      { preventivo: preventivoSenzaFlag, suMisura: suMisuraV3 },
      2
    )
    expect(out.preventivo?.includiCondizioni).toBe(true)
  })
})

describe('migrateQuoteState — ricordaPreventivo:false (solo flag persistito)', () => {
  it('da blob col solo flag → sezioni vuote {}', () => {
    const out = migrateQuoteState({ ricordaPreventivo: false }, 3)
    expect(out.sezioni).toEqual({})
    expect(out.ricordaPreventivo).toBe(false)
    expect(out.preventivo).toBeUndefined()
  })
})

describe('migrateQuoteState — v1 (Su Misura vecchio non mappabile)', () => {
  it('arredi riparte vuoto (articoli []), marmeria → gres se presente', () => {
    // v1: suMisura era una mappa-quantità (shape arbitraria, non ad articoli).
    const blobV1 = { suMisura: { 'voce-x': 3, 'voce-y': 1 }, marmeria: marmeriaV3 }
    const out = migrateQuoteState(blobV1, 1)
    expect(out.sezioni.arredi).toBeDefined()
    expect(out.sezioni.arredi!.articoli).toEqual([])
    expect(out.sezioni.arredi!.sconto).toBe(0)
    // la marmeria (shape stabile da sempre) viene comunque mappata.
    expect(out.sezioni.gres?.tipologiaMateriale).toBe('LAPITEC')
  })
})

describe('migrateQuoteState — idempotenza su input già v4', () => {
  it('un blob con `sezioni` non viene azzerato né rimappato', () => {
    const v4 = {
      preventivo: preventivoV3,
      sezioni: {
        arredi: { ...suMisuraV3, sconto: 0.1 },
        gres: { ...marmeriaV3, sconto: 0.3 },
      },
      ricordaPreventivo: true,
    }
    const out = migrateQuoteState(v4, 4)
    // gli sconti esistenti NON tornano a 0 / non vengono sovrascritti.
    expect(out.sezioni.arredi!.sconto).toBe(0.1)
    expect(out.sezioni.gres!.sconto).toBe(0.3)
    expect(out.sezioni.arredi!.articoli).toEqual([articolo])
  })

  it('re-run del migrate sul proprio output è un punto fisso', () => {
    const once = migrateQuoteState(
      { preventivo: preventivoV3, suMisura: suMisuraV3, marmeria: marmeriaV3 },
      3
    )
    const twice = migrateQuoteState(once, 4)
    expect(twice).toEqual(once)
  })
})

describe('migrateQuoteState — forward-compat progettoValore (fase 6, NESSUN bump)', () => {
  it('blob v4 SENZA progettoValore: la chiave resta undefined, arredi/gres intatti', () => {
    const v4 = {
      preventivo: preventivoV3,
      sezioni: {
        arredi: { ...suMisuraV3, sconto: 0.1 },
        gres: { ...marmeriaV3, sconto: 0.3 },
      },
      ricordaPreventivo: true,
    }
    const out = migrateQuoteState(v4, 4)
    expect(out.sezioni.progettoValore).toBeUndefined()
    expect(out.sezioni.arredi!.sconto).toBe(0.1)
    expect(out.sezioni.gres!.sconto).toBe(0.3)
  })

  it('blob v4 CON progettoValore: preservato identico (nessuna rimappatura, punto fisso)', () => {
    const progettoValore = {
      righe: [
        { id: 'p1', descrizione: 'Cucina a corpo', prezzo: 5000 },
        { id: 'p2', descrizione: 'Optional cappa', prezzo: 800 },
      ],
      sconto: 0.15,
    }
    const v4 = {
      preventivo: preventivoV3,
      sezioni: {
        arredi: { ...suMisuraV3, sconto: 0 },
        gres: { ...marmeriaV3 },
        progettoValore,
      },
      ricordaPreventivo: true,
    }
    const out = migrateQuoteState(v4, 4)
    expect(out.sezioni.progettoValore).toEqual(progettoValore)
    // re-run sul proprio output: resta identico (forward-compat senza version bump).
    expect(migrateQuoteState(out, 4).sezioni.progettoValore).toEqual(progettoValore)
  })
})

describe('migrateQuoteState — forward-compat porte (fase 7, NESSUN bump)', () => {
  it('blob v4 SENZA porte: la chiave resta undefined, arredi/gres intatti', () => {
    const v4 = {
      preventivo: preventivoV3,
      sezioni: {
        arredi: { ...suMisuraV3, sconto: 0.1 },
        gres: { ...marmeriaV3, sconto: 0.3 },
      },
      ricordaPreventivo: true,
    }
    const out = migrateQuoteState(v4, 4)
    expect(out.sezioni.porte).toBeUndefined()
    expect(out.sezioni.arredi!.sconto).toBe(0.1)
    expect(out.sezioni.gres!.sconto).toBe(0.3)
  })

  it('blob v4 CON porte (righe + optional annidati): preservato identico (punto fisso)', () => {
    const porte = {
      righe: [
        {
          id: 'p1',
          modelloNome: 'RAFFAELLA',
          altezzaCm: 230,
          optionals: [
            { id: 'o1', nome: 'STIPITI', unita: 'PORTA', quantita: 1, prezzoManuale: null },
          ],
        },
      ],
      sconto: 0.2,
    }
    const v4 = {
      preventivo: preventivoV3,
      sezioni: {
        arredi: { ...suMisuraV3, sconto: 0 },
        gres: { ...marmeriaV3 },
        porte,
      },
      ricordaPreventivo: true,
    }
    const out = migrateQuoteState(v4, 4)
    expect(out.sezioni.porte).toEqual(porte)
    // re-run sul proprio output: identico (forward-compat senza version bump).
    expect(migrateQuoteState(out, 4).sezioni.porte).toEqual(porte)
  })
})

describe('migrateQuoteState — forward-compat cucine (fase 8, NESSUN bump)', () => {
  it('blob v4 SENZA cucine: la chiave resta undefined, arredi/gres intatti', () => {
    const v4 = {
      preventivo: preventivoV3,
      sezioni: {
        arredi: { ...suMisuraV3, sconto: 0.1 },
        gres: { ...marmeriaV3, sconto: 0.3 },
      },
      ricordaPreventivo: true,
    }
    const out = migrateQuoteState(v4, 4)
    expect(out.sezioni.cucine).toBeUndefined()
    expect(out.sezioni.arredi!.sconto).toBe(0.1)
    expect(out.sezioni.gres!.sconto).toBe(0.3)
  })

  it('blob v4 CON cucine (voci + moltiplicatori + adeguamento): preservato identico (punto fisso)', () => {
    const cucine = {
      voci: [
        { voceId: 'colonna-fuorimisura', quantita: 1 },
        { voceId: 'striscia-led', quantita: 8 },
        { voceId: 'isola-laminato-fuorimisura', quantita: 1 },
      ],
      casse: false,
      ante: true,
      giorniExtra: 9,
      extraManuale: { descrizione: 'maniglie speciali', importo: 500 },
      adeguamentoPct: 0.2,
      descrizione: 'Cucina lineare 360 cm',
      sconto: 0.1,
    }
    const v4 = {
      preventivo: preventivoV3,
      sezioni: {
        arredi: { ...suMisuraV3, sconto: 0 },
        gres: { ...marmeriaV3 },
        cucine,
      },
      ricordaPreventivo: true,
    }
    const out = migrateQuoteState(v4, 4)
    expect(out.sezioni.cucine).toEqual(cucine)
    // re-run sul proprio output: identico (forward-compat senza version bump).
    expect(migrateQuoteState(out, 4).sezioni.cucine).toEqual(cucine)
  })
})

describe('migrateQuoteState — forward-compat vasca gres (NESSUN bump)', () => {
  // La vasca è una chiave OPZIONALE dentro `sezioni.gres`, non una sezione nuova:
  // i preventivi salvati prima della vasca restano v4 e non vanno migrati.
  it('blob v4 SENZA vasca: la chiave resta undefined, gres intatto (idempotente)', () => {
    const v4 = {
      preventivo: preventivoV3,
      sezioni: {
        arredi: { ...suMisuraV3, sconto: 0.1 },
        gres: { ...marmeriaV3, sconto: 0.3 },
      },
      ricordaPreventivo: true,
    }
    const out = migrateQuoteState(v4, 4)
    expect(out.sezioni.gres!.vasca).toBeUndefined()
    expect(out.sezioni.gres!.sconto).toBe(0.3)
    expect(out.sezioni.gres!.righeMateriali).toHaveLength(1)
    // punto fisso: un re-run non inventa una vasca né tocca il resto.
    expect(migrateQuoteState(out, 4)).toEqual(out)
  })

  it('blob v4 CON vasca: preservata identica (punto fisso)', () => {
    const vasca = { inclusa: true, prezzo: 1200 }
    const v4 = {
      preventivo: preventivoV3,
      sezioni: {
        arredi: { ...suMisuraV3, sconto: 0 },
        gres: { ...marmeriaV3, vasca },
      },
      ricordaPreventivo: true,
    }
    const out = migrateQuoteState(v4, 4)
    expect(out.sezioni.gres!.vasca).toEqual(vasca)
    // re-run sul proprio output: il prezzo snapshottato non torna al default.
    expect(migrateQuoteState(out, 4).sezioni.gres!.vasca).toEqual(vasca)
  })
})

describe('migrateQuoteState — note pagamento da sezione a documento', () => {
  // Il flag nasce su `suMisura/arredi` (era un campo del Su Misura) ma il PDF lo
  // stampa a livello documento. Il gradino lo COPIA su `preventivo`; il vecchio
  // resta dov'è (nessuna rimozione distruttiva) e vale come fallback di lettura.

  it('v3: copia includiNotePagamento da suMisura al preventivo', () => {
    const out = migrateQuoteState(
      {
        preventivo: preventivoV3,
        suMisura: { ...suMisuraV3, includiNotePagamento: true },
        marmeria: marmeriaV3,
      },
      3
    )
    expect(out.preventivo?.includiNotePagamento).toBe(true)
  })

  it('v3: un false esplicito SOPRAVVIVE (non viene promosso a true)', () => {
    const out = migrateQuoteState(
      { preventivo: preventivoV3, suMisura: { ...suMisuraV3, includiNotePagamento: false } },
      3
    )
    expect(out.preventivo?.includiNotePagamento).toBe(false)
  })

  it('v4 con flag ancora su arredi: la copia avviene lo stesso', () => {
    const v4 = {
      preventivo: preventivoV3,
      sezioni: { arredi: { ...suMisuraV3, sconto: 0, includiNotePagamento: true } },
      ricordaPreventivo: true,
    }
    const out = migrateQuoteState(v4, 4)
    expect(out.preventivo?.includiNotePagamento).toBe(true)
    // Il campo vecchio NON viene rimosso: i blob restano leggibili all'indietro.
    expect(out.sezioni.arredi!.includiNotePagamento).toBe(true)
  })

  it('un valore GIÀ sul preventivo non viene sovrascritto dalla sezione', () => {
    const v4 = {
      preventivo: { ...preventivoV3, includiNotePagamento: false },
      sezioni: { arredi: { ...suMisuraV3, sconto: 0, includiNotePagamento: true } },
    }
    const out = migrateQuoteState(v4, 4)
    expect(out.preventivo?.includiNotePagamento).toBe(false)
  })

  it('nessun flag da nessuna parte: la chiave resta assente (default al read)', () => {
    const senzaFlag: Record<string, unknown> = { ...suMisuraV3 }
    delete senzaFlag.includiNotePagamento
    const out = migrateQuoteState({ preventivo: preventivoV3, suMisura: senzaFlag }, 3)
    expect(out.preventivo?.includiNotePagamento).toBeUndefined()
  })

  it('IDEMPOTENTE: re-run sul proprio output è un punto fisso', () => {
    const once = migrateQuoteState(
      {
        preventivo: preventivoV3,
        suMisura: { ...suMisuraV3, includiNotePagamento: true },
        marmeria: marmeriaV3,
      },
      3
    )
    expect(migrateQuoteState(once, 4)).toEqual(once)
  })

  it('notePagamento (testo) non viene inventato dal migrate', () => {
    const out = migrateQuoteState({ preventivo: preventivoV3, suMisura: suMisuraV3 }, 3)
    expect(out.preventivo?.notePagamento).toBeUndefined()
  })
})

describe('migrateQuoteState — forward-compat testi descrittivi (NESSUN bump)', () => {
  it('descrizione arredi e descrizione porte per riga: preservate identiche', () => {
    const v4 = {
      preventivo: preventivoV3,
      sezioni: {
        arredi: { ...suMisuraV3, sconto: 0, descrizione: 'testo arredi mio' },
        porte: {
          sconto: 0,
          righe: [
            { id: 'p1', modelloNome: 'GIOTTO', altezzaCm: 210, optionals: [], descrizione: 'testo porta mio' },
            { id: 'p2', modelloNome: 'RAFFAELLA', altezzaCm: 210, optionals: [], descrizione: null },
          ],
        },
      },
    }
    const out = migrateQuoteState(v4, 4)
    expect(out.sezioni.arredi!.descrizione).toBe('testo arredi mio')
    expect(out.sezioni.porte!.righe[0].descrizione).toBe('testo porta mio')
    // `null` = "mai editata": deve restare null, non diventare undefined o una stringa.
    expect(out.sezioni.porte!.righe[1].descrizione).toBeNull()
    expect(migrateQuoteState(out, 4)).toEqual(out)
  })
})

describe('migrateQuoteState — forward-compat quantità e maniglia porte (NESSUN bump)', () => {
  // Chiavi opzionali DENTRO una sezione esistente, come la vasca in gres: i
  // preventivi salvati prima restano v4 e non vanno migrati.
  const porteLegacy = {
    sconto: 0,
    righe: [{ id: 'p1', modelloNome: 'GIOTTO', altezzaCm: 210, optionals: [] }],
  }

  it('blob v4 SENZA quantita/maniglia: le chiavi restano assenti, riga intatta', () => {
    const out = migrateQuoteState(
      { preventivo: preventivoV3, sezioni: { arredi: { ...suMisuraV3, sconto: 0 }, porte: porteLegacy } },
      4
    )
    expect(out.sezioni.porte!.righe[0].quantita).toBeUndefined()
    expect(out.sezioni.porte!.righe[0].maniglia).toBeUndefined()
    expect(out.sezioni.porte).toEqual(porteLegacy)
    expect(migrateQuoteState(out, 4)).toEqual(out)
  })

  it('blob v4 CON quantita e maniglia: preservate identiche (punto fisso)', () => {
    const porte = {
      sconto: 0.1,
      righe: [
        {
          id: 'p1',
          modelloNome: 'GIOTTO',
          altezzaCm: 210,
          optionals: [],
          quantita: 4,
          maniglia: { qta: 2, prezzoUnitario: 45, modello: 'Olivari Rio', finitura: 'cromo satinato' },
        },
      ],
    }
    const out = migrateQuoteState(
      { preventivo: preventivoV3, sezioni: { arredi: { ...suMisuraV3, sconto: 0 }, porte } },
      4
    )
    expect(out.sezioni.porte).toEqual(porte)
    expect(migrateQuoteState(out, 4).sezioni.porte).toEqual(porte)
  })

  it('blob v4 con maniglia SENZA prezzoUnitario: si carica intatta e vale come inclusa', () => {
    // Regola di Antonio (06/10): prezzo vuoto = maniglia inclusa. Nessun bump:
    // la chiave era già opzionale, il migrate non inventa un prezzo.
    const maniglia = { qta: 2, modello: 'Olivari Rio', finitura: 'cromo satinato' }
    const porte = {
      sconto: 0,
      righe: [{ id: 'p1', modelloNome: 'GIOTTO', altezzaCm: 210, optionals: [], maniglia }],
    }
    const out = migrateQuoteState({ preventivo: preventivoV3, sezioni: { porte } }, 4)
    const riga = out.sezioni.porte!.righe[0]
    expect(riga.maniglia).toEqual(maniglia)
    expect(riga.maniglia).not.toHaveProperty('prezzoUnitario')
    expect(calcRigaPorta(riga, null).totaleManiglia).toBe(0)
    expect(descrizionePortaDi(riga)).toContain('maniglia mod. Olivari Rio cromo satinato inclusa.')
  })

  it('il migrate non inventa una quantità di default (il default vive in lettura)', () => {
    const out = migrateQuoteState({ preventivo: preventivoV3, sezioni: { porte: porteLegacy } }, 3)
    expect(out.sezioni.porte!.righe[0].quantita).toBeUndefined()
  })
})

describe('migrateQuoteState — forward-compat battiscopa a corpo (NESSUN bump)', () => {
  const porteLegacy = {
    sconto: 0,
    righe: [
      {
        id: 'p1',
        modelloNome: 'GIOTTO',
        altezzaCm: 210,
        // Il battiscopa com'era salvato PRIMA della PR C: un optional.
        optionals: [{ id: 'o1', nome: 'BATTISCOPA MASSELLO', unita: 'ML', quantita: 210, prezzoManuale: null, prezzoUnitario: 1.2 }],
      },
    ],
  }

  it('blob v4 SENZA la chiave `battiscopa`: resta assente, gli optional intatti', () => {
    const out = migrateQuoteState({ preventivo: preventivoV3, sezioni: { porte: porteLegacy } }, 4)
    expect(out.sezioni.porte!.battiscopa).toBeUndefined()
    // L'optional legacy NON viene migrato in riga: i preventivi salvati non si riscrivono.
    expect(out.sezioni.porte!.righe[0].optionals).toHaveLength(1)
    expect(out.sezioni.porte).toEqual(porteLegacy)
    expect(migrateQuoteState(out, 4)).toEqual(out)
  })

  it('blob v4 CON battiscopa a corpo: preservato identico (punto fisso)', () => {
    const porte = {
      sconto: 0.1,
      righe: [],
      battiscopa: [
        { id: 'b1', nome: 'BATTISCOPA MASSELLO', quantitaCm: 500, prezzoUnitario: 1.2, quantita: 2, extra: true, descrizione: 'testo mio' },
        { id: 'b2', nome: 'BATTISCOPA MASSELLO', quantitaCm: 120, prezzoUnitario: 1.2, descrizione: null },
      ],
    }
    const out = migrateQuoteState({ preventivo: preventivoV3, sezioni: { porte } }, 4)
    expect(out.sezioni.porte).toEqual(porte)
    expect(migrateQuoteState(out, 4).sezioni.porte).toEqual(porte)
  })
})

describe('migrateQuoteState — preventivo null è assente (O10)', () => {
  it('preventivo null è assente: nessun errore, le sezioni del blob si salvano e l\'output non ha preventivo', () => {
    // Un blob rovinato con `preventivo: null` faceva lanciare il migrate sul
    // backfill (`null.includiCondizioni`), e `persist` ripartiva da vuoto
    // buttando anche le sezioni, che erano buone. Il blob ha anche `suMisura`
    // con `includiNotePagamento`, cioè il dato che fa arrivare la lettura di
    // `preventivo` al secondo punto (la copia del flag).
    const blob = { preventivo: null, suMisura: suMisuraV3, marmeria: marmeriaV3, ricordaPreventivo: true }

    const out = migrateQuoteState(blob, 3)

    expect(out.sezioni.arredi!.articoli).toEqual([articolo])
    expect(out.sezioni.gres!.sconto).toBe(0.2)
    expect(out.ricordaPreventivo).toBe(true)
    expect('preventivo' in out).toBe(false)
  })
})
