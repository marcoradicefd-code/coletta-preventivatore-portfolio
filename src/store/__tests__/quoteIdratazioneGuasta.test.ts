import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest'

// Boot con un preventivo salvato che non si lascia leggere (O10).
//
// Ogni caso semina `localStorage` PRIMA di importare lo store: l'idratazione di
// `persist` gira dentro `create()`, all'import, ed è l'unico percorso reale del
// boot. `rehydrate()` dopo l'import NON lo esercita (lì `useQuoteStore` esiste
// già, mentre il callback di `onRehydrateStorage` gira con lo store ancora in
// TDZ), quindi qui si usa `vi.resetModules()` e `await import(...)`.
//
// Solo valori sintetici, con un cognome sentinella: se finisse in un log, il
// test lo vede.
vi.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: () => ({}) } },
  LISTINI_BUCKET: 'Listini',
}))

const CHIAVE = 'coletta-quote-v1'
const COPIA = 'coletta-quote-v1-illeggibile'
const SENTINELLA = 'Cognomesentinella'
// Non JSON, e CORTO apposta: il messaggio di `JSON.parse` di V8 cita il testo
// intero solo sotto i 21 caratteri (sopra, ne cita una decina attorno al punto
// dell'errore, e la sentinella intera non c'è). Con un blob lungo o che sbaglia
// più avanti, `not.toContain(SENTINELLA)` sul log resterebbe verde anche se il
// log riportasse `e.message`: il test non presidierebbe il divieto.
const BLOB_NON_JSON = `${SENTINELLA} ??`

const preventivoSintetico = {
  numero: 'T-001',
  data: '2026-01-01',
  validitaGiorni: 30,
  cliente: { nome: 'Nome', cognome: SENTINELLA, indirizzo: '', citta: '', telefono: '', email: '' },
  oggettoPreventivo: '',
  note: '',
  includiCondizioni: true,
}

/** Importa lo store da zero: l'idratazione gira adesso, sul `localStorage` com'è. */
async function avvia() {
  vi.resetModules()
  return await import('@/store/quoteStore')
}

/**
 * Il migrate lancia davvero. Dopo la correzione di `preventivo: null` non c'è
 * più un blob noto che lo faccia lanciare, quindi lo si sostituisce con un mock.
 */
function migrateCheLancia() {
  vi.doMock('@/store/quoteMigrations', () => ({
    migrateQuoteState: () => {
      throw new TypeError('migrate di prova')
    },
  }))
}

/** Tutto ciò che è stato scritto nei log, come testo: per cercarci dentro il blob. */
function logComeTesto(spy: { mock: { calls: unknown[][] } }): string {
  return JSON.stringify(spy.mock.calls)
}

