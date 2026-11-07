import { describe, it, expect, beforeEach, vi } from 'vitest'

// quoteStore importa pricelistStore → supabase: mock minimale per restare
// hermetici (nessun env, nessuna rete), come in quoteStore.test.ts.
vi.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: () => ({}) } },
  LISTINI_BUCKET: 'Listini',
}))

import { useQuoteStore } from '@/store/quoteStore'
import { FALLBACK_PROGETTO_VALORE } from '@/store/quoteFallbacks'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

describe('quoteStore — Progetto a valore (sezioni.progettoValore)', () => {
  // resetAll → INITIAL_SEZIONI (arredi+gres, progettoValore NON presente):
  // la sezione parte undefined e si lazy-inizializza al primo uso.
  beforeEach(() => useQuoteStore.getState().resetAll())

  it('lazy-init dal fallback: add crea la sezione + assegna id, update applica la patch, remove elimina', () => {
    const s = useQuoteStore.getState()
    expect(useQuoteStore.getState().sezioni.progettoValore).toBeUndefined()

    s.addRigaProgettoValore({ descrizione: 'Cucina a corpo', prezzo: 5000 })
    const pv = useQuoteStore.getState().sezioni.progettoValore!
    expect(pv.righe).toHaveLength(1)
    expect(pv.sconto).toBe(0)
    const id = pv.righe[0].id
    expect(id).toBeTruthy()
    expect(pv.righe[0].descrizione).toBe('Cucina a corpo')
    expect(pv.righe[0].prezzo).toBe(5000)

    s.updateRigaProgettoValore(id, { prezzo: 5500, descrizione: 'Cucina a corpo (rev.)' })
    const upd = useQuoteStore.getState().sezioni.progettoValore!.righe[0]
    expect(upd.prezzo).toBe(5500)
    expect(upd.descrizione).toBe('Cucina a corpo (rev.)')

    s.removeRigaProgettoValore(id)
    expect(useQuoteStore.getState().sezioni.progettoValore!.righe).toHaveLength(0)
  })

  it('genera ID UUID univoci senza collisioni su molti add', () => {
    const s = useQuoteStore.getState()
    const N = 50
    for (let i = 0; i < N; i++) s.addRigaProgettoValore({ descrizione: `v${i}`, prezzo: i })
    const ids = useQuoteStore.getState().sezioni.progettoValore!.righe.map((r) => r.id)
    expect(ids).toHaveLength(N)
    expect(new Set(ids).size).toBe(N) // nessuna collisione
    expect(ids.every((id) => UUID_RE.test(id))).toBe(true)
  })

  it('setScontoSezione("progettoValore") lazy-inizializza e clampa [0,1] (NaN → 0)', () => {
    const s = useQuoteStore.getState()
    // su sezione mai toccata: crea dal fallback, righe vuote
    s.setScontoSezione('progettoValore', 0.1)
    const pv = useQuoteStore.getState().sezioni.progettoValore!
    expect(pv.sconto).toBe(0.1)
    expect(pv.righe).toEqual([])

    s.setScontoSezione('progettoValore', 1.5)
    expect(useQuoteStore.getState().sezioni.progettoValore!.sconto).toBe(1)
    s.setScontoSezione('progettoValore', -0.5)
    expect(useQuoteStore.getState().sezioni.progettoValore!.sconto).toBe(0)
    s.setScontoSezione('progettoValore', NaN)
    expect(useQuoteStore.getState().sezioni.progettoValore!.sconto).toBe(0)
  })

  it('isolamento: operare su progettoValore non tocca arredi/gres e non muta il FALLBACK congelato', () => {
    const s = useQuoteStore.getState()
    s.setScontoSezione('arredi', 0.3)
    s.setScontoSezione('gres', 0.4)
    s.addRigaProgettoValore({ descrizione: 'A', prezzo: 100 })
    s.setScontoSezione('progettoValore', 0.5)

    const sez = useQuoteStore.getState().sezioni
    expect(sez.arredi!.sconto).toBe(0.3)
    expect(sez.gres!.sconto).toBe(0.4)
    expect(sez.progettoValore!.sconto).toBe(0.5)
    expect(sez.progettoValore!.righe).toHaveLength(1)

    // Il fallback module-level congelato non è stato mutato (spread immutabile).
    expect(FALLBACK_PROGETTO_VALORE.righe).toEqual([])
    expect(FALLBACK_PROGETTO_VALORE.sconto).toBe(0)
  })
})
