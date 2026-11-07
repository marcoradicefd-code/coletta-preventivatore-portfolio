import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

// PreventivoPrint → quoteStore → pricelistStore → supabase: mock minimale per
// restare hermetici (nessun env, nessuna rete), come negli altri test di store.
vi.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: () => ({}) } },
  LISTINI_BUCKET: 'Listini',
}))

import { PreventivoPrint } from '@/components/print/PreventivoPrint'
import { useQuoteStore } from '@/store/quoteStore'
import { usePricelistStore } from '@/store/pricelistStore'
import { validatoPerTest } from '@/test-utils/listinoValidato'
import { VASCA_DESCRIZIONE } from '@/data/gres/vascaGres'
import type { ListinoMarmeria, Materiale, RilMontScaglione } from '@/types/marmeria'
import { articoloPZ } from '@/test-utils/articoli'
import { listinoCucinaFinto } from '@/test-utils/catalogoCucinaFinto'

// Listino cucine finto nello store, come dal bucket: i prezzi di vendita veri
// non entrano nei test (D7).
beforeEach(() => usePricelistStore.setState({ cucine: validatoPerTest(listinoCucinaFinto) }))

// Stringhe che compaiono SOLO nelle condizioni contrattuali reali: se il testo
// del file dati cambiasse, questi pattern vanno aggiornati di conseguenza.
const SEZIONE_CONDIZIONI = /DURATA E REALIZZAZIONE DELL'OPERA/
const FIRMA_CONDIZIONI = /PER ACCETTAZIONE/
// Caption della firma generica di fallback (esatta, per non collidere col
// footer "Coletta Ebanisteria — Bari").
const FIRMA_GENERICA = 'Firma per accettazione'

describe('PreventivoPrint — condizioni contrattuali', () => {
  beforeEach(() => {
    useQuoteStore.getState().resetAll()
  })
  afterEach(() => cleanup())

  it('con includiCondizioni=true: condizioni + UNICA firma in coda (no firma generica)', () => {
    useQuoteStore.getState().setIncludiCondizioni(true)
    render(<PreventivoPrint />)
    expect(screen.getByText(SEZIONE_CONDIZIONI)).toBeTruthy()
    expect(screen.getByText(FIRMA_CONDIZIONI)).toBeTruthy()
    // Firma consolidata: quella generica NON deve comparire.
    expect(screen.queryByText(FIRMA_GENERICA)).toBeNull()
  })

  it('con includiCondizioni=false: niente condizioni, ma firma generica di fallback', () => {
    useQuoteStore.getState().setIncludiCondizioni(false)
    render(<PreventivoPrint />)
    expect(screen.queryByText(SEZIONE_CONDIZIONI)).toBeNull()
    expect(screen.queryByText(FIRMA_CONDIZIONI)).toBeNull()
    // Fallback: il documento non resta mai senza firma.
    expect(screen.getByText(FIRMA_GENERICA)).toBeTruthy()
  })

  it('di default (resetAll) le condizioni sono incluse', () => {
    // Invariante prodotto: le condizioni vanno SEMPRE nel documento per default.
    expect(useQuoteStore.getState().preventivo.includiCondizioni).toBe(true)
    render(<PreventivoPrint />)
    expect(screen.getByText(SEZIONE_CONDIZIONI)).toBeTruthy()
  })
})

describe('PreventivoPrint — sezione Progetto a valore (fase 6)', () => {
  beforeEach(() => useQuoteStore.getState().resetAll())
  afterEach(() => cleanup())

  it('assente dal PDF finché non ci sono righe', () => {
    render(<PreventivoPrint />)
    expect(screen.queryByText('Progetto su misura')).toBeNull()
  })

  it('presente con righe: titolo "Progetto su misura" + descrizione della voce', () => {
    useQuoteStore.getState().addRigaProgettoValore({ descrizione: 'Cucina a corpo su disegno', prezzo: 1234.56 })
    render(<PreventivoPrint />)
    expect(screen.getByText('Progetto su misura')).toBeTruthy()
    expect(screen.getByText('Cucina a corpo su disegno')).toBeTruthy()
  })

  it('il totale imponibile somma la sezione valore (non la sostituisce)', () => {
    const s = useQuoteStore.getState()
    s.addArticoloSuMisura(articoloPZ) // arredi: 1 × 100 = 100
    s.addRigaProgettoValore({ descrizione: 'Voce a valore', prezzo: 200 }) // valore: 200
    render(<PreventivoPrint />)
    const totalRow = screen.getByText(/^Totale imponibile$/).closest('tr')
    // 100 (arredi) + 200 (valore) = 300 → prova che resultPV.totale è ADDIZIONATO.
    expect(totalRow?.textContent).toContain('300,00')
  })

  it('il prezzo a mano coi centesimi si stampa all\'euro intero, e il totale lo somma (D4)', () => {
    useQuoteStore.getState().addRigaProgettoValore({ descrizione: 'Voce a valore', prezzo: 250.5 })
    render(<PreventivoPrint />)
    expect(screen.getByText('Voce a valore').closest('tr')?.textContent).toContain('€ 251,00')
    expect(screen.getByText(/^Totale imponibile$/).closest('tr')?.textContent).toContain('251,00')
  })
})

