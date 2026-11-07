import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

// CucinePage → quoteStore/AppShell → supabase: mock minimale (hermetico),
// come PortePage.test.tsx.
vi.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: () => ({}) } },
  LISTINI_BUCKET: 'Listini',
}))

import { CucinePage } from '@/components/cucine/CucinePage'
import { useQuoteStore } from '@/store/quoteStore'
import { usePricelistStore } from '@/store/pricelistStore'
import { validatoPerTest } from '@/test-utils/listinoValidato'
import { listinoCucinaFinto } from '@/test-utils/catalogoCucinaFinto'

// Listino cucine finto nello store, come dal bucket: i prezzi di vendita veri
// non entrano nei test (D7).
beforeEach(() => usePricelistStore.setState({ cucine: validatoPerTest(listinoCucinaFinto) }))

// ANTA IN VETRO VISARM: voce base a 170 € nel catalogo finto → numeri puliti (no separatore migliaia).
const ANTA_QTY = /Quantità ANTA IN VETRO VISARM/i

describe('CucinePage — configuratore', () => {
  beforeEach(() => useQuoteStore.getState().resetAll())
  afterEach(() => cleanup())

  it('empty-state: heading + accordion presenti, riepilogo vuoto, e «Genera» non nel riepilogo (sta nella barra, L21-B)', () => {
    render(<CucinePage />)
    expect(screen.getByRole('heading', { name: 'Cucine' })).toBeTruthy()
    // Accordion base aperto di default → l'input della voce è presente.
    expect(screen.getByLabelText(ANTA_QTY)).toBeTruthy()
    // Riepilogo: nessuna voce ancora.
    expect(screen.getByText(/Nessuna voce\. Configura la cucina/i)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Genera Preventivo/i })).toBeNull()
  })

  it('una voce aggiorna il riepilogo live (primo totale → progettazione)', () => {
    render(<CucinePage />)
    fireEvent.change(screen.getByLabelText(ANTA_QTY), { target: { value: '2' } })
    // primoTotale = 170 × 2 = 340 → progettazione 10% = 34.
    expect(screen.getAllByText('€ 340,00').length).toBeGreaterThan(0) // primo totale + totale cucina
    expect(screen.getByText('+ € 34,00')).toBeTruthy() // Progettazione
    // La riga "nessuna voce" sparisce (sezione non più vuota).
    expect(screen.queryByText(/Nessuna voce\. Configura/i)).toBeNull()
  })

  it('adeguamento al 12,5%: l\'etichetta del riepilogo dice 12,5%, non 13% (O18)', () => {
    const s = useQuoteStore.getState()
    s.setVoceQuantita('anta-vetro-visarm', 1)
    s.setAdeguamentoCucina(0.125)
    render(<CucinePage />)
    expect(screen.getByText('Adeguamento (12,5%)')).toBeTruthy()
    expect(screen.getByText('Progettazione 10%')).toBeTruthy()
  })

  it('toggle moltiplicatore applica la % sul primo totale (casse +10%)', () => {
    render(<CucinePage />)
    fireEvent.change(screen.getByLabelText(ANTA_QTY), { target: { value: '2' } }) // primoTotale 340

    // Apri il pannello "Casse & Ante", poi attiva Casse +10%.
    fireEvent.click(screen.getByRole('button', { name: /Casse & Ante/i }))
    fireEvent.click(screen.getByLabelText('Casse +10%'))

    // casse = 340 × 10% = 34 → totale cucina 374. (progettazione diventa 37 su 374.)
    expect(screen.getAllByText('+ € 34,00').length).toBeGreaterThan(0) // riga Casse (+ anteprima pannello)
    expect(screen.getByText('€ 374,00')).toBeTruthy() // Totale cucina aggiornato
    expect(screen.getByText('+ € 37,00')).toBeTruthy() // Progettazione ora su 374
  })

  it('spunta «Profondità oltre 65 cm (+20%)» (L25): +20% di casse e ante nel totale, riga nel riepilogo solo se attiva', () => {
    render(<CucinePage />)
    fireEvent.change(screen.getByLabelText(ANTA_QTY), { target: { value: '2' } }) // primoTotale 340
    fireEvent.click(screen.getByRole('button', { name: /Casse & Ante/i }))
    expect(screen.queryByText('Profondità oltre 65 cm')).toBeNull()

    fireEvent.click(screen.getByLabelText('Profondità oltre 65 cm (+20%)'))
    expect(useQuoteStore.getState().sezioni.cucine?.profonditaOltre65).toBe(true)
    // 20% di 340 = 68 → totale cucina 408; progettazione 10% su 408 = 41.
    expect(screen.getByText('Profondità oltre 65 cm').parentElement!.textContent).toContain('+ € 68,00')
    expect(screen.getByText('€ 408,00')).toBeTruthy()
    expect(screen.getByText('+ € 41,00')).toBeTruthy()
    // Non è l'adeguamento: il suo campo resta al 20% di default.
    expect((screen.getByLabelText('Adeguamento') as HTMLInputElement).value).toBe('20')

    fireEvent.click(screen.getByLabelText('Profondità oltre 65 cm (+20%)'))
    expect(screen.queryByText('Profondità oltre 65 cm')).toBeNull()
    expect(screen.getAllByText('€ 340,00').length).toBeGreaterThan(0)
  })

  it('quantità frazionaria: voce, casse e totale cucina sono importi interi dell\'engine (D4)', () => {
    render(<CucinePage />)
    fireEvent.change(screen.getByLabelText(ANTA_QTY), { target: { value: '2.15' } }) // 170 × 2,15 = 365,50 → 366
    fireEvent.click(screen.getByRole('button', { name: /Casse & Ante/i }))
    fireEvent.click(screen.getByLabelText('Casse +10%'))
    // Casse = 10% di 366 = 36,60 → 37 (il riepilogo ricalcolava 36,60 da sé);
    // totale cucina = 366 + 37 = 403, la somma delle righe che si vedono.
    expect(screen.getAllByText('€ 366,00').length).toBeGreaterThan(0)
    expect(screen.getAllByText('+ € 37,00')).toHaveLength(2) // riga del riepilogo + anteprima del pannello
    expect(screen.queryByText(/36,60/)).toBeNull()
    expect(screen.getByText('€ 403,00')).toBeTruthy()
  })
})

