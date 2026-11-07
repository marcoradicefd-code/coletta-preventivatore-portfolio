import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import type { ListinoMarmeria, Materiale } from '@/types/marmeria'

vi.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: () => ({}) } },
  LISTINI_BUCKET: 'Listini',
}))

import { MaterialSelector } from '@/components/marmeria/MaterialSelector'
import { usePricelistStore } from '@/store/pricelistStore'
import { validatoPerTest } from '@/test-utils/listinoValidato'

const materiale = (produttore: string): Materiale => ({
  produttore,
  colore: 'Bianco',
  tipoSuperficie: 'Opaco',
  coloreFinituraCompleto: `${produttore} Bianco`,
  collezione: '',
  tipologia: 'GRES',
  spessori: {},
  alzatinaAltezza: 0,
  alzatinaEuroMl: 0,
  schienaleEuroMq: 0,
})

const listino = (produttori: string[]): ListinoMarmeria => ({
  materiali: produttori.map(materiale),
  lavorazioniBordo: [],
  lavorazioniVarie: [],
  vascheIntegrate: [],
  rilMontScaglioni: [],
  scontiDisponibili: [0],
  aggiornato: '',
})

// Sonar S2871: `.sort()` senza comparatore ordina per codice carattere, quindi
// le maiuscole prima delle minuscole e le accentate in fondo. Antonio cerca
// il produttore in ordine alfabetico, come lo leggerebbe.
describe('MaterialSelector — produttori in ordine alfabetico italiano', () => {
  afterEach(() => {
    cleanup()
    usePricelistStore.setState({ marmeria: null })
  })

  it('maiuscole e minuscole insieme, accentate al loro posto', () => {
    usePricelistStore.setState({
      marmeria: validatoPerTest(listino(['Zeta', 'Èlite', 'alfa', 'Beta', 'Zeta'])),
    })
    render(<MaterialSelector />)
    const [selectProduttore] = screen.getAllByRole('combobox')
    const opzioni = [...selectProduttore.querySelectorAll('option')].slice(1).map((o) => o.textContent)
    expect(opzioni).toEqual(['alfa', 'Beta', 'Èlite', 'Zeta'])
  })
})
