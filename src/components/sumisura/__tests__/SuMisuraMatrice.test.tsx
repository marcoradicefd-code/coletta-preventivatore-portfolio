import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import * as XLSX from 'xlsx'

// SuMisuraPage → pricelist/quote store → supabase: mock minimale (hermetico).
vi.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: () => ({}) } },
  LISTINI_BUCKET: 'Listini',
}))

import { SuMisuraPage } from '@/components/sumisura/SuMisuraPage'
import { useQuoteStore } from '@/store/quoteStore'
import { usePricelistStore } from '@/store/pricelistStore'
import { parseSuMisura } from '@/parsers/parseSuMisura'
import { validatoPerTest } from '@/test-utils/listinoValidato'
import { FINITURE_FINTE, ACCESSORI_FINTI } from '@/test-utils/finitureFinte'
import type { ListinoSuMisura } from '@/types/sumisura'

// Un rev1 finto (prezzi finti) e il listino di prima, senza FINITURE.
function listino(conMatrice: boolean): ListinoSuMisura {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['T'], ['n'], ['FINITURA', 'PREZZO', 'U.MISURA'], ['Anta laccata', 107, 'MQ']]), 'SU MISURA')
  if (conMatrice) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(FINITURE_FINTE), 'FINITURE')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ACCESSORI_FINTI), 'ACCESSORI')
  }
  return parseSuMisura(wb)
}

const s = () => useQuoteStore.getState()
const arredi = () => s().sezioni.arredi!
const opzioni = (label: string) =>
  Array.from((screen.getByLabelText(label) as HTMLSelectElement).options).map((o) => o.value).filter(Boolean)
const scegli = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
/** Il campo sotto un'etichetta di `Field` (le label del dialogo non hanno `for`). */
const campo = (label: string) => screen.getByText(label, { selector: 'label' }).parentElement!.querySelector('input')!
// Il configuratore è una Finestra (U4): la si trova per ruolo e nome.
const dialogo = () => screen.getByRole('dialog', { name: 'Nuovo elemento da matrice' })