describe('PreventivoPrint — sezione Porte (fase 7)', () => {
  beforeEach(() => {
    useQuoteStore.getState().resetAll()
    usePricelistStore.setState({ porte: null })
  })
  afterEach(() => cleanup())

  it('assente dal PDF finché non ci sono righe', () => {
    render(<PreventivoPrint />)
    expect(screen.queryByText('Porte')).toBeNull()
  })

  it('presente con righe: titolo "Porte" + nome modello', () => {
    usePricelistStore.setState({
      porte: validatoPerTest({
        modelli: [{ nome: 'RAFFAELLA', prezzo2026: 880, h215: 1060, h240: 1150 }],
        optional: [],
        aggiornato: 'test',
      }),
    })
    useQuoteStore.getState().addRigaPorta({ modelloNome: 'RAFFAELLA', altezzaCm: 200 })
    render(<PreventivoPrint />)
    expect(screen.getByText('Porte')).toBeTruthy()
    expect(screen.getByText('RAFFAELLA')).toBeTruthy()
  })

  it('il totale imponibile somma la sezione Porte (non la sostituisce)', () => {
    usePricelistStore.setState({
      porte: validatoPerTest({
        modelli: [{ nome: 'M', prezzo2026: 300, h215: 400, h240: 500 }],
        optional: [],
        aggiornato: 'test',
      }),
    })
    const s = useQuoteStore.getState()
    s.addArticoloSuMisura(articoloPZ) // arredi: 100
    s.addRigaPorta({ modelloNome: 'M', altezzaCm: 200 }) // porte: fascia base 300
    render(<PreventivoPrint />)
    const totalRow = screen.getByText(/^Totale imponibile$/).closest('tr')
    // 100 (arredi) + 300 (porte) = 400 → prova che resultPorte.totale è ADDIZIONATO.
    expect(totalRow?.textContent).toContain('400,00')
  })
})

