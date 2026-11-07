import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

vi.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: () => ({}) } },
  LISTINI_BUCKET: 'Listini',
}))

import { TopTable } from '@/components/marmeria/TopTable'
import { useQuoteStore } from '@/store/quoteStore'
import { usePricelistStore } from '@/store/pricelistStore'
import { validatoPerTest } from '@/test-utils/listinoValidato'
import type { ListinoMarmeria } from '@/types/marmeria'

// `minimoFatturabile` è un importo in €: la tabella lo mostrava come «Min. … mq»,
// acceso su ogni riga (nessuna quantità arriva a un importo). Il badge è uscito (A5).
const listino: ListinoMarmeria = {
  materiali: [
    {
      produttore: 'DEKTON', colore: 'Adia', tipoSuperficie: 'Opaco', coloreFinituraCompleto: 'Adia_Opaco',
      collezione: 'IND', tipologia: 'LAPITEC',
      spessori: { 13: { spessore: 13, disponibile: true, prezziMq: { fino62: 500, da63a70: 550, oltre70: 600 }, minimoFatturabile: 1200 } },
      alzatinaAltezza: 0, alzatinaEuroMl: 0, schienaleEuroMq: 0,
    },
  ],
  lavorazioniBordo: [], lavorazioniVarie: [], vascheIntegrate: [],
  rilMontScaglioni: [], scontiDisponibili: [0], aggiornato: '',
}

describe('TopTable — niente badge «Min. … mq»', () => {
  beforeEach(() => {
    useQuoteStore.getState().resetAll()
    usePricelistStore.setState({ marmeria: validatoPerTest(listino) })
  })
  afterEach(() => {
    cleanup()
    usePricelistStore.setState({ marmeria: null })
  })

  it('una riga sotto e una sopra i 2 mq: nessun badge sul minimo', () => {
    const s = useQuoteStore.getState()
    s.addRigaMateriale({ materialeKey: 'Adia_Opaco', spessore: 13, fascia: 'fino62', profonditaCm: 60, qtaMq: 1, prezzoMq: 500, totale: 500 })
    s.addRigaMateriale({ materialeKey: 'Adia_Opaco', spessore: 13, fascia: 'fino62', profonditaCm: 60, qtaMq: 5, prezzoMq: 500, totale: 2500 })
    render(<TopTable />)
    expect(screen.getAllByText('DEKTON — Adia')).toHaveLength(2)
    expect(screen.queryByText(/Min\./)).toBeNull()
  })
})

describe('TopTable — l\'importo di riga viene dall\'engine (A4, D4)', () => {
  beforeEach(() => {
    useQuoteStore.getState().resetAll()
    usePricelistStore.setState({ marmeria: validatoPerTest(listino) })
  })
  afterEach(() => {
    cleanup()
    usePricelistStore.setState({ marmeria: null })
  })

  it('totale persistito manomesso: la riga mostra quantità × prezzo all\'euro intero', () => {
    useQuoteStore.getState().addRigaMateriale({
      materialeKey: 'Adia_Opaco', spessore: 13, fascia: 'fino62', profonditaCm: 60, qtaMq: 2.5, prezzoMq: 100.3, totale: 1,
    })
    render(<TopTable />)
    expect(screen.getByText('€ 251,00')).toBeTruthy() // 250,75 → 251
    expect(screen.queryByText('€ 1,00')).toBeNull()
  })
})
