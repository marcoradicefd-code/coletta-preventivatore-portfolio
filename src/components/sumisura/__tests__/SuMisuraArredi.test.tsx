import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, within, waitFor } from '@testing-library/react'

// SuMisuraPage → pricelist/quote store → supabase: mock minimale (hermetico).
vi.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: () => ({}) } },
  LISTINI_BUCKET: 'Listini',
}))

import { SuMisuraPage } from '@/components/sumisura/SuMisuraPage'
import { useQuoteStore } from '@/store/quoteStore'
import { usePricelistStore } from '@/store/pricelistStore'
import { validatoPerTest } from '@/test-utils/listinoValidato'
import { articoloPZ } from '@/test-utils/articoli'
import type { ListinoSuMisura } from '@/types/sumisura'

// Listino sintetico, prezzi tondi inventati; nomi di ambienti, mai di clienti.
const LISTINO: ListinoSuMisura = {
  fogli: [{ nome: 'Armadi', nota: '', voci: [{ descrizione: 'Armadio a giorno', prezzoUnitario: 400, unitaMisura: 'PEZZO' }] }],
  aggiornato: '',
}

const s = () => useQuoteStore.getState()
const arredi = () => s().sezioni.arredi!
const card = (nome: string) => screen.getByRole('region', { name: `Arredo ${nome}` })

