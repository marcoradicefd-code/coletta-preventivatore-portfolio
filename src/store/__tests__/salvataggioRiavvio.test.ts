import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Revisione di Marco sulla #98 (decisione da rivedere n. 5): un preventivo
// inviato, riaperto dopo un riavvio con «ricorda preventivo», non deve
// risultare «modificato» se i dati non sono cambiati. Prima la fotografia del
// salvataggio era solo in memoria (confronto per identità), e dopo il riavvio
// mancava. Il riavvio si simula davvero: blob in localStorage, `vi.resetModules()`
// e stores importati da capo, che si reidratano dal blob. Solo dati finti.
vi.mock('@/lib/supabase', async () => ({
  supabase: (await import('@/test-utils/supabaseFinto')).supabaseFinto.client,
  LISTINI_BUCKET: 'Listini',
}))

async function avvia() {
  const { supabaseFinto, numeroDalServer } = await import('@/test-utils/supabaseFinto')
  const quote = await import('@/store/quoteStore')
  const salvataggio = await import('@/store/salvataggioStore')
  const { FALLBACK_PROGETTO_VALORE } = await import('@/store/quoteFallbacks')
  return { supabaseFinto, numeroDalServer, ...quote, ...salvataggio, FALLBACK_PROGETTO_VALORE }
}

const riga = (over: Record<string, unknown> = {}) => ({ id: 'p-1', anno: 2026, numero: 3, revisione: 0, stato: 'bozza', updated_at: 'u1', ...over })

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
})
afterEach(() => {
  localStorage.clear()
  vi.resetModules()
})

describe('dopo un riavvio, un preventivo salvato e non toccato non è «modificato»', () => {
  it('salva, mettilo in inviato, riavvia con «ricorda preventivo»: stato «salvato», nessuna modifica', async () => {
    const a = await avvia()
    a.useQuoteStore.getState().setRicordaPreventivo(true)
    a.useQuoteStore.getState().collegaCliente('c-0001', { ...a.initialPreventivo.cliente, nome: 'Cliente', cognome: 'Prova' })
    a.useQuoteStore.setState((st) => ({
      sezioni: { ...st.sezioni, progettoValore: { ...a.FALLBACK_PROGETTO_VALORE, righe: [{ id: 'v1', descrizione: 'Voce di prova', prezzo: 250 }] } },
    }))
    a.supabaseFinto.risposte.push(a.numeroDalServer(3), { data: riga(), error: null })
    expect((await a.salvaAperto()).ok).toBe(true)
    a.supabaseFinto.risposte.push({ data: riga({ stato: 'inviato', updated_at: 'u2' }), error: null })
    expect((await a.salvaAperto('inviato')).ok).toBe(true)
    expect(a.haModificheNonSalvate()).toBe(false)

    // Il riavvio: il blob resta, i moduli ripartono da capo e si reidratano.
    vi.resetModules()
    const b = await avvia()
    expect(b.useQuoteStore.getState().archivio.preventivo?.stato).toBe('inviato')
    expect(b.useSalvataggio.getState().ultimo).toBeNull()
    expect(b.haModificheNonSalvate()).toBe(false)
    const { renderHook } = await import('@testing-library/react')
    const { result } = renderHook(() => b.useStatoSalvataggio())
    expect(result.current).toBe('salvato')

    // Una modifica vera dopo il riavvio resta una modifica.
    b.useQuoteStore.getState().setPreventivo({ oggettoPreventivo: 'Modifica dopo il riavvio' })
    expect(b.haModificheNonSalvate()).toBe(true)
  })
})
