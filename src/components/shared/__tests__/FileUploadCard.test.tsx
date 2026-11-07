import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import type { ListinoMarmeria } from '@/types/marmeria'

vi.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: () => ({}) } },
  LISTINI_BUCKET: 'Listini',
}))

// Il worker vero non gira in jsdom: mockiamo il PARSING, non la validazione.
// È il punto: il test finge che il file sia stato letto e chiede se il listino
// che ne esce riesce a entrare nello store.
const { parseMock } = vi.hoisted(() => ({ parseMock: vi.fn() }))
vi.mock('@/lib/excelWorker', () => ({ parseExcelInWorker: parseMock }))

import { FileUploadCard } from '@/components/shared/FileUploadCard'
import { usePricelistStore } from '@/store/pricelistStore'

/**
 * Listino marmeria STRUTTURALMENTE INVALIDO ma con un materiale: è il caso
 * esatto di E2. Il vecchio `useExcelLoader` guardava solo `materiali.length`,
 * quindi questo passava e finiva nello store — prezzi sbagliati creduti giusti.
 * Zod lo rifiuta: nessun prezzo €/mq, nessuna lavorazione, nessuno sconto.
 */
const marmeriaInvalido = {
  materiali: [{ coloreFinituraCompleto: 'Adia kC_Opaco', produttore: 'X', colore: 'Y' }],
  lavorazioniBordo: [],
  lavorazioniVarie: [],
  vascheIntegrate: [],
  rilMontScaglioni: [],
  scontiDisponibili: [],
} as unknown as ListinoMarmeria

const marmeriaValido: ListinoMarmeria = {
  materiali: [
    {
      produttore: 'De Bari',
      colore: 'Adia',
      tipoSuperficie: 'kC_Opaco',
      coloreFinituraCompleto: 'Adia kC_Opaco',
      collezione: 'INDUSTRIAL',
      tipologia: 'GRES',
      spessori: {
        13: { spessore: 13, disponibile: true, prezziMq: { fino62: 100, da63a70: 100, oltre70: 120 }, minimoFatturabile: 0 },
        20: { spessore: 20, disponibile: false, prezziMq: { fino62: 'Non Disp.', da63a70: 'Non Disp.', oltre70: 'Non Disp.' }, minimoFatturabile: 0 },
        30: { spessore: 30, disponibile: false, prezziMq: { fino62: 'Non Disp.', da63a70: 'Non Disp.', oltre70: 'Non Disp.' }, minimoFatturabile: 0 },
      },
      alzatinaEuroMl: 10,
      schienaleEuroMl: 10,
      zoccolinoEuroMl: 10,
    },
  ] as unknown as ListinoMarmeria['materiali'],
  lavorazioniBordo: [{ id: 1, descrizione: 'Bordo dritto', prezzoMlPerTipologia: { GRES: 10, LAPITEC: 10, QUARZO: 10 } }],
  lavorazioniVarie: [],
  vascheIntegrate: [],
  rilMontScaglioni: [{ da: 0, a: null, importo: 350 }],
  scontiDisponibili: [0, 0.1],
  aggiornato: '',
}

/**
 * Listino su misura con la COLONNA PREZZI SPOSTATA (E4): descrizioni e unità di
 * misura perfette, prezzi tutti a zero — è quello che il parser produce quando
 * al posto di PREZZO finisce TOTALE di un preventivo non compilato. Prima
 * passava (l'unico controllo era `fogli.length === 0`) e l'app mostrava € 0,00
 * su tutto, in silenzio.
 */
const suMisuraPrezziSpostati = {
  fogli: [
    {
      nome: 'ANTE',
      nota: '',
      voci: [
        { descrizione: 'Anta laccata', prezzoUnitario: 0, unitaMisura: 'MQ' },
        { descrizione: 'Cassetto', prezzoUnitario: 0, unitaMisura: 'PEZZO' },
      ],
    },
  ],
  aggiornato: '',
} as unknown as import('@/types/sumisura').ListinoSuMisura