// O5: una voce salvata che il catalogo non conosce più non si vedeva affatto
// (gli accordion girano sul catalogo) e valeva 0 € in silenzio.
describe('CucinePage — voci non più a catalogo (O5)', () => {
  beforeEach(() => useQuoteStore.getState().resetAll())
  afterEach(() => cleanup())

  it('la voce si vede, dice «da definire» con la quantità, e il riepilogo è parziale', () => {
    const s = useQuoteStore.getState()
    s.setVoceQuantita('anta-vetro-visarm', 2) // 340 nel catalogo finto
    s.setVoceQuantita('voce-tolta-dal-catalogo', 3)
    render(<CucinePage />)
    expect(screen.getByText('Voci non più a catalogo')).toBeTruthy()
    expect(screen.getByText('voce-tolta-dal-catalogo')).toBeTruthy()
    expect(screen.getByText('3 · da definire')).toBeTruthy()
    expect(screen.getByText('Totale parziale cucina')).toBeTruthy()
    expect(screen.getByText('1 voce da definire')).toBeTruthy()
    // Il totale resta quello delle voci a catalogo.
    expect(screen.getAllByText('€ 340,00').length).toBeGreaterThan(0)
  })

  it('«Togli» la toglie dal preventivo, e il riepilogo torna pieno', () => {
    const s = useQuoteStore.getState()
    s.setVoceQuantita('anta-vetro-visarm', 2)
    s.setVoceQuantita('voce-tolta-dal-catalogo', 3)
    render(<CucinePage />)
    fireEvent.click(screen.getByRole('button', { name: 'Togli voce-tolta-dal-catalogo' }))
    expect(useQuoteStore.getState().sezioni.cucine!.voci).toEqual([{ voceId: 'anta-vetro-visarm', quantita: 2 }])
    expect(screen.queryByText('Voci non più a catalogo')).toBeNull()
    expect(screen.getByText('Totale cucina')).toBeTruthy()
    expect(screen.queryByText(/da definire/)).toBeNull()
  })

  it('presidio: con tutte le voci a catalogo il pannello non c è', () => {
    useQuoteStore.getState().setVoceQuantita('anta-vetro-visarm', 2)
    render(<CucinePage />)
    expect(screen.queryByText('Voci non più a catalogo')).toBeNull()
    expect(screen.queryByText(/da definire/)).toBeNull()
  })
})

