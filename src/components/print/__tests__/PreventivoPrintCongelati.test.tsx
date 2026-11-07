import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

vi.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: () => ({}) } },
  LISTINI_BUCKET: 'Listini',
}))

import { PreventivoPrint } from '@/components/print/PreventivoPrint'
import { useQuoteStore, initialPreventivo } from '@/store/quoteStore'
import { usePricelistStore } from '@/store/pricelistStore'
import { prezziAdesso } from '@/store/salvataggioStore'
import { listinoCucinaFinto } from '@/test-utils/catalogoCucinaFinto'
import { validatoPerTest } from '@/test-utils/listinoValidato'
import type { PreventivoSalvato, StatoPreventivo } from '@/types/archivio'

/**
 * Strada A: il PDF di un preventivo inviato, accettato o annullato esce dai
 * prezzi congelati al salvataggio, non dal listino di adesso; la bozza resta
 * dal vivo. Solo il listino cucine finto (D7) e una sua copia alzata del 10%.
 */
const LISTINO_A = { ...listinoCucinaFinto, aggiornato: 'listino-cucine-finto-A.xlsx' }
const LISTINO_B = {
  ...listinoCucinaFinto,
  prezzi: listinoCucinaFinto.prezzi.map((p) => ({ ...p, prezzo: Math.round(p.prezzo * 1.1) })),
  aggiornato: 'listino-cucine-finto-B.xlsx',
}
const SALVATO: PreventivoSalvato = { id: 'p-1', anno: 2026, numero: 7, revisione: 0, stato: 'bozza', updatedAt: 'x' }

const totaleImponibile = () => screen.getByRole('rowheader', { name: /^Totale imponibile/ }).nextElementSibling?.textContent

/** Un preventivo con una voce cucina, salvato con lo stato dato e i prezzi del listino A. */
function salvatoCon(stato: StatoPreventivo) {
  useQuoteStore.getState().collegaCliente('c-0001', { ...initialPreventivo.cliente, nome: 'Cliente', cognome: 'Prova' })
  useQuoteStore.getState().setVoceQuantita('base-pensile-laminato', 3)
  usePricelistStore.setState({ cucine: validatoPerTest(LISTINO_A) })
  useQuoteStore.getState().impostaSalvato({ ...SALVATO, stato }, prezziAdesso(useQuoteStore.getState().sezioni))
}

beforeEach(() => {
  useQuoteStore.getState().resetAll()
  usePricelistStore.setState({ marmeria: null, porte: null, cucine: null })
})
afterEach(() => cleanup())

describe('PDF e prezzi congelati (strada A)', () => {
  it.each(['inviato', 'accettato', 'annullato'] as const)('%s: col listino cambiato il PDF stampa i prezzi dell’invio', (stato) => {
    salvatoCon(stato)
    render(<PreventivoPrint />)
    const dellInvio = totaleImponibile()
    cleanup()
    usePricelistStore.setState({ cucine: validatoPerTest(LISTINO_B) })
    render(<PreventivoPrint />)
    expect(totaleImponibile()).toBe(dellInvio)
  })

  it('bozza: il PDF resta dal vivo, col listino di adesso', () => {
    salvatoCon('bozza')
    render(<PreventivoPrint />)
    const prima = totaleImponibile()
    cleanup()
    usePricelistStore.setState({ cucine: validatoPerTest(LISTINO_B) })
    render(<PreventivoPrint />)
    expect(totaleImponibile()).not.toBe(prima)
  })

  it('inviato senza il listino cucine caricato: il PDF ha comunque la cucina coi prezzi congelati', () => {
    salvatoCon('inviato')
    usePricelistStore.setState({ cucine: null })
    render(<PreventivoPrint />)
    expect(screen.getByText('Totale cucina')).toBeTruthy()
    expect(screen.queryByText('Listino non disponibile: importi da definire')).toBeNull()
  })

  it('inviato con le sezioni cambiate dopo il salvataggio: i prezzi congelati non valgono più, il PDF è dal vivo', () => {
    salvatoCon('inviato')
    useQuoteStore.getState().setVoceQuantita('base-pensile-laminato', 5)
    usePricelistStore.setState({ cucine: validatoPerTest(LISTINO_B) })
    render(<PreventivoPrint />)
    const vivo = totaleImponibile()
    cleanup()
    useQuoteStore.getState().impostaSalvato({ ...SALVATO, stato: 'bozza' })
    render(<PreventivoPrint />)
    expect(totaleImponibile()).toBe(vivo)
  })
})
