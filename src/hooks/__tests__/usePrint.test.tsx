import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, cleanup, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { UseReactToPrintOptions } from 'react-to-print'

// `react-to-print` si mocka: in jsdom non c'è un dialogo di stampa. Qui si prova
// il collegamento (quando `usePrint` stampa, quando no e cosa passa alla
// libreria), non la stampa né un guasto vero del browser. La funzione di
// stampa restituita in un render porta le opzioni di QUEL render, come
// l'`useCallback` della libreria (3.3.0): è la trappola del titolo (L23).
const { stampaMock, opzioni } = vi.hoisted(() => ({
  stampaMock: vi.fn<(o: UseReactToPrintOptions) => void>(),
  opzioni: { correnti: undefined as UseReactToPrintOptions | undefined },
}))
vi.mock('react-to-print', () => ({
  useReactToPrint: (o: UseReactToPrintOptions) => {
    opzioni.correnti = o
    return () => stampaMock(o)
  },
}))
vi.mock('@/lib/supabase', async () => ({
  supabase: (await import('@/test-utils/supabaseFinto')).supabaseFinto.client,
  LISTINI_BUCKET: 'Listini',
}))

import { usePrint, MSG_PREVENTIVO_VUOTO } from '@/hooks/usePrint'
import { ToastProvider } from '@/components/shared/Toast'
import { useQuoteStore, initialPreventivo } from '@/store/quoteStore'
import { usePricelistStore } from '@/store/pricelistStore'
import { dimenticaSalvataggio, prezziAdesso, segnaAllineato, useSalvataggio } from '@/store/salvataggioStore'
import { useAuthStore } from '@/store/authStore'
import { listinoCucinaFinto } from '@/test-utils/catalogoCucinaFinto'
import { validatoPerTest } from '@/test-utils/listinoValidato'
import { FALLBACK_PROGETTO_VALORE } from '@/store/quoteFallbacks'
import { supabaseFinto, numeroDalServer, clienteFinto, DATI_FINTI, RAGIONE_SOCIALE_FINTA } from '@/test-utils/supabaseFinto'
import { clienteDaArchivio } from '@/lib/clientiDb'
import { spiaConsole } from '@/test-utils/spiaConsole'
import type { PreventivoSalvato } from '@/types/archivio'
import type { Domanda } from '@/components/shared/Conferma'

const ANNO = new Date().getFullYear()
const SALVATO: PreventivoSalvato = { id: 'p-1', anno: ANNO, numero: 3, revisione: 0, stato: 'bozza', updatedAt: 'x' }
const riga = (over: Record<string, unknown> = {}) => ({ id: 'p-1', anno: ANNO, numero: 3, revisione: 0, stato: 'bozza', updated_at: 'y', ...over })

