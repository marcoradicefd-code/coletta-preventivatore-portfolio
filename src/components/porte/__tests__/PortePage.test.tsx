import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

// PortePage → pricelist/quote store → supabase: mock minimale (hermetico).
vi.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: () => ({}) } },
  LISTINI_BUCKET: 'Listini',
}))

import { PortePage } from '@/components/porte/PortePage'
import { usePricelistStore } from '@/store/pricelistStore'
import { useQuoteStore } from '@/store/quoteStore'
import { validatoPerTest } from '@/test-utils/listinoValidato'

const NESSUN_ERRORE = { suMisura: null, marmeria: null, porte: null, cucine: null }

const MSG_PORTE =
  'Errore lettura file Porte: Foglio "modello_porta": intestazione (MODELLO PORTA / PREZZO 2026 / H>215 / H>240) non trovata'

describe('PortePage — i quattro stati del listino', () => {
  beforeEach(() => {
    usePricelistStore.setState({ porte: null, loadingDefaults: false, errors: { ...NESSUN_ERRORE } })
    useQuoteStore.getState().resetAll()
  })
  afterEach(() => cleanup())

  it('non caricato: dice che manca e dove caricarlo', () => {
    render(<PortePage />)
    expect(screen.getByText('Listino Porte non caricato')).toBeTruthy()
  })

  it('in caricamento: NON dice "non caricato" — sarebbe una bugia per un secondo', () => {
    // `loadingDefaults` esisteva già nello store e non lo leggeva nessuno: per
    // tutta la durata della fetch le pagine dichiaravano "non caricato".
    usePricelistStore.setState({ loadingDefaults: true })
    render(<PortePage />)

    expect(screen.queryByText('Listino Porte non caricato')).toBeNull()
    expect(screen.getByText(/caricamento in corso/i)).toBeTruthy()
  })

  it('CARICAMENTO FALLITO: si distingue da "non caricato" e dice il PERCHÉ', () => {
    // I due stati vuoti erano indistinguibili: chi rompeva il listino leggeva
    // "non caricato" e ricaricava lo stesso file rotto, all'infinito.
    usePricelistStore.setState({ errors: { ...NESSUN_ERRORE, porte: MSG_PORTE } })
    render(<PortePage />)

    expect(screen.queryByText('Listino Porte non caricato')).toBeNull()
    expect(screen.getByText(/caricamento .* fallito/i)).toBeTruthy()
    // Il motivo vero del parser, non una parafrasi generica.
    expect(screen.getByText(/PREZZO 2026.*non trovata/)).toBeTruthy()
  })

  it('l errore vince sul caricamento: un retry in corso non nasconde il guasto', () => {
    usePricelistStore.setState({
      loadingDefaults: true,
      errors: { ...NESSUN_ERRORE, porte: MSG_PORTE },
    })
    render(<PortePage />)

    expect(screen.getByText(/caricamento .* fallito/i)).toBeTruthy()
  })

  it('con un listino porte mostra il titolo sezione e il bottone Aggiungi porta', () => {
    usePricelistStore.setState({
      porte: validatoPerTest({
        modelli: [{ nome: 'RAFFAELLA', prezzo2026: 880, h215: 1060, h240: 1150 }],
        optional: [{ nome: 'STIPITI' as const, unita: 'PORTA' as const, prezzo: 150 }],
        aggiornato: 'test',
      }),
    })
    render(<PortePage />)
    expect(screen.getByRole('heading', { name: 'Porte' })).toBeTruthy()
    // "Aggiungi porta" compare sia nel bottone sia nel messaggio lista-vuota →
    // targetto il bottone per ruolo (disambigua i match multipli).
    expect(screen.getByRole('button', { name: /aggiungi porta/i })).toBeTruthy()
  })

  it('un listino presente vince su un errore vecchio: si vede la pagina, non lo stato vuoto', () => {
    // Il fallback del bucket può lasciare un errore in `errors` con il listino
    // caricato lo stesso (upload manuale riuscito dopo un default rotto).
    usePricelistStore.setState({
      errors: { ...NESSUN_ERRORE, porte: MSG_PORTE },
      porte: validatoPerTest({
        modelli: [{ nome: 'RAFFAELLA', prezzo2026: 880, h215: 1060, h240: 1150 }],
        optional: [{ nome: 'STIPITI' as const, unita: 'PORTA' as const, prezzo: 150 }],
        aggiornato: 'test',
      }),
    })
    render(<PortePage />)

    expect(screen.getByRole('heading', { name: 'Porte' })).toBeTruthy()
  })
})

