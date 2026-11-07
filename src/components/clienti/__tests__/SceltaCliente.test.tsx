import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, within, waitFor, act } from '@testing-library/react'

vi.mock('@/lib/supabase', async () => ({
  supabase: (await import('@/test-utils/supabaseFinto')).supabaseFinto.client,
  LISTINI_BUCKET: 'Listini',
}))

import { supabaseFinto, clienteFinto, DATI_FINTI } from '@/test-utils/supabaseFinto'
import { spiaConsole } from '@/test-utils/spiaConsole'
import { useSceltaCliente } from '@/hooks/useSceltaCliente'
import { useQuoteStore } from '@/store/quoteStore'

/** Nella lista solo le colonne minime: niente telefono, email, indirizzo, note. */
const minimo = (over: Record<string, unknown> = {}) => {
  const c = clienteFinto(over)
  return { id: c.id, ragione_sociale: c.ragione_sociale, nome: c.nome, cognome: c.cognome, localita: c.localita }
}
const LISTA = [minimo(), minimo({ id: 'c-0002', ragione_sociale: 'Bottega Finta Snc', localita: 'Città di Prova' })]

/**
 * Monta la scelta come in AppShell e la apre dal pulsante, con `risposta` in
 * coda per la lettura della lista (anche una risposta che arriva dopo).
 */
async function montaEApri(risposta: unknown) {
  const esito: { scelta?: Promise<boolean> } = {}
  function Prova() {
    const { scegli, finestra } = useSceltaCliente()
    return (
      <>
        <button type="button" onClick={() => (esito.scelta = scegli('generare'))}>
          Apri
        </button>
        {finestra}
      </>
    )
  }
  supabaseFinto.risposte.push(risposta)
  render(<Prova />)
  fireEvent.click(screen.getByRole('button', { name: 'Apri' }))
  const dialogo = await screen.findByRole('dialog', { name: 'Scegli il cliente per generare il preventivo' })
  return { dialogo, combo: within(dialogo).getByRole('combobox'), scelta: () => esito.scelta! }
}

/** Monta la scelta, la apre e aspetta la lista. */
async function apri(lista: unknown[] = LISTA) {
  const aperta = await montaEApri({ data: lista, error: null })
  if (lista.length > 0) await within(aperta.dialogo).findAllByRole('option')
  return aperta
}

/**
 * Una risposta del database che arriva quando la si chiama: `await rispondi(valore)`.
 * Aspetta prima che la richiesta sia davvero partita (la catena finta la chiede
 * qualche microtask dopo il clic): senza, la risposta andrebbe nel vuoto e il
 * test passerebbe senza aver provato niente.
 */
function inAttesa() {
  let ok: ((v: unknown) => void) | null = null
  return {
    risposta: { then: (risolvi: (v: unknown) => void) => (ok = risolvi) },
    async rispondi(valore: unknown) {
      await waitFor(() => expect(ok).not.toBeNull())
      await act(async () => ok?.(valore))
    },
  }
}

beforeEach(() => {
  supabaseFinto.reset()
  useQuoteStore.getState().nuovoPreventivo()
})
afterEach(() => cleanup())

