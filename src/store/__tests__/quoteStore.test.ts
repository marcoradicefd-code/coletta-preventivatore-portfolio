import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ListinoMarmeria } from '@/types/marmeria'

// quoteStore importa pricelistStore → supabase: mock minimale per restare
// hermetici (nessun env, nessuna rete).
vi.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: () => ({}) } },
  LISTINI_BUCKET: 'Listini',
}))

import { useQuoteStore } from '@/store/quoteStore'
import { usePricelistStore } from '@/store/pricelistStore'
import { validatoPerTest } from '@/test-utils/listinoValidato'
import { listinoCucinaFinto, VASCA_PREZZO_FINTO } from '@/test-utils/catalogoCucinaFinto'

// Listino cucine finto nello store, come dal bucket: il prezzo vero della vasca
// non entra nei test (D7).
beforeEach(() => usePricelistStore.setState({ cucine: validatoPerTest(listinoCucinaFinto) }))


const listino: ListinoMarmeria = {
  materiali: [],
  lavorazioniBordo: [
    { id: 1, descrizione: 'Costa retta', prezzoMlPerTipologia: { QUARZO: 48, LAPITEC: 61, GRES: 61 } },
  ],
  lavorazioniVarie: [
    { descrizione: 'Foro', prezzoPerTipologia: { QUARZO: 120, LAPITEC: 132, GRES: 132 }, unitaMisura: 'PEZZO' },
  ],
  vascheIntegrate: [],
  rilMontScaglioni: [],
  scontiDisponibili: [0],
  aggiornato: '',
}

describe('quoteStore.setTipologiaMateriale', () => {
  beforeEach(() => {
    usePricelistStore.setState({ marmeria: validatoPerTest(listino) })
    useQuoteStore.getState().resetMarmeria()
  })

  it('ri-mappa prezzo e totale di bordo/varie alla nuova tipologia (NEW-001)', () => {
    const store = useQuoteStore.getState()
    // righe inserite con tipologia QUARZO
    store.setTipologiaMateriale('QUARZO')
    store.addRigaLavorazioneBordo({ lavorazioneId: 1, qtaMl: 2, prezzoMl: 48, totale: 96 })
    store.addRigaVaria({ descrizione: 'Foro', um: 'PEZZO', qta: 3, prezzoUnit: 120, totale: 360 })

    // cambio a LAPITEC → 61 e 132
    store.setTipologiaMateriale('LAPITEC')

    const gres = useQuoteStore.getState().sezioni.gres!
    expect(gres.tipologiaMateriale).toBe('LAPITEC')
    expect(gres.righeLavorazioniBordo[0].prezzoMl).toBe(61)
    expect(gres.righeLavorazioniBordo[0].totale).toBe(122) // 2 × 61
    expect(gres.righeVarie[0].prezzoUnit).toBe(132)
    expect(gres.righeVarie[0].totale).toBe(396) // 3 × 132
  })

  it('senza listino aggiorna solo la tipologia, righe invariate', () => {
    usePricelistStore.setState({ marmeria: null })
    const store = useQuoteStore.getState()
    store.addRigaLavorazioneBordo({ lavorazioneId: 1, qtaMl: 2, prezzoMl: 48, totale: 96 })

    const tolte = store.setTipologiaMateriale('GRES')

    const gres = useQuoteStore.getState().sezioni.gres!
    expect(gres.tipologiaMateriale).toBe('GRES')
    expect(gres.righeLavorazioniBordo[0].prezzoMl).toBe(48) // invariata: nessun listino
    expect(tolte).toEqual([]) // senza listino non si sa cosa sia disponibile: niente si toglie
  })

  it('toglie bordo e varie non disponibili per la nuova tipologia e le restituisce (A2, opzione b)', () => {
    usePricelistStore.setState({
      marmeria: validatoPerTest({
        ...listino,
        lavorazioniBordo: [
          ...listino.lavorazioniBordo,
          { id: 2, descrizione: 'Toro', prezzoMlPerTipologia: { QUARZO: 50, LAPITEC: 60, GRES: null } },
        ],
      }),
    })
    const store = useQuoteStore.getState()
    store.setTipologiaMateriale('LAPITEC')
    store.addRigaLavorazioneBordo({ lavorazioneId: 1, qtaMl: 2, prezzoMl: 61, totale: 122 })
    store.addRigaLavorazioneBordo({ lavorazioneId: 2, qtaMl: 3, prezzoMl: 60, totale: 180 })
    store.addRigaVaria({ descrizione: 'Foro', um: 'PEZZO', qta: 1, prezzoUnit: 132, totale: 132 })
    store.addRigaVaria({ descrizione: 'Foro rinominato', um: 'PEZZO', qta: 2, prezzoUnit: 10, totale: 20 })

    const tolte = store.setTipologiaMateriale('GRES')

    expect(tolte).toEqual([
      { descrizione: 'Toro', quantita: 3, unita: 'ml' },
      { descrizione: 'Foro rinominato', quantita: 2, unita: 'pz' },
    ])
    const gres = useQuoteStore.getState().sezioni.gres!
    expect(gres.righeLavorazioniBordo.map((r) => r.lavorazioneId)).toEqual([1])
    expect(gres.righeVarie.map((r) => r.descrizione)).toEqual(['Foro'])
    expect(gres.righeLavorazioniBordo[0].prezzoMl).toBe(61) // la riga rimasta è ri-prezzata (NEW-001)
  })
})

