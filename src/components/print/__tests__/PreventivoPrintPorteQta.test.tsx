import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import type { ListinoPorte } from '@/types/porte'
import type { RigaPorta } from '@/types/quote'

vi.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: () => ({}) } },
  LISTINI_BUCKET: 'Listini',
}))

import { PreventivoPrint } from '@/components/print/PreventivoPrint'
import { useQuoteStore } from '@/store/quoteStore'
import { usePricelistStore } from '@/store/pricelistStore'
import { validatoPerTest } from '@/test-utils/listinoValidato'
import { descrizionePorteDefault } from '@/data/testiDefault'
import { descrizionePortaDi } from '@/store/quoteSelectors'

const LISTINO: ListinoPorte = {
  modelli: [{ nome: 'GIOTTO', prezzo2026: 700, h215: 900, h240: 1000 }],
  optional: [{ nome: 'STIPITI', unita: 'PORTA', prezzo: 150 }],
  aggiornato: 'test',
}

// Il testo di oggi, scritto per esteso: è la garanzia che una riga senza
// maniglia non si muova di un carattere nei PDF già consegnati.
const TESTO_LEGACY =
  'Porta mod. GIOTTO, in finitura laccato opaco bianco, completa di stipiti e mostrine da 8cm in multistrato. Serratura magnetica, cerniere a scomparsa, maniglia cromo satinato.'

const MANIGLIA = { qta: 2, prezzoUnitario: 45, modello: 'Olivari Rio', finitura: 'cromo satinato' }

function seminaRighe(rs: RigaPorta[]) {
  useQuoteStore.setState((s) => ({
    sezioni: { ...s.sezioni, porte: { sconto: 0, righe: rs } },
  }))
}

const rigaBase = (over: Partial<RigaPorta> = {}): RigaPorta => ({
  id: 'r1',
  modelloNome: 'GIOTTO',
  altezzaCm: 210,
  optionals: [],
  ...over,
})

/** La riga <tr> che contiene il modello, per asserire dentro le sue celle. */
function rigaPorta(): HTMLElement {
  return screen.getByText('GIOTTO').closest('tr') as HTMLElement
}

describe('PreventivoPrint — colonne Qtà / prezzo unitario / importo (formato 1147)', () => {
  beforeEach(() => {
    useQuoteStore.getState().resetAll()
    usePricelistStore.setState({ porte: validatoPerTest(LISTINO) })
  })
  afterEach(() => cleanup())

  it('intestazioni: Qtà, Prezzo unitario e Importo (come Quantità/Prezzo/Importo del 1147)', () => {
    seminaRighe([rigaBase({ quantita: 2 })])
    render(<PreventivoPrint />)
    expect(screen.getByText('Qtà')).toBeTruthy()
    expect(screen.getByText('Prezzo unitario')).toBeTruthy()
    expect(screen.getByText('Importo')).toBeTruthy()
  })

  it('qta 2: stampa 2, il prezzo UNITARIO (700) e l importo (1.400)', () => {
    seminaRighe([rigaBase({ quantita: 2 })])
    render(<PreventivoPrint />)
    const tr = rigaPorta()
    expect(within(tr).getByText('2')).toBeTruthy()
    expect(tr.textContent).toContain('700,00')
    expect(tr.textContent).toContain('1.400,00')
  })

  it('riga LEGACY senza quantita: stampa 1 e l importo NON cambia', () => {
    seminaRighe([rigaBase()])
    render(<PreventivoPrint />)
    const tr = rigaPorta()
    expect(within(tr).getByText('1')).toBeTruthy()
    expect(tr.textContent).toContain('700,00')
    const totalRow = screen.getByText(/^Totale imponibile$/).closest('tr')
    expect(totalRow?.textContent).toContain('700,00')
  })

  it('il totale imponibile somma gli importi, non i prezzi unitari', () => {
    seminaRighe([rigaBase({ quantita: 3 })])
    render(<PreventivoPrint />)
    const totalRow = screen.getByText(/^Totale imponibile$/).closest('tr')
    expect(totalRow?.textContent).toContain('2.100,00')
  })

  it('riga irrisolvibile: resta "prezzo da definire", la quantità non la valorizza', () => {
    seminaRighe([rigaBase({ modelloNome: 'SPARITO', quantita: 3 })])
    render(<PreventivoPrint />)
    expect(screen.getByText('prezzo da definire')).toBeTruthy()
    // Una voce da definire rende il totale finale PARZIALE, e lo dice.
    const totalRow = screen.getByText(/^Totale imponibile parziale$/).closest('tr')
    expect(totalRow?.textContent).toContain('0,00')
  })
})