describe('PortePage — riepilogo riga con maniglia', () => {
  const LISTINO = {
    modelli: [{ nome: 'RAFFAELLA', prezzo2026: 880, h215: 1060, h240: 1150 }],
    optional: [{ nome: 'STIPITI' as const, unita: 'PORTA' as const, prezzo: 150 }],
    aggiornato: 'test',
  }
  beforeEach(() => {
    usePricelistStore.setState({ porte: validatoPerTest(LISTINO), loadingDefaults: false, errors: { ...NESSUN_ERRORE } })
    useQuoteStore.getState().resetAll()
  })
  afterEach(() => cleanup())

  function conManiglia(prezzoUnitario?: number) {
    const s = useQuoteStore.getState()
    s.addRigaPorta({ modelloNome: 'RAFFAELLA', altezzaCm: 210 })
    const id = useQuoteStore.getState().sezioni.porte!.righe[0].id
    const base = { qta: 2, modello: 'Olivari Rio', finitura: '' }
    s.setManigliaPorta(id, prezzoUnitario === undefined ? base : { ...base, prezzoUnitario })
  }

  it('maniglia senza prezzo: "· maniglia inclusa"', () => {
    conManiglia()
    render(<PortePage />)
    expect(screen.getByText(/· maniglia inclusa/)).toBeTruthy()
  })

  it('maniglia con prezzo: "· maniglia × 2", non "inclusa"', () => {
    conManiglia(45)
    render(<PortePage />)
    expect(screen.getByText(/· maniglia × 2/)).toBeTruthy()
    expect(screen.queryByText(/maniglia inclusa/)).toBeNull()
  })
})

// Le righe porta senza un importo vero: l'avviso e il trattino venivano da due
// `=== 'irrisolvibile'` senza test (O19). Ora da `avvisoPorta` e `origineValorizzata`.
describe('PortePage — riga porta senza importo: avviso e trattino', () => {
  const LISTINO = {
    modelli: [{ nome: 'GIOTTO', prezzo2026: 700, h215: 900, h240: 1000 }],
    optional: [{ nome: 'STIPITI' as const, unita: 'PORTA' as const, prezzo: 150 }],
    aggiornato: 'test',
  }
  beforeEach(() => {
    usePricelistStore.setState({ porte: validatoPerTest(LISTINO), loadingDefaults: false, errors: { ...NESSUN_ERRORE } })
    useQuoteStore.getState().resetAll()
  })
  afterEach(() => cleanup())

  const semina = (riga: Record<string, unknown>) =>
    useQuoteStore.setState((st) => ({
      sezioni: {
        ...st.sezioni,
        porte: { righe: [{ id: 'p1', modelloNome: 'GIOTTO', altezzaCm: 210, optionals: [], ...riga }], sconto: 0 },
      },
    }))

  it('modello non più nel listino: avviso «da definire» e nessun importo', () => {
    semina({ modelloNome: 'MODELLO SPARITO' })
    render(<PortePage />)
    expect(screen.getByText('Prezzo non più nel listino — da definire, esclusa dal totale')).toBeTruthy()
    expect(screen.getByTestId('totale-porta').textContent).toBe('—')
  })

  it('altezza svuotata: chiede l altezza, niente fascia né importo', () => {
    semina({ altezzaCm: 0 })
    render(<PortePage />)
    expect(screen.getByText("Inserisci l'altezza: esclusa dal totale finché non è completa.")).toBeTruthy()
    expect(screen.getByText(/altezza mancante/)).toBeTruthy()
    expect(screen.queryByText(/fascia/)).toBeNull()
    expect(screen.getByTestId('totale-porta').textContent).toBe('—')
  })

  it('riepilogo: «Totale parziale Porte» con una riga fuori dal totale, «Totale Porte» senza', () => {
    semina({ altezzaCm: 0 })
    render(<PortePage />)
    expect(screen.getByText('Totale parziale Porte')).toBeTruthy()
    cleanup()

    semina({})
    render(<PortePage />)
    expect(screen.getByText('Totale Porte')).toBeTruthy()
    expect(screen.queryByText('Totale parziale Porte')).toBeNull()
  })
})

