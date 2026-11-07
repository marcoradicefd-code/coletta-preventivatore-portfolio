import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

vi.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: () => ({}) } },
  LISTINI_BUCKET: 'Listini',
}))

import { act } from 'react'
import { useQuoteStore } from '@/store/quoteStore'
import { usePricelistStore } from '@/store/pricelistStore'
import { validatoPerTest } from '@/test-utils/listinoValidato'
import { MarmeriaRiepilogo } from '@/components/marmeria/MarmeriaRiepilogo'
import type { ListinoMarmeria } from '@/types/marmeria'

const LISTINO_GRES: ListinoMarmeria = {
  materiali: [],
  lavorazioniBordo: [],
  lavorazioniVarie: [],
  vascheIntegrate: [],
  rilMontScaglioni: [{ da: 0, a: 2000, importo: 300 }],
  scontiDisponibili: [0],
  aggiornato: '',
}

describe('MarmeriaRiepilogo — rilievo e montaggio', () => {
  beforeEach(() => {
    useQuoteStore.getState().resetAll()
    usePricelistStore.setState({ marmeria: validatoPerTest(LISTINO_GRES) })
  })
  afterEach(() => {
    cleanup()
    usePricelistStore.setState({ marmeria: null })
  })

  it('senza un top la riga non compare anche con la spunta accesa; compare appena c’è un top (A1)', () => {
    useQuoteStore.getState().setIncludiRilMont(true)
    render(<MarmeriaRiepilogo />)
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'Includi rilievo e montaggio' }).checked).toBe(true)
    expect(screen.queryByText('Rilievo + montaggio')).toBeNull()

    act(() => {
      useQuoteStore.getState().addRigaMateriale({
        materialeKey: 'k', spessore: 13, fascia: 'fino62', profonditaCm: 60, qtaMq: 1, prezzoMq: 100, totale: 100,
      })
    })
    expect(screen.getByText('Rilievo + montaggio').closest('div')?.textContent).toContain('300,00')
  })

  it('la tendina sconto mostra gli sconti decimali del listino esatti: 12,5%, non 13% (O18)', () => {
    usePricelistStore.setState({ marmeria: validatoPerTest({ ...LISTINO_GRES, scontiDisponibili: [0, 0.125] }) })
    render(<MarmeriaRiepilogo />)
    expect(screen.getByRole('option', { name: '12,5%' })).toBeTruthy()
    expect(screen.queryByRole('option', { name: '13%' })).toBeNull()
  })

  it('sotto i 2 mq mostra la riga «Integrazione ordine minimo 2 mq» (A5)', () => {
    useQuoteStore.getState().addRigaMateriale({
      materialeKey: 'k', spessore: 13, fascia: 'fino62', profonditaCm: 60, qtaMq: 1.5, prezzoMq: 100, totale: 150,
    })
    render(<MarmeriaRiepilogo />)
    // minimo 2 × 100 = 200, righe 150 → integrazione 50
    expect(screen.getByText('Integrazione ordine minimo 2 mq').closest('div')?.textContent).toContain('50,00')
  })
})
