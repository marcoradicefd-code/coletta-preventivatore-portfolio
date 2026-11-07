import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import { TotalDisplay } from '@/components/layout/TotalDisplay'

/**
 * Fascia critica del separatore migliaia (1.000-9.999) sul RAMO ANIMATO.
 *
 * È il ramo che aveva il bug: usava `toLocaleString` a mano e rendeva "1300,00".
 * Il ramo `prefersReduced` usava già `formatEur` ed era corretto → testarlo non
 * avrebbe intercettato nulla. Qui si lascia girare la spring vera e si aspetta
 * che si assesti sul valore finale (parte da 0 e conta fino al totale).
 */
describe('TotalDisplay — separatore migliaia (fascia 1.000-9.999)', () => {
  afterEach(() => cleanup())

  it('1300 → "€ 1.300,00", non "€ 1300,00"', async () => {
    const { container } = render(<TotalDisplay value={1300} />)
    await waitFor(
      () => expect(container.textContent).toContain('€ 1.300,00'),
      { timeout: 3_000 }
    )
  })

  it('9999 (estremo alto della fascia) → "€ 9.999,00"', async () => {
    const { container } = render(<TotalDisplay value={9999} />)
    await waitFor(
      () => expect(container.textContent).toContain('€ 9.999,00'),
      { timeout: 3_000 }
    )
  })

  it('999,50 (sotto la fascia) → nessun separatore', async () => {
    const { container } = render(<TotalDisplay value={999.5} />)
    await waitFor(
      () => expect(container.textContent).toContain('€ 999,50'),
      { timeout: 3_000 }
    )
  })

  it('valore fuori range → "€ —" (invariante preesistente)', () => {
    const { container } = render(<TotalDisplay value={Infinity} />)
    expect(container.textContent).toContain('€ —')
  })
})