// Battiscopa a metri lineari (specifica di Antonio, 06/10): altezza × €/cm =
// €/ml, × metri lineari, più la posa. Il blocco UI non aveva nessun test.
describe('PortePage — battiscopa: altezza, metri lineari, posa', () => {
  const LISTINO = {
    modelli: [{ nome: 'GIOTTO', prezzo2026: 700, h215: 900, h240: 1000 }],
    optional: [{ nome: 'BATTISCOPA MASSELLO' as const, unita: 'ML' as const, prezzo: 1.2 }],
    aggiornato: 'test',
  }
  beforeEach(() => {
    usePricelistStore.setState({ porte: validatoPerTest(LISTINO), loadingDefaults: false, errors: { ...NESSUN_ERRORE } })
    useQuoteStore.getState().resetAll()
  })
  afterEach(() => cleanup())

  const semina = (riga: Record<string, unknown>) =>
    useQuoteStore.setState((st) => ({
      sezioni: {
        ...st.sezioni,
        porte: { righe: [], sconto: 0, battiscopa: [{ id: 'b1', nome: 'BATTISCOPA MASSELLO', prezzoUnitario: 1.2, ...riga }] },
      },
    }))
  const riga = () => useQuoteStore.getState().sezioni.porte!.battiscopa![0]

  it('mostra il calcolo: €/cm × altezza = €/ml, × metri lineari, più la posa', () => {
    semina({ altezzaCm: 5, metriLineari: 5.5, prezzoPosaMl: 4 })
    render(<PortePage />)
    expect(screen.getByText('1,20 €/cm × 5 cm = 6,00 €/ml')).toBeTruthy()
    expect(screen.getByText('6,00 €/ml × 5,5 ml = 33,00 €')).toBeTruthy()
    expect(screen.getByText('posa 4,00 €/ml × 5,5 ml = 22,00 €')).toBeTruthy()
    expect(screen.getByTestId('totale-battiscopa').textContent).toBe('€ 55,00')
  })

  it('altezza, metri e posa scrivono nello store; svuotare toglie il valore', () => {
    semina({})
    render(<PortePage />)
    fireEvent.change(screen.getByLabelText('Altezza battiscopa (cm)'), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText('Metri lineari battiscopa'), { target: { value: '5.5' } })
    fireEvent.change(screen.getByLabelText('Posa battiscopa (€/ml)'), { target: { value: '4' } })
    expect(riga()).toMatchObject({ altezzaCm: 5, metriLineari: 5.5, prezzoPosaMl: 4 })
    fireEvent.change(screen.getByLabelText('Posa battiscopa (€/ml)'), { target: { value: '' } })
    expect(riga().prezzoPosaMl).toBeUndefined()
  })

  it('la spunta +20% maggiora il €/cm, e il calcolo lo dice', () => {
    semina({ altezzaCm: 5, metriLineari: 5.5, prezzoPosaMl: 4 })
    render(<PortePage />)
    fireEvent.click(screen.getByLabelText('Lavorazione extra (+20%)'))
    expect(riga().extra).toBe(true)
    expect(screen.getByText('1,44 €/cm (+20%) × 5 cm = 7,20 €/ml')).toBeTruthy()
    // Importi all'euro intero (D4): prodotto 39,60 → 40, posa 22, totale 62.
    expect(screen.getByTestId('totale-battiscopa').textContent).toBe('€ 62,00')
  })

  it('riga della #33: avviso con la lunghezza vecchia, fuori dal totale', () => {
    semina({ quantitaCm: 500 })
    render(<PortePage />)
    expect(screen.getByText(
      'Riga del vecchio formato (500 cm di lunghezza): inserisci altezza e metri lineari. Esclusa dal totale finché non è completa.'
    )).toBeTruthy()
    expect(screen.getByTestId('totale-battiscopa').textContent).toBe('—')
  })

  it('riga nuova senza misure: chiede altezza e metri, fuori dal totale', () => {
    semina({})
    render(<PortePage />)
    expect(screen.getByText('Inserisci altezza e metri lineari: esclusa dal totale finché non è completa.')).toBeTruthy()
    expect(screen.getByTestId('totale-battiscopa').textContent).toBe('—')
  })

  it('voce non più nel listino: prezzo da definire', () => {
    semina({ nome: 'SPARITO', prezzoUnitario: undefined, altezzaCm: 5, metriLineari: 5 })
    render(<PortePage />)
    expect(screen.getByText('Prezzo non più nel listino — da definire, escluso dal totale')).toBeTruthy()
  })

  it('il campo descrizione scrive nello store; svuotarlo torna automatica (null)', () => {
    semina({ altezzaCm: 5, metriLineari: 5 })
    render(<PortePage />)
    const campo = screen.getByLabelText('Descrizione (essenza, colore…)') as HTMLInputElement
    // Mai scritta: il campo è vuoto e il segnaposto è l'etichetta composta del PDF.
    expect(campo.value).toBe('')
    expect(campo.placeholder).toBe('Battiscopa BATTISCOPA MASSELLO H 5 cm — 5 ml × 6,00 €/ml')
    fireEvent.change(campo, { target: { value: 'Rovere naturale' } })
    expect(riga().descrizione).toBe('Rovere naturale')
    expect(campo.value).toBe('Rovere naturale')
    fireEvent.change(campo, { target: { value: '  ' } })
    expect(riga().descrizione).toBeNull()
    expect(campo.value).toBe('')
  })

  it('rimuovere toglie la riga', () => {
    semina({ altezzaCm: 5, metriLineari: 5 })
    render(<PortePage />)
    fireEvent.click(screen.getByLabelText('Rimuovi battiscopa'))
    expect(useQuoteStore.getState().sezioni.porte!.battiscopa).toHaveLength(0)
  })
})