describe('PreventivoPrint — sezione Cucine (fase 8)', () => {
  beforeEach(() => useQuoteStore.getState().resetAll())
  afterEach(() => cleanup())

  it('assente dal PDF finché la sezione è vuota', () => {
    render(<PreventivoPrint />)
    expect(screen.queryByText('Cucina')).toBeNull()
  })

  it('con contenuto: titolo "Cucina" + descrizione VISIBILE, ma le VOCI NASCOSTE', () => {
    const s = useQuoteStore.getState()
    s.setVoceQuantita('colonna-210-laccato', 1)
    s.setDescrizioneCucina('Cucina lineare 360 cm, ante laccato opaco')
    render(<PreventivoPrint />)
    // Titolo di sezione + descrizione a corpo: VISIBILI.
    expect(screen.getByText('Cucina')).toBeTruthy()
    expect(screen.getByText('Cucina lineare 360 cm, ante laccato opaco')).toBeTruthy()
    // La singola voce del catalogo NON compare (richiesta Antonio: voci nascoste).
    expect(screen.queryByText('COLONNA 210 LACCATO')).toBeNull()
  })

  it('il totale imponibile somma l imponibile cucina (non lo sostituisce)', () => {
    const s = useQuoteStore.getState()
    s.addArticoloSuMisura(articoloPZ) // arredi: 100
    s.setVoceQuantita('anta-vetro-visarm', 1) // totaleCucina 170 (catalogo finto); adeguamento default 20%
    // imponibile cucina = 170 + prog 17 + adeguamento 34 = 221 (sotto 1.000 → nessun separatore
    // migliaia; in jsdom c'è eccome: format.test.ts pinna formatEur(1300) === '1.300,00').
    render(<PreventivoPrint />)
    const totalRow = screen.getByText(/^Totale imponibile$/).closest('tr')
    expect(totalRow?.textContent).toContain('321,00') // 100 (arredi) + 221 (cucina)
  })

  it('adeguamento al 12,5%: nel PDF nessuna riga Adeguamento, l importo sta nel totale (O18 resta a schermo)', () => {
    const s = useQuoteStore.getState()
    s.setVoceQuantita('base-pensile-laminato', 4) // 1.040 nel catalogo finto
    s.setAdeguamentoCucina(0.125)
    render(<PreventivoPrint />)
    // 1.040 + progettazione 104 + adeguamento 130 = 1.274 (Antonio 12/10: solo il totale).
    expect(screen.getByText('Totale cucina').closest('div')?.textContent).toContain('1.274,00')
    expect(screen.queryByText(/Adeguamento/)).toBeNull()
  })

  it('ordine SPEC §A.2: Cucina è renderizzata PRIMA di arredi', () => {
    const s = useQuoteStore.getState()
    s.setVoceQuantita('colonna-210-laccato', 1)
    s.addArticoloSuMisura(articoloPZ)
    render(<PreventivoPrint />)
    const cucina = screen.getByText('Cucina')
    const arredi = screen.getByText('Falegnameria Su Misura')
    // arredi SEGUE cucina nel DOM → cucina è prima.
    expect(cucina.compareDocumentPosition(arredi) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('giorni extra con la tariffa del listino cucine (D7): nessuna riga, sono nel totale', () => {
    useQuoteStore.getState().setGiorniExtra(3)
    render(<PreventivoPrint />)
    const riga = screen.getByText('Totale cucina').closest('div')
    expect(riga?.textContent).toContain('510,00') // 3 × 170 del listino finto
    expect(screen.queryByText(/Giorni extra/)).toBeNull()
  })

  it('giorni extra senza tariffa nel listino: «da definire» e TOTALE PARZIALE', () => {
    usePricelistStore.setState({ cucine: validatoPerTest({ ...listinoCucinaFinto, giornoRate: null }) })
    const s = useQuoteStore.getState()
    s.setVoceQuantita('anta-vetro-visarm', 1)
    s.setGiorniExtra(3)
    render(<PreventivoPrint />)
    expect(screen.getByText('Giorni extra (3) — da definire')).toBeTruthy()
    expect(screen.getByText('Totale parziale cucina')).toBeTruthy()
    expect(screen.getByText(/^Totale imponibile parziale$/)).toBeTruthy()
  })
})

// Il blocco gres nel PDF esiste solo con un listino caricato (`resultMM` è null
// senza) → va messo in pricelistStore, e tolto dopo per non farlo trapelare
// negli altri describe di questo file.
const listinoMM: ListinoMarmeria = {
  materiali: [],
  lavorazioniBordo: [],
  lavorazioniVarie: [],
  vascheIntegrate: [],
  rilMontScaglioni: [],
  scontiDisponibili: [0],
  aggiornato: '',
}

const rigaMateriale = {
  materialeKey: 'k',
  spessore: 13 as const,
  fascia: 'fino62' as const,
  profonditaCm: 60,
  qtaMq: 1,
  prezzoMq: 100,
  totale: 100,
}

describe('PreventivoPrint — vasca in gres', () => {
  beforeEach(() => {
    useQuoteStore.getState().resetAll()
    usePricelistStore.setState({ marmeria: validatoPerTest(listinoMM) })
  })
  afterEach(() => {
    cleanup()
    usePricelistStore.setState({ marmeria: null })
  })

  it('vasca NON inclusa: blocco gres presente, riga vasca ASSENTE', () => {
    useQuoteStore.getState().addRigaMateriale(rigaMateriale)
    render(<PreventivoPrint />)
    expect(screen.getByText('Marmeria / Gres')).toBeTruthy()
    expect(screen.queryByText(VASCA_DESCRIZIONE)).toBeNull()
  })

  it('vasca inclusa: riga con la descrizione commerciale e il prezzo', () => {
    useQuoteStore.getState().addRigaMateriale(rigaMateriale)
    useQuoteStore.getState().setVasca({ inclusa: true })
    render(<PreventivoPrint />)
    // SummaryRow è un div flex (label + importo), non una riga di tabella.
    const riga = screen.getByText(VASCA_DESCRIZIONE).closest('div')
    expect(riga?.textContent).toContain('1.240,00')
  })

  it('vasca esclusa dopo essere stata inclusa: la riga sparisce (prezzo non trapela)', () => {
    const s = useQuoteStore.getState()
    s.addRigaMateriale(rigaMateriale)
    s.setVasca({ inclusa: true })
    s.setVasca({ inclusa: false })
    render(<PreventivoPrint />)
    expect(screen.queryByText(VASCA_DESCRIZIONE)).toBeNull()
  })

  it('vasca-sola (nessuna riga materiali): il blocco gres compare comunque', () => {
    // `sezioneNonVuota('gres')` guarda gresTotLordo > 0, e la vasca è nel lordo
    // → il predicato copre già il caso senza modifiche.
    useQuoteStore.getState().setVasca({ inclusa: true })
    render(<PreventivoPrint />)
    expect(screen.getByText('Marmeria / Gres')).toBeTruthy()
    expect(screen.getByText(VASCA_DESCRIZIONE)).toBeTruthy()
    // e il totale imponibile la somma (non la ignora).
    const totalRow = screen.getByText(/^Totale imponibile$/).closest('tr')
    expect(totalRow?.textContent).toContain('1.240,00')
  })
})

// Titoli dei SezioneBlock, per leggere l'ordine delle sezioni nel DOM.
const TITOLI_SEZIONE = ['Cucina', 'Falegnameria Su Misura', 'Porte', 'Progetto su misura', 'Marmeria / Gres']

/** I titoli delle sezioni presenti nel PDF, nell'ordine del DOM. */
function ordineSezioni(): string[] {
  return TITOLI_SEZIONE.flatMap((titolo) => {
    const el = screen.queryByText(titolo)
    return el ? [{ titolo, el }] : []
  })
    .sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
    .map((s) => s.titolo)
}

// Richiesta Antonio (09/09): il top gres va subito dopo la cucina, come nel
// preventivo 1147 (pag. 2: riga cucina, poi top + schienale + vasca). Ordine
// FISSO, senza condizioni: Cucina → Gres → Arredi → Porte → Progetto.
describe('PreventivoPrint — ordine delle sezioni: Gres subito dopo la Cucina', () => {
  beforeEach(() => {
    useQuoteStore.getState().resetAll()
    usePricelistStore.setState({ marmeria: validatoPerTest(listinoMM) })
  })
  afterEach(() => {
    cleanup()
    usePricelistStore.setState({ marmeria: null })
  })

  it('con cucina e gres: il Gres segue "Totale cucina" e precede gli arredi', () => {
    const s = useQuoteStore.getState()
    s.setVoceQuantita('colonna-210-laccato', 1)
    s.addRigaMateriale(rigaMateriale)
    s.addArticoloSuMisura(articoloPZ)
    s.addRigaProgettoValore({ descrizione: 'Voce a valore', prezzo: 200 })
    render(<PreventivoPrint />)
    expect(ordineSezioni()).toEqual(['Cucina', 'Marmeria / Gres', 'Falegnameria Su Misura', 'Progetto su misura'])
    const totaleCucina = screen.getByText('Totale cucina')
    const gres = screen.getByText('Marmeria / Gres')
    expect(totaleCucina.compareDocumentPosition(gres) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('senza cucina: il Gres è la prima sezione', () => {
    const s = useQuoteStore.getState()
    s.addRigaMateriale(rigaMateriale)
    s.addArticoloSuMisura(articoloPZ)
    s.addRigaProgettoValore({ descrizione: 'Voce a valore', prezzo: 200 })
    render(<PreventivoPrint />)
    expect(ordineSezioni()).toEqual(['Marmeria / Gres', 'Falegnameria Su Misura', 'Progetto su misura'])
  })

  it('cucina senza gres: ordine invariato', () => {
    const s = useQuoteStore.getState()
    s.setVoceQuantita('colonna-210-laccato', 1)
    s.addArticoloSuMisura(articoloPZ)
    s.addRigaProgettoValore({ descrizione: 'Voce a valore', prezzo: 200 })
    render(<PreventivoPrint />)
    expect(ordineSezioni()).toEqual(['Cucina', 'Falegnameria Su Misura', 'Progetto su misura'])
  })
})

const articoloMQ = {
  ...articoloPZ,
  descrizione: 'Anta a misura',
  um: 'MQ' as const,
  larghezzaCm: 80,
  altezzaCm: 90,
}

// Listino con prezzi lavorazioni: è quello "nuovo", caricato DOPO che le righe
// erano già state inserite col listino vecchio.
const listinoConLavorazioni: ListinoMarmeria = {
  ...listinoMM,
  lavorazioniBordo: [
    { id: 1, descrizione: 'Bordo dritto', prezzoMlPerTipologia: { GRES: 10, LAPITEC: 10, QUARZO: 10 } },
    { id: 2, descrizione: 'Bordo toro', prezzoMlPerTipologia: { GRES: 25, LAPITEC: 25, QUARZO: 25 } },
  ],
  lavorazioniVarie: [
    { descrizione: 'Foro rubinetto', unitaMisura: 'PEZZO', prezzoPerTipologia: { GRES: 30, LAPITEC: 30, QUARZO: 30 } },
  ],
}

/** Gli importi in € stampati in una tabella del PDF, nell'ordine del DOM. */
function importiTabella(intestazione: string): number[] {
  const titolo = screen.getByText(intestazione)
  const tabella = titolo.nextElementSibling as HTMLElement
  return Array.from(tabella.querySelectorAll('tbody td:last-child')).map((td) =>
    Number((td.textContent ?? '').replace('€', '').replace(/\./g, '').replace(',', '.').trim())
  )
}

/** L'importo della riga di riepilogo con quell'etichetta (SummaryRow, non <tr>). */
function totaleSezione(label: string): number {
  const riga = screen.getByText(label).closest('div')
  const match = /€\s*([\d.]+,\d{2})/.exec(riga?.textContent ?? '')
  return Number((match?.[1] ?? '').replace(/\./g, '').replace(',', '.'))
}

describe('PreventivoPrint — le righe stampate sommano al totale stampato', () => {
  beforeEach(() => {
    useQuoteStore.getState().resetAll()
    usePricelistStore.setState({ marmeria: validatoPerTest(listinoConLavorazioni) })
  })
  afterEach(() => {
    cleanup()
    usePricelistStore.setState({ marmeria: null })
  })

  it('lavorazioni bordo: prezzi del listino CAMBIATI sotto righe già inserite', () => {
    const s = useQuoteStore.getState()
    s.addRigaMateriale(rigaMateriale)
    // Righe quotate col listino VECCHIO: prezzoMl/totale nello store sono stantii
    // (5 e 25 invece di 10 e 25... il bordo dritto è raddoppiato nel listino nuovo).
    s.addRigaLavorazioneBordo({ lavorazioneId: 1, qtaMl: 2, prezzoMl: 5, totale: 10 })
    s.addRigaLavorazioneBordo({ lavorazioneId: 2, qtaMl: 4, prezzoMl: 20, totale: 80 })
    render(<PreventivoPrint />)

    // Il PDF va al CLIENTE: se somma le righe a mano deve trovare il totale che
    // gli viene chiesto di pagare. Col vecchio codice le righe dicevano 10+80=90
    // e il totale di sezione (calcMarmeria, live) diceva 120.
    const righe = importiTabella('Lavorazioni bordo (€/ml)')
    expect(righe).toEqual([20, 100]) // 2×10 e 4×25, prezzi del listino CORRENTE
    expect(righe.reduce((a, b) => a + b, 0)).toBe(totaleSezione('Totale lavorazioni bordo'))
  })

  it('lavorazioni varie: stessa invariante', () => {
    const s = useQuoteStore.getState()
    s.addRigaMateriale(rigaMateriale)
    s.addRigaVaria({ descrizione: 'Foro rubinetto', um: 'PEZZO', qta: 3, prezzoUnit: 12, totale: 36 })
    render(<PreventivoPrint />)

    const righe = importiTabella('Lavorazioni varie')
    expect(righe).toEqual([90]) // 3×30 dal listino corrente, non 3×12 dello snapshot
    expect(righe.reduce((a, b) => a + b, 0)).toBe(totaleSezione('Totale lavorazioni varie'))
  })
})

// Un materiale vero nel listino: serve a stampare "produttore — colore" invece
// della chiave grezza. Solo i campi che il PDF legge contano, gli altri sono lì
// per il tipo.
const materialeListino: Materiale = {
  produttore: 'MARAZZI',
  colore: 'Grande Marble',
  tipoSuperficie: 'Lucido',
  coloreFinituraCompleto: 'Grande Marble_Lucido',
  collezione: 'GRANDE',
  tipologia: 'GRES',
  spessori: {},
  alzatinaAltezza: 0.08,
  alzatinaEuroMl: 50,
  schienaleEuroMq: 100,
}

// Forma del listino reale (rilMont.ts): 300 / 400 fissi, poi 15% sopra i 3.000.
const scaglioniRilMont: RilMontScaglione[] = [
  { da: 0, a: 2000, importo: 300 },
  { da: 2000, a: 3000, importo: 400 },
  { da: 3000, a: null, importo: 0, percentuale: 0.15 },
]

const listinoGres: ListinoMarmeria = {
  ...listinoConLavorazioni,
  materiali: [materialeListino],
  rilMontScaglioni: scaglioniRilMont,
}

// I rami del blocco Gres che il PDF stampa solo in certe condizioni. Nessun
// mock del motore: i numeri passano da calcMarmeria, quindi sono quelli che il
// cliente leggerebbe. Vasca e tabelle bordo/varie sono già pinnate sopra, nei
// describe "vasca in gres" e "le righe stampate sommano".
describe('PreventivoPrint — blocco Gres: rami del riepilogo e delle tabelle', () => {
  beforeEach(() => {
    useQuoteStore.getState().resetAll()
    usePricelistStore.setState({ marmeria: validatoPerTest(listinoGres) })
  })
  afterEach(() => {
    cleanup()
    usePricelistStore.setState({ marmeria: null })
  })

  it('sconto > 0: riga sconto stampata, e il totale scontato è lordo meno sconto', () => {
    const s = useQuoteStore.getState()
    s.addRigaMateriale({ ...rigaMateriale, qtaMq: 10, totale: 1000 }) // 10 mq × 100 = 1.000
    s.setScontoSezione('gres', 0.1)
    render(<PreventivoPrint />)
    expect(totaleSezione('Totale lordo')).toBe(1000)
    expect(totaleSezione('Sconto (10%)')).toBe(100)
    expect(screen.getByText('Sconto (10%)').closest('div')?.textContent).toContain('- € 100,00')
    expect(totaleSezione('Totale scontato')).toBe(900)
  })

  it('minimo 2 mq: riga «Integrazione ordine minimo 2 mq» stampata, e il lordo torna con le righe', () => {
    const s = useQuoteStore.getState()
    s.addRigaMateriale(rigaMateriale) // 1 mq × 100 → minimo 2 × 100 = 200
    render(<PreventivoPrint />)
    expect(totaleSezione('Totale materiali')).toBe(100)
    expect(totaleSezione('Integrazione ordine minimo 2 mq')).toBe(100)
    expect(totaleSezione('Totale lordo')).toBe(200)
  })

  it('rilievo e montaggio: sopra i 3.000 il motore applica il 15% (4.000 → 600)', () => {
    const s = useQuoteStore.getState()
    s.addRigaMateriale({ ...rigaMateriale, qtaMq: 40, totale: 4000 }) // 40 mq × 100 = 4.000
    s.setIncludiRilMont(true)
    render(<PreventivoPrint />)
    expect(screen.getByText('Rilievo e montaggio').closest('div')?.textContent).toContain('600,00')
    expect(totaleSezione('Totale Marmeria')).toBe(4600)
  })

  it('alzatine: la tabella compare con la riga, e somma al proprio totale', () => {
    const s = useQuoteStore.getState()
    s.addRigaMateriale(rigaMateriale)
    s.addRigaAlzatina({ materialeKey: 'Grande Marble_Lucido', qtaMl: 2, prezzoMl: 50, totale: 100 })
    s.addRigaAlzatina({ materialeKey: 'Materiale_Tolto_Dal_Listino', qtaMl: 1, prezzoMl: 30, totale: 30 })
    render(<PreventivoPrint />)
    const tabella = screen.getByText('Alzatine (€/ml)').nextElementSibling as HTMLElement
    const nomi = Array.from(tabella.querySelectorAll('tbody td:first-child')).map((td) => td.textContent)
    expect(nomi).toEqual(['MARAZZI — Grande Marble', 'Materiale_Tolto_Dal_Listino'])
    expect(importiTabella('Alzatine (€/ml)')).toEqual([100, 30])
    expect(totaleSezione('Totale alzatine')).toBe(130)
  })

  it('totale persistito manomesso: il PDF stampa quantità × prezzo all\'euro intero, non r.totale (A4, D4)', () => {
    const s = useQuoteStore.getState()
    s.addRigaMateriale({ ...rigaMateriale, qtaMq: 2.5, prezzoMq: 100.3, totale: 1 }) // 250,75 → 251
    s.addRigaAlzatina({ materialeKey: 'Grande Marble_Lucido', qtaMl: 1.5, prezzoMl: 33.3, totale: 9999 }) // 49,95 → 50
    render(<PreventivoPrint />)
    expect(importiTabella('Top — Schienali — Fianchi (€/mq)')).toEqual([251])
    expect(totaleSezione('Totale materiali')).toBe(251)
    expect(importiTabella('Alzatine (€/ml)')).toEqual([50])
    expect(totaleSezione('Totale alzatine')).toBe(50)
  })

  it('materiali: nome dal listino se c è, altrimenti la chiave grezza (nessun crash)', () => {
    const s = useQuoteStore.getState()
    s.addRigaMateriale({ ...rigaMateriale, materialeKey: 'Grande Marble_Lucido' })
    s.addRigaMateriale({ ...rigaMateriale, materialeKey: 'Materiale_Tolto_Dal_Listino' })
    render(<PreventivoPrint />)
    const tabella = screen.getByText('Top — Schienali — Fianchi (€/mq)').nextElementSibling as HTMLElement
    const nomi = Array.from(tabella.querySelectorAll('tbody td:first-child')).map((td) => td.textContent)
    expect(nomi).toEqual(['MARAZZI — Grande Marble', 'Materiale_Tolto_Dal_Listino'])
  })

  it('lavorazione bordo sparita dal listino: «prezzo da definire», mai € 0,00, e totale PARZIALE (A2)', () => {
    const s = useQuoteStore.getState()
    s.addRigaMateriale(rigaMateriale)
    s.addRigaLavorazioneBordo({ lavorazioneId: 99, qtaMl: 2, prezzoMl: 10, totale: 20 })
    render(<PreventivoPrint />)
    const riga = screen.getByText('Lavorazione #99').closest('tr')!
    expect(riga.textContent).toContain('prezzo da definire')
    expect(riga.textContent).not.toMatch(/€\s*0,00/)
    expect(totaleSezione('Totale lavorazioni bordo')).toBe(0)
    expect(screen.getByText(/1 lavorazione da definire/)).toBeTruthy()
    expect(screen.getByText(/^Totale imponibile parziale$/)).toBeTruthy()
  })

  it('gres di sole lavorazioni da definire: il blocco si stampa, senza rilievo, e il totale è PARZIALE (A2)', () => {
    const s = useQuoteStore.getState()
    s.addRigaLavorazioneBordo({ lavorazioneId: 99, qtaMl: 2, prezzoMl: 10, totale: 20 })
    s.setIncludiRilMont(true)
    render(<PreventivoPrint />)
    expect(screen.getByText('Marmeria / Gres')).toBeTruthy()
    expect(screen.getByText('Lavorazione #99').closest('tr')!.textContent).toContain('prezzo da definire')
    expect(screen.queryByText('Rilievo e montaggio')).toBeNull()
    expect(screen.queryByText(/Listino non disponibile/)).toBeNull()
    expect(screen.getByText(/^Totale imponibile parziale$/)).toBeTruthy()
  })
})

describe('PreventivoPrint — formattazione dei mq', () => {
  beforeEach(() => useQuoteStore.getState().resetAll())
  afterEach(() => {
    cleanup()
    usePricelistStore.setState({ marmeria: null })
  })

  it('i mq escono con la VIRGOLA decimale, non col punto inglese', () => {
    const s = useQuoteStore.getState()
    s.setMostraMqInPdf(true)
    s.addArticoloSuMisura(articoloMQ) // 80×90 → 0,72 mq
    render(<PreventivoPrint />)
    // Il PDF va al cliente: i mq stanno nella stessa riga di un importo in euro
    // con la virgola. `toFixed(2)` dava "0.72 mq" — due separatori decimali
    // diversi a due centimetri l'uno dall'altro. Pinniamo la virgola.
    expect(screen.getByText('80×90 cm = 0,72 mq')).toBeTruthy()
    expect(screen.queryByText(/0\.72/)).toBeNull()
  })

  it('le quantità gres escono all\'italiana in tutte e 4 le tabelle (O2)', () => {
    usePricelistStore.setState({ marmeria: validatoPerTest(listinoConLavorazioni) })
    const s = useQuoteStore.getState()
    s.addRigaMateriale({ ...rigaMateriale, qtaMq: 1.5, totale: 150 })
    s.addRigaAlzatina({ materialeKey: 'Grande Marble_Lucido', qtaMl: 2.5, prezzoMl: 50, totale: 125 })
    s.addRigaLavorazioneBordo({ lavorazioneId: 1, qtaMl: 1.25, prezzoMl: 10, totale: 12.5 })
    s.addRigaVaria({ descrizione: 'Foro rubinetto', um: 'PEZZO', qta: 1.5, prezzoUnit: 30, totale: 45 })
    render(<PreventivoPrint />)
    // Nel PDF il punto è il separatore delle MIGLIAIA: «1.5» si legge millecinque.
    const primaRiga = (intestazione: string) => {
      const tabella = screen.getByText(intestazione).nextElementSibling as HTMLElement
      return tabella.querySelector('tbody tr')?.textContent ?? ''
    }
    expect(primaRiga('Top — Schienali — Fianchi (€/mq)')).toContain('1,5')
    expect(primaRiga('Alzatine (€/ml)')).toContain('2,5')
    expect(primaRiga('Lavorazioni bordo (€/ml)')).toContain('1,25')
    expect(primaRiga('Lavorazioni varie')).toContain('1,5')
    for (const t of ['Top — Schienali — Fianchi (€/mq)', 'Alzatine (€/ml)', 'Lavorazioni bordo (€/ml)', 'Lavorazioni varie']) {
      expect(primaRiga(t)).not.toMatch(/\d\.\d/)
    }
  })
})

// HEUR-029 dell'audit UX del 06/10: senza listino Gres il blocco spariva dal
// PDF e dal totale senza dirlo. Seconda difesa (la prima è "Genera" spento):
// il blocco c'è, con gli importi da definire, e il totale si dichiara parziale.
describe('PreventivoPrint — gres compilato senza listino: niente esclusioni silenziose', () => {
  beforeEach(() => {
    useQuoteStore.getState().resetAll()
    usePricelistStore.setState({ marmeria: null })
  })
  afterEach(() => {
    cleanup()
    usePricelistStore.setState({ marmeria: null })
  })

  it('il blocco "Marmeria / Gres" c è e dice che gli importi sono da definire', () => {
    useQuoteStore.getState().addRigaMateriale(rigaMateriale)
    render(<PreventivoPrint />)
    expect(screen.getByText('Marmeria / Gres')).toBeTruthy()
    expect(screen.getByText('Listino non disponibile: importi da definire')).toBeTruthy()
  })

  it('il totale si dichiara PARZIALE, con il motivo', () => {
    useQuoteStore.getState().addArticoloSuMisura(articoloPZ)
    useQuoteStore.getState().addRigaMateriale(rigaMateriale)
    render(<PreventivoPrint />)
    expect(screen.queryByText(/^Totale imponibile$/)).toBeNull()
    const totale = screen.getByText(/^Totale imponibile parziale$/).closest('tr')
    expect(totale?.textContent).toContain('100,00') // solo gli arredi: il gres è da definire
    expect(screen.getByText('totale parziale — Marmeria / Gres da definire')).toBeTruthy()
  })

  it('presidio: con il listino il PDF resta quello di oggi', () => {
    usePricelistStore.setState({ marmeria: validatoPerTest(listinoMM) })
    useQuoteStore.getState().addRigaMateriale(rigaMateriale)
    render(<PreventivoPrint />)
    expect(screen.getByText(/^Totale imponibile$/)).toBeTruthy()
    expect(screen.queryByText(/da definire/)).toBeNull()
  })
})

// O5: una voce cucina che il catalogo non conosce più (tolta o rinominata)
// valeva 0 € in silenzio. Ora il totale della cucina si dichiara parziale, la
// nota dice quante sono e il TOTALE finale è PARZIALE, come per le porte.
describe('PreventivoPrint — voci cucina fuori catalogo (O5)', () => {
  beforeEach(() => {
    useQuoteStore.getState().resetAll()
    usePricelistStore.setState({ marmeria: null })
  })
  afterEach(() => cleanup())

  it('«Totale parziale cucina», la nota col numero e il TOTALE PARZIALE che nomina la Cucina', () => {
    const s = useQuoteStore.getState()
    s.setVoceQuantita('colonna-210-laccato', 1) // 1.260 nel catalogo finto
    s.setVoceQuantita('voce-tolta-dal-catalogo', 3)
    render(<PreventivoPrint />)
    expect(screen.getByText('Totale parziale cucina')).toBeTruthy()
    expect(screen.queryByText('Totale cucina')).toBeNull()
    expect(screen.getByText('totale parziale — 1 voce da definire')).toBeTruthy()
    // Il totale somma solo le voci a catalogo: 1.260 + progettazione 126 + adeguamento 252.
    const totale = screen.getByText(/^Totale imponibile parziale$/).closest('tr')
    expect(totale?.textContent).toContain('1.638,00')
    expect(screen.getByText('totale parziale — Cucina da definire')).toBeTruthy()
  })

  it('più voci fuori catalogo: la nota è al plurale', () => {
    const s = useQuoteStore.getState()
    s.setVoceQuantita('colonna-210-laccato', 1)
    s.setVoceQuantita('voce-tolta-dal-catalogo', 3)
    s.setVoceQuantita('voce-rinominata', 1)
    render(<PreventivoPrint />)
    expect(screen.getByText('totale parziale — 2 voci da definire')).toBeTruthy()
  })

  it('una cucina di sole voci fuori catalogo stampa comunque il suo blocco', () => {
    useQuoteStore.getState().setVoceQuantita('voce-tolta-dal-catalogo', 3)
    render(<PreventivoPrint />)
    expect(screen.getByText('Cucina')).toBeTruthy()
    expect(screen.getByText('Totale parziale cucina')).toBeTruthy()
    expect(screen.getByText(/^Totale imponibile parziale$/)).toBeTruthy()
  })

  it('con il gres senza listino: la nota finale le elenca nell ordine del PDF, e il gres resta nel suo blocco', () => {
    const s = useQuoteStore.getState()
    s.setVoceQuantita('voce-tolta-dal-catalogo', 3)
    s.addRigaMateriale(rigaMateriale)
    render(<PreventivoPrint />)
    expect(screen.getByText('totale parziale — Cucina, Marmeria / Gres da definire')).toBeTruthy()
    expect(screen.getByText('Listino non disponibile: importi da definire')).toBeTruthy()
  })

  it('presidio: con tutte le voci a catalogo il PDF resta quello di oggi', () => {
    useQuoteStore.getState().setVoceQuantita('colonna-210-laccato', 1)
    render(<PreventivoPrint />)
    expect(screen.getByText('Totale cucina')).toBeTruthy()
    expect(screen.getByText(/^Totale imponibile$/)).toBeTruthy()
    expect(screen.queryByText(/da definire/)).toBeNull()
  })
})

// Antonio, 12/10: il blocco Cucina del PDF stampa solo il totale, cioè
// l'imponibile. Sconto, progettazione, adeguamento, giorni ed extra restano
// nel riepilogo a schermo (CucineRiepilogo), per l'operatore.
describe('PreventivoPrint — cucina: in stampa solo il totale (L17)', () => {
  beforeEach(() => {
    useQuoteStore.getState().resetAll()
    usePricelistStore.setState({ marmeria: null })
  })
  afterEach(() => cleanup())

  /** Sconto, adeguamento, giorni ed extra tutti valorizzati, sul listino finto. */
  function cucinaCompleta() {
    const s = useQuoteStore.getState()
    s.setVoceQuantita('colonna-210-laccato', 1) // 1.260
    s.setScontoSezione('cucine', 0.1) // -126
    s.setAdeguamentoCucina(0.05) // +63; progettazione 10% +126
    s.setGiorniExtra(3) // +510 (3 × 170)
    s.setExtraManuale({ descrizione: 'Trasporto al piano', importo: 300 })
  }
  // 1.260 - 126 + 126 + 63 + 510 + 300
  const IMPONIBILE = '2.133,00'
  /** Le righe di riepilogo del blocco Cucina (il SummaryBlock che contiene il totale). */
  const riepilogoCucina = (label: string) => screen.getByText(label).closest('div')!.parentElement!

  it('una sola riga d importo, «Totale cucina» in grassetto con l imponibile', () => {
    cucinaCompleta()
    render(<PreventivoPrint />)
    const label = screen.getByText('Totale cucina')
    expect(label.closest('div')?.textContent).toContain(IMPONIBILE)
    expect(label.style.fontWeight).toBe('700')
    const blocco = riepilogoCucina('Totale cucina')
    expect(blocco.textContent?.match(/€/g)).toHaveLength(1)
    for (const assente of ['Progettazione', 'Adeguamento', 'Sconto', 'Giorni extra (', 'Extra', 'Trasporto al piano', 'Imponibile']) {
      expect(blocco.textContent).not.toContain(assente)
    }
    // Il totale imponibile è lo stesso numero: si nascondono solo i passaggi.
    expect(screen.getByText(/^Totale imponibile$/).closest('tr')?.textContent).toContain(IMPONIBILE)
  })

  it('caso parziale: «Totale parziale cucina» con l imponibile e la nota, niente passaggi', () => {
    cucinaCompleta()
    useQuoteStore.getState().setVoceQuantita('voce-tolta-dal-catalogo', 2)
    render(<PreventivoPrint />)
    expect(screen.queryByText('Totale cucina')).toBeNull()
    const blocco = riepilogoCucina('Totale parziale cucina')
    expect(blocco.textContent).toContain(IMPONIBILE)
    expect(blocco.textContent).toContain('totale parziale — 1 voce da definire')
    expect(blocco.textContent?.match(/€/g)).toHaveLength(1)
    for (const assente of ['Progettazione', 'Adeguamento', 'Sconto', 'Giorni extra (', 'Extra', 'Imponibile']) {
      expect(blocco.textContent).not.toContain(assente)
    }
    expect(screen.getByText(/^Totale imponibile parziale$/).closest('tr')?.textContent).toContain(IMPONIBILE)
  })
})

// PR 10b-2: i prezzi della cucina vengono dal listino cucine. Una cucina
// compilata senza listino non sparisce dal PDF e non vale 0: blocco «da
// definire» e TOTALE PARZIALE (seconda difesa: «Genera» è già spento).
describe('PreventivoPrint — cucina senza listino cucine (10b-2)', () => {
  beforeEach(() => {
    useQuoteStore.getState().resetAll()
    usePricelistStore.setState({ cucine: null, marmeria: null })
  })
  afterEach(() => cleanup())

  it('blocco Cucina «importi da definire», cucina fuori dal totale e TOTALE PARZIALE che la nomina', () => {
    const s = useQuoteStore.getState()
    s.setVoceQuantita('colonna-210-laccato', 1)
    s.addArticoloSuMisura(articoloPZ) // arredi: 100
    render(<PreventivoPrint />)
    expect(screen.getByText('Cucina')).toBeTruthy()
    expect(screen.getByText('Listino non disponibile: importi da definire')).toBeTruthy()
    expect(screen.getByText('Totale Cucina — da definire')).toBeTruthy()
    expect(screen.queryByText('Totale cucina')).toBeNull()
    const totale = screen.getByText(/^Totale imponibile parziale$/).closest('tr')
    expect(totale?.textContent).toContain('100,00') // solo gli arredi
    expect(screen.getByText('totale parziale — Cucina da definire')).toBeTruthy()
  })

  it('una cucina di soli giorni extra è compilata: blocco «da definire» anche lì', () => {
    useQuoteStore.getState().setGiorniExtra(2)
    render(<PreventivoPrint />)
    expect(screen.getByText('Totale Cucina — da definire')).toBeTruthy()
    expect(screen.getByText(/^Totale imponibile parziale$/)).toBeTruthy()
  })

  it('presidio: cucina vuota senza listino, nessun blocco Cucina e totale non parziale', () => {
    useQuoteStore.getState().addArticoloSuMisura(articoloPZ)
    render(<PreventivoPrint />)
    expect(screen.queryByText('Cucina')).toBeNull()
    expect(screen.getByText(/^Totale imponibile$/)).toBeTruthy()
    expect(screen.queryByText(/da definire/)).toBeNull()
  })
})

// Sconti decimali (decisione del 06/10): l'etichetta stampava Math.round,
// quindi "Sconto (13%)" accanto a un importo calcolato al 12,5%.
describe('PreventivoPrint — sconto decimale', () => {
  beforeEach(() => useQuoteStore.getState().resetAll())
  afterEach(() => cleanup())

  it('l etichetta dice 12,5%, non 13%', () => {
    useQuoteStore.getState().addArticoloSuMisura(articoloPZ)
    useQuoteStore.getState().setScontoSezione('arredi', 0.125)
    render(<PreventivoPrint />)
    expect(screen.getByText('Sconto (12,5%)')).toBeTruthy()
    expect(screen.queryByText('Sconto (13%)')).toBeNull()
  })

  it('presidio: l importo dello sconto resta calcolato al 12,5%', () => {
    useQuoteStore.getState().addArticoloSuMisura({ ...articoloPZ, prezzoUnitario: 1000 })
    useQuoteStore.getState().setScontoSezione('arredi', 0.125)
    render(<PreventivoPrint />)
    // Sconto sul lordo (BR-005): 1.000 × 12,5% = 125,00, non 130,00 del 13%.
    const riga = screen.getByText(/^Sconto \(/).closest('div')
    expect(riga?.textContent).toContain('125,00')
  })
})

// Sonar S5256: la tabella del totale non aveva intestazioni. La cella con la
// scritta è l'intestazione della riga: uno screen reader legge "TOTALE…,
// € …" invece di due celle scollegate.
describe('PreventivoPrint — totale con intestazione di riga', () => {
  beforeEach(() => useQuoteStore.getState().resetAll())
  afterEach(() => cleanup())

  it('la scritta del totale è un rowheader della sua riga', () => {
    useQuoteStore.getState().addArticoloSuMisura(articoloPZ)
    render(<PreventivoPrint />)
    // Anche le righe dell'imponibile e dell'IVA (L18) hanno la loro intestazione.
    expect(screen.getByRole('rowheader', { name: 'Totale imponibile' }).closest('tr')?.textContent).toContain('100,00')
    expect(screen.getByRole('rowheader', { name: 'IVA 22% su € 100,00' }).closest('tr')?.textContent).toContain('22,00')
    const intestazione = screen.getByRole('rowheader', { name: 'TOTALE (IVA compresa)' })
    expect(intestazione.closest('tr')?.textContent).toContain('122,00')
  })
})
