import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'

vi.mock('@/lib/supabase', () => ({ supabase: { storage: { from: () => ({}) } }, LISTINI_BUCKET: 'Listini' }))

import { SuMisuraPage } from '@/components/sumisura/SuMisuraPage'
import { useQuoteStore } from '@/store/quoteStore'
import { usePricelistStore } from '@/store/pricelistStore'
import { validatoPerTest } from '@/test-utils/listinoValidato'
import { articoloPZ } from '@/test-utils/articoli'
import type { ListinoSuMisura } from '@/types/sumisura'

/**
 * Arredi: U12, U13, U17 e U18 della revisione L15-L21. jsdom non impagina: per
 * U12, U13 e U17 si provano le classi che reggono la misura del revisore; per
 * U18 nomi e ripristino. Listino sintetico, prezzi inventati.
 */
const LISTINO: ListinoSuMisura = {
  fogli: [{ nome: 'Armadi', nota: '', voci: [{ descrizione: 'Armadio a giorno', prezzoUnitario: 400, unitaMisura: 'PEZZO' }] }],
  aggiornato: '',
}
const s = () => useQuoteStore.getState()

beforeEach(() => {
  s().resetAll()
  usePricelistStore.setState({ suMisura: validatoPerTest(LISTINO) })
})
afterEach(() => {
  cleanup()
  usePricelistStore.setState({ suMisura: null })
})

describe('Arredi — riepilogo, nomi, bersagli, «Rimuovi» (U12, U13, U17, U18)', () => {
  it('U12: da xl il riepilogo fermo non supera lo schermo e il Totale resta in vista in fondo al pannello', () => {
    s().addArticoloSuMisura({ ...articoloPZ, descrizione: 'Mensola' })
    render(<SuMisuraPage />)
    const totale = screen.getByText('Totale Arredi').parentElement as HTMLElement
    const pannello = totale.closest('.glass-panel') as HTMLElement
    expect(pannello.className).toMatch(/xl:max-h-\[calc\(100dvh-var\(--altezza-barra,0px\)-[^\]]+\)\]/)
    expect(pannello.className).toContain('xl:overflow-y-auto')
    expect(totale.className).toContain('xl:sticky')
    expect(totale.className).toContain('xl:bottom-0')
  })

  it('U13: «Aggiungi in» non allarga la pagina con un nome lungo, e il nome dell’arredo ha un limite', () => {
    const id = s().addArredo('Camera matrimoniale con il guardaroba a muro')
    s().addArticoloSuMisura({ ...articoloPZ, descrizione: 'Comò', arredoId: id })
    render(<SuMisuraPage />)
    const select = screen.getByLabelText('Aggiungi in')
    expect(select.className).toContain('min-w-0')
    expect(select.className).toContain('max-w-full')
    expect(select.parentElement?.className).toContain('min-w-0')
    expect(screen.getByLabelText('Nome arredo').getAttribute('maxlength')).toBe('60')
    fireEvent.click(screen.getByRole('button', { name: 'Nuovo arredo' }))
    expect(screen.getByLabelText('Nome del nuovo arredo').getAttribute('maxlength')).toBe('60')
  })

  it('U18: «Configura», «Modifica» e «Rimuovi» dicono su quale voce agiscono', () => {
    s().addArticoloSuMisura({ ...articoloPZ, descrizione: 'Mensola' })
    render(<SuMisuraPage />)
    expect(screen.getByRole('button', { name: 'Configura Armadio a giorno' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Modifica Mensola' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Rimuovi Mensola' })).toBeTruthy()
  })

  it('U18: «Rimuovi» si può annullare: «Ripristina» rimette l’articolo com’era e dov’era', () => {
    s().addArticoloSuMisura({ ...articoloPZ, descrizione: 'Mensola' })
    s().addArticoloSuMisura({ ...articoloPZ, descrizione: 'Comò' })
    const prima = s().sezioni.arredi!.articoli
    render(<SuMisuraPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Rimuovi Mensola' }))
    expect(s().sezioni.arredi!.articoli.map((a) => a.descrizione)).toEqual(['Comò'])
    const avviso = screen.getAllByRole('status').find((n) => n.textContent?.includes('rimosso'))!
    expect(avviso.textContent).toContain('«Mensola» rimosso.')
    fireEvent.click(within(avviso).getByRole('button', { name: 'Ripristina «Mensola»' }))
    expect(s().sezioni.arredi!.articoli).toEqual(prima)
    expect(screen.queryByRole('button', { name: /^Ripristina/ })).toBeNull()
  })

  it('U17: su mobile i bersagli dell’elenco sono da 44 px (24-32 da desktop)', () => {
    const id = s().addArredo('Studio')
    s().addArticoloSuMisura({ ...articoloPZ, descrizione: 'Libreria', arredoId: id })
    render(<SuMisuraPage />)
    for (const nome of ['Modifica Libreria', 'Rimuovi Libreria']) {
      const b = screen.getByRole('button', { name: nome })
      expect(b.className, nome).toMatch(/\bh-11\b/)
      expect(b.className, nome).toMatch(/\bw-11\b/)
      expect(b.className, nome).toMatch(/\bmd:h-8\b/)
    }
    for (const nome of ['Elimina arredo Studio', 'Aggiungi elemento']) {
      expect(screen.getByRole('button', { name: nome }).className, nome).toMatch(/\bmin-h-11\b/)
    }
    expect(screen.getByLabelText('Sposta Libreria in').className).toMatch(/\bmin-h-11\b/)
    expect(screen.getByLabelText('IVA').className).toMatch(/\bmin-h-11\b/)
    expect(screen.getByRole('button', { name: 'Configura Armadio a giorno' }).className).toMatch(/\bmin-h-11\b/)
  })
})
