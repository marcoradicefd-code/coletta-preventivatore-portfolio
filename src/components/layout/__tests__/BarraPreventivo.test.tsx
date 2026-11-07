import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, within, waitFor, act } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

vi.mock('@/lib/supabase', async () => ({
  supabase: (await import('@/test-utils/supabaseFinto')).supabaseFinto.client,
  LISTINI_BUCKET: 'Listini',
}))

import { supabaseFinto, numeroDalServer, EMAIL_FINTA, DATI_FINTI } from '@/test-utils/supabaseFinto'
import { spiaConsole } from '@/test-utils/spiaConsole'
import { BarraPreventivo } from '@/components/layout/BarraPreventivo'
import { useQuoteStore, initialPreventivo, QUOTE_VERSION } from '@/store/quoteStore'
import { dimenticaSalvataggio, prezziAdesso, revisioneAperto, salvaAperto, segnaAllineato, useSalvataggio } from '@/store/salvataggioStore'
import { usePricelistStore } from '@/store/pricelistStore'
import { listinoCucinaFinto } from '@/test-utils/catalogoCucinaFinto'
import { validatoPerTest } from '@/test-utils/listinoValidato'
import { FALLBACK_PROGETTO_VALORE } from '@/store/quoteFallbacks'
import type { PreventivoSalvato } from '@/types/archivio'

const ANNO = new Date().getFullYear()
const AGG = '2026-10-13T10:00:00.000001+00:00'
const SALVATO: PreventivoSalvato = { id: 'p-1', anno: ANNO, numero: 1, revisione: 0, stato: 'bozza', updatedAt: AGG }
const riga = (over: Record<string, unknown> = {}) => ({ id: 'p-1', anno: ANNO, numero: 1, revisione: 0, stato: 'bozza', updated_at: AGG, ...over })

/** Un preventivo con un cliente scelto e una riga a valore da 250 €. */
function preparaStore(salvato: PreventivoSalvato | null = null) {
  const s = useQuoteStore.getState()
  s.collegaCliente('c-0001', { ...initialPreventivo.cliente, nome: 'Mario', cognome: 'Prova', email: EMAIL_FINTA })
  useQuoteStore.setState((st) => ({
    sezioni: { ...st.sezioni, progettoValore: { ...FALLBACK_PROGETTO_VALORE, righe: [{ id: 'v1', descrizione: 'Voce di prova', prezzo: 250 }] } },
  }))
  if (salvato) {
    // Coi prezzi congelati del salvataggio (strada A), come dopo un «Salva».
    s.impostaSalvato(salvato, prezziAdesso(useQuoteStore.getState().sezioni))
    segnaAllineato()
  }
}

function monta() {
  const onScegliCliente = vi.fn()
  render(<BarraPreventivo onScegliCliente={onScegliCliente} />)
  return { onScegliCliente, barra: screen.getByRole('region', { name: 'Barra del preventivo' }) }
}

