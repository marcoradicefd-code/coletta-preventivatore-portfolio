import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'

vi.mock('@/lib/supabase', () => ({ supabase: { storage: { from: () => ({}) } }, LISTINI_BUCKET: 'Listini' }))

import { ArticoloConfigModal } from '@/components/sumisura/ArticoloConfigModal'
import { articoloPZ } from '@/test-utils/articoli'

afterEach(() => cleanup())

/**
 * U4 (revisione L15-L21): il configuratore non era un dialog (niente ruolo,
 * focus, Esc) e otto campi non avevano un nome accessibile; «Aggiungi al
 * preventivo» si spegneva senza dire cosa mancava. Ora è una `Finestra`.
 */
function monta(iniziale = { ...articoloPZ, um: 'MQ' as const, quantita: null, larghezzaCm: null, altezzaCm: null }) {
  const onClose = vi.fn()
  const onSalva = vi.fn()
  render(<ArticoloConfigModal iniziale={{ ...iniziale, origine: 'manuale' }} modalita="nuovo" onSalva={onSalva} onClose={onClose} />)
  return { onClose, onSalva, dialogo: screen.getByRole('dialog', { name: 'Configura articolo' }) }
}

describe('ArticoloConfigModal — una finestra accessibile (U4)', () => {
  it('è un dialog col titolo come nome, e ogni campo ha il suo nome accessibile', () => {
    const { dialogo } = monta()
    for (const nome of ['Descrizione', 'Larghezza (cm)', 'Altezza (cm)', 'Note', 'Prezzo unitario (€)', 'Finitura interna', 'Finitura esterna', 'Codice finitura (manuale, alternativo)']) {
      expect(within(dialogo).getByLabelText(nome), nome).toBeTruthy()
    }
  })

  it('le unità di misura dicono quale è scelta (aria-pressed), non solo col colore', () => {
    const { dialogo } = monta()
    expect(within(dialogo).getByRole('button', { name: 'Metri quadri (MQ)' }).getAttribute('aria-pressed')).toBe('true')
    expect(within(dialogo).getByRole('button', { name: 'Pezzi (PZ)' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('Esc chiude; «Chiudi senza salvare» chiude', () => {
    const { dialogo, onClose } = monta()
    fireEvent(dialogo, new Event('cancel', { cancelable: true }))
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Chiudi senza salvare' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('«Aggiungi al preventivo» non si spegne: dice cosa manca (aria-describedby) e non salva finché manca', () => {
    const { dialogo, onSalva } = monta()
    const aggiungi = within(dialogo).getByRole('button', { name: /Aggiungi al preventivo/ })
    expect(aggiungi.hasAttribute('disabled')).toBe(false)
    const motivo = document.getElementById(aggiungi.getAttribute('aria-describedby') ?? '')
    expect(motivo?.textContent).toMatch(/Manca: .*misure/)
    fireEvent.click(aggiungi)
    expect(onSalva).not.toHaveBeenCalled()
    fireEvent.change(within(dialogo).getByLabelText('Larghezza (cm)'), { target: { value: '100' } })
    fireEvent.change(within(dialogo).getByLabelText('Altezza (cm)'), { target: { value: '100' } })
    expect(aggiungi.getAttribute('aria-describedby')).toBeNull()
    fireEvent.click(aggiungi)
    expect(onSalva).toHaveBeenCalledTimes(1)
  })
})