describe('SceltaCliente — combobox APG con «Crea» (L21-B, § 3.3)', () => {
  it('la lista legge solo id, ragione sociale, nome, cognome e località; il record completo si legge alla scelta', async () => {
    const { dialogo, scelta } = await apri()
    expect(supabaseFinto.arg(0, 'select')).toBe('id, ragione_sociale, nome, cognome, localita')
    supabaseFinto.risposte.push({ data: clienteFinto({ id: 'c-0002', ragione_sociale: 'Bottega Finta Snc' }), error: null })
    fireEvent.click(within(dialogo).getByRole('option', { name: /Bottega Finta Snc/ }))
    expect(await scelta()).toBe(true)
    expect(supabaseFinto.chiamate[1].passi.find(([p]) => p === 'eq')?.[1]).toEqual(['id', 'c-0002'])
    expect(String(supabaseFinto.arg(1, 'select'))).toContain('note')
    expect(useQuoteStore.getState().archivio.clienteId).toBe('c-0002')
    expect(useQuoteStore.getState().preventivo.cliente.nome).toBe('Bottega Finta Snc')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('tastiera: frecce che girano, aria-activedescendant che segue, Invio che sceglie', async () => {
    const { combo, scelta } = await apri()
    const attiva = () => document.getElementById(combo.getAttribute('aria-activedescendant') ?? '')
    expect(attiva()?.textContent).toContain('Cliente Prova Srl')
    fireEvent.keyDown(combo, { key: 'ArrowDown' })
    expect(attiva()?.textContent).toContain('Bottega Finta Snc')
    expect(attiva()?.getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(combo, { key: 'ArrowDown' })
    expect(attiva()?.textContent).toContain('Cliente Prova Srl')
    fireEvent.keyDown(combo, { key: 'ArrowUp' })
    expect(attiva()?.textContent).toContain('Bottega Finta Snc')
    supabaseFinto.risposte.push({ data: clienteFinto({ id: 'c-0002', ragione_sociale: 'Bottega Finta Snc' }), error: null })
    fireEvent.keyDown(combo, { key: 'Enter' })
    expect(await scelta()).toBe(true)
    expect(useQuoteStore.getState().archivio.clienteId).toBe('c-0002')
  })

  it('Esc svuota la ricerca e lascia la finestra aperta; a ricerca vuota la chiusura risponde «nessun cliente»', async () => {
    const { dialogo, combo, scelta } = await apri()
    fireEvent.change(combo, { target: { value: 'bottega' } })
    expect(within(dialogo).getAllByRole('option').map((o) => o.textContent)).toEqual(['Bottega Finta Snc · Città di Prova', '+ Crea "bottega"'])
    fireEvent.keyDown(combo, { key: 'Escape' })
    expect((combo as HTMLInputElement).value).toBe('')
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent(dialogo, new Event('cancel', { cancelable: true }))
    expect(await scelta()).toBe(false)
    expect(useQuoteStore.getState().archivio.clienteId).toBeNull()
  })

  it('ricerca senza risultati: lo dice e offre «+ Crea»; Crea chiede solo nome, cognome e telefono e crea una volta sola', async () => {
    const { dialogo, combo, scelta } = await apri()
    fireEvent.change(combo, { target: { value: 'Mario Prova Finto' } })
    expect(within(dialogo).getByText('Nessun cliente trovato per "Mario Prova Finto".')).toBeTruthy()
    fireEvent.keyDown(combo, { key: 'Enter' })
    expect((within(dialogo).getByLabelText('Nome') as HTMLInputElement).value).toBe('Mario')
    expect((within(dialogo).getByLabelText('Cognome') as HTMLInputElement).value).toBe('Prova Finto')
    // Solo tre campi: nome, cognome e telefono (il resto si completa nella scheda).
    expect(within(dialogo).getAllByRole('textbox')).toHaveLength(3)
    expect(within(dialogo).queryByRole('combobox')).toBeNull()
    expect(within(dialogo).getByLabelText('Telefono').getAttribute('type')).toBe('tel')
    fireEvent.change(within(dialogo).getByLabelText('Telefono'), { target: { value: '000 0000000' } })
    supabaseFinto.risposte.push({ data: clienteFinto({ id: 'c-0009', ragione_sociale: 'Mario Prova Finto' }), error: null })
    const crea = within(dialogo).getByRole('button', { name: 'Crea e usa questo cliente' })
    fireEvent.click(crea)
    fireEvent.click(crea)
    expect(await scelta()).toBe(true)
    const insert = supabaseFinto.chiamate.filter((c) => c.passi.some(([p]) => p === 'insert'))
    expect(insert).toHaveLength(1)
    expect(insert[0].passi.find(([p]) => p === 'insert')?.[1][0]).toMatchObject({
      ragione_sociale: 'Mario Prova Finto',
      nome: 'Mario',
      cognome: 'Prova Finto',
      telefono: '000 0000000',
      note: null,
    })
    expect(useQuoteStore.getState().archivio.clienteId).toBe('c-0009')
  })

  it('S8: «Crea e usa» dopo un errore di rete riusa lo stesso id, così una risposta persa non fa un doppione', async () => {
    const { dialogo, combo, scelta } = await apri()
    fireEvent.change(combo, { target: { value: 'Mario Prova Finto' } })
    fireEvent.keyDown(combo, { key: 'Enter' })
    supabaseFinto.risposte.push(new TypeError('Failed to fetch'))
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Crea e usa questo cliente' }))
    expect(await within(dialogo).findByText(/Errore di rete/)).toBeTruthy()
    supabaseFinto.risposte.push({ data: clienteFinto({ id: 'c-0009', ragione_sociale: 'Mario Prova Finto' }), error: null })
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Crea e usa questo cliente' }))
    expect(await scelta()).toBe(true)
    const id = supabaseFinto.chiamate
      .map((c) => c.passi.find(([p]) => p === 'insert')?.[1][0] as { id?: string } | undefined)
      .filter(Boolean)
      .map((r) => r?.id)
    expect(id).toHaveLength(2)
    expect(id[0]).toBeTruthy()
    expect(id[1]).toBe(id[0])
  })

  it('validazione all\'invio: senza nome né cognome lo dice, mette il focus sul nome e non scrive', async () => {
    const { dialogo, combo } = await apri([])
    expect(within(dialogo).getByText('Nessun cliente ancora: scrivi il nome per crearlo.')).toBeTruthy()
    fireEvent.change(combo, { target: { value: 'x' } })
    fireEvent.click(within(dialogo).getByRole('option', { name: '+ Crea "x"' }))
    fireEvent.change(within(dialogo).getByLabelText('Nome'), { target: { value: '  ' } })
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Crea e usa questo cliente' }))
    expect(within(dialogo).getByRole('alert').textContent).toBe('Scrivi almeno il nome o il cognome del cliente.')
    expect(document.activeElement).toBe(within(dialogo).getByLabelText('Nome'))
    expect(supabaseFinto.chiamate.filter((c) => c.passi.some(([p]) => p === 'insert'))).toHaveLength(0)
  })

  it('presidio: scelta, errore e creazione non loggano email, telefono né ragione sociale finti', async () => {
    const spia = spiaConsole()
    spia.avvia()
    try {
      const { dialogo, combo } = await apri()
      supabaseFinto.risposte.push({ data: null, error: { code: '42501', message: DATI_FINTI.join(' ') } })
      fireEvent.click(within(dialogo).getByRole('option', { name: /Cliente Prova Srl/ }))
      expect(await within(dialogo).findByRole('alert')).toBeTruthy()
      fireEvent.change(combo, { target: { value: 'Prova' } })
      expect(spia.trovati(DATI_FINTI)).toEqual([])
    } finally {
      spia.ripristina()
    }
  })
})

describe('SceltaCliente — revisione funzionale del 14/10 sulla #97', () => {
  it('#1: scrivendo in Cognome il focus resta lì, non torna su Nome a ogni tasto', async () => {
    const { dialogo, combo } = await apri()
    fireEvent.change(combo, { target: { value: 'Zeta Finto' } })
    fireEvent.keyDown(combo, { key: 'Enter' })
    const cognome = within(dialogo).getByLabelText('Cognome')
    cognome.focus()
    fireEvent.change(cognome, { target: { value: 'R' } })
    expect(document.activeElement).toBe(cognome)
    fireEvent.change(cognome, { target: { value: 'Ro' } })
    expect(document.activeElement).toBe(cognome)
    expect((cognome as HTMLInputElement).value).toBe('Ro')
  })

  it('#4: «+ Crea» non c\'è finché la lista non è letta; lista in errore: il motivo e «Riprova», che la rilegge', async () => {
    const lettura = inAttesa()
    const { dialogo, combo } = await montaEApri(lettura.risposta)
    fireEvent.change(combo, { target: { value: 'Cliente Prova' } })
    // Lista non ancora letta: niente «Crea», o nascerebbe un doppione di un cliente che c'è.
    expect(within(dialogo).queryAllByRole('option')).toEqual([])
    await lettura.rispondi({ data: null, error: { code: '42501' } })
    const avviso = within(dialogo).getByRole('alert')
    expect(avviso.textContent).toContain('Operazione non consentita per questo account.')
    expect(within(dialogo).queryAllByRole('option')).toEqual([])
    supabaseFinto.risposte.push({ data: LISTA, error: null })
    fireEvent.click(within(avviso).getByRole('button', { name: 'Riprova' }))
    expect(await within(dialogo).findByRole('option', { name: /Cliente Prova Srl/ })).toBeTruthy()
    expect(within(dialogo).getByRole('option', { name: '+ Crea "Cliente Prova"' })).toBeTruthy()
    expect(within(dialogo).queryByRole('alert')).toBeNull()
  })

  it('#6: chiusa la finestra mentre legge o crea il cliente, la risposta che arriva dopo non collega niente', async () => {
    const { dialogo, scelta } = await apri()
    const lettura = inAttesa()
    supabaseFinto.risposte.push(lettura.risposta)
    fireEvent.click(within(dialogo).getByRole('option', { name: /Cliente Prova Srl/ }))
    fireEvent(dialogo, new Event('cancel', { cancelable: true }))
    expect(await scelta()).toBe(false)
    await lettura.rispondi({ data: clienteFinto(), error: null })
    expect(useQuoteStore.getState().archivio.clienteId).toBeNull()

    // Lo stesso con la creazione: il cliente nasce nel database, ma non si collega.
    supabaseFinto.risposte.push({ data: LISTA, error: null })
    fireEvent.click(screen.getByRole('button', { name: 'Apri' }))
    const riaperta = await screen.findByRole('dialog', { name: 'Scegli il cliente per generare il preventivo' })
    await within(riaperta).findAllByRole('option')
    fireEvent.change(within(riaperta).getByRole('combobox'), { target: { value: 'Zeta Finto' } })
    fireEvent.keyDown(within(riaperta).getByRole('combobox'), { key: 'Enter' })
    const creazione = inAttesa()
    supabaseFinto.risposte.push(creazione.risposta)
    fireEvent.click(within(riaperta).getByRole('button', { name: 'Crea e usa questo cliente' }))
    fireEvent(riaperta, new Event('cancel', { cancelable: true }))
    await creazione.rispondi({ data: clienteFinto({ id: 'c-0009', ragione_sociale: 'Zeta Finto' }), error: null })
    expect(useQuoteStore.getState().archivio.clienteId).toBeNull()
  })

  it('d: due tocchi rapidi su clienti diversi, il secondo risponde prima: resta collegato l\'ultimo toccato', async () => {
    const { dialogo, scelta } = await apri()
    const primo = inAttesa()
    const secondo = inAttesa()
    supabaseFinto.risposte.push(primo.risposta, secondo.risposta)
    fireEvent.click(within(dialogo).getByRole('option', { name: /Cliente Prova Srl/ }))
    fireEvent.click(within(dialogo).getByRole('option', { name: /Bottega Finta Snc/ }))
    await secondo.rispondi({ data: clienteFinto({ id: 'c-0002', ragione_sociale: 'Bottega Finta Snc' }), error: null })
    await primo.rispondi({ data: clienteFinto(), error: null })
    expect(await scelta()).toBe(true)
    expect(useQuoteStore.getState().archivio.clienteId).toBe('c-0002')
    expect(useQuoteStore.getState().preventivo.cliente.nome).toBe('Bottega Finta Snc')
  })

  it('#8: con le frecce l\'opzione attiva resta in vista (scrollIntoView, block «nearest»)', async () => {
    // jsdom non scorre: si prova che l'opzione attiva chiede di farsi vedere, non lo scorrimento.
    const prima = Element.prototype.scrollIntoView
    const scorri = vi.fn()
    Element.prototype.scrollIntoView = scorri
    try {
      const { combo } = await apri()
      scorri.mockClear()
      fireEvent.keyDown(combo, { key: 'ArrowDown' })
      expect(scorri).toHaveBeenLastCalledWith({ block: 'nearest' })
      expect(scorri.mock.contexts.at(-1)).toBe(document.getElementById(combo.getAttribute('aria-activedescendant') ?? ''))
    } finally {
      Element.prototype.scrollIntoView = prima
    }
  })

  it('#14: «Torna alla ricerca» rimette il focus sulla ricerca; i tre campi sono un form, e l\'invio (Invio, «Vai») crea', async () => {
    const { dialogo, combo, scelta } = await apri()
    fireEvent.change(combo, { target: { value: 'Zeta Finto' } })
    fireEvent.keyDown(combo, { key: 'Enter' })
    const torna = within(dialogo).getByRole('button', { name: 'Torna alla ricerca' })
    torna.focus()
    fireEvent.click(torna)
    // Il focus non resta sul pulsante, che diventerebbe «Chiudi»: un secondo Invio chiuderebbe la finestra.
    expect(document.activeElement).toBe(within(dialogo).getByRole('combobox'))

    fireEvent.keyDown(within(dialogo).getByRole('combobox'), { key: 'Enter' })
    const nome = within(dialogo).getByLabelText('Nome') as HTMLInputElement
    expect(nome.form).not.toBeNull()
    supabaseFinto.risposte.push({ data: clienteFinto({ id: 'c-0009', ragione_sociale: 'Zeta Finto' }), error: null })
    fireEvent.submit(nome.form as HTMLFormElement)
    expect(await scelta()).toBe(true)
    expect(supabaseFinto.chiamate.filter((c) => c.passi.some(([p]) => p === 'insert'))).toHaveLength(1)
    expect(useQuoteStore.getState().archivio.clienteId).toBe('c-0009')
  })
})

// U19 (revisione L15-L21): esiti della ricerca non annunciati, `aria-expanded`
// sempre vero anche senza opzioni, la lista una tappa di Tab in più.
describe('SceltaCliente — annunci e combobox (U19)', () => {
  afterEach(() => cleanup())
  it('aria-expanded segue le opzioni, la lista non prende il Tab, «Nessun cliente trovato» è annunciato', async () => {
    const { dialogo, combo } = await apri()
    expect(combo.getAttribute('aria-expanded')).toBe('true')
    expect(within(dialogo).getByRole('listbox').getAttribute('tabindex')).toBe('-1')
    const prima = within(dialogo).getAllByRole('status')
    fireEvent.change(combo, { target: { value: 'Mario Prova Finto' } })
    const annuncio = within(dialogo).getAllByRole('status').find((n) => n.textContent === 'Nessun cliente trovato per "Mario Prova Finto".')
    expect(prima).toContain(annuncio)
  })
})