beforeEach(() => {
  supabaseFinto.reset()
  useQuoteStore.getState().nuovoPreventivo()
  dimenticaSalvataggio()
  useSalvataggio.setState({ inCorso: false })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('BarraPreventivo — dove si è e cosa succede (L21-B, § 3.1)', () => {
  it('mai salvato e senza cliente: «Non ancora salvato» con la nota, «Scegli il cliente»; «Salva» apre la scelta, niente scritture', () => {
    const { onScegliCliente, barra } = monta()
    expect(within(barra).getByText('Non ancora salvato')).toBeTruthy()
    expect(within(barra).getByText('Il numero arriva al primo salvataggio')).toBeTruthy()
    fireEvent.click(within(barra).getByRole('button', { name: 'Scegli il cliente' }))
    expect(onScegliCliente).toHaveBeenLastCalledWith()
    const salva = within(barra).getByRole('button', { name: 'Salva' })
    expect(salva.hasAttribute('disabled')).toBe(false)
    fireEvent.click(salva)
    expect(onScegliCliente).toHaveBeenLastCalledWith('salvare')
    expect(supabaseFinto.chiamate).toHaveLength(0)
    expect(within(barra).getByRole('button', { name: /Genera Preventivo/ }).hasAttribute('disabled')).toBe(false)
  })

  it('primo salvataggio: numero dal database, «Salvato alle» annunciato; una modifica dopo dice «Modifiche non salvate»', async () => {
    preparaStore()
    const { barra } = monta()
    expect(within(barra).getByRole('button', { name: /Cliente: Mario Prova/ })).toBeTruthy()
    expect(within(barra).getByText('Modifiche non salvate')).toBeTruthy()
    supabaseFinto.risposte.push(numeroDalServer(1), { data: riga(), error: null })
    fireEvent.click(within(barra).getByRole('button', { name: 'Salva' }))
    expect(within(barra).getByText('Salvataggio…')).toBeTruthy()
    const stato = await within(barra).findByText(/^Salvato alle \d{2}:\d{2}$/)
    expect(stato.getAttribute('aria-live')).toBe('polite')
    expect(within(barra).getByText(`N. ${ANNO}-001 · Bozza`)).toBeTruthy()
    const insert = supabaseFinto.chiamate.find((c) => c.passi.some(([p]) => p === 'insert'))
    expect(insert?.passi.find(([p]) => p === 'insert')?.[1][0]).toMatchObject({ numero: 1, totale_imponibile: 250, dati: { versione: QUOTE_VERSION } })
    expect(useQuoteStore.getState().archivio.preventivo).toEqual(SALVATO)

    useQuoteStore.getState().setPreventivo({ oggettoPreventivo: 'Cucina di prova' })
    expect(await within(barra).findByText('Modifiche non salvate')).toBeTruthy()
  })

  it('mentre salva, i pulsanti spenti hanno il motivo accanto (aria-describedby sullo stato)', async () => {
    preparaStore(SALVATO)
    // Una modifica: senza, «Salva» non scrive (revisione del 14/10, difetto 12).
    useQuoteStore.getState().setPreventivo({ oggettoPreventivo: 'Modifica locale' })
    const { barra } = monta()
    let rispondi: (v: unknown) => void = () => undefined
    supabaseFinto.risposte.push({ then: (ok: (v: unknown) => void) => (rispondi = ok) })
    fireEvent.click(within(barra).getByRole('button', { name: 'Salva' }))
    const salva = within(barra).getByRole('button', { name: 'Salva' })
    // U6: spento con aria-disabled (resta focalizzabile), non con disabled.
    await waitFor(() => expect(salva.getAttribute('aria-disabled')).toBe('true'))
    const motivo = document.getElementById(salva.getAttribute('aria-describedby') ?? '')
    expect(motivo?.textContent).toBe('Salvataggio…')
    rispondi({ data: riga({ updated_at: 'dopo' }), error: null })
    await waitFor(() => expect(salva.getAttribute('aria-disabled')).toBeNull())
  })

  it('conflitto: lo dice, nessuna sovrascrittura, e fa scegliere; «Ricarica la versione salvata» rilegge dal database', async () => {
    preparaStore(SALVATO)
    useQuoteStore.getState().setPreventivo({ oggettoPreventivo: 'Modifica locale' })
    const { barra } = monta()
    supabaseFinto.risposte.push({ data: null, error: null })
    fireEvent.click(within(barra).getByRole('button', { name: 'Salva' }))
    const avviso = await within(barra).findByRole('alert')
    expect(avviso.textContent).toContain('modificato da un’altra parte')
    expect(within(avviso).getByRole('button', { name: 'Salva le mie modifiche come nuova revisione' })).toBeTruthy()
    expect(within(avviso).getByRole('button', { name: 'Lascia così' })).toBeTruthy()
    expect(supabaseFinto.chiamate.filter((c) => c.passi.some(([p]) => p === 'update'))).toHaveLength(1)

    const aggiornato = '2026-10-13T11:00:00.000001+00:00'
    supabaseFinto.risposte.push({
      data: { ...riga({ updated_at: aggiornato }), cliente_id: 'c-0001', dati: { versione: QUOTE_VERSION, preventivo: initialPreventivo, sezioni: {} } },
      error: null,
    })
    fireEvent.click(within(avviso).getByRole('button', { name: 'Ricarica la versione salvata' }))
    await waitFor(() => expect(useQuoteStore.getState().archivio.preventivo?.updatedAt).toBe(aggiornato))
    expect(within(barra).queryByRole('alert')).toBeNull()
    expect(within(barra).getByText('Salvato')).toBeTruthy()
  })

  it('rete giù: il messaggio dice cosa fare e «Riprova» rifà il salvataggio; nessun dato finto nella console', async () => {
    const spia = spiaConsole()
    spia.avvia()
    try {
      preparaStore(SALVATO)
      useQuoteStore.getState().setPreventivo({ oggettoPreventivo: 'Modifica locale' })
      const { barra } = monta()
      supabaseFinto.risposte.push(new TypeError(DATI_FINTI.join(' ')))
      fireEvent.click(within(barra).getByRole('button', { name: 'Salva' }))
      const avviso = await within(barra).findByRole('alert')
      expect(avviso.textContent).toContain('Errore di rete')
      supabaseFinto.risposte.push({ data: riga({ updated_at: 'dopo' }), error: null })
      fireEvent.click(within(avviso).getByRole('button', { name: 'Riprova' }))
      expect(await within(barra).findByText(/^Salvato alle/)).toBeTruthy()
      expect(supabaseFinto.chiamate.filter((c) => c.passi.some(([p]) => p === 'update'))).toHaveLength(2)
      expect(spia.trovati(DATI_FINTI)).toEqual([])
    } finally {
      spia.ripristina()
    }
  })
})

describe('BarraPreventivo — revisione funzionale del 14/10 sulla #97', () => {
  it('#2: «Riprova» rifà l\'azione fallita anche se non è partita dalla barra (qui «Nuova revisione»)', async () => {
    preparaStore(SALVATO)
    const { barra } = monta()
    // «Nuova revisione» dalla pagina Preventivi: l'ultima revisione è la 0, l'INSERT non ha risposta.
    supabaseFinto.risposte.push({ data: { revisione: 0 }, error: null }, new TypeError('Failed to fetch'))
    await act(async () => {
      await revisioneAperto()
    })
    const avviso = await within(barra).findByRole('alert')
    expect(avviso.textContent).toContain('Errore di rete')
    supabaseFinto.risposte.push({ data: { revisione: 0 }, error: null }, { data: riga({ id: 'p-2', revisione: 1 }), error: null })
    fireEvent.click(within(avviso).getByRole('button', { name: 'Riprova' }))
    await waitFor(() => expect(useQuoteStore.getState().archivio.preventivo).toMatchObject({ id: 'p-2', revisione: 1 }))
    expect(supabaseFinto.chiamate.filter((c) => c.passi.some(([p]) => p === 'insert'))).toHaveLength(2)
    expect(within(barra).queryByRole('alert')).toBeNull()
  })

  it('#3: da desktop la barra non copre i riepiloghi né i campi: la sua altezza in --altezza-barra, usata dai riepiloghi e dallo scorrimento', () => {
    // Limite dichiarato: jsdom non impagina, quindi non si misura la sovrapposizione vera.
    // Si provano il collegamento (la barra scrive la sua altezza misurata) e le classi
    // e le regole che la usano; la posizione la vede Marco sulla preview.
    const osservatori: ResizeObserverCallback[] = []
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: ResizeObserverCallback) {
          osservatori.push(cb)
        }
        observe() {}
        disconnect() {}
      }
    )
    const altezza = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(65)
    monta()
    const radice = document.documentElement
    expect(radice.style.getPropertyValue('--altezza-barra')).toBe('65px')
    // Con il pannello d'errore la barra cresce: la variabile la segue.
    altezza.mockReturnValue(150)
    act(() => osservatori.forEach((cb) => cb([], {} as ResizeObserver)))
    expect(radice.style.getPropertyValue('--altezza-barra')).toBe('150px')
    cleanup()
    expect(radice.style.getPropertyValue('--altezza-barra')).toBe('')

    const leggi = (f: string) => readFileSync(resolve(process.cwd(), f), 'utf8')
    for (const f of [
      'src/components/cucine/CucineRiepilogo.tsx',
      'src/components/marmeria/MarmeriaRiepilogo.tsx',
      'src/components/porte/PorteRiepilogo.tsx',
      'src/components/sumisura/SuMisuraRiepilogo.tsx',
      'src/components/valore/ProgettoValoreRiepilogo.tsx',
    ]) {
      expect(leggi(f), f).not.toContain('xl:top-8')
      expect(leggi(f), f).toContain('xl:sticky-sotto-barra')
    }
    const css = leggi('src/index.css')
    expect(css).toMatch(/@utility sticky-sotto-barra \{[^}]*position: sticky;[^}]*top: calc\(var\(--altezza-barra, 0px\) \+ 2rem\)/)
    expect(css).toMatch(/@media \(width >= 48rem\) \{\s*html \{\s*scroll-padding-top: var\(--altezza-barra, 0px\);/)
  })

  it('#7: aperto un altro preventivo, la barra non dice «Salvato alle…» del salvataggio di prima', async () => {
    preparaStore()
    const { barra } = monta()
    supabaseFinto.risposte.push(numeroDalServer(1), { data: riga(), error: null })
    fireEvent.click(within(barra).getByRole('button', { name: 'Salva' }))
    expect(await within(barra).findByText(/^Salvato alle/)).toBeTruthy()
    act(() => {
      useQuoteStore.getState().apriDaArchivio(initialPreventivo, {}, { clienteId: 'c-0002', preventivo: { ...SALVATO, id: 'p-9', numero: 9 } })
      segnaAllineato()
    })
    expect(within(barra).getByText(`N. ${ANNO}-009 · Bozza`)).toBeTruthy()
    expect(within(barra).getByText('Salvato')).toBeTruthy()
    expect(within(barra).queryByText(/^Salvato alle/)).toBeNull()
  })

  it('#11: senza crypto.randomUUID (HTTP, Safari < 15.4) il primo salvataggio riesce con un id v4; senza nessun generatore lo dice e non consuma numeri', async () => {
    const vero = globalThis.crypto
    vi.stubGlobal('crypto', { getRandomValues: vero.getRandomValues.bind(vero) })
    preparaStore()
    const { barra } = monta()
    supabaseFinto.risposte.push(numeroDalServer(1), { data: riga(), error: null })
    fireEvent.click(within(barra).getByRole('button', { name: 'Salva' }))
    expect(await within(barra).findByText(/^Salvato alle/)).toBeTruthy()
    const insert = supabaseFinto.chiamate.find((c) => c.passi.some(([p]) => p === 'insert'))
    expect((insert?.passi.find(([p]) => p === 'insert')?.[1][0] as { id: string }).id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    )
    expect(supabaseFinto.chiamate.filter((c) => c.rpc)).toHaveLength(1)
    cleanup()

    supabaseFinto.reset()
    useQuoteStore.getState().nuovoPreventivo()
    dimenticaSalvataggio()
    vi.stubGlobal('crypto', {})
    preparaStore()
    const seconda = monta()
    fireEvent.click(within(seconda.barra).getByRole('button', { name: 'Salva' }))
    const avviso = await within(seconda.barra).findByRole('alert')
    expect(avviso.textContent).toMatch(/errore imprevisto/)
    expect(supabaseFinto.chiamate).toHaveLength(0)
    expect(useSalvataggio.getState().inCorso).toBe(false)
  })

  it('#12: «Salva» senza modifiche non scrive e lo dice; neanche il salvataggio dello store scrive', async () => {
    preparaStore(SALVATO)
    const { barra } = monta()
    expect(within(barra).getByText('Salvato')).toBeTruthy()
    fireEvent.click(within(barra).getByRole('button', { name: 'Salva' }))
    expect(await within(barra).findByText('Nessuna modifica da salvare')).toBeTruthy()
    let esito: Awaited<ReturnType<typeof salvaAperto>> | undefined
    await act(async () => {
      esito = await salvaAperto()
    })
    expect(esito).toEqual({ ok: true, dato: SALVATO })
    expect(supabaseFinto.chiamate).toHaveLength(0)
    // Dopo una modifica «Salva» scrive di nuovo, e la nota sparisce.
    act(() => useQuoteStore.getState().setPreventivo({ oggettoPreventivo: 'Modifica' }))
    expect(within(barra).queryByText('Nessuna modifica da salvare')).toBeNull()
  })
})

