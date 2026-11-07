import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, within, act, waitFor } from '@testing-library/react'

vi.mock('@/lib/supabase', async () => ({
  supabase: (await import('@/test-utils/supabaseFinto')).supabaseFinto.client,
  LISTINI_BUCKET: 'Listini',
}))

import { supabaseFinto, EMAIL_FINTA, DATI_FINTI } from '@/test-utils/supabaseFinto'
import { spiaConsole } from '@/test-utils/spiaConsole'
import { useAuthStore } from '@/store/authStore'
import type { User } from '@supabase/supabase-js'
import { PreventiviPage } from '@/components/preventivi/PreventiviPage'
import { useQuoteStore, initialPreventivo, QUOTE_VERSION } from '@/store/quoteStore'
import { FALLBACK_PROGETTO_VALORE } from '@/store/quoteFallbacks'
import { useSalvataggio } from '@/store/salvataggioStore'
import { MSG_SENZA_CLIENTE } from '@/lib/preventiviDb'
import type { PreventivoSalvato } from '@/types/archivio'

const ANNO = new Date().getFullYear()
const AGG = '2026-10-13T10:00:00.000001+00:00'
const SALVATO: PreventivoSalvato = { id: 'p-1', anno: ANNO, numero: 1, revisione: 0, stato: 'bozza', updatedAt: AGG }
const riga = (over: Record<string, unknown> = {}) => ({
  id: 'p-1', anno: ANNO, numero: 1, revisione: 0, stato: 'bozza', updated_at: AGG,
  totale_imponibile: 250, cliente_id: 'c-0001', clienti: { ragione_sociale: 'Cliente Prova Srl' }, ...over,
})
const ELENCO = [
  riga({ id: 'p-2', numero: 2, stato: 'inviato', clienti: { ragione_sociale: 'Bottega Finta Snc' } }),
  riga(),
]

/** Un preventivo aperto con un cliente scelto e una riga a valore da 250 €. */
function preparaStore(salvato: PreventivoSalvato | null = null) {
  const s = useQuoteStore.getState()
  s.nuovoPreventivo()
  s.collegaCliente('c-0001', { ...initialPreventivo.cliente, nome: 'Cliente Prova Srl', email: EMAIL_FINTA })
  useQuoteStore.setState((st) => ({
    sezioni: { ...st.sezioni, progettoValore: { ...FALLBACK_PROGETTO_VALORE, righe: [{ id: 'v1', descrizione: 'Voce di prova', prezzo: 250 }] } },
  }))
  if (salvato) s.impostaSalvato(salvato)
}

async function apriPagina(elenco: unknown[] = ELENCO) {
  supabaseFinto.risposte.push({ data: elenco, error: null })
  render(<PreventiviPage />)
  if (elenco.length > 0) await screen.findAllByRole('button', { name: /^Apri il preventivo/ })
  else await screen.findByText('Nessun preventivo salvato.')
}

const pannello = () => screen.getByRole('region', { name: 'Preventivo aperto' })

