import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { ArticoloSuMisura } from '@/types/sumisura'

// Chiude il confine #1 del migrate gate: qui NON si testa la funzione pura, ma lo
// STATO FINALE dello store dopo il vero ciclo Zustand persist → migrate → merge →
// set. Lo store importa pricelistStore → supabase: mock minimale per restare
// hermetici (nessun env, nessuna rete), come negli altri test di store.
vi.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: () => ({}) } },
  LISTINI_BUCKET: 'Listini',
}))

import { useQuoteStore, avvisoBlobIlleggibile } from '@/store/quoteStore'
import { FALLBACK_ARREDI, FALLBACK_GRES } from '@/store/quoteFallbacks'

const STORAGE_KEY = 'coletta-quote-v1'

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

// Blob PERSISTITO v3 realistico (con `ricordaPreventivo:true` la partialize v3
// salvava preventivo + suMisura + marmeria). Stessi valori del gate puro, ma qui
// transitano per il vero migrate dentro `persist`.
const blobV3 = {
  ricordaPreventivo: true,
  preventivo: {
    numero: '2026-001',
    data: '2026-06-29',
    validitaGiorni: 30,
    cliente: { nome: 'Mario', cognome: 'Rossi', indirizzo: '', citta: '', telefono: '', email: '' },
    oggettoPreventivo: '',
    note: '',
    includiCondizioni: false, // esplicito: NON deve essere ribaltato dal backfill
  },
  suMisura: {
    articoli: [articolo],
    quotaProgettazione: true,
    noteGenerali: 'note generali',
    includiNotePagamento: false,
    mostraMqInPdf: true,
  },
  marmeria: {
    tipologiaMateriale: 'LAPITEC',
    righeMateriali: [
      { id: 'm1', materialeKey: 'k', spessore: 20, fascia: 'fino62', profonditaCm: 60, qtaMq: 2, prezzoMq: 100, totale: 200 },
    ],
    righeAlzatine: [],
    righeLavorazioniBordo: [],
    righeVarie: [],
    sconto: 0.2,
    includiRilMont: true,
  },
}

// Formato persist di Zustand: localStorage[name] = JSON.stringify({ state, version }).
function seedV3(state: unknown): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ state, version: 3 }))
}

// rehydrate() rilegge lo storage, esegue il migrate (version 3 < 4 corrente) e fa
// il merge nello store. Il thenable si risolve a idratazione completata.
async function rehydrate(): Promise<void> {
  await useQuoteStore.persist.rehydrate()
}

describe('quoteStore — idratazione persist end-to-end (v3 → v4)', () => {
  beforeEach(() => {
    localStorage.clear()
  })
  afterEach(() => {
    localStorage.clear()
  })

  it('reidrata un blob v3 realistico nello STATO dello store con shape per-sezione', async () => {
    seedV3(blobV3)
    await rehydrate()

    const state = useQuoteStore.getState()

    // gres (ex marmeria): sconto e includiRilMont preservati attraverso il persist
    expect(state.sezioni.gres!.sconto).toBe(0.2)
    expect(state.sezioni.gres!.includiRilMont).toBe(true)
    expect(state.sezioni.gres!.tipologiaMateriale).toBe('LAPITEC')
    expect(state.sezioni.gres!.righeMateriali).toHaveLength(1)

    // arredi (ex suMisura): articoli presenti, sconto inizializzato a 0
    expect(state.sezioni.arredi!.articoli).toHaveLength(1)
    expect(state.sezioni.arredi!.articoli[0].id).toBe('a1')
    expect(state.sezioni.arredi!.quotaProgettazione).toBe(true)
    expect(state.sezioni.arredi!.sconto).toBe(0)

    // preventivo: includiCondizioni esplicito (false) NON ribaltato dal backfill
    expect(state.preventivo.includiCondizioni).toBe(false)
    expect(state.preventivo.numero).toBe('2026-001')

    // i vecchi rami top-level NON esistono più nello stato idratato
    const raw = useQuoteStore.getState() as unknown as Record<string, unknown>
    expect(raw.marmeria).toBeUndefined()
    expect(raw.suMisura).toBeUndefined()
  })

  it('ricordaPreventivo:false → sezioni {} dopo idratazione, componenti su FALLBACK_*', async () => {
    // Con flag false la partialize v3 persisteva SOLO il flag.
    seedV3({ ricordaPreventivo: false })
    await rehydrate()

    const state = useQuoteStore.getState()
    expect(state.ricordaPreventivo).toBe(false)
    expect(state.sezioni).toEqual({})

    // I selettori dei componenti cadono sul fallback STABILE module-level
    // (riferimento identico → niente loop di re-render Zustand).
    expect(state.sezioni.gres).toBeUndefined()
    expect(state.sezioni.arredi).toBeUndefined()
    expect(state.sezioni.gres ?? FALLBACK_GRES).toBe(FALLBACK_GRES)
    expect(state.sezioni.arredi ?? FALLBACK_ARREDI).toBe(FALLBACK_ARREDI)
  })
})

// La copia del blob illeggibile (O10) è una copia di dati del cliente: la tolgono
// `resetAll` e `persist.clearStorage()` (quindi il logout). Qui `rehydrate()`
// dopo l'import basta: si prova la pulizia, non il percorso del boot (quello è in
// `quoteIdratazioneGuasta.test.ts`).
describe('quoteStore — pulizia della copia del blob illeggibile', () => {
  const CHIAVE_COPIA = 'coletta-quote-v1-illeggibile'
  const grezzo = '{"cliente":"Cognomesentinella" ??'

  beforeEach(() => {
    localStorage.clear()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
    // Azzera copia e avviso (stato di modulo) per i test che seguono.
    useQuoteStore.getState().resetAll()
    localStorage.clear()
  })

  it('resetAll toglie la copia del blob illeggibile e spegne l\'avviso', async () => {
    localStorage.setItem(STORAGE_KEY, grezzo)
    await rehydrate()
    expect(localStorage.getItem(CHIAVE_COPIA)).toBe(grezzo)
    expect(avvisoBlobIlleggibile()).toBe('copiato')

    useQuoteStore.getState().resetAll()

    expect(localStorage.getItem(CHIAVE_COPIA)).toBeNull()
    expect(avvisoBlobIlleggibile()).toBeNull()
  })

  it('persist.clearStorage toglie la copia insieme al blob', async () => {
    localStorage.setItem(STORAGE_KEY, grezzo)
    await rehydrate()
    expect(localStorage.getItem(CHIAVE_COPIA)).toBe(grezzo)
    expect(localStorage.getItem(STORAGE_KEY)).toBe(grezzo)

    useQuoteStore.persist.clearStorage()

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(localStorage.getItem(CHIAVE_COPIA)).toBeNull()
  })
})
