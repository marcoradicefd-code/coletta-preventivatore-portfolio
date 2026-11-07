import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import { useState } from 'react'
import { QtyInput } from '@/components/shared/QtyInput'

// Il tetto per riga resta (lastra max 162×324 = 5,25 mq; una cucina da 7 m
// lineari fa circa 4,4 mq di top): oltre il massimo il valore si limita, ma
// lo si dice con un testo che resta, non con un bordo rosso per un secondo.

/** QtyInput controllato come nelle tabelle gres: il valore torna dallo stato. */
function Campo({ unita, onValore }: { unita: string; onValore?: (v: number) => void }) {
  const [valore, setValore] = useState(0)
  return (
    <QtyInput
      context="marmeria"
      unitaMisura={unita}
      value={valore}
      onChange={(v) => {
        setValore(v)
        onValore?.(v)
      }}
    />
  )
}

const campo = () => screen.getByRole('spinbutton') as HTMLInputElement

describe('QtyInput — oltre il massimo per riga', () => {
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('25 mq: si limita a 20, il campo mostra 20 e un messaggio dice perché', () => {
    const onValore = vi.fn()
    render(<Campo unita="MQ" onValore={onValore} />)
    fireEvent.change(campo(), { target: { value: '25' } })
    // Il calcolo usa lo stesso valore che l'utente vede nel campo.
    expect(onValore).toHaveBeenLastCalledWith(20)
    expect(campo().value).toBe('20')
    const msg = screen.getByRole('status')
    expect(msg.textContent).toBe('Massimo 20 mq per riga: aggiungi una riga per quantità maggiori')
    expect(campo().getAttribute('aria-describedby')).toBe(msg.id)
  })

  it('il messaggio resta: non è un lampo di un secondo', () => {
    vi.useFakeTimers()
    render(<Campo unita="MQ" />)
    fireEvent.change(campo(), { target: { value: '25' } })
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(screen.getByRole('status').textContent).toContain('Massimo 20 mq per riga')
  })

  it('tornando nel limite il messaggio sparisce', () => {
    render(<Campo unita="MQ" />)
    fireEvent.change(campo(), { target: { value: '25' } })
    fireEvent.change(campo(), { target: { value: '15' } })
    expect(screen.queryByRole('status')).toBeNull()
    expect(campo().getAttribute('aria-describedby')).toBeNull()
  })

  it('dentro il limite: nessun messaggio, valore passato com è', () => {
    const onValore = vi.fn()
    render(<Campo unita="MQ" onValore={onValore} />)
    fireEvent.change(campo(), { target: { value: '4.4' } })
    expect(onValore).toHaveBeenLastCalledWith(4.4)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('ml e pezzi: il messaggio legge il limite e l unità della riga', () => {
    render(<Campo unita="ML" />)
    fireEvent.change(campo(), { target: { value: '60' } })
    expect(screen.getByRole('status').textContent).toBe(
      'Massimo 50 ml per riga: aggiungi una riga per quantità maggiori'
    )
    cleanup()
    render(<Campo unita="PEZZO" />)
    fireEvent.change(campo(), { target: { value: '51' } })
    expect(screen.getByRole('status').textContent).toBe(
      'Massimo 50 pezzi per riga: aggiungi una riga per quantità maggiori'
    )
  })
})