describe('PreventivoPrint — la maniglia nel PDF', () => {
  beforeEach(() => {
    useQuoteStore.getState().resetAll()
    usePricelistStore.setState({ porte: validatoPerTest(LISTINO) })
  })
  afterEach(() => cleanup())

  it('maniglia valorizzata: compare come voce con la sua quantità e il suo importo', () => {
    seminaRighe([rigaBase({ maniglia: MANIGLIA })])
    render(<PreventivoPrint />)
    // DUE occorrenze, ed è il progetto: il testo derivato la NOMINA ("maniglia
    // Olivari Rio cromo satinato", al posto della standard inclusa) e la voce
    // sotto la PREZZA. Una sola delle due lascerebbe il cliente a dedurre.
    expect(screen.getAllByText(/Olivari Rio/)).toHaveLength(2)
    expect(screen.getByText(/\+ maniglia Olivari Rio cromo satinato/)).toBeTruthy()
    const tr = rigaPorta()
    expect(tr.textContent).toContain('× 2 = € 90,00')
    // 700 porta + 90 maniglia (2 × 45), la maniglia FUORI dal moltiplicatore.
    expect(tr.textContent).toContain('790,00')
  })

  it('maniglia fuori dal moltiplicatore: 3 porte + 2 maniglie = 2.100 + 90', () => {
    seminaRighe([rigaBase({ quantita: 3, maniglia: MANIGLIA })])
    render(<PreventivoPrint />)
    const totalRow = screen.getByText(/^Totale imponibile$/).closest('tr')
    expect(totalRow?.textContent).toContain('2.190,00')
  })

  it('senza maniglia: nessuna voce maniglia nel PDF', () => {
    seminaRighe([rigaBase()])
    render(<PreventivoPrint />)
    expect(screen.queryByText(/Olivari Rio/)).toBeNull()
  })
})

describe('PreventivoPrint — il testo di default deriva la maniglia, non la quantità', () => {
  beforeEach(() => {
    useQuoteStore.getState().resetAll()
    usePricelistStore.setState({ porte: validatoPerTest(LISTINO) })
  })
  afterEach(() => cleanup())

  it('la quantità non entra nel testo: 1, 2 e 5 porte danno il testo di sempre', () => {
    // Punto 5 di Antonio (14/10): la quantità sta solo nella colonna Qtà.
    for (const quantita of [undefined, 1, 2, 5]) {
      expect(descrizionePortaDi(rigaBase({ quantita }))).toBe(TESTO_LEGACY)
    }
  })

  it('2 porte dello stesso modello: il testo senza «n.2», la colonna Qtà dice 2', () => {
    seminaRighe([rigaBase({ quantita: 2 })])
    render(<PreventivoPrint />)
    const tr = rigaPorta()
    expect(tr.textContent).not.toContain('n.2')
    expect(within(tr).getByText(TESTO_LEGACY)).toBeTruthy()
    expect(within(tr).getByText('2')).toBeTruthy()
  })

  it('descrizione scritta a mano con «n.2»: resta com\'è, è una promessa dell\'utente', () => {
    seminaRighe([rigaBase({ quantita: 2, descrizione: 'n.2 Porta a battente su misura' })])
    render(<PreventivoPrint />)
    expect(within(rigaPorta()).getByText('n.2 Porta a battente su misura')).toBeTruthy()
    expect(within(rigaPorta()).getByText('2')).toBeTruthy()
  })

  it('maniglia valorizzata: il testo NOMINA quella maniglia, non promette la standard', () => {
    // Altrimenti il PDF descrive una maniglia inclusa e ne fattura un'altra.
    seminaRighe([rigaBase({ maniglia: MANIGLIA })])
    render(<PreventivoPrint />)
    const testo = descrizionePorteDefault('GIOTTO', MANIGLIA)
    // Con prezzo è un modello extra: "mod." davanti al modello, e niente "inclusa".
    expect(testo).toContain('maniglia mod. Olivari Rio cromo satinato.')
    expect(testo).not.toContain('inclusa')
    expect(testo).not.toContain('maniglia cromo satinato')
    expect(screen.getByText(testo)).toBeTruthy()
  })

  it('descrizione EDITATA: resta la promessa dell utente anche cambiando quantità', () => {
    seminaRighe([rigaBase({ quantita: 2, descrizione: 'Porta scorrevole a scomparsa' })])
    render(<PreventivoPrint />)
    expect(screen.getByText('Porta scorrevole a scomparsa')).toBeTruthy()
    expect(screen.queryByText(/^n\.2 Porta mod\./)).toBeNull()
    // …ma la COLONNA dice comunque la verità: è la ragione per cui esiste.
    expect(within(rigaPorta()).getByText('2')).toBeTruthy()
  })

  it('descrizione editata + maniglia: nessuna ricomposizione, la voce maniglia resta', () => {
    seminaRighe([rigaBase({ descrizione: 'Testo mio', maniglia: MANIGLIA })])
    render(<PreventivoPrint />)
    expect(screen.getByText('Testo mio')).toBeTruthy()
    expect(screen.getByText(/Olivari Rio/)).toBeTruthy()
  })
})