describe('Arredi raggruppati nella pagina (L19)', () => {
  beforeEach(() => {
    s().resetAll()
    usePricelistStore.setState({ suMisura: validatoPerTest(LISTINO) })
  })
  afterEach(() => {
    cleanup()
    usePricelistStore.setState({ suMisura: null })
  })

  it('senza arredi la pagina è quella di prima, più il pulsante «Nuovo arredo»', () => {
    s().addArticoloSuMisura({ ...articoloPZ, descrizione: 'Mensola' })
    render(<SuMisuraPage />)
    expect(screen.getByRole('button', { name: 'Nuovo arredo' })).toBeTruthy()
    expect(screen.getByText('Mensola')).toBeTruthy()
    expect(screen.queryByText('Altre voci')).toBeNull()
    expect(screen.queryByLabelText('Aggiungi in')).toBeNull()
    expect(screen.queryByLabelText(/^Sposta /)).toBeNull()
    expect(screen.queryByRole('region')).toBeNull()
  })

  it('«Nuovo arredo» chiede il nome: vuoto non crea, Esc annulla, Invio crea la card', () => {
    render(<SuMisuraPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Nuovo arredo' }))
    const nome = screen.getByLabelText('Nome del nuovo arredo')
    expect(document.activeElement).toBe(nome)
    expect((screen.getByRole('button', { name: 'Crea arredo' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.keyDown(nome, { key: 'Escape' })
    expect(screen.queryByLabelText('Nome del nuovo arredo')).toBeNull()
    expect(s().sezioni.arredi?.arredi).toBeUndefined()

    fireEvent.click(screen.getByRole('button', { name: 'Nuovo arredo' }))
    fireEvent.change(screen.getByLabelText('Nome del nuovo arredo'), { target: { value: '  Ingresso ' } })
    fireEvent.submit(screen.getByLabelText('Nome del nuovo arredo'))
    expect(arredi().arredi!.map((x) => x.nome)).toEqual(['Ingresso'])
    expect((within(card('Ingresso')).getByLabelText('Nome arredo') as HTMLInputElement).value).toBe('Ingresso')
    // Il nuovo arredo è dove andranno le voci scelte dopo.
    expect((screen.getByLabelText('Aggiungi in') as HTMLSelectElement).value).toBe(arredi().arredi![0].id)
  })

  it('«Aggiungi elemento» porta il listino con l\'arredo scelto, e l\'elemento finisce nella sua card col subtotale', () => {
    s().addArredo('Ingresso')
    const matrimoniale = s().addArredo('Matrimoniale')
    render(<SuMisuraPage />)
    fireEvent.click(within(card('Matrimoniale')).getByRole('button', { name: 'Aggiungi elemento' }))
    expect((screen.getByLabelText('Aggiungi in') as HTMLSelectElement).value).toBe(matrimoniale)
    expect(document.activeElement).toBe(screen.getByLabelText('Cerca voce di listino'))

    fireEvent.click(screen.getByRole('button', { name: /Configura/ }))
    // La label di `NumberField` non è associata al campo (issue a11y nota): lo si
    // prende dal suo contenitore.
    const quantita = screen.getByText('Quantità').parentElement!.querySelector('input')!
    fireEvent.change(quantita, { target: { value: '2' } })
    fireEvent.click(screen.getByText('Aggiungi al preventivo'))

    expect(arredi().articoli.map((a) => a.arredoId)).toEqual([matrimoniale])
    const m = within(card('Matrimoniale'))
    expect(m.getByText('Armadio a giorno')).toBeTruthy()
    expect(m.getByText(/^Subtotale/).textContent).toBe('Subtotale € 800,00')
    expect(within(card('Ingresso')).getByText('Nessun elemento.')).toBeTruthy()
  })

  it('il nome si rinomina dalla card, e un elemento si sposta dal menu della riga', () => {
    const ingresso = s().addArredo('Ingresso')
    const studio = s().addArredo('Studio')
    s().addArticoloSuMisura({ ...articoloPZ, descrizione: 'Scarpiera', arredoId: ingresso })
    render(<SuMisuraPage />)

    fireEvent.change(within(card('Studio')).getByLabelText('Nome arredo'), { target: { value: 'Studio e libreria' } })
    expect(arredi().arredi!.find((x) => x.id === studio)!.nome).toBe('Studio e libreria')

    fireEvent.change(screen.getByLabelText('Sposta Scarpiera in'), { target: { value: studio } })
    expect(arredi().articoli[0].arredoId).toBe(studio)
    expect(within(card('Studio e libreria')).getByText('Scarpiera')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Sposta Scarpiera in'), { target: { value: '' } })
    expect(arredi().articoli[0].arredoId).toBeUndefined()
    expect(within(screen.getByRole('region', { name: 'Altre voci' })).getByText('Scarpiera')).toBeTruthy()
  })

  it('«Elimina arredo» vuoto lo toglie senza chiedere', () => {
    s().addArredo('Studio')
    render(<SuMisuraPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Elimina arredo Studio' }))
    expect(arredi().arredi).toEqual([])
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('«Elimina arredo» con elementi chiede con la conferma del design system: «Torna indietro» prima, l’eliminazione per ultima e «pericolo» (U10)', async () => {
    const ingresso = s().addArredo('Ingresso')
    s().addArticoloSuMisura({ ...articoloPZ, descrizione: 'Armadio', arredoId: ingresso })
    s().addArticoloSuMisura({ ...articoloPZ, descrizione: 'Cassetti', arredoId: ingresso })
    render(<SuMisuraPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Elimina arredo Ingresso' }))
    const dialogo = await screen.findByRole('alertdialog', { name: 'Eliminare l’arredo «Ingresso»?' })
    expect(within(dialogo).getByText('Spostare i 2 elementi in Altre voci o eliminarli?')).toBeTruthy()
    const pulsanti = within(dialogo).getAllByRole('button').map((b) => b.textContent)
    expect(pulsanti).toEqual(['Torna indietro', 'Sposta in Altre voci', 'Elimina gli elementi'])
    expect(within(dialogo).queryByRole('button', { name: 'Annulla' })).toBeNull()
    expect(within(dialogo).getByRole('button', { name: 'Elimina gli elementi' }).className).toContain('bg-error')
    expect(document.activeElement).toBe(within(dialogo).getByRole('button', { name: 'Torna indietro' }))
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Torna indietro' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(arredi().arredi!.map((x) => x.id)).toEqual([ingresso])
    expect(arredi().articoli).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: 'Elimina arredo Ingresso' }))
    fireEvent(await screen.findByRole('alertdialog'), new Event('cancel'))
    expect(arredi().arredi).toHaveLength(1)
    expect(arredi().articoli).toHaveLength(2)
  })

  it('«Sposta in Altre voci» tiene gli elementi senza arredo, «Elimina l’elemento» li toglie', async () => {
    const ingresso = s().addArredo('Ingresso')
    const studio = s().addArredo('Studio')
    s().addArticoloSuMisura({ ...articoloPZ, descrizione: 'Armadio', arredoId: ingresso })
    s().addArticoloSuMisura({ ...articoloPZ, descrizione: 'Libreria', arredoId: studio })
    render(<SuMisuraPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Elimina arredo Ingresso' }))
    expect(within(await screen.findByRole('alertdialog')).getByText("Spostare l'elemento in Altre voci o eliminarlo?")).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Sposta in Altre voci' }))
    await waitFor(() => expect(arredi().arredi).toHaveLength(1))
    expect(arredi().articoli.map((a) => [a.descrizione, a.arredoId])).toEqual([
      ['Armadio', undefined],
      ['Libreria', studio],
    ])
    expect(within(screen.getByRole('region', { name: 'Altre voci' })).getByText('Armadio')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Elimina arredo Studio' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Elimina l’elemento' }))
    await waitFor(() => expect(arredi().arredi).toEqual([]))
    expect(arredi().articoli.map((a) => a.descrizione)).toEqual(['Armadio'])
  })
})
