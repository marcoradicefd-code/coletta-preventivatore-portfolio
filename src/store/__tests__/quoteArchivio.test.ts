import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: () => ({}) } },
  LISTINI_BUCKET: 'Listini',
}))

import { useQuoteStore, ARCHIVIO_VUOTO, initialPreventivo } from '@/store/quoteStore'
import { quoteHaDati } from '@/components/layout/sections'
import { dataOggiItalia } from '@/utils/format'
import type { PreventivoSalvato } from '@/types/archivio'

const SALVATO: PreventivoSalvato = { id: 'p-1', anno: 2026, numero: 1, revisione: 0, stato: 'bozza', updatedAt: '2026-10-13T10:00:00+00:00' }
const blob = () => JSON.parse(localStorage.getItem('coletta-quote-v1') ?? 'null')

beforeEach(() => {
  localStorage.clear()
  useQuoteStore.getState().setRicordaPreventivo(false)
  useQuoteStore.getState().resetAll()
})

describe('quoteStore — il legame col database (L21)', () => {
  it('collegaCliente e impostaSalvato scrivono il legame; resetAll (logout) lo toglie', () => {
    const s = useQuoteStore.getState()
    s.collegaCliente('c-0001', { ...initialPreventivo.cliente, nome: 'Cliente Prova Srl' })
    s.impostaSalvato(SALVATO)
    expect(useQuoteStore.getState().archivio).toEqual({ clienteId: 'c-0001', preventivo: SALVATO })
    expect(useQuoteStore.getState().preventivo.cliente.nome).toBe('Cliente Prova Srl')
    useQuoteStore.getState().resetAll()
    expect(useQuoteStore.getState().archivio).toEqual(ARCHIVIO_VUOTO)
  })

  it('il legame si persiste solo con «ricorda preventivo», come i dati del cliente', () => {
    useQuoteStore.getState().collegaCliente('c-0001')
    expect(blob()?.state.archivio).toBeUndefined()
    useQuoteStore.getState().setRicordaPreventivo(true)
    useQuoteStore.getState().impostaSalvato(SALVATO)
    expect(blob()?.state.archivio).toEqual({ clienteId: 'c-0001', preventivo: SALVATO })
  })

  it('il numero riservato per il primo salvataggio resta col legame finché la riga non è salvata (L21-B)', () => {
    const s = useQuoteStore.getState()
    s.setRicordaPreventivo(true)
    s.collegaCliente('c-0001')
    s.riservaNumero({ id: 'p-1', anno: 2026, numero: 1 })
    expect(blob()?.state.archivio).toEqual({ clienteId: 'c-0001', preventivo: null, riservato: { id: 'p-1', anno: 2026, numero: 1 } })
    useQuoteStore.getState().impostaSalvato(SALVATO)
    expect(useQuoteStore.getState().archivio).toEqual({ clienteId: 'c-0001', preventivo: SALVATO })
    // L'id di una revisione dello stesso numero non ancora arrivata resta anche
    // dopo un «Salva» della revisione aperta, e se ne va quando la riga c'è
    // (revisione del 14/10, plausibile b).
    useQuoteStore.getState().riservaNumero({ id: 'p-2', anno: 2026, numero: 1 })
    useQuoteStore.getState().impostaSalvato({ ...SALVATO, updatedAt: 'dopo' })
    expect(useQuoteStore.getState().archivio.riservato).toEqual({ id: 'p-2', anno: 2026, numero: 1 })
    useQuoteStore.getState().impostaSalvato({ ...SALVATO, id: 'p-2', revisione: 1 })
    expect(useQuoteStore.getState().archivio).toEqual({ clienteId: 'c-0001', preventivo: { ...SALVATO, id: 'p-2', revisione: 1 } })
  })

  it('nuovoPreventivo azzera documento, sezioni e legame, e lascia «ricorda preventivo» com\'era', () => {
    const s = useQuoteStore.getState()
    s.setRicordaPreventivo(true)
    s.setPreventivo({ oggettoPreventivo: 'Prova' })
    s.impostaSalvato(SALVATO)
    useQuoteStore.getState().nuovoPreventivo()
    const dopo = useQuoteStore.getState()
    expect(dopo.archivio).toEqual(ARCHIVIO_VUOTO)
    // Un documento nuovo: quello di default con la data di oggi (C3).
    expect(dopo.preventivo).toEqual({ ...initialPreventivo, data: dataOggiItalia() })
    expect(dopo.ricordaPreventivo).toBe(true)
  })
})

// C3 (revisione L15-L21): la data di un preventivo nuovo è quella del giorno in
// cui lo si crea, in ora italiana; non quella del caricamento della pagina, in UTC.
describe('data di un preventivo nuovo (C3)', () => {
  afterEach(() => vi.useRealTimers())

  it('app aperta il 12/10 e «Nuovo preventivo» il 15/10: la data è il 15/10', () => {
    vi.useFakeTimers({ now: new Date('2026-10-12T08:00:00Z'), toFake: ['Date'] })
    useQuoteStore.getState().nuovoPreventivo()
    vi.setSystemTime(new Date('2026-10-15T08:00:00Z'))
    useQuoteStore.getState().nuovoPreventivo()
    expect(useQuoteStore.getState().preventivo.data).toBe('2026-10-15')
    useQuoteStore.getState().resetAll()
    expect(useQuoteStore.getState().preventivo.data).toBe('2026-10-15')
  })

  it('alle 00:30 del 13/10 in Italia (22:30 del 12/10 in UTC) la data è il 13/10', () => {
    vi.useFakeTimers({ now: new Date('2026-10-12T22:30:00Z'), toFake: ['Date'] })
    useQuoteStore.getState().nuovoPreventivo()
    expect(useQuoteStore.getState().preventivo.data).toBe('2026-10-13')
    // Una data di default non è lavoro da non perdere (avviso di uscita).
    expect(quoteHaDati(useQuoteStore.getState().preventivo, useQuoteStore.getState().sezioni)).toBe(false)
  })
})