beforeEach(() => {
  supabaseFinto.reset()
  useQuoteStore.getState().nuovoPreventivo()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('PreventiviPage (L21)', () => {
  it('il preventivo aperto: «Non ancora salvato» finché non ha un numero; poi numero e stato, e lo stato si cambia salvando', async () => {
    preparaStore()
    await apriPagina([])
    expect(within(pannello()).getByText('Non ancora salvato: il numero arriva al primo salvataggio.')).toBeTruthy()
    expect(within(pannello()).queryByRole('button', { name: 'Salva' })).toBeNull()
    cleanup()
    preparaStore(SALVATO)
    await apriPagina([])
    expect(within(pannello()).getByText(`N. ${ANNO}-001 · Bozza`)).toBeTruthy()
    supabaseFinto.risposte.push({ data: riga({ stato: 'inviato', updated_at: 'dopo' }), error: null }, { data: [], error: null })
    fireEvent.change(within(pannello()).getByLabelText('Stato'), { target: { value: 'inviato' } })
    expect(await screen.findByText(`Preventivo N. ${ANNO}-001 salvato come «Inviato».`)).toBeTruthy()
    const update = supabaseFinto.chiamate.find((c) => c.passi.some(([p]) => p === 'update'))
    expect(update?.passi.find(([p]) => p === 'update')?.[1][0]).toMatchObject({ stato: 'inviato', totale_imponibile: 250 })
    expect(useQuoteStore.getState().archivio.preventivo?.stato).toBe('inviato')
  })

  it('l\'elenco si cerca per numero o cliente e si filtra per stato', async () => {
    await apriPagina()
    fireEvent.change(screen.getByLabelText('Cerca nei preventivi'), { target: { value: 'bottega' } })
    expect(screen.queryByRole('button', { name: `Apri il preventivo ${ANNO}-001` })).toBeNull()
    expect(screen.getByRole('button', { name: `Apri il preventivo ${ANNO}-002` })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Cerca nei preventivi'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Filtra per stato'), { target: { value: 'bozza' } })
    expect(screen.queryByRole('button', { name: `Apri il preventivo ${ANNO}-002` })).toBeNull()
    expect(screen.getByRole('button', { name: `Apri il preventivo ${ANNO}-001` })).toBeTruthy()
  })

  it('«Apri» carica il preventivo salvato nell\'app, col suo cliente e il suo lock', async () => {
    await apriPagina()
    const dati = {
      versione: QUOTE_VERSION,
      preventivo: { ...initialPreventivo, oggettoPreventivo: 'Cucina di prova', cliente: { ...initialPreventivo.cliente, nome: 'Cliente Prova Srl' } },
      sezioni: {},
    }
    supabaseFinto.risposte.push({ data: { ...riga(), dati }, error: null })
    fireEvent.click(screen.getByRole('button', { name: `Apri il preventivo ${ANNO}-001` }))
    expect(await screen.findByText(`Aperto il preventivo N. ${ANNO}-001.`)).toBeTruthy()
    const s = useQuoteStore.getState()
    expect(s.preventivo.oggettoPreventivo).toBe('Cucina di prova')
    // Più l'impronta canonica dello stato aperto: dopo un riavvio dice se ci sono modifiche.
    expect(s.archivio).toEqual({ clienteId: 'c-0001', preventivo: SALVATO, impronta: expect.stringMatching(/^[0-9a-f]{8}-\d+$/) })
  })

  it('«Nuova revisione»: stesso numero, revisione successiva', async () => {
    preparaStore({ ...SALVATO, stato: 'inviato' })
    await apriPagina()
    supabaseFinto.risposte.push(
      { data: { revisione: 0 }, error: null },
      { data: riga({ id: 'p-3', revisione: 1 }), error: null },
      { data: ELENCO, error: null }
    )
    fireEvent.click(within(pannello()).getByRole('button', { name: 'Nuova revisione' }))
    expect(await screen.findByText(`Salvata la revisione N. ${ANNO}-001 rev. 1.`)).toBeTruthy()
    expect(useQuoteStore.getState().archivio.preventivo).toMatchObject({ id: 'p-3', numero: 1, revisione: 1 })
  })

  it('«Annulla» dalla lista, dopo la conferma: stato annullato, e il preventivo aperto non si salva più sopra', async () => {
    preparaStore(SALVATO)
    const nativa = vi.spyOn(window, 'confirm')
    await apriPagina()
    supabaseFinto.risposte.push({ data: riga({ stato: 'annullato' }), error: null }, { data: [riga({ stato: 'annullato' })], error: null })
    fireEvent.click(screen.getByRole('button', { name: `Annulla il preventivo ${ANNO}-001` }))
    const dialogo = await screen.findByRole('alertdialog', { name: `Annullare il preventivo N. ${ANNO}-001?` })
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Annulla il preventivo' }))
    expect(nativa).not.toHaveBeenCalled()
    expect(await screen.findByText(`Preventivo N. ${ANNO}-001 annullato.`)).toBeTruthy()
    expect(useQuoteStore.getState().archivio.preventivo?.stato).toBe('annullato')
    expect(within(pannello()).queryByLabelText('Stato')).toBeNull()
    expect(supabaseFinto.chiamate.find((c) => c.passi.some(([p]) => p === 'update'))?.passi.find(([p]) => p === 'update')?.[1][0]).toEqual({
      stato: 'annullato',
    })
  })
})

describe('PreventiviPage — stato vuoto e «Come funziona» (L21-B, §§ 3.7 e 3.8)', () => {
  beforeEach(() => {
    localStorage.clear()
    useAuthStore.setState({ user: { id: 'u-prova' } as User })
  })
  afterEach(() => useAuthStore.setState({ user: null }))

  it('nessun preventivo salvato: lo dice, con «Nuovo preventivo» accanto', async () => {
    await apriPagina([])
    const lista = screen.getByText('Nessun preventivo salvato.').parentElement as HTMLElement
    expect(within(lista).getByRole('button', { name: 'Nuovo preventivo' })).toBeTruthy()
  })

  it('«Come funziona» in tre righe; «Ho capito» lo chiude e non torna per quell\'utente (chiave con il solo id)', async () => {
    await apriPagina([])
    const aiuto = screen.getByRole('region', { name: 'Come funziona' })
    expect(within(aiuto).getAllByRole('listitem').map((l) => l.textContent)).toEqual([
      'Scegli il cliente («Scegli il cliente», nella barra del preventivo).',
      'Compila le sezioni: Cucine, Arredi, Porte, Progetto a valore, Gres.',
      '«Genera Preventivo»: salva e crea il PDF.',
    ])
    fireEvent.click(within(aiuto).getByRole('button', { name: 'Ho capito' }))
    expect(screen.queryByRole('region', { name: 'Come funziona' })).toBeNull()
    expect(localStorage.getItem('coletta-aiuto-preventivi-visto:u-prova')).toBe('1')
    cleanup()
    await apriPagina([])
    expect(screen.queryByRole('region', { name: 'Come funziona' })).toBeNull()
    cleanup()
    useAuthStore.setState({ user: { id: 'u-altro' } as User })
    await apriPagina([])
    expect(screen.getByRole('region', { name: 'Come funziona' })).toBeTruthy()
  })

  it('presidio della pagina: elenco, apertura con errore e annullo non loggano email, telefono né ragione sociale finti', async () => {
    const spia = spiaConsole()
    spia.avvia()
    try {
      preparaStore(SALVATO)
      await apriPagina([riga({ clienti: { ragione_sociale: DATI_FINTI[2] } })])
      supabaseFinto.risposte.push({ data: null, error: { code: '42501', message: DATI_FINTI.join(' ') } })
      fireEvent.click(screen.getByRole('button', { name: `Apri il preventivo ${ANNO}-001` }))
      fireEvent.click(await screen.findByRole('button', { name: 'Apri e sostituisci' }))
      expect(await screen.findByText('Operazione non consentita per questo account.')).toBeTruthy()
      expect(spia.trovati(DATI_FINTI)).toEqual([])
    } finally {
      spia.ripristina()
    }
  })
})

describe('PreventiviPage — revisione funzionale del 14/10 sulla #97', () => {
  it('#9: la prima lettura dell\'elenco fallisce: il motivo con «Riprova»; riletto, l\'avviso sparisce', async () => {
    supabaseFinto.risposte.push({ data: null, error: { code: '42501' } })
    render(<PreventiviPage />)
    const avviso = await screen.findByRole('alert')
    expect(avviso.textContent).toContain('Operazione non consentita per questo account.')
    supabaseFinto.risposte.push({ data: ELENCO, error: null })
    fireEvent.click(within(avviso).getByRole('button', { name: 'Riprova' }))
    expect(await screen.findByRole('button', { name: `Apri il preventivo ${ANNO}-001` })).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('#15: i testi non dicono «in alto»: su mobile la barra del preventivo sta in basso', async () => {
    localStorage.clear()
    expect(MSG_SENZA_CLIENTE).not.toMatch(/in alto|in basso/)
    expect(MSG_SENZA_CLIENTE).toContain('nella barra del preventivo')
    await apriPagina([])
    const aiuto = screen.getByRole('region', { name: 'Come funziona' })
    expect(aiuto.textContent).not.toMatch(/in alto|in basso/)
    expect(aiuto.textContent).toContain('nella barra del preventivo')
  })

  it('c: mentre un salvataggio è in corso il select Stato è spento, col motivo accanto (non torna indietro in silenzio)', async () => {
    preparaStore(SALVATO)
    await apriPagina([])
    try {
      act(() => useSalvataggio.setState({ inCorso: true }))
      expect(within(pannello()).getByLabelText('Stato').hasAttribute('disabled')).toBe(true)
      expect(within(pannello()).getByText('Operazione in corso…')).toBeTruthy()
      act(() => useSalvataggio.setState({ inCorso: false }))
      expect(within(pannello()).getByLabelText('Stato').hasAttribute('disabled')).toBe(false)
    } finally {
      useSalvataggio.setState({ inCorso: false })
    }
  })
})

// Strada A, transizioni di stato (revisione automatica sulla 0005): chi non è
// admin manda lo stato solo avanti, e la pagina non offre ciò che il database rifiuta.
describe('PreventiviPage — il select Stato offre solo le transizioni ammesse', () => {
  const opzioni = () =>
    [...(within(pannello()).getByLabelText('Stato') as HTMLSelectElement).options].map((o) => o.textContent)
  afterEach(() => useAuthStore.setState({ isAdmin: false }))

  it('utente: da bozza tutte e tre; da inviato solo avanti (accettato); da accettato nessun cambio dal select', async () => {
    preparaStore(SALVATO)
    await apriPagina([])
    expect(opzioni()).toEqual(['Bozza', 'Inviato', 'Accettato'])
    cleanup()
    preparaStore({ ...SALVATO, stato: 'inviato' })
    await apriPagina([])
    expect(opzioni()).toEqual(['Inviato', 'Accettato'])
    cleanup()
    preparaStore({ ...SALVATO, stato: 'accettato' })
    await apriPagina([])
    expect(opzioni()).toEqual(['Accettato'])
  })

  it('admin: anche indietro (inviato e accettato in bozza)', async () => {
    useAuthStore.setState({ isAdmin: true })
    preparaStore({ ...SALVATO, stato: 'accettato' })
    await apriPagina([])
    expect(opzioni()).toEqual(['Bozza', 'Inviato', 'Accettato'])
  })
})

// U6 (revisione L15-L21): durante un gesto il pulsante che l'ha aperto restava
// `disabled`, quindi perdeva il focus e alla chiusura della conferma il focus
// finiva sul body. Ora è `aria-disabled`: resta focalizzabile, e il <dialog>
// del browser gli restituisce il focus.
describe('PreventiviPage — il pulsante del gesto tiene il focus durante la conferma (U6)', () => {
  it('«Nuovo preventivo» con la conferma aperta: aria-disabled, non disabled, e ha ancora il focus', async () => {
    preparaStore(SALVATO)
    await apriPagina([])
    const nuovo = within(pannello()).getByRole('button', { name: 'Nuovo preventivo' })
    nuovo.focus()
    fireEvent.click(nuovo)
    await screen.findByRole('alertdialog')
    expect(nuovo.hasAttribute('disabled')).toBe(false)
    expect(nuovo.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Resta su questo' }))
    await waitFor(() => expect(nuovo.getAttribute('aria-disabled')).toBeNull())
  })
})

// Revisione L15-L21: U1, U10, U15, U17, U19 sulla pagina Preventivi.
describe('PreventiviPage — mobile, stato vuoto e annunci (U1, U10, U15, U17, U19)', () => {
  it('U1: su mobile le righe sono schede, lo span sr-only non allarga la pagina; U10: «Annulla preventivo», non «Annulla»', async () => {
    await apriPagina()
    const tabella = screen.getByRole('table')
    expect(tabella.className).not.toMatch(/(^|\s)min-w-\[/)
    expect(tabella.parentElement?.className).toContain('relative')
    expect(tabella.querySelector('thead')?.className).toContain('max-md:sr-only')
    expect(tabella.querySelector('tbody tr')?.className).toContain('max-md:flex')
    expect(screen.getAllByRole('button', { name: /^Annulla il preventivo/ })[0].textContent).toBe('Annulla preventivo')
  })

  it('U15: nessun preventivo salvato ma uno in corso: il passo dopo è salvarlo, non iniziarne uno nuovo', async () => {
    preparaStore()
    await apriPagina([])
    const vuoto = screen.getByText('Nessun preventivo salvato.').parentElement as HTMLElement
    expect(within(vuoto).queryByRole('button', { name: 'Nuovo preventivo' })).toBeNull()
    expect(within(vuoto).getByText(/salvalo con «Salva», nella barra del preventivo/)).toBeTruthy()
  })

  it('U19: «Nessun preventivo trovato.» è annunciato e ha «Azzera filtri»; U17: il filtro dello stato è da 44 px', async () => {
    await apriPagina()
    expect(screen.getByLabelText('Filtra per stato').className).toMatch(/\bmin-h-11\b/)
    fireEvent.change(screen.getByLabelText('Cerca nei preventivi'), { target: { value: 'niente così' } })
    const annuncio = screen.getAllByRole('status').find((n) => n.textContent === 'Nessun preventivo trovato.')
    expect(annuncio).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Azzera filtri' }))
    expect(screen.getAllByRole('button', { name: /^Apri il preventivo/ })).toHaveLength(2)
  })
})