// PR 10b-2: la pagina gira sul catalogo composto dal listino cucine nello store.
describe('CucinePage — dal listino cucine (D7)', () => {
  beforeEach(() => useQuoteStore.getState().resetAll())
  afterEach(() => cleanup())

  const senzaAnta = () =>
    validatoPerTest({
      ...listinoCucinaFinto,
      prezzi: listinoCucinaFinto.prezzi.filter((p) => p.id !== 'anta-vetro-visarm'),
      vociMancanti: ['anta-vetro-visarm'],
    })

  it('senza listino cucine la pagina mostra lo stato del listino, non il configuratore', () => {
    usePricelistStore.setState({ cucine: null })
    render(<CucinePage />)
    expect(screen.getByText('Listino Cucine non caricato')).toBeTruthy()
    expect(screen.queryByLabelText(ANTA_QTY)).toBeNull()
    expect(screen.queryByRole('button', { name: /Genera Preventivo/i })).toBeNull()
  })

  it('una voce che il listino non prezza non si offre negli accordion', () => {
    usePricelistStore.setState({ cucine: senzaAnta() })
    render(<CucinePage />)
    expect(screen.queryByLabelText(ANTA_QTY)).toBeNull()
    expect(screen.getByLabelText(/Quantità COLONNA 210 LACCATO/i)).toBeTruthy()
  })

  it('le due cause sono distinte: voce senza prezzo nel listino (col nome) e voce non più a catalogo (con l id)', () => {
    usePricelistStore.setState({ cucine: senzaAnta() })
    const s = useQuoteStore.getState()
    s.setVoceQuantita('anta-vetro-visarm', 2)
    s.setVoceQuantita('voce-tolta-dal-catalogo', 3)
    render(<CucinePage />)
    expect(screen.getByText('Voci senza prezzo nel listino caricato')).toBeTruthy()
    expect(screen.getByText('ANTA IN VETRO VISARM 6/8 CON CERNIERE SALICE')).toBeTruthy()
    expect(screen.queryByText('anta-vetro-visarm')).toBeNull()
    expect(screen.getByText('Voci non più a catalogo')).toBeTruthy()
    expect(screen.getByText('voce-tolta-dal-catalogo')).toBeTruthy()
    expect(screen.getByText('2 voci da definire')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Togli ANTA IN VETRO VISARM 6/8 CON CERNIERE SALICE' }))
    expect(useQuoteStore.getState().sezioni.cucine!.voci).toEqual([{ voceId: 'voce-tolta-dal-catalogo', quantita: 3 }])
  })

  it('giorni extra: l etichetta porta la tariffa del listino', () => {
    useQuoteStore.getState().setGiorniExtra(2)
    render(<CucinePage />)
    expect(screen.getByText('Giorni (2 × 170,00 €)')).toBeTruthy() // tariffa del listino finto
    expect(screen.getByText('+ € 340,00')).toBeTruthy()
  })

  it('giorni extra senza tariffa nel listino: «tariffa da definire» e totale parziale', () => {
    usePricelistStore.setState({ cucine: validatoPerTest({ ...listinoCucinaFinto, giornoRate: null }) })
    const s = useQuoteStore.getState()
    s.setVoceQuantita('anta-vetro-visarm', 1)
    s.setGiorniExtra(2)
    render(<CucinePage />)
    expect(screen.getByText('tariffa da definire')).toBeTruthy()
    expect(screen.getByText('Totale parziale cucina')).toBeTruthy()
    expect(screen.getByText('1 voce da definire')).toBeTruthy()
  })
})

// Marco, 12/10: la lente di ricerca delle voci, come in Arredi (CampoRicerca).
describe('CucinePage — ricerca sulle voci (L17)', () => {
  beforeEach(() => useQuoteStore.getState().resetAll())
  afterEach(() => cleanup())

  const cerca = (testo: string) => fireEvent.change(screen.getByLabelText('Cerca voce cucina'), { target: { value: testo } })
  const accordion = (titolo: RegExp) => screen.queryByRole('button', { name: titolo })
  // Le 4 voci col nome che contiene «cassetto», tutte negli Opzionali.
  const CASSETTI = [/Quantità CASSETTO\\CESTONE/, /Quantità CASSETTO BLUM/, /Quantità CASSETTO 120/, /Quantità CASSETTO CON CODA/]

  it('filtra per nome in tutti i blocchi: apre l accordion con risultati, nasconde gli altri, il badge li conta', () => {
    render(<CucinePage />)
    cerca('cassetto')
    // Gli Opzionali erano chiusi: con dei risultati si aprono.
    for (const re of CASSETTI) expect(screen.getByLabelText(re)).toBeTruthy()
    expect(accordion(/^Opzionali/)?.getAttribute('aria-expanded')).toBe('true')
    expect(accordion(/^Opzionali/)?.textContent).toBe('Opzionali4')
    expect(screen.queryByLabelText(/Quantità GOLA IN ALLUMINIO/)).toBeNull()
    // Gli accordion senza risultati non si mostrano.
    expect(accordion(/^Basi, colonne e ante/)).toBeNull()
    expect(accordion(/^Casse & Ante/)).toBeNull()
    expect(accordion(/^Open/)).toBeNull()
  })

  it('maiuscole e accenti non contano', () => {
    render(<CucinePage />)
    for (const testo of ['CASSETTO', '  Cassètto ']) {
      cerca(testo)
      for (const re of CASSETTI) expect(screen.getByLabelText(re)).toBeTruthy()
      expect(accordion(/^Opzionali/)?.textContent).toBe('Opzionali4')
    }
  })

  it('nessun risultato: «Nessuna voce trovata» e il pulsante che azzera la ricerca', () => {
    render(<CucinePage />)
    cerca('lavello')
    expect(screen.getByText('Nessuna voce trovata')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^(Basi|Casse|Opzionali|Open)/ })).toBeNull()
    // Un verbo solo per la ricerca (U10): «Cancella ricerca», come la X del campo; e l'esito è annunciato (U19).
    expect(screen.getAllByRole('status').some((n) => n.textContent === 'Nessuna voce trovata')).toBe(true)
    fireEvent.click(screen.getAllByRole('button', { name: 'Cancella ricerca' }).at(-1)!)
    expect((screen.getByLabelText('Cerca voce cucina') as HTMLInputElement).value).toBe('')
    expect(screen.queryByText('Nessuna voce trovata')).toBeNull()
    expect(screen.getByLabelText(ANTA_QTY)).toBeTruthy()
  })

  it('a ricerca vuota torna tutto com era: accordion aperti dall utente, badge, quantità nello store', () => {
    render(<CucinePage />)
    fireEvent.click(accordion(/^Opzionali/)!) // aperto dall'utente
    fireEvent.change(screen.getByLabelText(ANTA_QTY), { target: { value: '2' } })
    cerca('isola')
    // La voce scelta non corrisponde: sparisce dalla vista, non dallo store.
    expect(screen.queryByLabelText(ANTA_QTY)).toBeNull()
    expect(useQuoteStore.getState().sezioni.cucine?.voci).toEqual([{ voceId: 'anta-vetro-visarm', quantita: 2 }])
    // Chiudere un accordion durante la ricerca non tocca quelli di prima.
    fireEvent.click(accordion(/^Open/)!)
    expect(accordion(/^Open/)?.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(screen.getByRole('button', { name: 'Cancella ricerca' }))
    expect(accordion(/^Basi, colonne e ante/)?.getAttribute('aria-expanded')).toBe('true')
    expect(accordion(/^Opzionali/)?.getAttribute('aria-expanded')).toBe('true')
    expect(accordion(/^Open/)?.getAttribute('aria-expanded')).toBe('false')
    expect(accordion(/^Basi, colonne e ante/)?.textContent).toBe('Basi, colonne e ante1')
    expect((screen.getByLabelText(ANTA_QTY) as HTMLInputElement).value).toBe('2')
  })
})
