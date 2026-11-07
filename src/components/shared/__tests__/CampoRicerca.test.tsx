import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { CampoRicerca } from '@/components/shared/CampoRicerca'

afterEach(() => cleanup())

// U8 (revisione L15-L21): «Cancella ricerca» era grigio chiaro (1,95:1) e 24 × 24 px anche su mobile.
describe('CampoRicerca — «Cancella ricerca» leggibile e grande abbastanza (U8, U17)', () => {
  it('la X ha il colore dei testi terziari e un bersaglio di 44 px su mobile (24 da desktop)', () => {
    render(<CampoRicerca value="prova" onChange={() => {}} placeholder="Cerca…" aria-label="Cerca nelle voci" />)
    const x = screen.getByRole('button', { name: 'Cancella ricerca' })
    expect(x.className).toContain('text-ink-tertiary')
    expect(x.className).not.toContain('text-ink-disabled')
    expect(x.className).toMatch(/\bh-11\b/)
    expect(x.className).toMatch(/\bw-11\b/)
    expect(x.className).toMatch(/\bmd:h-6\b/)
    expect(x.getAttribute('type')).toBe('button')
  })
})

describe('CampoRicerca — il campo stesso è un bersaglio da 44 px su mobile (U17)', () => {
  it('min-h-11 su mobile, più basso da desktop', () => {
    render(<CampoRicerca value="" onChange={() => {}} placeholder="Cerca…" aria-label="Cerca nelle voci" />)
    const campo = screen.getByLabelText('Cerca nelle voci')
    expect(campo.className).toMatch(/\bmin-h-11\b/)
    expect(campo.className).toMatch(/\bmd:min-h-0\b/)
  })
})