describe('quoteStore — boot con un preventivo salvato illeggibile', () => {
  let errorSpy: MockInstance<typeof console.error>

  beforeEach(() => {
    localStorage.clear()
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
    vi.doUnmock('@/store/quoteMigrations')
    vi.resetModules()
  })

  it('blob non JSON: l\'idratazione finisce e lo store riparte vuoto', async () => {
    localStorage.setItem(CHIAVE, BLOB_NON_JSON)

    const { useQuoteStore, haIdratazioneFallita } = await avvia()

    expect(useQuoteStore.persist.hasHydrated()).toBe(true)
    // Lo prende la rete su `getItem`: non serve arrivare all'ultima.
    expect(haIdratazioneFallita()).toBe(false)
    const stato = useQuoteStore.getState()
    expect(stato.preventivo.cliente.cognome).toBe('')
    expect(stato.ricordaPreventivo).toBe(false)
  })

  it('blob non JSON: la stringa grezza è copiata nella chiave illeggibile e il log non cita il contenuto', async () => {
    const grezzo = BLOB_NON_JSON
    // Precondizione: il messaggio di V8 cita davvero la sentinella. Se un
    // aggiornamento di Node cambiasse il formato, il test si ferma qui invece di
    // diventare cieco sul log.
    expect(() => JSON.parse(grezzo)).toThrow(SENTINELLA)
    localStorage.setItem(CHIAVE, grezzo)

    const { avvisoBlobIlleggibile } = await avvia()

    expect(localStorage.getItem(COPIA)).toBe(grezzo)
    expect(avvisoBlobIlleggibile()).toBe('copiato')
    // Un log solo, col prefisso: senza, in produzione nessuno saprebbe cos'è successo.
    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(logComeTesto(errorSpy)).toContain('[quoteStore]')
    // Il messaggio di JSON.parse cita il testo (vedi la precondizione sopra): nel
    // log va solo il nome dell'errore.
    expect(logComeTesto(errorSpy)).not.toContain(SENTINELLA)
  })

  it('migrate che lancia: l\'idratazione finisce e la copia è scritta prima che il blob venga sovrascritto', async () => {
    migrateCheLancia()
    const grezzo = JSON.stringify({
      state: { ricordaPreventivo: true, preventivo: preventivoSintetico },
      version: 3,
    })
    localStorage.setItem(CHIAVE, grezzo)

    const { useQuoteStore, avvisoBlobIlleggibile } = await avvia()

    expect(useQuoteStore.persist.hasHydrated()).toBe(true)
    expect(useQuoteStore.getState().preventivo.cliente.cognome).toBe('')
    // Il migrate che ritorna fa scattare subito il `setItem`: la chiave
    // principale è già riscritta (v4, solo il toggle). La copia è il blob di prima.
    expect(JSON.parse(localStorage.getItem(CHIAVE)!)).toEqual({ state: { ricordaPreventivo: false }, version: 4 })
    expect(localStorage.getItem(COPIA)).toBe(grezzo)
    expect(avvisoBlobIlleggibile()).toBe('copiato')
    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(logComeTesto(errorSpy)).toContain('migrate di prova')
    expect(logComeTesto(errorSpy)).not.toContain(SENTINELLA)
  })

  it('dopo il reset «Ricorda preventivo» resta spento anche se il blob lo aveva acceso', async () => {
    migrateCheLancia()
    localStorage.setItem(
      CHIAVE,
      JSON.stringify({ state: { ricordaPreventivo: true, preventivo: preventivoSintetico }, version: 3 })
    )

    const { useQuoteStore } = await avvia()

    expect(useQuoteStore.getState().ricordaPreventivo).toBe(false)
  })

  it('S3: blob v4 con sezioni di forma sbagliata («ricorda preventivo»): riparte vuoto, copia da parte, il PDF si monta', async () => {
    const grezzo = JSON.stringify({
      state: { ricordaPreventivo: true, preventivo: preventivoSintetico, sezioni: { arredi: 5, porte: { righe: 7 } } },
      version: 4,
    })
    localStorage.setItem(CHIAVE, grezzo)

    const { useQuoteStore, avvisoBlobIlleggibile } = await avvia()

    expect(useQuoteStore.persist.hasHydrated()).toBe(true)
    const stato = useQuoteStore.getState()
    expect(stato.sezioni.arredi?.articoli).toEqual([])
    expect(stato.preventivo.cliente.cognome).toBe('')
    expect(stato.ricordaPreventivo).toBe(false)
    expect(localStorage.getItem(COPIA)).toBe(grezzo)
    expect(avvisoBlobIlleggibile()).toBe('copiato')
    expect(logComeTesto(errorSpy)).not.toContain(SENTINELLA)
    // Il PDF (sempre montato in AppShell) non lancia: niente «Errore applicazione» a ogni avvio.
    const { render } = await import('@testing-library/react')
    const { createElement } = await import('react')
    const { PreventivoPrint } = await import('@/components/print/PreventivoPrint')
    expect(() => render(createElement(PreventivoPrint))).not.toThrow()
  })

  it('strada A: prezzi congelati di forma sbagliata nel blob: via solo quelli, il resto del preventivo si ripristina', async () => {
    localStorage.setItem(
      CHIAVE,
      JSON.stringify({
        state: {
          ricordaPreventivo: true,
          preventivo: preventivoSintetico,
          archivio: { clienteId: 'c-0001', preventivo: null, prezzi: { vista: 5 } },
        },
        version: 4,
      })
    )
    const { useQuoteStore, avvisoBlobIlleggibile } = await avvia()
    const stato = useQuoteStore.getState()
    expect(stato.preventivo.cliente.cognome).toBe(SENTINELLA)
    expect(stato.archivio.clienteId).toBe('c-0001')
    expect(stato.archivio.prezzi).toBeNull()
    expect(avvisoBlobIlleggibile()).toBeNull()
  })

  it('blob v4 buono: stato ripristinato, nessuna copia, nessun log, blob non riscritto al boot', async () => {
    // Il presidio delle reti: scattano solo su eccezione.
    const grezzo = JSON.stringify({
      state: { ricordaPreventivo: true, preventivo: preventivoSintetico, sezioni: {} },
      version: 4,
    })
    localStorage.setItem(CHIAVE, grezzo)

    const { useQuoteStore, haIdratazioneFallita, avvisoBlobIlleggibile } = await avvia()

    expect(useQuoteStore.persist.hasHydrated()).toBe(true)
    expect(useQuoteStore.getState().preventivo.cliente.cognome).toBe(SENTINELLA)
    expect(useQuoteStore.getState().ricordaPreventivo).toBe(true)
    expect(localStorage.getItem(COPIA)).toBeNull()
    expect(avvisoBlobIlleggibile()).toBeNull()
    expect(haIdratazioneFallita()).toBe(false)
    expect(errorSpy).not.toHaveBeenCalled()
    expect(localStorage.getItem(CHIAVE)).toBe(grezzo)
  })

  it('localStorage inaccessibile in lettura: l\'idratazione finisce e lo store parte vuoto', async () => {
    // Come in un browser che blocca i dati del sito: la lettura lancia
    // SecurityError. La scrittura che lancia è un altro difetto (O33).
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('accesso negato', 'SecurityError')
    })

    const { useQuoteStore, avvisoBlobIlleggibile } = await avvia()

    expect(useQuoteStore.persist.hasHydrated()).toBe(true)
    expect(useQuoteStore.getState().preventivo.cliente.cognome).toBe('')
    // Non si è letto niente, quindi niente da copiare: l'avviso lo dice.
    expect(avvisoBlobIlleggibile()).toBe('non-copiato')
    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(logComeTesto(errorSpy)).toContain('SecurityError')
  })
})
