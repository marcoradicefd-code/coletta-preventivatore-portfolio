import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { FinituraCombobox } from '@/components/sumisura/FinituraCombobox'
import { cercaFiniture } from '@/data/finiture'

// La tastiera del combobox: l'indice attivo si limita a ogni render (prima lo
// riscriveva un effect). Le opzioni non prendono il focus: è il campo a
// gestire frecce, Invio ed Esc (pattern combobox WAI-ARIA).

function monta(props: { creatable?: boolean } = {}) {
  const onChange = vi.fn()
  render(<FinituraCombobox label="Finitura" value="" onChange={onChange} {...props} />)
  const campo = screen.getByRole('combobox')
  fireEvent.focus(campo)
  return { campo, onChange }
}

const attiva = (campo: HTMLElement) => campo.getAttribute('aria-activedescendant')?.split('-opt-')[1]

describe('FinituraCombobox — tastiera', () => {
  afterEach(() => cleanup())

  it('frecce giù e su muovono la riga attiva, Invio sceglie quella', () => {
    const { campo, onChange } = monta()
    expect(attiva(campo)).toBe('0') // "— Nessuna —"

    fireEvent.keyDown(campo, { key: 'ArrowDown' })
    fireEvent.keyDown(campo, { key: 'ArrowDown' })
    expect(attiva(campo)).toBe('2')
    fireEvent.keyDown(campo, { key: 'ArrowUp' })
    expect(attiva(campo)).toBe('1')

    fireEvent.keyDown(campo, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith(cercaFiniture('', 50).opzioni[0].value)
  })

  it('freccia su in cima resta sulla prima riga', () => {
    const { campo } = monta()
    fireEvent.keyDown(campo, { key: 'ArrowUp' })
    expect(attiva(campo)).toBe('0')
  })

  it('lista accorciata dalla ricerca: l indice resta dentro, Invio sceglie una riga che esiste', () => {
    const { campo, onChange } = monta()
    // Nessuna finitura corrisponde: resta solo "— Nessuna —" (riga 0), mentre
    // la digitazione ha portato l'indice salvato a 1.
    fireEvent.change(campo, { target: { value: 'zzqqxx nessuna finitura' } })
    expect(attiva(campo)).toBe('0')

    fireEvent.keyDown(campo, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('Esc chiude la lista senza scegliere', () => {
    const { campo, onChange } = monta()
    fireEvent.keyDown(campo, { key: 'Escape' })
    expect(campo.getAttribute('aria-expanded')).toBe('false')
    expect(onChange).not.toHaveBeenCalled()
  })
})

// U5 (revisione L15-L21): il combobox non aveva nome accessibile, e col Tab la
// lista restava aperta (due popup insieme); la lista era una tappa di Tab in più.
describe('FinituraCombobox — nome e chiusura al Tab (U5)', () => {
  afterEach(() => cleanup())

  it('l’etichetta dà il nome al combobox; uscendo col focus la lista si chiude; la lista non è una tappa di Tab', async () => {
    render(
      <>
        <FinituraCombobox label="Finitura interna" value="" onChange={() => {}} />
        <button type="button">dopo</button>
      </>
    )
    const campo = screen.getByLabelText('Finitura interna')
    expect(campo.getAttribute('role')).toBe('combobox')
    fireEvent.focus(campo)
    const lista = screen.getByRole('listbox')
    expect(lista.getAttribute('tabindex')).toBe('-1')
    fireEvent.blur(campo, { relatedTarget: screen.getByRole('button', { name: 'dopo' }) })
    expect(campo.getAttribute('aria-expanded')).toBe('false')
    // AnimatePresence toglie il nodo al giro dopo l'uscita.
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
  })
})