const baseArticolo = {
  origine: 'manuale' as const,
  descrizione: 'X',
  prezzoUnitario: 100,
  um: 'PZ' as const,
  larghezzaCm: null,
  altezzaCm: null,
  lunghezzaMl: null,
  quantita: 1,
  profonditaOltre65: false,
  finituraInterna: '',
  finituraEsterna: '',
  codiceFinitura: '',
  note: '',
}

describe('quoteStore.setSconto', () => {
  beforeEach(() => useQuoteStore.getState().resetMarmeria())

  it('clampa lo sconto nell\'intervallo [0,1] e gestisce NaN', () => {
    const s = useQuoteStore.getState()
    s.setSconto(1.5)
    expect(useQuoteStore.getState().sezioni.gres!.sconto).toBe(1)
    s.setSconto(-0.5)
    expect(useQuoteStore.getState().sezioni.gres!.sconto).toBe(0)
    s.setSconto(0.2)
    expect(useQuoteStore.getState().sezioni.gres!.sconto).toBe(0.2)
    s.setSconto(NaN)
    expect(useQuoteStore.getState().sezioni.gres!.sconto).toBe(0)
  })
})

describe('quoteStore.setScontoSezione (sconto per-sezione, Fase 2)', () => {
  beforeEach(() => useQuoteStore.getState().resetAll())

  it('imposta e clampa lo sconto di arredi e gres in modo indipendente', () => {
    const s = useQuoteStore.getState()
    s.setScontoSezione('arredi', 0.3)
    s.setScontoSezione('gres', 1.5) // clampato a 1
    const sez = useQuoteStore.getState().sezioni
    expect(sez.arredi!.sconto).toBe(0.3)
    expect(sez.gres!.sconto).toBe(1)
    // i due sconti sono separati: arredi resta 0.3
    s.setScontoSezione('gres', 0.1)
    expect(useQuoteStore.getState().sezioni.arredi!.sconto).toBe(0.3)
    expect(useQuoteStore.getState().sezioni.gres!.sconto).toBe(0.1)
  })
})

describe('quoteStore — articoli Su Misura (sezioni.arredi)', () => {
  beforeEach(() => useQuoteStore.getState().resetSuMisura())

  it('add assegna un id, update applica la patch, remove elimina', () => {
    const s = useQuoteStore.getState()
    s.addArticoloSuMisura(baseArticolo)
    const arts = useQuoteStore.getState().sezioni.arredi!.articoli
    expect(arts).toHaveLength(1)
    const id = arts[0].id
    expect(id).toBeTruthy()

    s.updateArticoloSuMisura(id, { descrizione: 'Modificato' })
    expect(useQuoteStore.getState().sezioni.arredi!.articoli[0].descrizione).toBe('Modificato')

    s.removeArticoloSuMisura(id)
    expect(useQuoteStore.getState().sezioni.arredi!.articoli).toHaveLength(0)
  })
})

describe('quoteStore — reset', () => {
  it('resetAll azzera preventivo, arredi e gres', () => {
    const s = useQuoteStore.getState()
    s.setCliente({ nome: 'Mario' })
    s.addArticoloSuMisura(baseArticolo)
    s.addRigaMateriale({ materialeKey: 'k', spessore: 13, fascia: 'fino62', profonditaCm: 60, qtaMq: 1, prezzoMq: 100, totale: 100 })

    s.resetAll()

    const st = useQuoteStore.getState()
    expect(st.preventivo.cliente.nome).toBe('')
    expect(st.sezioni.arredi!.articoli).toHaveLength(0)
    expect(st.sezioni.gres!.righeMateriali).toHaveLength(0)
  })
})

