import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'

vi.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: () => ({}) } },
  LISTINI_BUCKET: 'Listini',
}))

import { LavorazioniBordoTable } from '@/components/marmeria/LavorazioniBordoTable'
import { LavorazioniVarieTable } from '@/components/marmeria/LavorazioniVarieTable'
import { useQuoteStore } from '@/store/quoteStore'
import { usePricelistStore } from '@/store/pricelistStore'
import { calcMarmeria } from '@/engine/calcMarmeria'
import { FALLBACK_GRES } from '@/store/quoteFallbacks'
import { validatoPerTest } from '@/test-utils/listinoValidato'
import type { ListinoMarmeria } from '@/types/marmeria'

// Listino "nuovo": prezzi diversi da quelli con cui le righe sono state quotate.
const listino: ListinoMarmeria = {
  materiali: [],
  lavorazioniBordo: [{ id: 1, descrizione: 'Bordo dritto', prezzoMlPerTipologia: { GRES: 10, LAPITEC: 10, QUARZO: 10 } }],
  lavorazioniVarie: [
    { descrizione: 'Foro rubinetto', unitaMisura: 'PEZZO', prezzoPerTipologia: { GRES: 30, LAPITEC: 30, QUARZO: 30 } },
  ],
  vascheIntegrate: [],
  rilMontScaglioni: [],
  scontiDisponibili: [0],
  aggiornato: '',
}

/** L'ultima cella (Totale) di ogni riga della tabella. */
function totaliRighe(): number[] {
  return Array.from(document.querySelectorAll('tbody tr')).map((tr) => {
    const td = tr.querySelector('td:last-child')
    return Number((td?.textContent ?? '').replace('€', '').replace(/\./g, '').replace(',', '.').trim())
  })
}

function sezioneGres() {
  return useQuoteStore.getState().sezioni.gres ?? FALLBACK_GRES
}

describe('Tabelle lavorazioni — il totale di riga concorda con quello di sezione', () => {
  beforeEach(() => {
    useQuoteStore.getState().resetAll()
    usePricelistStore.setState({ marmeria: validatoPerTest(listino) })
  })
  afterEach(() => {
    cleanup()
    usePricelistStore.setState({ marmeria: null })
  })

  it('bordo: la riga mostra il prezzo LIVE × qtà, non il totale stantio dello store', () => {
    // Riga quotata col listino vecchio (5 €/ml); il listino corrente dice 10.
    useQuoteStore.getState().addRigaLavorazioneBordo({ lavorazioneId: 1, qtaMl: 3, prezzoMl: 5, totale: 15 })
    render(<LavorazioniBordoTable />)

    // Lo store conserva ancora lo snapshot stantio: il test prova che la UI non
    // lo guarda più, non che lo store sia stato ripulito.
    expect(sezioneGres().righeLavorazioniBordo[0].totale).toBe(15)

    expect(totaliRighe()).toEqual([30]) // 3 × 10, prezzo corrente
    expect(totaliRighe()[0]).toBe(calcMarmeria(listino, sezioneGres()).totLavorazioniBordo)
  })

  it('varie: stessa invariante', () => {
    useQuoteStore.getState().addRigaVaria({ descrizione: 'Foro rubinetto', um: 'PEZZO', qta: 2, prezzoUnit: 12, totale: 24 })
    render(<LavorazioniVarieTable />)

    expect(totaliRighe()).toEqual([60]) // 2 × 30
    expect(totaliRighe()[0]).toBe(calcMarmeria(listino, sezioneGres()).totLavorazioniVarie)
  })

  it('riga non selezionata (qtà 0): nessun importo, nessuna riga fantasma nello store', () => {
    // La tabella è un PICKER: elenca tutte le lavorazioni del listino, non solo
    // quelle scelte. Le righe a zero non devono inventarsi un totale né una riga
    // nello store. CurrencyCell rende "—" per 0 senza showZero.
    render(<LavorazioniBordoTable />)
    const celle = Array.from(document.querySelectorAll('tbody tr td:last-child'))
    expect(celle.map((td) => td.textContent?.trim())).toEqual(['—'])
    expect(sezioneGres().righeLavorazioniBordo).toHaveLength(0)
  })
})

// A2: una riga che il listino non sa prezzare (N/D per la tipologia, arrivata col
// listino dopo il cambio tipologia; oppure non più nel listino) è «da definire»
// nel PDF: qui deve vedersi e si deve poter togliere.
describe('Tabelle lavorazioni — le righe da definire si vedono e si tolgono (A2)', () => {
  const listinoND: ListinoMarmeria = {
    ...listino,
    lavorazioniBordo: [{ id: 1, descrizione: 'Bordo toro', prezzoMlPerTipologia: { GRES: null, LAPITEC: 10, QUARZO: 10 } }],
    lavorazioniVarie: [
      { descrizione: 'Fresata', unitaMisura: 'PEZZO', prezzoPerTipologia: { GRES: null, LAPITEC: 30, QUARZO: 30 } },
    ],
  }
  beforeEach(() => {
    useQuoteStore.getState().resetAll()
    useQuoteStore.getState().setTipologiaMateriale('GRES') // nessun listino ancora: niente si toglie
    usePricelistStore.setState({ marmeria: validatoPerTest(listinoND) })
  })
  afterEach(() => {
    cleanup()
    usePricelistStore.setState({ marmeria: null })
  })

  it('bordo: «Togli» sulla riga N/D con quantità e sulla riga non più nel listino', () => {
    const s = useQuoteStore.getState()
    s.addRigaLavorazioneBordo({ lavorazioneId: 1, qtaMl: 2, prezzoMl: 10, totale: 20 })
    s.addRigaLavorazioneBordo({ lavorazioneId: 9, qtaMl: 1.5, prezzoMl: 10, totale: 15 })
    const { getByRole, getByText } = render(<LavorazioniBordoTable />)
    expect(getByText('non più nel listino — da definire')).toBeTruthy()
    expect(getByText('1,5 ml · da definire')).toBeTruthy()

    fireEvent.click(getByRole('button', { name: 'Togli Bordo toro' }))
    fireEvent.click(getByRole('button', { name: 'Togli Lavorazione #9' }))
    expect(sezioneGres().righeLavorazioniBordo).toEqual([])
  })

  it('varie: idem', () => {
    const s = useQuoteStore.getState()
    s.addRigaVaria({ descrizione: 'Fresata', um: 'PEZZO', qta: 2, prezzoUnit: 30, totale: 60 })
    s.addRigaVaria({ descrizione: 'Foro rinominato', um: 'PEZZO', qta: 1, prezzoUnit: 30, totale: 30 })
    const { getByRole, getByText } = render(<LavorazioniVarieTable />)
    expect(getByText('non più nel listino — da definire')).toBeTruthy()

    fireEvent.click(getByRole('button', { name: 'Togli Fresata' }))
    fireEvent.click(getByRole('button', { name: 'Togli Foro rinominato' }))
    expect(sezioneGres().righeVarie).toEqual([])
  })
})