// Regola di Antonio (06/10): prezzo VUOTO = maniglia inclusa (standard), prezzo
// valorizzato = modello extra che si somma. La finitura resta, dopo il modello.
describe('PreventivoPrint — maniglia inclusa (prezzo vuoto)', () => {
  const INCLUSA = { qta: 2, modello: 'Olivari Rio', finitura: 'cromo satinato' }

  beforeEach(() => {
    useQuoteStore.getState().resetAll()
    usePricelistStore.setState({ porte: validatoPerTest(LISTINO) })
  })
  afterEach(() => cleanup())

  it('riga legacy senza maniglia: testo identico a oggi, nessuna voce maniglia', () => {
    expect(descrizionePorteDefault('GIOTTO')).toBe(TESTO_LEGACY)
    seminaRighe([rigaBase()])
    render(<PreventivoPrint />)
    expect(screen.getByText(TESTO_LEGACY)).toBeTruthy()
    expect(screen.queryByText(/\+ maniglia/)).toBeNull()
  })

  it('inclusa senza prezzo: testo "maniglia mod. … inclusa" e totale invariato', () => {
    const testo = descrizionePorteDefault('GIOTTO', INCLUSA)
    expect(testo).toContain('maniglia mod. Olivari Rio cromo satinato inclusa.')
    seminaRighe([rigaBase({ maniglia: INCLUSA })])
    render(<PreventivoPrint />)
    expect(screen.getByText(testo)).toBeTruthy()
    const totalRow = screen.getByText(/^Totale imponibile$/).closest('tr')
    expect(totalRow?.textContent).toContain('700,00')
  })

  it('inclusa senza prezzo: la voce sotto dice "inclusa" e non stampa importi', () => {
    seminaRighe([rigaBase({ maniglia: INCLUSA })])
    render(<PreventivoPrint />)
    const voce = screen.getByText(/\+ maniglia mod\. Olivari Rio/)
    expect(voce.textContent).toBe('+ maniglia mod. Olivari Rio cromo satinato — inclusa')
    expect(voce.textContent).not.toContain('€')
  })

  it('prezzo 0 vale come vuoto: inclusa', () => {
    const testo = descrizionePorteDefault('GIOTTO', { ...INCLUSA, prezzoUnitario: 0 })
    expect(testo).toContain('inclusa.')
  })

  it('extra con prezzo: totale + qta × prezzo, voce col suo importo, testo senza "inclusa"', () => {
    seminaRighe([rigaBase({ maniglia: { ...INCLUSA, prezzoUnitario: 45 } })])
    render(<PreventivoPrint />)
    // Sulla riga della porta: le condizioni contrattuali dicono "IVA inclusa".
    expect(rigaPorta().textContent).not.toContain('inclusa')
    expect(rigaPorta().textContent).toContain('maniglia mod. Olivari Rio cromo satinato.')
    expect(rigaPorta().textContent).toContain('× 2 = € 90,00')
    expect(rigaPorta().textContent).toContain('790,00')
  })

  it('modello vuoto e niente prezzo: testo standard invariato, nessuna voce', () => {
    const vuota = { qta: 1, modello: '  ', finitura: '' }
    expect(descrizionePorteDefault('GIOTTO', vuota)).toBe(TESTO_LEGACY)
    seminaRighe([rigaBase({ maniglia: vuota })])
    render(<PreventivoPrint />)
    expect(screen.queryByText(/\+ maniglia/)).toBeNull()
  })
})

// Con una porta irrisolvibile il blocco Porte diceva "Totale parziale Porte",
// ma la riga finale restava "TOTALE GENERALE": lo stesso silenzio del gres.
describe('PreventivoPrint — porte da definire: il totale finale si dichiara parziale', () => {
  beforeEach(() => {
    useQuoteStore.getState().resetAll()
    usePricelistStore.setState({ porte: validatoPerTest(LISTINO), marmeria: null })
  })
  afterEach(() => cleanup())

  it('una porta irrisolvibile: riga finale "TOTALE PARZIALE" con il motivo', () => {
    seminaRighe([rigaBase(), rigaBase({ id: 'r2', modelloNome: 'INESISTENTE' })])
    render(<PreventivoPrint />)
    expect(screen.queryByText(/^Totale imponibile$/)).toBeNull()
    const totale = screen.getByText(/^Totale imponibile parziale$/).closest('tr')
    expect(totale?.textContent).toContain('700,00') // solo la porta prezzata
    expect(screen.getByText('totale parziale — Porte da definire')).toBeTruthy()
  })

  it('gres senza listino e porte da definire: il motivo le elenca entrambe', () => {
    seminaRighe([rigaBase({ modelloNome: 'INESISTENTE' })])
    useQuoteStore.getState().addRigaMateriale({
      materialeKey: 'k', spessore: 13, fascia: 'fino62', profonditaCm: 60, qtaMq: 1, prezzoMq: 100, totale: 100,
    })
    render(<PreventivoPrint />)
    expect(screen.getByText('totale parziale — Marmeria / Gres, Porte da definire')).toBeTruthy()
  })

  it('presidio: nessun da definire, "Totale imponibile" invariato', () => {
    seminaRighe([rigaBase()])
    render(<PreventivoPrint />)
    expect(screen.getByText(/^Totale imponibile$/)).toBeTruthy()
    expect(screen.queryByText(/^Totale imponibile parziale$/)).toBeNull()
    expect(screen.queryByText(/^totale parziale —/)).toBeNull()
  })
})