// Strada A: la barra dice da dove vengono i prezzi di un preventivo inviato. Solo il listino cucine finto (D7).
describe('BarraPreventivo — prezzi congelati (strada A)', () => {
  const LISTINO_A = { ...listinoCucinaFinto, aggiornato: 'listino-cucine-finto-A.xlsx' }
  const LISTINO_B = { ...listinoCucinaFinto, prezzi: listinoCucinaFinto.prezzi.map((p) => ({ ...p, prezzo: p.prezzo + 10 })), aggiornato: 'listino-cucine-finto-B.xlsx' }

  function cucinaInviata(conPrezzi: boolean) {
    useQuoteStore.getState().collegaCliente('c-0001', { ...initialPreventivo.cliente, nome: 'Mario', cognome: 'Prova' })
    useQuoteStore.getState().setVoceQuantita('base-pensile-laminato', 3)
    usePricelistStore.setState({ cucine: validatoPerTest(LISTINO_A) })
    const prezzi = conPrezzi ? { ...prezziAdesso(useQuoteStore.getState().sezioni), calcolatiIl: '2026-10-01T09:00:00.000Z' } : undefined
    useQuoteStore.getState().impostaSalvato({ ...SALVATO, stato: 'inviato' }, prezzi)
    segnaAllineato()
  }
  afterEach(() => usePricelistStore.setState({ cucine: null }))

  it('listino cambiato dopo l’invio: «Prezzi del 01/10/2026: per aggiornarli fai una nuova revisione»', () => {
    cucinaInviata(true)
    const { barra } = monta()
    expect(within(barra).queryByText(/Prezzi del/)).toBeNull()
    cleanup()
    usePricelistStore.setState({ cucine: validatoPerTest(LISTINO_B) })
    const { barra: dopo } = monta()
    expect(within(dopo).getByText('Prezzi del 01/10/2026: per aggiornarli fai una nuova revisione.')).toBeTruthy()
  })

  it('inviato salvato prima dei prezzi congelati: la nota «prezzi attuali, non quelli dell’invio»', () => {
    cucinaInviata(false)
    const { barra } = monta()
    expect(within(barra).getByText('Prezzi attuali, non quelli dell’invio: questo preventivo è stato salvato prima che l’app li conservasse.')).toBeTruthy()
  })
})