describe('Arredi — nuovo elemento da matrice (L20)', () => {
  beforeEach(() => {
    s().resetAll()
    usePricelistStore.setState({ suMisura: validatoPerTest(listino(true)) })
  })
  afterEach(() => {
    cleanup()
    usePricelistStore.setState({ suMisura: null })
  })

  it('presidio: col listino senza FINITURE la pagina è quella di prima (nessun pulsante, nessuna spunta sotto 40 cm)', () => {
    usePricelistStore.setState({ suMisura: validatoPerTest(listino(false)) })
    render(<SuMisuraPage />)
    expect(screen.queryByRole('button', { name: 'Nuovo elemento da matrice' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^Configura / }))
    expect(screen.getByRole('heading', { name: 'Configura articolo' })).toBeTruthy()
    expect(screen.queryByLabelText('Tipo')).toBeNull()
    expect(screen.queryByText('Profondità minore di 40cm (−10%)')).toBeNull()
    expect(screen.getByText('Profondità maggiore di 65cm (+15%)')).toBeTruthy()
  })

  it('Tipo → Interno → Esterno offre solo le combinazioni che esistono; il €/mq si mostra da solo e non si scrive', () => {
    render(<SuMisuraPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Nuovo elemento da matrice' }))
    expect(opzioni('Tipo')).toEqual(['MOBILE A GIORNO', 'ARMADIO CON ANTE', 'TELAIO CON ANTE', 'MENSOLE A MURO'])
    expect(screen.getByText(/il prezzo si mostra da solo/)).toBeTruthy()

    scegli('Tipo', 'ARMADIO CON ANTE')
    // Le due grafie di ABET-LAMICOLOR sono un interno solo.
    expect(opzioni('Interno')).toEqual(['LAMINATO BIANCO', 'LAMINATO ABET-LAMICOLOR'])
    expect((screen.getByLabelText('Esterno') as HTMLSelectElement).disabled).toBe(true)
    scegli('Interno', 'LAMINATO ABET-LAMICOLOR')
    expect(opzioni('Esterno')).toEqual(['LACCATO OPACO', 'ESSENZA'])
    scegli('Esterno', 'ESSENZA')
    expect(within(dialogo()).getByText('Prezzo (matrice finiture)').nextElementSibling!.textContent).toBe('€ 743,00 / MQ')
    expect(screen.queryByText('Prezzo unitario (€)')).toBeNull()

    // Un tipo «qualsiasi interno» salta l'Interno.
    scegli('Tipo', 'TELAIO CON ANTE')
    expect(screen.queryByLabelText('Interno')).toBeNull()
    expect(within(dialogo()).getByText('Qualsiasi')).toBeTruthy()
    expect(opzioni('Esterno')).toEqual(['LACCATO OPACO'])
  })

  it('−10% sotto 40 cm nel riepilogo del dialogo; le due spunte di profondità si escludono', () => {
    render(<SuMisuraPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Nuovo elemento da matrice' }))
    scegli('Tipo', 'MOBILE A GIORNO')
    scegli('Interno', 'LAMINATO')
    scegli('Esterno', 'LAMINATO')
    fireEvent.change(campo('Larghezza (cm)'), { target: { value: '300' } })
    fireEvent.change(campo('Altezza (cm)'), { target: { value: '100' } })
    const sotto40 = screen.getByLabelText('Profondità minore di 40cm (−10%)') as HTMLInputElement
    const oltre65 = screen.getByLabelText('Profondità maggiore di 65cm (+15%)') as HTMLInputElement
    fireEvent.click(sotto40)
    // 3 mq × 317 = 951, −10% = 95, totale 856.
    expect(screen.getByText('Riduzione profondità < 40cm (−10%)').nextElementSibling!.textContent).toBe('€ -95,00')
    expect(screen.getByText('Totale articolo').nextElementSibling!.textContent).toBe('€ 856,00')
    fireEvent.click(oltre65)
    expect([sotto40.checked, oltre65.checked]).toEqual([false, true])
    fireEvent.click(sotto40)
    expect([sotto40.checked, oltre65.checked]).toEqual([true, false])
  })

  it('salva l elemento e gli accessori scelti nello stesso arredo; la riga dice la combinazione e il −10%', () => {
    const ingresso = s().addArredo('Ingresso')
    render(<SuMisuraPage />)
    scegli('Aggiungi in', ingresso)
    fireEvent.click(screen.getByRole('button', { name: 'Nuovo elemento da matrice' }))
    scegli('Tipo', 'ARMADIO CON ANTE')
    scegli('Interno', 'LAMINATO BIANCO')
    scegli('Esterno', 'LACCATO OPACO')
    fireEvent.change(campo('Larghezza (cm)'), { target: { value: '200' } })
    fireEvent.change(campo('Altezza (cm)'), { target: { value: '250' } })
    fireEvent.click(screen.getByLabelText('Profondità minore di 40cm (−10%)'))
    // Lavorazione a MQ: sulla superficie dell'elemento. Accessorio a pezzi: la quantità.
    fireEvent.click(screen.getByLabelText(/LAVORAZIONE MILLERIGHI/))
    fireEvent.click(screen.getByLabelText(/^CASSETTO/))
    const aggiungi = screen.getByRole('button', { name: 'Aggiungi al preventivo' }) as HTMLButtonElement
    // Manca la quantità del cassetto: il pulsante non si spegne, lo dice (U4).
    expect(document.getElementById(aggiungi.getAttribute('aria-describedby') ?? '')?.textContent).toBe('Manca: la quantità delle lavorazioni scelte.')
    fireEvent.click(aggiungi)
    expect(arredi().articoli).toEqual([])
    fireEvent.change(screen.getByLabelText('Quantità CASSETTO (PZ)'), { target: { value: '2' } })
    fireEvent.click(aggiungi)

    expect(arredi().articoli.map((a) => [a.descrizione, a.um, a.prezzoUnitario, a.arredoId])).toEqual([
      ['Armadio con ante', 'MQ', 523, ingresso],
      ['LAVORAZIONE MILLERIGHI (MIN 1MQ)', 'MQ', 109, ingresso],
      ['CASSETTO', 'PZ', 97, ingresso],
    ])
    expect(arredi().articoli[0]).toMatchObject({
      combinazione: { tipo: 'ARMADIO CON ANTE', interno: 'LAMINATO BIANCO', esterno: 'LACCATO OPACO' },
      profonditaSotto40: true,
      larghezzaCm: 200,
      altezzaCm: 250,
    })
    expect(arredi().articoli[1]).toMatchObject({ larghezzaCm: 200, altezzaCm: 250, profonditaOltre65: false })
    expect(screen.getByText('interno laminato bianco, esterno laccato opaco')).toBeTruthy()
    expect(screen.getByText('200×250 cm · −10%')).toBeTruthy()
  })

  it('modifica: la combinazione salvata si rilegge e il prezzo resta quello della scelta finché non si cambia', () => {
    // Salvato con un listino di prima: 999 €/mq, oggi la matrice dice 637.
    s().addArticoloSuMisura({
      origine: 'listino', descrizione: 'Armadio con ante', prezzoUnitario: 999, um: 'MQ', larghezzaCm: 100, altezzaCm: 300,
      lunghezzaMl: null, quantita: null, profonditaOltre65: false, finituraInterna: '', finituraEsterna: '', codiceFinitura: '', note: '',
      combinazione: { tipo: 'ARMADIO CON ANTE', interno: 'LAMINATO ABET – LAMICOLOR', esterno: 'LACCATO OPACO' },
    })
    render(<SuMisuraPage />)
    fireEvent.click(screen.getByRole('button', { name: /^Modifica / }))
    expect((screen.getByLabelText('Interno') as HTMLSelectElement).value).toBe('LAMINATO ABET-LAMICOLOR')
    expect(screen.getByText('Prezzo (matrice finiture)').nextElementSibling!.textContent).toBe('€ 999,00 / MQ')
    scegli('Esterno', 'ESSENZA')
    expect(screen.getByText('Prezzo (matrice finiture)').nextElementSibling!.textContent).toBe('€ 743,00 / MQ')
  })

  it('«Passa a voce manuale» toglie la combinazione e rende il prezzo scrivibile', () => {
    render(<SuMisuraPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Nuovo elemento da matrice' }))
    scegli('Tipo', 'MENSOLE A MURO')
    scegli('Esterno', 'LAMINATO')
    fireEvent.click(screen.getByLabelText('Profondità minore di 40cm (−10%)'))
    fireEvent.click(screen.getByRole('button', { name: 'Passa a voce manuale (prezzo a mano)' }))
    expect(screen.queryByLabelText('Tipo')).toBeNull()
    expect(screen.queryByLabelText('Profondità minore di 40cm (−10%)')).toBeNull()
    expect(campo('Prezzo unitario (€)').value).toBe('57')
    expect(screen.getByRole('heading', { name: 'Configura articolo' })).toBeTruthy()
  })
})
