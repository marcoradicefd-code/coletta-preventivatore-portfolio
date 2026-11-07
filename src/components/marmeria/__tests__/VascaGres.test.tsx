import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import type { ListinoMarmeria } from '@/types/marmeria'

// VascaGres → quoteStore → pricelistStore → supabase: mock minimale per restare
// hermetici (nessun env, nessuna rete), come negli altri test di componenti.
vi.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: () => ({}) } },
  LISTINI_BUCKET: 'Listini',
}))

import { VascaGres } from '@/components/marmeria/VascaGres'
import { MarmeriaRiepilogo } from '@/components/marmeria/MarmeriaRiepilogo'
import { useQuoteStore } from '@/store/quoteStore'
import { usePricelistStore } from '@/store/pricelistStore'
import { validatoPerTest } from '@/test-utils/listinoValidato'
import { VASCA_DESCRIZIONE } from '@/data/gres/vascaGres'
import { listinoCucinaFinto, VASCA_PREZZO_FINTO } from '@/test-utils/catalogoCucinaFinto'

// Listino cucine finto nello store, come dal bucket: il prezzo vero della vasca
// non entra nei test (D7).
beforeEach(() => usePricelistStore.setState({ cucine: validatoPerTest(listinoCucinaFinto) }))


// Il prezzo della vasca viene dal listino cucine, il riepilogo dal listino gres
// (senza non renderizza) → listino gres minimo, senza materiali né lavorazioni.
const listino: ListinoMarmeria = {
  materiali: [],
  lavorazioniBordo: [],
  lavorazioniVarie: [],
  vascheIntegrate: [],
  rilMontScaglioni: [],
  scontiDisponibili: [0],
  aggiornato: '',
}

const vascaStore = () => useQuoteStore.getState().sezioni.gres!.vasca

describe('VascaGres — checkbox', () => {
  beforeEach(() => {
    usePricelistStore.setState({ marmeria: validatoPerTest(listino) })
    useQuoteStore.getState().resetMarmeria()
  })
  afterEach(() => cleanup())

  it('parte non spuntata, senza campo prezzo', () => {
    render(<VascaGres />)
    expect((screen.getByLabelText(VASCA_DESCRIZIONE) as HTMLInputElement).checked).toBe(false)
    // Il prezzo si mostra solo a vasca inclusa: niente campo morto.
    expect(screen.queryByLabelText('Prezzo vasca')).toBeNull()
  })

  it('spuntandola include la vasca e snapshotta il prezzo di default', () => {
    render(<VascaGres />)
    fireEvent.click(screen.getByLabelText(VASCA_DESCRIZIONE))

    expect(vascaStore()).toEqual({ inclusa: true, prezzo: VASCA_PREZZO_FINTO })
    expect((screen.getByLabelText('Prezzo vasca') as HTMLInputElement).value).toBe(
      String(VASCA_PREZZO_FINTO)
    )
  })

  it('togliendo la spunta la vasca esce dal preventivo, ma il prezzo resta', () => {
    render(<VascaGres />)
    const cb = screen.getByLabelText(VASCA_DESCRIZIONE)
    fireEvent.click(cb)
    fireEvent.change(screen.getByLabelText('Prezzo vasca'), { target: { value: '1200' } })
    fireEvent.click(cb)

    expect(vascaStore()).toEqual({ inclusa: false, prezzo: 1200 })
    expect(screen.queryByLabelText('Prezzo vasca')).toBeNull()
  })
})

// Opzione A (PR 10b-2): senza un prezzo di default la casella è disattivata col
// motivo; una vasca già inclusa resta com'è.
describe('VascaGres — senza il prezzo nel listino cucine', () => {
  beforeEach(() => {
    usePricelistStore.setState({ marmeria: validatoPerTest(listino) })
    useQuoteStore.getState().resetMarmeria()
  })
  afterEach(() => cleanup())

  it('listino cucine assente: casella disattivata col motivo, e cliccarla non include', () => {
    usePricelistStore.setState({ cucine: null })
    render(<VascaGres />)
    const cb = screen.getByLabelText(VASCA_DESCRIZIONE) as HTMLInputElement
    expect(cb.disabled).toBe(true)
    expect(screen.getByText('Listino Cucine non caricato: il prezzo della vasca viene da lì.')).toBeTruthy()
    fireEvent.click(cb)
    expect(vascaStore()).toBeUndefined()
  })

  it('listino cucine senza la riga della vasca: casella disattivata col suo motivo', () => {
    usePricelistStore.setState({ cucine: validatoPerTest({ ...listinoCucinaFinto, vascaGres: null }) })
    render(<VascaGres />)
    expect((screen.getByLabelText(VASCA_DESCRIZIONE) as HTMLInputElement).disabled).toBe(true)
    expect(screen.getByText('Il listino cucine non ha il prezzo della vasca.')).toBeTruthy()
  })

  it('vasca già inclusa e poi listino assente: casella attiva e prezzo congelato', () => {
    useQuoteStore.getState().setVasca({ inclusa: true })
    usePricelistStore.setState({ cucine: null })
    render(<VascaGres />)
    expect((screen.getByLabelText(VASCA_DESCRIZIONE) as HTMLInputElement).disabled).toBe(false)
    expect((screen.getByLabelText('Prezzo vasca') as HTMLInputElement).value).toBe(String(VASCA_PREZZO_FINTO))
    expect(screen.queryByText(/il prezzo della vasca viene da lì/)).toBeNull()
  })
})

describe('VascaGres — prezzo editabile → riepilogo', () => {
  beforeEach(() => {
    usePricelistStore.setState({ marmeria: validatoPerTest(listino) })
    useQuoteStore.getState().resetMarmeria()
  })
  afterEach(() => cleanup())

  // La riga "Vasca" del riepilogo (label corta, come i subtotali fratelli).
  const rigaVasca = () => screen.queryByText('Vasca')?.closest('div')

  it('la riga Vasca compare solo a vasca inclusa', () => {
    render(<MarmeriaRiepilogo />)
    expect(rigaVasca()).toBeUndefined()

    cleanup()
    useQuoteStore.getState().setVasca({ inclusa: true })
    render(<MarmeriaRiepilogo />)
    expect(rigaVasca()?.textContent).toContain('1.240,00')
  })

  it('editando il prezzo il riepilogo si aggiorna (riga Vasca + totale)', () => {
    render(
      <>
        <VascaGres />
        <MarmeriaRiepilogo />
      </>
    )
    fireEvent.click(screen.getByLabelText(VASCA_DESCRIZIONE))
    expect(rigaVasca()?.textContent).toContain('1.240,00')

    fireEvent.change(screen.getByLabelText('Prezzo vasca'), { target: { value: '1200' } })

    expect(vascaStore()!.prezzo).toBe(1200)
    expect(rigaVasca()?.textContent).toContain('1.200,00')
    // Il totale lordo segue: la vasca è dentro il lordo, non appiccicata dopo.
    expect(screen.getByText('Totale lordo').closest('div')?.textContent).toContain('1.200,00')
  })
})
