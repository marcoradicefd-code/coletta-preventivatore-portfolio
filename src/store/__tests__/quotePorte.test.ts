import { describe, it, expect, beforeEach, vi } from 'vitest'

// quoteStore importa pricelistStore → supabase: mock minimale (hermetico).
vi.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: () => ({}) } },
  LISTINI_BUCKET: 'Listini',
}))

import { useQuoteStore } from '@/store/quoteStore'
import { FALLBACK_PORTE } from '@/store/quoteFallbacks'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

describe('quoteStore — Porte (sezioni.porte)', () => {
  beforeEach(() => useQuoteStore.getState().resetAll())

  it('lazy-init: addRigaPorta crea la sezione + una riga con id e optionals vuoti', () => {
    const s = useQuoteStore.getState()
    expect(useQuoteStore.getState().sezioni.porte).toBeUndefined()

    s.addRigaPorta({ modelloNome: 'RAFFAELLA', altezzaCm: 210 })
    const porte = useQuoteStore.getState().sezioni.porte!
    expect(porte.righe).toHaveLength(1)
    expect(porte.sconto).toBe(0)
    const r = porte.righe[0]
    expect(UUID_RE.test(r.id)).toBe(true)
    expect(r.modelloNome).toBe('RAFFAELLA')
    expect(r.altezzaCm).toBe(210)
    expect(r.optionals).toEqual([])
  })

  it('updateRigaPorta modifica modello/altezza; removeRigaPorta elimina', () => {
    const s = useQuoteStore.getState()
    s.addRigaPorta({ modelloNome: 'A', altezzaCm: 200 })
    const id = useQuoteStore.getState().sezioni.porte!.righe[0].id

    s.updateRigaPorta(id, { altezzaCm: 250, modelloNome: 'B' })
    const r = useQuoteStore.getState().sezioni.porte!.righe[0]
    expect(r.altezzaCm).toBe(250)
    expect(r.modelloNome).toBe('B')

    s.removeRigaPorta(id)
    expect(useQuoteStore.getState().sezioni.porte!.righe).toHaveLength(0)
  })

  it('CRUD optional annidati su una riga (add/update/remove, id UUID univoci)', () => {
    const s = useQuoteStore.getState()
    s.addRigaPorta({ modelloNome: 'A', altezzaCm: 200 })
    const rigaId = useQuoteStore.getState().sezioni.porte!.righe[0].id

    s.addOptionalPorta(rigaId, { nome: 'SPECCHIO', unita: 'MQ', quantita: 2, prezzoManuale: null })
    s.addOptionalPorta(rigaId, { nome: 'STIPITI', unita: 'PORTA', quantita: 1, prezzoManuale: null })
    let opts = useQuoteStore.getState().sezioni.porte!.righe[0].optionals
    expect(opts).toHaveLength(2)
    expect(new Set(opts.map((o) => o.id)).size).toBe(2)
    expect(opts.every((o) => UUID_RE.test(o.id))).toBe(true)

    const optId = opts[0].id
    s.updateOptionalPorta(rigaId, optId, { quantita: 5 })
    expect(useQuoteStore.getState().sezioni.porte!.righe[0].optionals[0].quantita).toBe(5)

    s.removeOptionalPorta(rigaId, optId)
    opts = useQuoteStore.getState().sezioni.porte!.righe[0].optionals
    expect(opts).toHaveLength(1)
    expect(opts[0].nome).toBe('STIPITI')
  })

  it('setScontoSezione("porte") lazy-init + clamp [0,1] (NaN → 0)', () => {
    const s = useQuoteStore.getState()
    s.setScontoSezione('porte', 0.1)
    const porte = useQuoteStore.getState().sezioni.porte!
    expect(porte.sconto).toBe(0.1)
    expect(porte.righe).toEqual([])

    s.setScontoSezione('porte', 1.5)
    expect(useQuoteStore.getState().sezioni.porte!.sconto).toBe(1)
    s.setScontoSezione('porte', -0.5)
    expect(useQuoteStore.getState().sezioni.porte!.sconto).toBe(0)
    s.setScontoSezione('porte', NaN)
    expect(useQuoteStore.getState().sezioni.porte!.sconto).toBe(0)
  })

  it('resetPorte riporta la sezione al fallback (righe vuote, sconto 0)', () => {
    const s = useQuoteStore.getState()
    s.addRigaPorta({ modelloNome: 'A', altezzaCm: 200 })
    s.setScontoSezione('porte', 0.3)
    s.resetPorte()
    const porte = useQuoteStore.getState().sezioni.porte!
    expect(porte.righe).toHaveLength(0)
    expect(porte.sconto).toBe(0)
  })

  it('isolamento: operare su porte non tocca arredi/gres/valore e non muta il FALLBACK', () => {
    const s = useQuoteStore.getState()
    s.setScontoSezione('arredi', 0.2)
    s.setScontoSezione('gres', 0.3)
    s.setScontoSezione('progettoValore', 0.4)
    s.addRigaPorta({ modelloNome: 'A', altezzaCm: 200 })
    s.setScontoSezione('porte', 0.5)

    const sez = useQuoteStore.getState().sezioni
    expect(sez.arredi!.sconto).toBe(0.2)
    expect(sez.gres!.sconto).toBe(0.3)
    expect(sez.progettoValore!.sconto).toBe(0.4)
    expect(sez.porte!.sconto).toBe(0.5)

    // Fallback module-level congelato: mai mutato (spread immutabile).
    expect(FALLBACK_PORTE.righe).toEqual([])
    expect(FALLBACK_PORTE.sconto).toBe(0)
  })
})