function wrapper({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>
}

/**
 * Nell'app il documento è sempre montato fuori schermo e `contentRef` punta a
 * lui; nel hook isolato il ref è vuoto, quindi lo si riempie come farebbe React.
 */
function monta({ risposta = null as string | null, sceltaOk = false } = {}) {
  const chiedi = vi.fn<(d: Domanda) => Promise<string | null>>(async () => risposta)
  const scegliCliente = vi.fn(async () => {
    if (sceltaOk) useQuoteStore.getState().collegaCliente('c-0002', { ...initialPreventivo.cliente, nome: 'Cliente', cognome: 'Nuovo' })
    return sceltaOk
  })
  const vista = renderHook(() => usePrint({ chiedi, scegliCliente }), { wrapper })
  vista.result.current.contentRef.current = document.createElement('div')
  return { ...vista, chiedi, scegliCliente }
}

/** Una riga a valore (il preventivo non è vuoto) e, se serve, il cliente. */
function preventivo({ cliente = true } = {}) {
  if (cliente) useQuoteStore.getState().collegaCliente('c-0001', { ...initialPreventivo.cliente, nome: 'Mario', cognome: 'Prova' })
  useQuoteStore.setState((st) => ({
    sezioni: { ...st.sezioni, progettoValore: { ...FALLBACK_PROGETTO_VALORE, righe: [{ id: 'v1', descrizione: 'Voce di prova', prezzo: 250 }] } },
  }))
}

/** Salvato e allineato: coi prezzi congelati del salvataggio (strada A), come dopo un «Salva». */
function salvatoAllineato(s: PreventivoSalvato = SALVATO) {
  useQuoteStore.getState().impostaSalvato(s, prezziAdesso(useQuoteStore.getState().sezioni))
  segnaAllineato()
}

/**
 * La fine del gesto di «Genera», non un tempo fisso: il gesto passa da
 * `inEsclusiva`, che rimette `occupato` a false nel `finally`, cioè dopo la
 * stampa. Un'attesa di 5 ms reali, col Mac carico, finiva prima del
 * `setTimeout` 0 di `stampa` (L28): la stampa non c'era ancora, e il gesto
 * rimasto aperto stampava e teneva `occupato` nel test dopo.
 */
function fineGesto(): Promise<void> {
  return new Promise((fine) => {
    if (!useSalvataggio.getState().occupato) return fine()
    const smetti = useSalvataggio.subscribe((s) => {
      if (s.occupato) return
      smetti()
      fine()
    })
  })
}

async function genera(handlePrint: () => void) {
  await act(async () => {
    handlePrint()
    await fineGesto()
  })
}

const scritture = () => supabaseFinto.chiamate.filter((c) => c.rpc || c.passi.some(([p]) => p === 'insert' || p === 'update'))

beforeEach(() => {
  stampaMock.mockReset()
  supabaseFinto.reset()
  useQuoteStore.getState().nuovoPreventivo()
  dimenticaSalvataggio()
  useSalvataggio.setState({ inCorso: false, occupato: false })
  usePricelistStore.setState({ marmeria: null, cucine: null })
})
afterEach(() => cleanup())

describe('usePrint — «Genera» salva sempre prima di stampare (L21-B, § 3.2)', () => {
  it('cliente collegato e nessuna modifica: stampa subito, senza scrivere niente', async () => {
    preventivo()
    salvatoAllineato()
    const { result, chiedi, scegliCliente } = monta()
    await genera(result.current.handlePrint)
    expect(stampaMock).toHaveBeenCalledTimes(1)
    expect(scritture()).toEqual([])
    expect(chiedi).not.toHaveBeenCalled()
    expect(scegliCliente).not.toHaveBeenCalled()
  })

  it('mai salvato: salva (numero dal database), dice «Salvato come N. …», e il PDF esce col numero', async () => {
    preventivo()
    let numeroAllaStampa: number | undefined
    stampaMock.mockImplementation(() => (numeroAllaStampa = useQuoteStore.getState().archivio.preventivo?.numero))
    supabaseFinto.risposte.push(numeroDalServer(3), { data: riga(), error: null })
    const { result } = monta()
    await genera(result.current.handlePrint)
    expect(stampaMock).toHaveBeenCalledTimes(1)
    expect(numeroAllaStampa).toBe(3)
    expect(screen.getByText(`Salvato come N. ${ANNO}-003`)).toBeTruthy()
  })

  it('modifiche non salvate: aggiorna con il lock, poi stampa', async () => {
    preventivo()
    salvatoAllineato()
    useQuoteStore.getState().setPreventivo({ oggettoPreventivo: 'Modifica' })
    supabaseFinto.risposte.push({ data: riga({ updated_at: 'z' }), error: null })
    const { result } = monta()
    await genera(result.current.handlePrint)
    expect(stampaMock).toHaveBeenCalledTimes(1)
    const update = scritture()
    expect(update).toHaveLength(1)
    expect(update[0].passi.filter(([p]) => p === 'eq').map(([, a]) => a)).toEqual([['id', 'p-1'], ['updated_at', 'x']])
  })

  it('nessun cliente: apre «Scegli il cliente per generare»; chiusa, niente; scelto, salva e stampa nello stesso gesto', async () => {
    preventivo({ cliente: false })
    const chiusa = monta({ sceltaOk: false })
    await genera(chiusa.result.current.handlePrint)
    expect(chiusa.scegliCliente).toHaveBeenCalledWith('generare')
    expect(stampaMock).not.toHaveBeenCalled()
    expect(scritture()).toEqual([])
    cleanup()

    supabaseFinto.risposte.push(numeroDalServer(4), { data: riga({ numero: 4 }), error: null })
    const scelto = monta({ sceltaOk: true })
    await genera(scelto.result.current.handlePrint)
    expect(stampaMock).toHaveBeenCalledTimes(1)
    const insert = scritture().find((c) => c.passi.some(([p]) => p === 'insert'))
    expect(insert?.passi.find(([p]) => p === 'insert')?.[1][0]).toMatchObject({ cliente_id: 'c-0002', numero: 4 })
  })

  it('annullato: la finestra coi due verbi; «Stampa con la dicitura ANNULLATO» stampa senza scrivere, Esc non fa niente', async () => {
    preventivo()
    salvatoAllineato({ ...SALVATO, stato: 'annullato' })
    const stampa = monta({ risposta: 'stampa' })
    await genera(stampa.result.current.handlePrint)
    const domanda = stampa.chiedi.mock.calls[0][0]
    expect(domanda.titolo).toBe('Questo preventivo è annullato')
    expect(domanda.azioni.map((a) => [a.etichetta, a.tipo])).toEqual([
      ['Stampa con la dicitura ANNULLATO', 'secondario'],
      ['Fai una nuova revisione', 'primario'],
    ])
    expect(stampaMock).toHaveBeenCalledTimes(1)
    expect(scritture()).toEqual([])
    cleanup()

    const esc = monta({ risposta: null })
    await genera(esc.result.current.handlePrint)
    expect(stampaMock).toHaveBeenCalledTimes(1)
    expect(scritture()).toEqual([])
  })

  it('annullato, «Fai una nuova revisione»: la salva in bozza e la stampa', async () => {
    preventivo()
    salvatoAllineato({ ...SALVATO, stato: 'annullato' })
    supabaseFinto.risposte.push({ data: { revisione: 0 }, error: null }, { data: riga({ id: 'p-2', revisione: 1 }), error: null })
    const { result } = monta({ risposta: 'revisione' })
    await genera(result.current.handlePrint)
    expect(stampaMock).toHaveBeenCalledTimes(1)
    expect(useQuoteStore.getState().archivio.preventivo).toMatchObject({ id: 'p-2', revisione: 1, stato: 'bozza' })
    expect(screen.getByText(`Salvato come N. ${ANNO}-003 rev. 1`)).toBeTruthy()
  })

  it('conflitto o rete al salvataggio: non stampa, e l\'errore resta per la barra (con «Riprova»)', async () => {
    preventivo()
    salvatoAllineato()
    useQuoteStore.getState().setPreventivo({ oggettoPreventivo: 'Modifica' })
    supabaseFinto.risposte.push({ data: null, error: null }, new TypeError('Failed to fetch'))
    const { result } = monta()
    await genera(result.current.handlePrint)
    expect(useSalvataggio.getState().errore).toMatchObject({ conflitto: true })
    await genera(result.current.handlePrint)
    expect(useSalvataggio.getState().errore).toMatchObject({ rete: true })
    expect(stampaMock).not.toHaveBeenCalled()
  })

  it('listino gres che manca, o preventivo vuoto: non stampa e dice perché, senza scrivere', async () => {
    const vuoto = monta()
    await genera(vuoto.result.current.handlePrint)
    expect(screen.getByRole('alert').textContent).toContain(MSG_PREVENTIVO_VUOTO)
    cleanup()

    preventivo()
    useQuoteStore.getState().addRigaMateriale({ materialeKey: 'k', spessore: 13, fascia: 'fino62', profonditaCm: 60, qtaMq: 1, prezzoMq: 100, totale: 100 })
    const gres = monta()
    await genera(gres.result.current.handlePrint)
    expect(screen.getByRole('alert').textContent).toContain('Listino Gres non caricato')
    expect(stampaMock).not.toHaveBeenCalled()
    expect(scritture()).toEqual([])
  })
})

describe('usePrint — revisione funzionale del 14/10 sulla #97', () => {
  it('#10: doppio tocco su «Genera» con il preventivo già salvato e senza modifiche: una stampa sola', async () => {
    preventivo()
    salvatoAllineato()
    const { result } = monta()
    await act(async () => {
      result.current.handlePrint()
      result.current.handlePrint()
      await fineGesto()
    })
    expect(stampaMock).toHaveBeenCalledTimes(1)
    expect(scritture()).toEqual([])
    // Finito il gesto, un nuovo «Genera» stampa di nuovo.
    await genera(result.current.handlePrint)
    expect(stampaMock).toHaveBeenCalledTimes(2)
  })
})

// L23, punto 1 di Antonio (14/10): il titolo del documento è il nome del file
// che Chrome propone e l'intestazione di ogni pagina. Il numero di un
// preventivo mai salvato arriva nello stesso gesto di «Genera» (salva, un giro,
// stampa), mentre la funzione di stampa che il gesto chiama è nata nel render
// di prima. Il titolo qui si risolve come lo risolve la libreria in `print()`.
describe('usePrint — il titolo del PDF: numero e cliente, letti al momento della stampa (L23)', () => {
  const titoli: string[] = []
  beforeEach(() => {
    titoli.length = 0
    stampaMock.mockImplementation((o) => {
      const t = o.documentTitle
      titoli.push(typeof t === 'function' ? t() : (t ?? ''))
    })
  })

  it('mai salvato: il primo «Genera» stampa col numero appena assegnato e il cliente, e niente va nella console', async () => {
    const spia = spiaConsole()
    spia.avvia()
    try {
      useQuoteStore.getState().collegaCliente('c-0001', clienteDaArchivio(clienteFinto()))
      preventivo({ cliente: false })
      supabaseFinto.risposte.push(numeroDalServer(3), { data: riga(), error: null })
      const { result } = monta()
      await genera(result.current.handlePrint)
      expect(stampaMock).toHaveBeenCalledTimes(1)
      const atteso = `Preventivo N. ${ANNO}-003 – ${RAGIONE_SOCIALE_FINTA}`
      expect(titoli).toEqual([atteso])
      expect(spia.trovati([...DATI_FINTI, atteso])).toEqual([])
    } finally {
      spia.ripristina()
    }
  })

  it('annullato, «Stampa con la dicitura ANNULLATO»: il titolo la porta in fondo', async () => {
    preventivo()
    salvatoAllineato({ ...SALVATO, stato: 'annullato' })
    const { result } = monta({ risposta: 'stampa' })
    await genera(result.current.handlePrint)
    expect(stampaMock).toHaveBeenCalledTimes(1)
    expect(titoli).toEqual([`Preventivo N. ${ANNO}-003 – Mario Prova – ANNULLATO`])
  })

  it('annullato, «Fai una nuova revisione»: il titolo è della revisione appena salvata, senza ANNULLATO', async () => {
    preventivo()
    salvatoAllineato({ ...SALVATO, stato: 'annullato' })
    supabaseFinto.risposte.push({ data: { revisione: 0 }, error: null }, { data: riga({ id: 'p-2', revisione: 1 }), error: null })
    const { result } = monta({ risposta: 'revisione' })
    await genera(result.current.handlePrint)
    expect(stampaMock).toHaveBeenCalledTimes(1)
    expect(titoli).toEqual([`Preventivo N. ${ANNO}-003 rev. 1 – Mario Prova`])
  })
})

// O32: "Genera" dice quando la stampa non può partire. I test provano il
// collegamento; l'annullamento del dialogo e i guasti dell'iframe non li
// segnala nemmeno `react-to-print`.
describe('usePrint — "Genera" dice quando la stampa non può partire (O32)', () => {
  beforeEach(() => {
    opzioni.correnti = undefined
    preventivo()
    salvatoAllineato()
  })

  it('ref del documento vuoto: toast d\'errore e nessuna stampa', async () => {
    const { result } = renderHook(() => usePrint({ chiedi: vi.fn(), scegliCliente: vi.fn() }), { wrapper })

    await genera(result.current.handlePrint)

    expect(screen.getByRole('alert').textContent).toContain('Il preventivo non è pronto per la stampa. Riprova.')
    expect(stampaMock).not.toHaveBeenCalled()
  })

  it('onPrintError: toast d\'errore, senza il testo dell\'eccezione', () => {
    renderHook(() => usePrint({ chiedi: vi.fn(), scegliCliente: vi.fn() }), { wrapper })

    act(() => opzioni.correnti?.onPrintError?.('onBeforePrint', new Error('dettaglio interno')))

    const avviso = screen.getByRole('alert').textContent ?? ''
    expect(avviso).toContain('La stampa non è riuscita. Riprova.')
    expect(avviso).not.toContain('dettaglio interno')
  })
})

// Strada A (Marco, 14/10) e C2 della revisione L15-L21: solo il listino cucine finto (D7).
describe('usePrint — strada A: «Genera» ricalcola la bozza, inviato e accettato non si riscrivono', () => {
  const LISTINO_A = { ...listinoCucinaFinto, aggiornato: 'listino-cucine-finto-A.xlsx' }
  const LISTINO_B = {
    ...listinoCucinaFinto,
    prezzi: listinoCucinaFinto.prezzi.map((p) => ({ ...p, prezzo: Math.round(p.prezzo * 1.1) })),
    aggiornato: 'listino-cucine-finto-B.xlsx',
  }

  /** Una cucina salvata con lo stato dato, coi prezzi del listino A congelati, e allineata. */
  function cucinaSalvata(stato: PreventivoSalvato['stato']) {
    useQuoteStore.getState().collegaCliente('c-0001', { ...initialPreventivo.cliente, nome: 'Mario', cognome: 'Prova' })
    useQuoteStore.getState().setVoceQuantita('base-pensile-laminato', 3)
    usePricelistStore.setState({ cucine: validatoPerTest(LISTINO_A) })
    useQuoteStore.getState().impostaSalvato({ ...SALVATO, stato }, prezziAdesso(useQuoteStore.getState().sezioni))
    segnaAllineato()
  }

  afterEach(() => useAuthStore.setState({ isAdmin: false }))

  it('C2: bozza senza modifiche ma col listino cambiato: «Genera» riscrive i prezzi, poi stampa', async () => {
    cucinaSalvata('bozza')
    usePricelistStore.setState({ cucine: validatoPerTest(LISTINO_B) })
    supabaseFinto.risposte.push({ data: riga({ updated_at: 'z' }), error: null })
    const { result } = monta()
    await genera(result.current.handlePrint)
    expect(stampaMock).toHaveBeenCalledTimes(1)
    const update = scritture()
    expect(update).toHaveLength(1)
    const patch = update[0].passi.find(([p]) => p === 'update')?.[1][0] as { totale_imponibile: number; dati: { prezzi: { listini: { cucine: string } } } }
    expect(patch.dati.prezzi.listini.cucine).toBe('listino-cucine-finto-B.xlsx')
  })

  it('inviato senza modifiche: «Genera» stampa i prezzi congelati e non scrive, anche col listino cambiato', async () => {
    cucinaSalvata('inviato')
    usePricelistStore.setState({ cucine: validatoPerTest(LISTINO_B) })
    const { result, chiedi } = monta()
    await genera(result.current.handlePrint)
    expect(stampaMock).toHaveBeenCalledTimes(1)
    expect(scritture()).toEqual([])
    expect(chiedi).not.toHaveBeenCalled()
  })

  it('N2: inviato senza modifiche e listino Cucine assente: «Genera» stampa i prezzi congelati, senza toast e senza scrivere', async () => {
    cucinaSalvata('inviato')
    usePricelistStore.setState({ cucine: null })
    const { result, chiedi } = monta()
    await genera(result.current.handlePrint)
    expect(stampaMock).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(scritture()).toEqual([])
    expect(chiedi).not.toHaveBeenCalled()
  })

  it('inviato con modifiche, utente: «Genera» propone solo la nuova revisione; scelta, la salva in bozza e la stampa', async () => {
    cucinaSalvata('inviato')
    useQuoteStore.getState().setVoceQuantita('base-pensile-laminato', 4)
    supabaseFinto.risposte.push({ data: { revisione: 0 }, error: null }, { data: riga({ revisione: 1, id: 'p-2' }), error: null })
    const { result, chiedi } = monta({ risposta: 'revisione' })
    await genera(result.current.handlePrint)
    expect(stampaMock).toHaveBeenCalledTimes(1)
    expect(chiedi.mock.calls[0][0].azioni.map((a) => a.etichetta)).toEqual(['Torna indietro', 'Fai una nuova revisione'])
    const insert = scritture().find((c) => c.passi.some(([p]) => p === 'insert'))
    expect(insert?.passi.find(([p]) => p === 'insert')?.[1][0]).toMatchObject({ revisione: 1, stato: 'bozza' })
  })

  it('inviato con modifiche, admin: c’è anche «Correggi questo preventivo», che riscrive la stessa riga', async () => {
    useAuthStore.setState({ isAdmin: true })
    cucinaSalvata('accettato')
    useQuoteStore.getState().setVoceQuantita('base-pensile-laminato', 4)
    supabaseFinto.risposte.push({ data: riga({ stato: 'accettato', updated_at: 'z' }), error: null })
    const { result, chiedi } = monta({ risposta: 'correggi' })
    await genera(result.current.handlePrint)
    expect(stampaMock).toHaveBeenCalledTimes(1)
    const domanda = chiedi.mock.calls[0][0]
    expect(domanda.azioni.map((a) => a.etichetta)).toEqual(['Torna indietro', 'Correggi questo preventivo', 'Fai una nuova revisione'])
    expect(domanda.testo).toMatch(/il cliente ha già la versione inviata/)
    expect(scritture()[0].passi.find(([p]) => p === 'update')?.[1][0]).toMatchObject({ stato: 'accettato' })
  })

  it('«Salva» su un inviato con modifiche: la stessa domanda; «Torna indietro» non scrive e non stampa', async () => {
    cucinaSalvata('inviato')
    useQuoteStore.getState().setVoceQuantita('base-pensile-laminato', 4)
    const { result, chiedi } = monta({ risposta: null })
    await act(async () => {
      await result.current.handleSalva()
    })
    expect(chiedi).toHaveBeenCalledTimes(1)
    expect(chiedi.mock.calls[0][0].titolo).toMatch(/inviato/)
    expect(scritture()).toEqual([])
    expect(stampaMock).not.toHaveBeenCalled()
  })
})
