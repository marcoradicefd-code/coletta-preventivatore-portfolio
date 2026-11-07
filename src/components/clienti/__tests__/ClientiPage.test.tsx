import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within, act } from '@testing-library/react'

vi.mock('@/lib/supabase', async () => ({
  supabase: (await import('@/test-utils/supabaseFinto')).supabaseFinto.client,
  LISTINI_BUCKET: 'Listini',
}))

import { supabaseFinto, clienteFinto, EMAIL_FINTA, DATI_FINTI } from '@/test-utils/supabaseFinto'
import { spiaConsole } from '@/test-utils/spiaConsole'
import { ClientiPage } from '@/components/clienti/ClientiPage'
import { ClientForm } from '@/components/client/ClientForm'
import { NOTA_DATI_PARTICOLARI } from '@/components/clienti/SchedaCliente'
import { useAuthStore } from '@/store/authStore'
import { useQuoteStore } from '@/store/quoteStore'
import { clienteDaArchivio } from '@/lib/clientiDb'

const SECONDO = clienteFinto({ id: 'c-0002', ragione_sociale: 'Bottega Finta Snc', localita: 'Città di Prova', email: null })

/** Rende la pagina con l'elenco già in coda e aspetta che compaia. */
async function apriPagina(righe = [clienteFinto(), SECONDO]) {
  supabaseFinto.risposte.push({ data: righe, error: null })
  render(<ClientiPage />)
  if (righe.length > 0) await screen.findByText(righe[0].ragione_sociale as string)
}

const chiamatePer = (tabella: string, passo: string) =>
  supabaseFinto.chiamate.filter((c) => c.tabella === tabella && c.passi.some(([p]) => p === passo))

