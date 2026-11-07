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

const LISTINO: ListinoPorte = {
  modelli: [{ nome: 'GIOTTO', prezzo2026: 700, h215: 900, h240: 1000 }],
  optional: [{ nome: 'STIPITI', unita: 'PORTA', prezzo: 150 }],
  aggiornato: 'PORTE_2026.xlsx',
}

function seminaRighe(rs: RigaPorta[]) {
  useQuoteStore.setState((s) => ({
    sezioni: { ...s.sezioni, porte: { sconto: 0, righe: rs } },
  }))
}

describe('PreventivoPrint — porte senza prezzo ricostruibile', () => {
  beforeEach(() => {
    useQuoteStore.getState().resetAll()
    usePricelistStore.setState({ porte: validatoPerTest(LISTINO) })
  })
  afterEach(() => cleanup())

  it('la riga irrisolvibile stampa "prezzo da definire", non € 0,00', () => {
    // € 0,00 su un PDF che va al cliente è una promessa: quella porta gliela hai
    // appena regalata. "Da definire" è l'unica cosa onesta da stampare quando il
    // prezzo non è ricostruibile.
    seminaRighe([{ id: 'persa', modelloNome: 'MODELLO SPARITO', altezzaCm: 210, optionals: [] }])
    render(<PreventivoPrint />)

    // Scoped alla RIGA: i € 0,00 di subtotale e totale generale sono legittimi
    // (la sezione non ha nessuna riga prezzabile), quello nella cella no.
    const riga = screen.getByText('MODELLO SPARITO').closest('tr')
    expect(riga).toBeTruthy()
    expect(within(riga!).getByText(/prezzo da definire/i)).toBeTruthy()
    expect(within(riga!).queryByText(/€ 0,00/)).toBeNull()
  })

  it('la riga irrisolvibile NON entra nel totale, e il totale si dichiara parziale', () => {
    seminaRighe([
      { id: 'ok', modelloNome: 'GIOTTO', altezzaCm: 210, optionals: [] },
      { id: 'persa', modelloNome: 'MODELLO SPARITO', altezzaCm: 210, optionals: [] },
    ])
    render(<PreventivoPrint />)

    // Il totale è quello della sola riga con un prezzo vero: la persa non entra
    // come zero, che abbasserebbe il conto in silenzio.
    expect(screen.getAllByText('€ 700,00').length).toBeGreaterThan(0)
    expect(screen.getByText('Totale parziale Porte')).toBeTruthy()
    expect(screen.queryByText('Totale Porte')).toBeNull()
    expect(screen.getByText(/1 voce da definire/i)).toBeTruthy()
  })

  it('due righe irrisolvibili: il conteggio è al plurale', () => {
    seminaRighe([
      { id: 'p1', modelloNome: 'SPARITO A', altezzaCm: 210, optionals: [] },
      { id: 'p2', modelloNome: 'SPARITO B', altezzaCm: 210, optionals: [] },
    ])
    render(<PreventivoPrint />)

    expect(screen.getByText(/2 voci da definire/i)).toBeTruthy()
  })

  it('tutte le righe con prezzo: nessuna dicitura parziale, totale normale', () => {
    seminaRighe([{ id: 'ok', modelloNome: 'GIOTTO', altezzaCm: 210, optionals: [] }])
    render(<PreventivoPrint />)

    expect(screen.queryByText(/da definire/i)).toBeNull()
    expect(screen.queryByText(/totale parziale/i)).toBeNull()
    expect(screen.getByText('Totale Porte')).toBeTruthy()
  })
})

// O4 (decisione di Marco, 09/10): la porta senza altezza è «da completare», come il
// battiscopa senza misure. Prima usciva «0 cm · fascia base» col prezzo pieno.
describe('PreventivoPrint — porta senza altezza: da completare', () => {
  beforeEach(() => {
    useQuoteStore.getState().resetAll()
    usePricelistStore.setState({ porte: validatoPerTest(LISTINO), marmeria: null })
  })
  afterEach(() => cleanup())

  it('la riga stampa trattini in altezza e prezzo unitario, «da completare» nell Importo, mai € 0,00', () => {
    seminaRighe([{ id: 'senza-h', modelloNome: 'GIOTTO', altezzaCm: 0, optionals: [] }])
    render(<PreventivoPrint />)

    const celle = Array.from(screen.getByText('GIOTTO').closest('tr')!.querySelectorAll('td')).map((td) => td.textContent)
    // Modello · Altezza / fascia · Optional · Qtà · Prezzo unitario · Importo
    expect(celle.slice(1)).toEqual(['—', '—', '1', '—', 'da completare'])
    expect(celle.join(' ')).not.toMatch(/€/)
  })

  it('con una porta prezzata accanto: il totale è solo quella, e il TOTALE si dichiara parziale', () => {
    seminaRighe([
      { id: 'ok', modelloNome: 'GIOTTO', altezzaCm: 210, optionals: [] },
      { id: 'senza-h', modelloNome: 'GIOTTO', altezzaCm: 0, optionals: [] },
    ])
    render(<PreventivoPrint />)

    expect(screen.getByText('Totale parziale Porte')).toBeTruthy()
    expect(screen.getByText(/1 voce da definire/i)).toBeTruthy()
    expect(screen.queryByText(/^Totale imponibile$/)).toBeNull()
    expect(screen.getByText(/^Totale imponibile parziale$/).closest('tr')?.textContent).toContain('700,00')
    expect(screen.getByText('totale parziale — Porte da definire')).toBeTruthy()
  })
})

// Decisione 1 di Marco (09/10): sotto una porta fuori dal subtotale la voce
// maniglia resta, ma senza «= € …»: sarebbe un importo che non sta in nessun totale.
describe('PreventivoPrint — maniglia sotto una porta non valorizzata', () => {
  beforeEach(() => {
    useQuoteStore.getState().resetAll()
    usePricelistStore.setState({ porte: validatoPerTest(LISTINO), marmeria: null })
  })
  afterEach(() => cleanup())

  const maniglia = { qta: 2, modello: 'Olivari', finitura: '', prezzoUnitario: 45 }
  const voceManiglia = (modello: string) =>
    Array.from(screen.getByText(modello).closest('tr')!.querySelectorAll('td > div'))
      .map((d) => d.textContent ?? '')
      .find((t) => t.startsWith('+ maniglia'))

  it('porta da completare o irrisolvibile: voce senza importo; porta prezzata: con importo', () => {
    seminaRighe([
      { id: 'senza-h', modelloNome: 'GIOTTO', altezzaCm: 0, optionals: [], maniglia },
      { id: 'persa', modelloNome: 'MODELLO SPARITO', altezzaCm: 210, optionals: [], maniglia },
    ])
    render(<PreventivoPrint />)
    expect(voceManiglia('GIOTTO')).toBe('+ maniglia Olivari × 2')
    expect(voceManiglia('MODELLO SPARITO')).toBe('+ maniglia Olivari × 2')
    cleanup()

    seminaRighe([{ id: 'ok', modelloNome: 'GIOTTO', altezzaCm: 210, optionals: [], maniglia }])
    render(<PreventivoPrint />)
    expect(voceManiglia('GIOTTO')).toBe('+ maniglia Olivari × 2 = € 90,00')
  })
})