function caricaFile(nome = 'listino marmeria.xlsx', tipo: 'marmeria' | 'sumisura' = 'marmeria') {
  const { container } = render(<FileUploadCard type={tipo} onClose={() => {}} />)
  const input = container.querySelector('input[type="file"]') as HTMLInputElement
  const file = new File(['x'], nome, { type: 'application/vnd.ms-excel' })
  fireEvent.change(input, { target: { files: [file] } })
}

describe('FileUploadCard — upload manuale: nessun listino entra senza validazione (E2)', () => {
  beforeEach(() => {
    usePricelistStore.setState({ suMisura: null, marmeria: null, porte: null })
    parseMock.mockReset()
  })
  afterEach(() => cleanup())

  it('marmeria strutturalmente invalida: RIFIUTATA, errore visibile, store INTATTO', async () => {
    parseMock.mockResolvedValue(marmeriaInvalido)
    caricaFile()

    // L'errore arriva sullo schermo, non solo in console: è la modale che lo mostra.
    const errore = await screen.findByText(/non è un listino Gres valido/i)
    expect(errore).toBeTruthy()
    // E il dettaglio Zod è nel messaggio, non un generico "formato errato".
    expect(errore.textContent).toMatch(/lavorazioni bordo|prezzo|sconti/i)

    // Il punto di E2: lo store NON è stato toccato.
    expect(usePricelistStore.getState().marmeria).toBeNull()
  })

  it('marmeria valida: entra, nessun errore (niente cambia per i file buoni)', async () => {
    parseMock.mockResolvedValue(marmeriaValido)
    caricaFile('listino marmeria.xlsx')

    await waitFor(() => expect(usePricelistStore.getState().marmeria).not.toBeNull())
    expect(screen.queryByText(/non è un listino/i)).toBeNull()
    // `aggiornato` viene dal filename, come nel percorso bucket.
    expect(usePricelistStore.getState().marmeria?.aggiornato).toBe('listino marmeria.xlsx')
  })

  it('errore del parser: riportato in italiano, store INTATTO', async () => {
    parseMock.mockRejectedValue(new Error('Foglio "GAMMA_COLORI" non trovato'))
    caricaFile()

    const errore = await screen.findByText(/Errore lettura file Gres/i)
    expect(errore.textContent).toContain('GAMMA_COLORI')
    expect(usePricelistStore.getState().marmeria).toBeNull()
  })

  it('SU MISURA con la colonna prezzi spostata: RIFIUTATO, store INTATTO (E4)', async () => {
    // Su misura era l'unica categoria senza schema. Questo file ha fogli e voci
    // — quindi il vecchio `fogli.length === 0` era contento — ma zero prezzi.
    parseMock.mockResolvedValue(suMisuraPrezziSpostati)
    caricaFile('listino su misura.xlsx', 'sumisura')

    const errore = await screen.findByText(/non è un listino Arredi valido/i)
    expect(errore.textContent).toMatch(/colonna dei prezzi sembra spostata/i)
    expect(usePricelistStore.getState().suMisura).toBeNull()
  })
})

/** Su misura valido con DUE fogli: uno è un foglio di lavoro, e il caricamento locale non può scegliere. */
const suMisuraDueFogli = {
  fogli: [
    { nome: 'ANTE', nota: '', voci: [{ descrizione: 'Anta laccata', prezzoUnitario: 120, unitaMisura: 'MQ' }] },
    { nome: 'PREVENTIVO MARIO', nota: '', voci: [{ descrizione: 'Acconto', prezzoUnitario: 900, unitaMisura: 'PEZZO' }] },
  ],
  aggiornato: '',
} as unknown as import('@/types/sumisura').ListinoSuMisura

