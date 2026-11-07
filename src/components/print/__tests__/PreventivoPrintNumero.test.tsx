import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

vi.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: () => ({}) } },
  LISTINI_BUCKET: 'Listini',
}))

import { PreventivoPrint } from '@/components/print/PreventivoPrint'
import { ClientForm } from '@/components/client/ClientForm'
import { useQuoteStore } from '@/store/quoteStore'
import type { PreventivoSalvato } from '@/types/archivio'

const SALVATO: PreventivoSalvato = { id: 'p-1', anno: 2026, numero: 7, revisione: 0, stato: 'bozza', updatedAt: 'x' }

beforeEach(() => useQuoteStore.getState().resetAll())
afterEach(() => cleanup())

describe('numero del preventivo nel PDF (L21)', () => {
  it('salvato: intestazione e piè di pagina stampano il numero del database, non quello scritto a mano', () => {
    useQuoteStore.getState().setPreventivo({ numero: 'scritto a mano' })
    useQuoteStore.getState().impostaSalvato({ ...SALVATO, revisione: 2 })
    render(<PreventivoPrint />)
    expect(screen.getByText(/^N\. 2026-007 rev\. 2 del /)).toBeTruthy()
    expect(screen.getByText('Preventivo N. 2026-007 rev. 2')).toBeTruthy()
    expect(screen.queryByText(/scritto a mano/)).toBeNull()
  })

  it('bozza non salvata: resta il numero scritto a mano, e il trattino senza', () => {
    useQuoteStore.getState().setPreventivo({ numero: '2026-042' })
    render(<PreventivoPrint />)
    expect(screen.getByText('Preventivo N. 2026-042')).toBeTruthy()
    cleanup()
    useQuoteStore.getState().setPreventivo({ numero: '' })
    render(<PreventivoPrint />)
    expect(screen.getByText('Preventivo N. —')).toBeTruthy()
  })

  it('annullato (L21-B): l\'intestazione porta la dicitura ANNULLATO; non annullato no', () => {
    useQuoteStore.getState().impostaSalvato({ ...SALVATO, stato: 'annullato' })
    render(<PreventivoPrint />)
    expect(screen.getByText('ANNULLATO')).toBeTruthy()
    cleanup()
    useQuoteStore.getState().impostaSalvato(SALVATO)
    render(<PreventivoPrint />)
    expect(screen.queryByText('ANNULLATO')).toBeNull()
  })

  it('Dati preventivo: salvato, il numero del database in sola lettura', () => {
    useQuoteStore.getState().impostaSalvato(SALVATO)
    render(<ClientForm />)
    const campo = screen.getByDisplayValue('2026-007') as HTMLInputElement
    expect(campo.readOnly).toBe(true)
  })
})