beforeEach(() => {
  supabaseFinto.reset()
  useQuoteStore.getState().resetAll()
  useAuthStore.setState({ isAdmin: false })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('ClientiPage — anagrafica (L21)', () => {
  it('elenca i clienti e la lente cerca senza accenti', async () => {
    await apriPagina()
    expect(screen.getByText('Bottega Finta Snc')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Cerca nei clienti'), { target: { value: 'citta di' } })
    expect(screen.queryByText('Cliente Prova Srl')).toBeNull()
    expect(screen.getByText('Bottega Finta Snc')).toBeTruthy()
  })

  it('un errore di caricamento si mostra senza dati personali', async () => {
    supabaseFinto.risposte.push({ data: null, error: { code: '42501', message: EMAIL_FINTA } })
    render(<ClientiPage />)
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Operazione non consentita per questo account.')
    expect(alert.textContent).not.toContain(EMAIL_FINTA)
  })

  it('«Nuovo cliente» crea il cliente con la ragione sociale, e la scheda dice di non scrivere dati particolari', async () => {
    await apriPagina()
    fireEvent.click(screen.getByRole('button', { name: 'Nuovo cliente' }))
    const scheda = screen.getByRole('region', { name: 'Nuovo cliente' })
    expect(within(scheda).getByText(NOTA_DATI_PARTICOLARI)).toBeTruthy()
    expect(within(scheda).queryByLabelText(/fiscale/i)).toBeNull()
    fireEvent.change(within(scheda).getByLabelText(/Ragione sociale/), { target: { value: 'Nuova Prova Srl' } })
    supabaseFinto.risposte.push(
      { data: clienteFinto({ id: 'c-0003', ragione_sociale: 'Nuova Prova Srl' }), error: null },
      { data: [clienteFinto()], error: null }
    )
    fireEvent.click(within(scheda).getByRole('button', { name: 'Crea cliente' }))
    // Doppio clic nello stesso giro: un cliente solo (verdetto sulla #96, osservazione 8).
    fireEvent.click(within(scheda).getByRole('button', { name: 'Crea cliente' }))
    expect(await screen.findByText(/^Cliente creato alle \d{2}:\d{2}\.$/)).toBeTruthy()
    expect(chiamatePer('clienti', 'insert')).toHaveLength(1)
    expect(chiamatePer('clienti', 'insert')[0].passi.find(([p]) => p === 'insert')?.[1][0]).toMatchObject({
      ragione_sociale: 'Nuova Prova Srl',
    })
  })

  it('anomalia del 13/10 riprodotta: «Salva modifiche» senza cambiamenti non scrive, e l\'esito sta accanto al pulsante', async () => {
    await apriPagina()
    fireEvent.click(screen.getByRole('button', { name: 'Apri la scheda di Cliente Prova Srl' }))
    const scheda = screen.getByRole('region', { name: 'Scheda cliente' })
    const salva = within(scheda).getByRole('button', { name: 'Salva modifiche' })
    // Cinque clic (o cinque Invio): con la #96 erano cinque PATCH, e la conferma
    // compariva in cima alla pagina. Ora nessuna scrittura, e lo dice qui.
    for (let i = 0; i < 5; i++) fireEvent.click(salva)
    expect(chiamatePer('clienti', 'update')).toHaveLength(0)
    expect(within(scheda).getByText('Nessuna modifica da salvare.')).toBeTruthy()
    // Con una modifica: una scrittura, col lock, e l'esito accanto al pulsante.
    fireEvent.change(within(scheda).getByLabelText('Note'), { target: { value: 'Nota finta' } })
    supabaseFinto.risposte.push({ data: clienteFinto({ note: 'Nota finta', updated_at: 'dopo' }), error: null }, { data: [clienteFinto()], error: null })
    fireEvent.click(salva)
    fireEvent.click(salva)
    expect(await within(scheda).findByText(/^Modifiche salvate alle \d{2}:\d{2}\.$/)).toBeTruthy()
    const update = chiamatePer('clienti', 'update')
    expect(update).toHaveLength(1)
    expect(update[0].passi.filter(([p]) => p === 'eq').map(([, a]) => a)).toEqual([
      ['id', 'c-0001'],
      ['updated_at', clienteFinto().updated_at],
    ])
    // Dopo il salvataggio la scheda resta aperta sul pulsante: un altro clic non riscrive.
    fireEvent.click(salva)
    expect(chiamatePer('clienti', 'update')).toHaveLength(1)
  })

  it('«Elimina» non c\'è per chi non è admin', async () => {
    await apriPagina()
    fireEvent.click(screen.getByRole('button', { name: 'Apri la scheda di Cliente Prova Srl' }))
    expect(screen.getByRole('region', { name: 'Scheda cliente' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Elimina' })).toBeNull()
  })

  it('l\'admin non elimina un cliente con preventivi: il messaggio lo dice e nessuna DELETE parte', async () => {
    useAuthStore.setState({ isAdmin: true })
    const conferma = vi.spyOn(window, 'confirm')
    await apriPagina()
    fireEvent.click(screen.getByRole('button', { name: 'Apri la scheda di Cliente Prova Srl' }))
    supabaseFinto.risposte.push({ count: 2, error: null })
    fireEvent.click(screen.getByRole('button', { name: 'Elimina' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Il cliente ha 2 preventivi: non si può eliminare.')
    expect(conferma).not.toHaveBeenCalled()
    expect(chiamatePer('clienti', 'delete')).toHaveLength(0)
  })

  it('l\'admin elimina un cliente senza preventivi, dopo la conferma', async () => {
    useAuthStore.setState({ isAdmin: true })
    const nativa = vi.spyOn(window, 'confirm')
    await apriPagina()
    fireEvent.click(screen.getByRole('button', { name: 'Apri la scheda di Cliente Prova Srl' }))
    supabaseFinto.risposte.push({ count: 0, error: null })
    fireEvent.click(screen.getByRole('button', { name: 'Elimina' }))
    // La conferma del design system, coi verbi: «Torna indietro» non elimina.
    const dialogo = await screen.findByRole('alertdialog', { name: 'Eliminare Cliente Prova Srl dall’anagrafica?' })
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Torna indietro' }))
    expect(chiamatePer('clienti', 'delete')).toHaveLength(0)
    supabaseFinto.risposte.push({ count: 0, error: null }, { data: [{ id: 'c-0001' }], error: null }, { data: [SECONDO], error: null })
    fireEvent.click(screen.getByRole('button', { name: 'Elimina' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Elimina il cliente' }))
    expect(nativa).not.toHaveBeenCalled()
    expect(await screen.findByText('Cliente eliminato.')).toBeTruthy()
    expect(chiamatePer('clienti', 'delete')[0].passi.find(([p]) => p === 'eq')?.[1]).toEqual(['id', 'c-0001'])
    await waitFor(() => expect(screen.queryByText('Cliente Prova Srl')).toBeNull())
  })

  it('«Usa nel preventivo» collega il cliente e ne mette i dati nel preventivo', async () => {
    await apriPagina()
    fireEvent.click(screen.getByRole('button', { name: 'Apri la scheda di Cliente Prova Srl' }))
    fireEvent.click(screen.getByRole('button', { name: 'Usa nel preventivo' }))
    const s = useQuoteStore.getState()
    expect(s.archivio.clienteId).toBe('c-0001')
    expect(s.preventivo.cliente).toMatchObject({ nome: 'Cliente Prova Srl', email: EMAIL_FINTA })
  })
})

describe('ClientForm — il cliente si sceglie nella finestra condivisa (L21-B)', () => {
  it('nessuna lettura dell\'anagrafica dal form; «Scegli il cliente» apre la scelta; un cliente collegato altrove aggiorna i campi', async () => {
    const scegli = vi.fn()
    render(<ClientForm onScegliCliente={scegli} />)
    expect(supabaseFinto.chiamate).toHaveLength(0)
    expect(screen.queryByRole('button', { name: 'Nuovo cliente' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Scegli il cliente' }))
    expect(scegli).toHaveBeenCalledTimes(1)
    // Collegato dalla barra o da «Genera»: il form, già montato, lo mostra.
    act(() => useQuoteStore.getState().collegaCliente('c-0002', clienteDaArchivio(SECONDO as never)))
    await waitFor(() => expect(screen.getByDisplayValue('Bottega Finta Snc')).toBeTruthy())
    expect(screen.getByDisplayValue('00000 Città di Prova (XX)')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Cambia cliente' })).toBeTruthy()
  })

  it('il numero non si scrive a mano: «Non ancora salvato» con la nota, finché il database non lo assegna', () => {
    render(<ClientForm />)
    const numero = screen.getByDisplayValue('Non ancora salvato') as HTMLInputElement
    expect(numero.readOnly).toBe(true)
    expect(screen.getByText('Il numero arriva al primo salvataggio.')).toBeTruthy()
  })
})

describe('ClientiPage — stati vuoti col passo dopo (L21-B, § 3.7)', () => {
  it('anagrafica vuota: «Nessun cliente ancora» con «Nuovo cliente»', async () => {
    supabaseFinto.risposte.push({ data: [], error: null })
    render(<ClientiPage />)
    expect(await screen.findByText('Nessun cliente ancora.')).toBeTruthy()
    const nuovi = screen.getAllByRole('button', { name: 'Nuovo cliente' })
    fireEvent.click(nuovi[nuovi.length - 1])
    expect(screen.getByRole('region', { name: 'Nuovo cliente' })).toBeTruthy()
  })

  it('ricerca senza risultati: «Nessun cliente trovato per "…"» con «Crea "…"», che apre la scheda con la ragione sociale scritta', async () => {
    await apriPagina()
    fireEvent.change(screen.getByLabelText('Cerca nei clienti'), { target: { value: 'Nuova Finta Srl' } })
    expect(screen.getByText('Nessun cliente trovato per "Nuova Finta Srl".')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Crea "Nuova Finta Srl"' }))
    const scheda = screen.getByRole('region', { name: 'Nuovo cliente' })
    expect((within(scheda).getByLabelText(/Ragione sociale/) as HTMLInputElement).value).toBe('Nuova Finta Srl')
  })
})

describe('presidio della pagina: nessuna riga di cliente nella console', () => {
  it('elenco, ricerca, scheda, salvataggio con errore: nessun log con email, telefono o ragione sociale finti', async () => {
    const spia = spiaConsole()
    spia.avvia()
    try {
      await apriPagina()
      fireEvent.change(screen.getByLabelText('Cerca nei clienti'), { target: { value: 'example' } })
      fireEvent.click(screen.getByRole('button', { name: 'Apri la scheda di Cliente Prova Srl' }))
      fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Nota finta' } })
      supabaseFinto.risposte.push({ data: null, error: { code: '23505', details: DATI_FINTI.join(' ') } })
      fireEvent.click(screen.getByRole('button', { name: 'Salva modifiche' }))
      expect(await screen.findByText(/Un altro salvataggio è arrivato prima/)).toBeTruthy()
      expect(spia.trovati(DATI_FINTI)).toEqual([])
    } finally {
      spia.ripristina()
    }
  })
})

describe('ClientiPage — revisione funzionale del 14/10 sulla #97', () => {
  it('#5: «Modifiche salvate alle…» sparisce appena si modifica di nuovo', async () => {
    await apriPagina()
    fireEvent.click(screen.getByRole('button', { name: 'Apri la scheda di Cliente Prova Srl' }))
    const scheda = screen.getByRole('region', { name: 'Scheda cliente' })
    fireEvent.change(within(scheda).getByLabelText('Note'), { target: { value: 'Nota finta' } })
    supabaseFinto.risposte.push({ data: clienteFinto({ note: 'Nota finta', updated_at: 'dopo' }), error: null }, { data: [clienteFinto()], error: null })
    fireEvent.click(within(scheda).getByRole('button', { name: 'Salva modifiche' }))
    expect(await within(scheda).findByText(/^Modifiche salvate alle \d{2}:\d{2}\.$/)).toBeTruthy()
    fireEvent.change(within(scheda).getByLabelText('Note'), { target: { value: 'Nota finta, cambiata' } })
    expect(within(scheda).queryByText(/^Modifiche salvate alle/)).toBeNull()
  })

  it('#9: la prima lettura dell\'anagrafica fallisce: il motivo con «Riprova», che la rilegge', async () => {
    supabaseFinto.risposte.push({ data: null, error: { code: '42501' } })
    render(<ClientiPage />)
    const avviso = await screen.findByRole('alert')
    expect(avviso.textContent).toContain('Operazione non consentita per questo account.')
    supabaseFinto.risposte.push({ data: [clienteFinto()], error: null })
    fireEvent.click(within(avviso).getByRole('button', { name: 'Riprova' }))
    expect(await screen.findByText('Cliente Prova Srl')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

// Revisione L15-L21: U1, U2, U14, U17, U19 sull'anagrafica. jsdom non impagina:
// per U1 e U17 si provano le classi che reggono le misure del revisore.
describe('ClientiPage — mobile, scheda e annunci (U1, U2, U14, U17, U19)', () => {
  it('U1: su mobile le righe sono schede (niente scorrimento laterale) e lo span sr-only non allarga la pagina', async () => {
    await apriPagina()
    const tabella = screen.getByRole('table')
    expect(tabella.className).not.toMatch(/(^|\s)min-w-\[/)
    expect(tabella.className).toContain('md:min-w-[560px]')
    expect(tabella.parentElement?.className).toContain('relative')
    expect(tabella.querySelector('thead')?.className).toContain('max-md:sr-only')
    expect(tabella.querySelector('tbody tr')?.className).toContain('max-md:flex')
  })

  it('U2: «Scheda» porta la scheda in vista e il focus sul primo campo', async () => {
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    await apriPagina()
    fireEvent.click(screen.getByRole('button', { name: 'Apri la scheda di Bottega Finta Snc' }))
    const scheda = screen.getByRole('region', { name: 'Scheda cliente' })
    await waitFor(() => expect(document.activeElement).toBe(within(scheda).getByLabelText(/Ragione sociale/)))
    expect(scroll).toHaveBeenCalled()
  })

  it('U14: con modifiche non salvate, aprire un altro cliente o chiudere chiede prima', async () => {
    await apriPagina()
    fireEvent.click(screen.getByRole('button', { name: 'Apri la scheda di Cliente Prova Srl' }))
    const scheda = screen.getByRole('region', { name: 'Scheda cliente' })
    fireEvent.change(within(scheda).getByLabelText('Telefono'), { target: { value: '000 1111111' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apri la scheda di Bottega Finta Snc' }))
    const domanda = await screen.findByRole('alertdialog', { name: 'Lasciare le modifiche non salvate?' })
    fireEvent.click(within(domanda).getByRole('button', { name: 'Torna alla scheda' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect((within(screen.getByRole('region', { name: 'Scheda cliente' })).getByLabelText('Telefono') as HTMLInputElement).value).toBe('000 1111111')
    fireEvent.click(within(screen.getByRole('region', { name: 'Scheda cliente' })).getByRole('button', { name: 'Chiudi' }))
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Lascia le modifiche' }))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Scheda cliente' })).toBeNull())
  })

  it('U19: l’esito della ricerca è annunciato (output sempre nel DOM)', async () => {
    await apriPagina()
    const prima = screen.getAllByRole('status')
    fireEvent.change(screen.getByLabelText('Cerca nei clienti'), { target: { value: 'nessuno così' } })
    const annuncio = screen.getAllByRole('status').find((n) => n.textContent === 'Nessun cliente trovato per "nessuno così".')
    // Lo stesso nodo di prima: un nodo nuovo, nato già pieno, può non essere annunciato.
    expect(prima).toContain(annuncio)
  })

  it('U17: «Nuovo cliente» e «Scheda» sono bersagli da 44 px su mobile', async () => {
    await apriPagina()
    expect(screen.getAllByRole('button', { name: 'Nuovo cliente' })[0].className).toMatch(/\bmin-h-11\b/)
    expect(screen.getByRole('button', { name: 'Apri la scheda di Bottega Finta Snc' }).className).toMatch(/\bmin-h-11\b/)
  })
})