describe('FileUploadCard — upload locale Su Misura: avviso dei fogli (O9, modo 5)', () => {
  beforeEach(() => {
    usePricelistStore.setState({
      suMisura: null,
      marmeria: null,
      porte: null,
      referti: { suMisura: null, marmeria: null, porte: null, cucine: null },
    })
    parseMock.mockReset()
  })
  afterEach(() => cleanup())

  it('SU MISURA caricato a mano con più fogli: il referto porta l avviso del caricamento locale', async () => {
    parseMock.mockResolvedValue(suMisuraDueFogli)
    caricaFile('listino su misura.xlsx', 'sumisura')

    await waitFor(() => expect(usePricelistStore.getState().suMisura).not.toBeNull())
    const referto = usePricelistStore.getState().referti.suMisura
    expect(referto?.caricati.map((c) => c.nome)).toEqual(['ANTE', 'PREVENTIVO MARIO'])
    expect(referto?.avviso).toMatch(/^Listino caricato a mano con tutti i fogli\./)
    // Nessuna nota: non fa rumore nel riquadro dell'admin.
    expect(referto?.note).toEqual([])
  })
})

// Sonar S1082/S6819: la drop zone si apriva solo col mouse. Ora è un
// <button> nativo: Invio e Spazio li gestisce il browser (jsdom non li simula).
describe('FileUploadCard — drop zone da tastiera', () => {
  let apri: ReturnType<typeof vi.spyOn> | undefined
  afterEach(() => {
    apri?.mockRestore()
    cleanup()
  })

  it('è un <button type="button"> raggiungibile col Tab; il click apre il selettore file', () => {
    apri = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
    const { container } = render(<FileUploadCard type="marmeria" onClose={() => {}} />)
    const zona = screen.getByRole('button', { name: 'Scegli un file Excel da caricare' })
    expect(zona.tagName).toBe('BUTTON')
    expect(zona.getAttribute('type')).toBe('button')
    expect(zona.tabIndex).toBe(0)

    fireEvent.click(zona)

    expect(apri).toHaveBeenCalledTimes(1)
    expect(apri.mock.contexts[0]).toBe(container.querySelector('input[type="file"]'))
  })
})

describe('FileUploadCard — drop', () => {
  beforeEach(() => {
    usePricelistStore.setState({ suMisura: null, marmeria: null, porte: null })
    parseMock.mockReset()
  })
  afterEach(() => cleanup())

  it('un file trascinato sulla drop zone passa dalla stessa validazione del picker', async () => {
    parseMock.mockResolvedValue(marmeriaInvalido)
    render(<FileUploadCard type="marmeria" onClose={() => {}} />)
    const file = new File(['x'], 'listino marmeria.xlsx', { type: 'application/vnd.ms-excel' })
    fireEvent.drop(screen.getByRole('button', { name: 'Scegli un file Excel da caricare' }), {
      dataTransfer: { files: [file] },
    })

    await waitFor(() => expect(parseMock).toHaveBeenCalled())
    expect(usePricelistStore.getState().marmeria).toBeNull()
  })
})

// Difetto introdotto in 2de2ed7: con role="button" e aria-label lo screen
// reader leggeva solo l'etichetta, non l'errore né il successo dentro la drop
// zone. Ora i messaggi stanno sotto il riquadro, fuori dal bottone.
describe('FileUploadCard — esito letto dagli screen reader', () => {
  beforeEach(() => {
    usePricelistStore.setState({ suMisura: null, marmeria: null, porte: null })
    parseMock.mockReset()
  })
  afterEach(() => cleanup())

  it('errore: in role="alert", fuori dal bottone', async () => {
    parseMock.mockRejectedValue(new Error('Foglio "GAMMA_COLORI" non trovato'))
    caricaFile()

    const avviso = await screen.findByRole('alert')
    expect(avviso.textContent).toContain('GAMMA_COLORI')
    expect(avviso.closest('button')).toBeNull()
  })

  it('successo: in role="status" e Chiudi, entrambi fuori dalla drop zone', async () => {
    parseMock.mockResolvedValue(marmeriaValido)
    caricaFile()

    const esito = await screen.findByRole('status')
    expect(esito.textContent).toContain('Listino aggiornato con successo!')
    expect(esito.closest('button')).toBeNull()
    // Il "Chiudi" col testo, non la X dell'intestazione (aria-label "Chiudi").
    const chiudi = screen.getByText('Chiudi', { selector: 'button' })
    expect(chiudi.parentElement?.closest('button')).toBeNull()
  })
})