// U3 (revisione L15-L21): su mobile numero e stato erano troncati («N. 2026-012
// rev. 2 · I…»), e col pannello d'errore la barra copriva fino al 74% dello
// schermo, con `main` a un `pb-40` fisso. jsdom non impagina: si provano le
// classi e le regole che reggono le misure del revisore.
describe('BarraPreventivo — mobile (U3)', () => {
  it('numero e stato su una riga loro (troncati solo da desktop), pannello d’errore con altezza massima, spazio in fondo misurato', async () => {
    preparaStore({ ...SALVATO, revisione: 2, stato: 'inviato' })
    useQuoteStore.getState().setPreventivo({ oggettoPreventivo: 'Modifica locale' })
    supabaseFinto.risposte.push(new TypeError('Failed to fetch'))
    const { barra } = monta()
    const numero = within(barra).getByText(`N. ${ANNO}-001 rev. 2 · Inviato`)
    expect(numero.className).not.toMatch(/(^|\s)truncate(\s|$)/)
    expect(numero.className).toContain('md:truncate')
    await act(async () => {
      await salvaAperto(undefined, undefined, { correggi: true })
    })
    const pannello = within(barra).getByRole('alert')
    expect(pannello.className).toContain('max-h-[40dvh]')
    expect(pannello.className).toContain('overflow-y-auto')
    const leggi = (f: string) => readFileSync(resolve(process.cwd(), f), 'utf8')
    expect(leggi('src/components/layout/AppShell.tsx')).toContain('max-md:pb-[calc(var(--altezza-barra,10rem)+1rem)]')
    expect(leggi('src/components/layout/AppShell.tsx')).not.toMatch(/\spb-40\s/)
    expect(leggi('src/components/shared/Toast.tsx')).toContain('max-md:bottom-[calc(var(--altezza-barra,10rem)+0.5rem)]')
  })
})