describe('quoteStore — ID riga univoci (NEW-002)', () => {
  beforeEach(() => useQuoteStore.getState().resetAll())

  it('genera ID univoci in formato UUID, senza collisioni su molti add', () => {
    const s = useQuoteStore.getState()
    const N = 50
    for (let i = 0; i < N; i++) {
      s.addArticoloSuMisura(baseArticolo)
      s.addRigaMateriale({ materialeKey: 'k', spessore: 13, fascia: 'fino62', profonditaCm: 60, qtaMq: 1, prezzoMq: 100, totale: 100 })
      s.addRigaAlzatina({ materialeKey: 'k', qtaMl: 1, prezzoMl: 80, totale: 80 })
    }
    const m = useQuoteStore.getState()
    const ids = [
      ...m.sezioni.arredi!.articoli.map((a) => a.id),
      ...m.sezioni.gres!.righeMateriali.map((r) => r.id),
      ...m.sezioni.gres!.righeAlzatine.map((r) => r.id),
    ]
    expect(ids).toHaveLength(N * 3)
    // nessuna collisione: tutti distinti
    expect(new Set(ids).size).toBe(N * 3)
    // formato UUID (niente più counter `r\d+_…` azzerabile al reload)
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    expect(ids.every((id) => UUID_RE.test(id))).toBe(true)
  })
})

describe('quoteStore.setVasca (vasca gres)', () => {
  beforeEach(() => useQuoteStore.getState().resetMarmeria())

  const vasca = () => useQuoteStore.getState().sezioni.gres!.vasca

  it('preventivo fresco: nessuna vasca (chiave assente, non "inclusa: false")', () => {
    expect(vasca()).toBeUndefined()
  })

  it('prima inclusione: snapshotta il prezzo di default nella voce', () => {
    useQuoteStore.getState().setVasca({ inclusa: true })
    expect(vasca()).toEqual({ inclusa: true, prezzo: VASCA_PREZZO_FINTO })
  })

  it('il prezzo editato è per-preventivo e sopravvive al toggle (snapshot, non default vivo)', () => {
    const s = useQuoteStore.getState()
    s.setVasca({ inclusa: true })
    s.setVasca({ prezzo: 1200 })
    expect(vasca()).toEqual({ inclusa: true, prezzo: 1200 })

    // Escludere e re-includere NON deve rimettere il default: il preventivo
    // conserva il prezzo con cui è stato quotato.
    s.setVasca({ inclusa: false })
    expect(vasca()).toEqual({ inclusa: false, prezzo: 1200 })
    s.setVasca({ inclusa: true })
    expect(vasca()).toEqual({ inclusa: true, prezzo: 1200 })
  })

  it('senza listino cucine la prima inclusione non avviene (opzione A, D7)', () => {
    usePricelistStore.setState({ cucine: null })
    useQuoteStore.getState().setVasca({ inclusa: true })
    expect(vasca()).toBeUndefined()
    // Col prezzo passato dal chiamante sì: non c'è niente da prendere dal listino.
    useQuoteStore.getState().setVasca({ inclusa: true, prezzo: 1200 })
    expect(vasca()).toEqual({ inclusa: true, prezzo: 1200 })
  })

  it('una vasca già inclusa resta col suo prezzo, col listino assente o cambiato', () => {
    useQuoteStore.getState().setVasca({ inclusa: true })
    usePricelistStore.setState({ cucine: null })
    useQuoteStore.getState().setVasca({ inclusa: false })
    useQuoteStore.getState().setVasca({ inclusa: true })
    expect(vasca()).toEqual({ inclusa: true, prezzo: VASCA_PREZZO_FINTO })
    usePricelistStore.setState({ cucine: validatoPerTest({ ...listinoCucinaFinto, vascaGres: 999 }) })
    useQuoteStore.getState().setVasca({ inclusa: true })
    expect(vasca()).toEqual({ inclusa: true, prezzo: VASCA_PREZZO_FINTO })
  })

  it('resetMarmeria azzera la vasca (FALLBACK_GRES non ha la chiave)', () => {
    useQuoteStore.getState().setVasca({ inclusa: true, prezzo: 1200 })
    useQuoteStore.getState().resetMarmeria()
    expect(vasca()).toBeUndefined()
  })
})
