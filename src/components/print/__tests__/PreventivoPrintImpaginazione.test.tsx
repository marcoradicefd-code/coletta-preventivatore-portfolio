import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

vi.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: () => ({}) } },
  LISTINI_BUCKET: 'Listini',
}))

import { PreventivoPrint } from '@/components/print/PreventivoPrint'
import { useQuoteStore } from '@/store/quoteStore'
import { FALLBACK_PROGETTO_VALORE } from '@/store/quoteFallbacks'
import { articoloPZ } from '@/test-utils/articoli'

/**
 * Impaginazione del PDF (C4, C5, C6 della revisione L15-L21). jsdom non
 * impagina: qui si provano gli stili che la reggono; la misura vera (righe di
 * ogni importo in Chromium con `emulateMedia print`) è l'e2e
 * `e2e/impaginazione-pdf.spec.ts`. Importi finti da 4 e 5 cifre.
 */
beforeEach(() => {
  useQuoteStore.getState().resetAll()
  const s = useQuoteStore.getState()
  const arredo = s.addArredo('Parete attrezzata soggiorno e boiserie con tanti altri elementi')
  s.addArticoloSuMisura({ ...articoloPZ, descrizione: 'Armadio di prova', prezzoUnitario: 12500, arredoId: arredo })
  useQuoteStore.setState((st) => ({
    sezioni: { ...st.sezioni, progettoValore: { ...FALLBACK_PROGETTO_VALORE, righe: [{ id: 'v1', descrizione: 'Voce di prova', prezzo: 99999 }] } },
  }))
})
afterEach(() => cleanup())

/** Le celle e gli span che stampano un importo «€ …». */
const importi = (c: HTMLElement) => [...c.querySelectorAll('td, span')].filter((el) => /^-? ?€\s/.test(el.textContent ?? '') && el.children.length === 0) as HTMLElement[]

describe('PDF: impaginazione degli importi e delle sezioni', () => {
  it('C4: nessun importo va a capo (white-space nowrap su ogni cella e valore «€ …»)', () => {
    const { container } = render(<PreventivoPrint />)
    const celle = importi(container)
    expect(celle.length).toBeGreaterThan(5)
    expect(celle.filter((el) => el.style.whiteSpace !== 'nowrap').map((el) => el.textContent)).toEqual([])
    expect(screen.getAllByText('€ 99.999,00').length).toBeGreaterThan(0)
  })

  it('C4: le colonne degli importi reggono «€ 99.999,00» (almeno 100 px), quelle dei prezzi unitari almeno 96', () => {
    const { container } = render(<PreventivoPrint />)
    const larghezze = [...container.querySelectorAll('th')].map((th) => [th.textContent, Number.parseInt(th.style.width || '0', 10)] as const)
    for (const [nome, w] of larghezze.filter(([n]) => n === 'Totale' || n === 'Importo' || n === 'Prezzo')) expect(w, nome ?? '').toBeGreaterThanOrEqual(100)
    for (const [nome, w] of larghezze.filter(([n]) => /^€\//.test(n ?? ''))) expect(w, nome ?? '').toBeGreaterThanOrEqual(96)
  })

  it('C5: «Subtotale <nome lungo>»: il valore non si comprime e l’etichetta va a capo da sola', () => {
    render(<PreventivoPrint />)
    const etichetta = screen.getByText('Subtotale Parete attrezzata soggiorno e boiserie con tanti altri elementi')
    const valore = etichetta.nextElementSibling as HTMLElement
    expect(valore.style.whiteSpace).toBe('nowrap')
    expect(valore.style.flexShrink).toBe('0')
    expect(etichetta.style.minWidth).toBe('0px')
  })

  it('C6: titolo di sezione mai orfano, riepilogo intero, subtotale attaccato alla sua tabella', () => {
    render(<PreventivoPrint />)
    const titolo = screen.getByText('Falegnameria Su Misura')
    expect(titolo.style.breakAfter).toBe('avoid')
    const riepilogo = screen.getByText('Totale Su Misura').closest('div[data-riepilogo]') as HTMLElement
    expect(riepilogo?.style.breakInside).toBe('avoid')
    const subtotale = screen.getByText(/^Subtotale Parete/).closest('div[data-subtotale-arredo]') as HTMLElement
    expect(subtotale?.style.breakBefore).toBe('avoid')
  })
})
