import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: () => ({}) } },
  LISTINI_BUCKET: 'Listini',
}))

import { TipologiaSelector } from '@/components/marmeria/TipologiaSelector'
import { ToastProvider } from '@/components/shared/Toast'
import { useQuoteStore } from '@/store/quoteStore'
import { usePricelistStore } from '@/store/pricelistStore'
import { validatoPerTest } from '@/test-utils/listinoValidato'
import type { ListinoMarmeria } from '@/types/marmeria'

const listino: ListinoMarmeria = {
  materiali: [],
  lavorazioniBordo: [
    { id: 1, descrizione: 'Toro', prezzoMlPerTipologia: { QUARZO: 50, LAPITEC: 60, GRES: null } },
    { id: 2, descrizione: 'Becco', prezzoMlPerTipologia: { QUARZO: 40, LAPITEC: 45, GRES: null } },
  ],
  lavorazioniVarie: [],
  vascheIntegrate: [],
  rilMontScaglioni: [],
  scontiDisponibili: [0],
  aggiornato: '',
}

const MSG = 'Tipologia Gres: tolta 1 lavorazione non disponibile — Toro (2,5 ml)'

describe('TipologiaSelector — avviso delle lavorazioni tolte (A2, opzione b)', () => {
  beforeEach(() => {
    useQuoteStore.getState().resetAll()
    usePricelistStore.setState({ marmeria: validatoPerTest(listino) })
  })
  afterEach(() => {
    cleanup()
    usePricelistStore.setState({ marmeria: null })
  })

  it('elenca cosa ha tolto, resta finché lo si chiude, e un cambio successivo avvisa di nuovo', async () => {
    const conToro = () => {
      useQuoteStore.getState().setTipologiaMateriale('LAPITEC')
      useQuoteStore.getState().addRigaLavorazioneBordo({ lavorazioneId: 1, qtaMl: 2.5, prezzoMl: 60, totale: 150 })
    }
    conToro()
    render(<ToastProvider><TipologiaSelector /></ToastProvider>)
    const select = screen.getByRole('combobox')

    fireEvent.change(select, { target: { value: 'GRES' } })
    expect(screen.getByRole('alert').textContent).toContain(MSG)
    expect(useQuoteStore.getState().sezioni.gres!.righeLavorazioniBordo).toEqual([])

    fireEvent.click(screen.getByRole('button', { name: 'Chiudi notifica' }))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull()) // dopo l'animazione d'uscita

    // Stessa riga, stesso cambio: è un fatto nuovo, l'avviso torna.
    fireEvent.change(select, { target: { value: 'LAPITEC' } })
    conToro()
    fireEvent.change(select, { target: { value: 'GRES' } })
    expect(screen.getByRole('alert').textContent).toContain(MSG)
  })

  it('il participio si accorda: «tolta 1 lavorazione», «tolte 2 lavorazioni»', () => {
    const s = useQuoteStore.getState()
    s.setTipologiaMateriale('LAPITEC')
    s.addRigaLavorazioneBordo({ lavorazioneId: 1, qtaMl: 2.5, prezzoMl: 60, totale: 150 })
    s.addRigaLavorazioneBordo({ lavorazioneId: 2, qtaMl: 1, prezzoMl: 45, totale: 45 })
    render(<ToastProvider><TipologiaSelector /></ToastProvider>)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'GRES' } })
    const avviso = screen.getByRole('alert').textContent
    expect(avviso).toContain('Tipologia Gres: tolte 2 lavorazioni non disponibili — Toro (2,5 ml), Becco (1 ml)')
    expect(avviso).not.toContain('tolta')
  })
})
