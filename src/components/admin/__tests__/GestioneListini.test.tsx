import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, within, waitFor, fireEvent, act } from '@testing-library/react'

// GestioneListini legge l'elenco file da supabase.storage.from(bucket).list().
// Mock hermetico con `list`/`upload` controllabili per-test (vi.hoisted → riferibili
// nella factory). `upload` è hoisted perché i test di sanitizzazione asseriscono
// sull'argomento con cui viene chiamata; `remove` perché i test dell'eliminazione
// contano le chiamate e il loro ordine (file, poi sidecar).
const { listMock, uploadMock, removeMock, downloadMock, parseMock } = vi.hoisted(() => ({
  listMock: vi.fn(),
  uploadMock: vi.fn(),
  removeMock: vi.fn(),
  downloadMock: vi.fn(),
  parseMock: vi.fn(),
}))
vi.mock('@/lib/supabase', () => ({
  supabase: {
    storage: {
      from: () => ({
        list: listMock,
        upload: uploadMock,
        remove: removeMock,
        download: downloadMock,
      }),
    },
  },
  LISTINI_BUCKET: 'Listini',
}))
// Il parse nel worker (jsdom non ha Worker): di default un listino VALIDO per la
// categoria, così i test che non parlano di validazione arrivano all'upload. Dalla
// #58 un file si esamina PRIMA dell'upload (A4).
vi.mock('@/lib/excelWorker', () => ({ parseExcelInWorker: parseMock }))

import { GestioneListini } from '@/components/admin/GestioneListini'
import { sanitizeNomeFile, avvisoCollisioneCategoria } from '@/components/admin/nomeFileListino'
import { usePricelistStore, categorizzaListino, ETICHETTA } from '@/store/pricelistStore'
import { validatoPerTest } from '@/test-utils/listinoValidato'
import { ToastProvider } from '@/components/shared/Toast'
import { parseSuMisura } from '@/parsers/parseSuMisura'
import * as XLSX from 'xlsx'
import type { ListinoMarmeria } from '@/types/marmeria'
import type { ListinoPorte } from '@/types/porte'
import type { ListinoSuMisura } from '@/types/sumisura'
import type { ListinoCucina } from '@/types/cucina'
import { strutturaCucina } from '@/data/cucina/strutturaCucina'
import { nomeSidecar } from '@/lib/selezioneFogli'
import { FINITURE_FINTE, ACCESSORI_FINTI } from '@/test-utils/finitureFinte'

const MARMERIA_VALIDO: ListinoMarmeria = {
  materiali: [
    {
      produttore: 'DEKTON', colore: 'Adia', tipoSuperficie: 'Opaco', coloreFinituraCompleto: 'Adia_Opaco',
      collezione: 'IND', tipologia: 'LAPITEC',
      spessori: { 13: { spessore: 13, disponibile: true, prezziMq: { fino62: 500, da63a70: 550, oltre70: 600 }, minimoFatturabile: 1200 } },
      alzatinaAltezza: 0, alzatinaEuroMl: 0, schienaleEuroMq: 0,
    },
  ],
  lavorazioniBordo: [{ id: 1, descrizione: 'Costa retta', prezzoMlPerTipologia: { QUARZO: 48, LAPITEC: 61, GRES: 61 } }],
  lavorazioniVarie: [],
  vascheIntegrate: [],
  rilMontScaglioni: [{ da: 0, a: null, importo: 300 }],
  scontiDisponibili: [0, 0.05],
  aggiornato: '',
}
const PORTE_VALIDO: ListinoPorte = {
  modelli: [{ nome: 'GIOTTO', prezzo2026: 700, h215: 900, h240: 1000 }],
  optional: [{ nome: 'Serratura', unita: 'PORTA', prezzo: 40 }],
  aggiornato: '',
}
const SUMISURA_VALIDO: ListinoSuMisura = {
  // Non «CUCINA»: un su misura col solo foglio CUCINA ora si rifiuta (PR 10b-1).
  fogli: [{ nome: 'SU MISURA', nota: '', voci: [{ descrizione: 'Anta', prezzoUnitario: 100, unitaMisura: 'MQ' }] }],
  aggiornato: '',
}
// Prezzi inventati (D7): il listino cucine vero non entra nei test.
const CUCINE_VALIDO: ListinoCucina = {
  prezzi: [{ id: 'base-pensile-laminato', prezzo: 111 }],
  percentuali: { casse: 0.1, ante: 0.2, progettazione: 0.1, adeguamento: 0.2 },
  giornoRate: 66,
  vascaGres: 555,
  vociMancanti: [],
  righeSconosciute: [],
  aggiornato: '',
}
const VALIDO = { marmeria: MARMERIA_VALIDO, porte: PORTE_VALIDO, sumisura: SUMISURA_VALIDO, cucine: CUCINE_VALIDO }
function parseValido() {
  parseMock.mockReset()
  parseMock.mockImplementation(async (tipo: keyof typeof VALIDO) => structuredClone(VALIDO[tipo]))
}

const PORTE_ATTIVO = 'LISTINO PORTE COLETTA EBANISTERIA.xlsx'
const PORTE_VECCHIO = 'porte_2025_vecchio.xlsx'

// Shape file come da supabase storage .list(): il componente legge name/updated_at/metadata.size.
function fileEntry(name: string) {
  return { name, updated_at: '2026-01-02T10:00:00.000Z', metadata: { size: 12345 } }
}

describe('GestioneListini — badge categoria "Porte" + "In uso"', () => {
  beforeEach(() => {
    // Store non popolato di default: l'attivazione dipende dal fallback find()-logic,
    // salvo quando un test setta esplicitamente porte.aggiornato.
    usePricelistStore.setState({ suMisura: null, marmeria: null, porte: null, cucine: null })
    listMock.mockReset()
  })
  afterEach(() => cleanup())

  it('4) file categoria porte → badge testo "Porte" con classe colore warning', async () => {
    listMock.mockResolvedValue({ data: [fileEntry(PORTE_ATTIVO)], error: null })
    render(<GestioneListini />)

    // fetchFiles è async (loading → lista): attendo la comparsa del badge.
    const badge = await screen.findByText('Porte')
    expect(badge).toBeTruthy()
    expect(badge.className).toContain('text-warning')
  })

  it('5) "In uso": porte.aggiornato = nome-file → quel file attivo; altro file porte → non attivo', async () => {
    usePricelistStore.setState({
      porte: validatoPerTest({ modelli: [], optional: [], aggiornato: PORTE_ATTIVO }),
    })
    listMock.mockResolvedValue({
      data: [fileEntry(PORTE_ATTIVO), fileEntry(PORTE_VECCHIO)],
      error: null,
    })
    render(<GestioneListini />)

    const attivoRow = (await screen.findByText(PORTE_ATTIVO)).closest('li')!
    const vecchioRow = screen.getByText(PORTE_VECCHIO).closest('li')!

    // Il file che coincide con porte.aggiornato → "In uso"; l'altro porte → "Non attivo".
    expect(within(attivoRow).getByText('In uso')).toBeTruthy()
    expect(within(vecchioRow).getByText('Non attivo')).toBeTruthy()
    expect(within(vecchioRow).queryByText('In uso')).toBeNull()
  })
  it('categoria che non si è caricata: nessun «In uso», il più recente «Non caricato», e il buono non è «da eliminare» (O8)', async () => {
    usePricelistStore.setState({
      marmeria: null,
      errors: { suMisura: null, marmeria: 'Il file "MARMERIA Rev_84.xlsx" non è un listino Gres valido', porte: null, cucine: null },
    })
    listMock.mockResolvedValue({
      data: [fileEntry('MARMERIA Rev_84.xlsx'), fileEntry('MARMERIA Rev_83.xlsx')],
      error: null,
    })
    render(<GestioneListini />)

    const rotto = (await screen.findByText('MARMERIA Rev_84.xlsx')).closest('li')!
    const buono = screen.getByText('MARMERIA Rev_83.xlsx').closest('li')!
    expect(within(rotto).getByText('Non caricato')).toBeTruthy()
    expect(screen.queryByText('In uso')).toBeNull()
    expect(within(buono).getByText('Non attivo')).toBeTruthy()
    expect(screen.queryByText(/non più utilizzat/)).toBeNull()
    usePricelistStore.setState({ errors: { suMisura: null, marmeria: null, porte: null, cucine: null } })
  })
})

// Caratteri di controllo costruiti dal CODICE, mai scritti come byte letterali:
// un NUL nel sorgente rende il file BINARIO per git (diff illeggibile in review)
// ed è invisibile nell'editor — chi legge non vedrebbe cosa stiamo testando.
const NUL = String.fromCharCode(0)
const UNIT_SEP = String.fromCharCode(31)

describe('sanitizeNomeFile — nome sicuro per lo Storage', () => {
  it('toglie i segmenti di path e i `..`', () => {
    expect(sanitizeNomeFile('../../porte.xlsx')).toBe('porte.xlsx')
    expect(sanitizeNomeFile('..\\..\\porte.xlsx')).toBe('porte.xlsx')
    expect(sanitizeNomeFile('/etc/passwd.xlsx')).toBe('passwd.xlsx')
    expect(sanitizeNomeFile('cartella/sotto/listino.xlsx')).toBe('listino.xlsx')
  })

  it('toglie i caratteri di controllo (li copre l allowlist, senza regola dedicata)', () => {
    expect(sanitizeNomeFile(`por${NUL}te${UNIT_SEP}.xlsx`)).toBe('porte.xlsx')
    expect(sanitizeNomeFile('listino\n\t.xls')).toBe('listino.xls')
  })

  it('conserva lettere accentate, numeri, spazi, trattini e underscore', () => {
    expect(sanitizeNomeFile('Listino Marmeria Città 2026.xlsx')).toBe('Listino Marmeria Città 2026.xlsx')
    expect(sanitizeNomeFile('porte_2026-rev2.xls')).toBe('porte_2026-rev2.xls')
  })

  it('parentesi e apostrofi passano intatti: sono innocui e frequenti nei nomi veri', () => {
    // L'allowlist è la più LARGA possibile senza separatori di path, non la più
    // stretta: `()` e `'` non contano nulla per traversal e categorizzazione, e
    // rinominarli in silenzio sarebbe un costo senza contropartita.
    expect(sanitizeNomeFile('Listino (rev 2).xlsx')).toBe('Listino (rev 2).xlsx')
    expect(sanitizeNomeFile("Listino D'Amico.xlsx")).toBe("Listino D'Amico.xlsx")
    // Il download del browser produce questo di continuo.
    expect(sanitizeNomeFile('Listino (1).xlsx')).toBe('Listino (1).xlsx')
    // Apostrofo TIPOGRAFICO: macOS lo sostituisce da solo al dritto.
    expect(sanitizeNomeFile('Listino D’Amico.xlsx')).toBe('Listino D’Amico.xlsx')
  })

  it('un nome già pulito non viene toccato', () => {
    expect(sanitizeNomeFile('LISTINO PORTE COLETTA EBANISTERIA.xlsx')).toBe(
      'LISTINO PORTE COLETTA EBANISTERIA.xlsx'
    )
  })

  it('l estensione sopravvive sempre: se passava VALID_EXT prima, passa anche dopo', () => {
    // Invariante su cui si regge il resto: `.`/`x`/`l`/`s` sono tutti allowlisted.
    for (const n of ['../a.xlsx', `a${NUL}.xls`, '..xlsx', 'à€$.xlsx']) {
      expect(/\.(xlsx|xls)$/i.test(sanitizeNomeFile(n))).toBe(true)
    }
  })

  it('un segmento di path NON contrabbanda una categoria', () => {
    // `porte` sta nel PATH, non nel nome: dopo la sanitizzazione il file si
    // chiama `listino.xlsx` → Su misura. La categorizzazione legge il nome
    // MEMORIZZATO, quindi è coerente con quello che vede l'utente nel listing.
    expect(categorizzaListino('../porte/listino.xlsx')).toBe('porte') // nome grezzo: sbagliato
    expect(categorizzaListino(sanitizeNomeFile('../porte/listino.xlsx'))).toBe('sumisura')
    // Viceversa: una parola-categoria NEL nome sopravvive sempre.
    expect(categorizzaListino(sanitizeNomeFile('../../Listino Porte 2026.xlsx'))).toBe('porte')
    expect(categorizzaListino(sanitizeNomeFile('/tmp/marmeria rev82.xlsx'))).toBe('marmeria')
  })
})

describe('GestioneListini — upload col nome sanitizzato', () => {
  beforeEach(() => {
    usePricelistStore.setState({ suMisura: null, marmeria: null, porte: null, cucine: null })
    listMock.mockReset()
    listMock.mockResolvedValue({ data: [], error: null })
    uploadMock.mockReset()
    parseValido()
    uploadMock.mockResolvedValue({ error: null })
  })
  afterEach(() => cleanup())

  async function caricaFileChiamato(nome: string) {
    const { container } = render(<GestioneListini />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    // Byte VERI di un .xlsx (firma ZIP "PK"): senza, il check di firma ferma il
    // file prima dell'upload e questi test non arriverebbero mai ad asserire.
    const file = new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0])], nome, {
      type: 'application/vnd.ms-excel',
    })
    // `File.name` è read-only: il costruttore lo fissa, ma un browser non
    // metterebbe mai un path lì — per questo il test lo forza esplicitamente.
    Object.defineProperty(file, 'name', { value: nome })
    fireEvent.change(input, { target: { files: [file] } })
    await waitFor(() => expect(uploadMock).toHaveBeenCalled())
    return uploadMock.mock.calls[0][0] as string
  }

  it('nome con ../ → upload riceve il nome PULITO, non quello grezzo', async () => {
    const nomeUsato = await caricaFileChiamato('../../porte.xlsx')
    expect(nomeUsato).toBe('porte.xlsx')
  })

  it('nome con / → upload riceve il nome PULITO', async () => {
    const nomeUsato = await caricaFileChiamato('cartella/listino marmeria.xlsx')
    expect(nomeUsato).toBe('listino marmeria.xlsx')
  })

  it('nome già pulito → passa intatto (nessun danno collaterale)', async () => {
    const nomeUsato = await caricaFileChiamato('LISTINO PORTE COLETTA EBANISTERIA.xlsx')
    expect(nomeUsato).toBe('LISTINO PORTE COLETTA EBANISTERIA.xlsx')
  })
})

describe('GestioneListini — l errore di upload è INLINE e non scade', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    usePricelistStore.setState({ suMisura: null, marmeria: null, porte: null, cucine: null })
    listMock.mockReset()
    listMock.mockResolvedValue({ data: [], error: null })
    uploadMock.mockReset()
    parseValido()
    uploadMock.mockResolvedValue({ error: null })
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  function droppa(nome: string) {
    const { container } = render(<GestioneListini />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['x'], nome, { type: 'text/plain' })
    Object.defineProperty(file, 'name', { value: nome })
    fireEvent.change(input, { target: { files: [file] } })
  }

  /** Un file con i byte VERI di un .xlsx: firma ZIP "PK\\x03\\x04". */
  function fileExcelVero(nome: string): File {
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0])
    const file = new File([zip], nome, { type: 'application/vnd.ms-excel' })
    Object.defineProperty(file, 'name', { value: nome })
    return file
  }

  async function droppaFile(file: File) {
    const { container } = render(<GestioneListini />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } })
    })
  }

  function pannelloErrore() {
    return screen.queryByText('Caricamento non riuscito')
  }

  it('un upload rifiutato mostra il motivo INLINE, non in un toast', async () => {
    droppa('appunti.txt')

    expect(pannelloErrore()).toBeTruthy()
    expect(screen.getByText(/Formato non valido/i)).toBeTruthy()
  })

  it('NON scade: dopo 10s è ancora lì (il toast sarebbe sparito a 3,5s)', async () => {
    // È il punto della voce: il messaggio di `ingestListino` è il verdetto del
    // parser, col suggerimento su cosa correggere nel file. In 3,5s non si legge.
    droppa('appunti.txt')
    expect(pannelloErrore()).toBeTruthy()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })

    expect(pannelloErrore()).toBeTruthy()
  })

  it('è chiudibile a mano', async () => {
    droppa('appunti.txt')

    fireEvent.click(screen.getByRole('button', { name: /chiudi errore/i }))

    expect(pannelloErrore()).toBeNull()
  })

  it('un tentativo nuovo riparte pulito: l errore mostrato è quello di ADESSO', async () => {
    droppa('appunti.txt')
    expect(pannelloErrore()).toBeTruthy()
    cleanup()

    // Secondo giro con un file valido: nessun errore residuo dal primo.
    await droppaFile(fileExcelVero('listino marmeria.xlsx'))
    await waitFor(() => expect(uploadMock).toHaveBeenCalled())

    expect(pannelloErrore()).toBeNull()
  })
})

describe('GestioneListini — un file rinominato non entra nel bucket (E13)', () => {
  beforeEach(() => {
    usePricelistStore.setState({ suMisura: null, marmeria: null, porte: null, cucine: null })
    listMock.mockReset()
    listMock.mockResolvedValue({ data: [], error: null })
    uploadMock.mockReset()
    parseValido()
    uploadMock.mockResolvedValue({ error: null })
  })
  afterEach(() => cleanup())

  async function droppaByte(byte: number[], nome: string) {
    const { container } = render(<GestioneListini />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    // `type` è quello che darebbe il BROWSER a un .txt rinominato .xlsx: lo
    // deriva dall'estensione. Per questo un check su `file.type` sarebbe teatro —
    // guarderebbe la stessa stringa che VALID_EXT ha già visto.
    const file = new File([new Uint8Array(byte)], nome, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    Object.defineProperty(file, 'name', { value: nome })
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } })
    })
  }

  it('estensione giusta ma byte sbagliati: NON viene caricato, e il motivo si legge', async () => {
    // Il danno che previene non è "spazzatura nel bucket": `loadDefaults` prende
    // il file più RECENTE per categoria, quindi un illeggibile appena caricato
    // OSCURA il listino buono, che smette di caricarsi.
    await droppaByte([0x68, 0x65, 0x6c, 0x6c, 0x6f], 'listino marmeria.xlsx') // "hello"

    expect(uploadMock).not.toHaveBeenCalled()
    expect(screen.getByText(/non è un file Excel/i)).toBeTruthy()
  })

  it('firma ZIP (.xlsx vero): passa', async () => {
    await droppaByte([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0], 'listino marmeria.xlsx')

    await waitFor(() => expect(uploadMock).toHaveBeenCalled())
  })

  it('firma OLE2 (.xls vero, il formato del listino su misura): passa', async () => {
    await droppaByte([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], 'listino marmeria.xls')

    await waitFor(() => expect(uploadMock).toHaveBeenCalled())
  })
})

describe('avvisoCollisioneCategoria — E10, il nome ambiguo non passa più in silenzio', () => {
  it('nome con SIA porte SIA marmeria: dice quale categoria vince', () => {
    const avviso = avvisoCollisioneCategoria('listino porte e marmeria.xlsx')
    expect(avviso).toContain('sia "porte" sia "marmeria"')
    // Vince porte perché `categorizzaListino` la controlla per prima: l'avviso
    // deve dire la verità sul comportamento, non una preferenza.
    expect(avviso).toContain('come Porte')
    expect(categorizzaListino('listino porte e marmeria.xlsx')).toBe('porte')
  })

  it('una sola parola-categoria: nessun avviso', () => {
    expect(avvisoCollisioneCategoria('listino marmeria rev82.xlsx')).toBeNull()
    expect(avvisoCollisioneCategoria('LISTINO PORTE COLETTA EBANISTERIA.xlsx')).toBeNull()
  })

  it('nessuna parola-categoria (su misura, il fallback): nessun avviso', () => {
    expect(avvisoCollisioneCategoria('COLETTA_APR26_AGGIORNATO.xls')).toBeNull()
  })

  it('case-insensitive come la categorizzazione', () => {
    expect(avvisoCollisioneCategoria('PORTE e Marmeria 2026.xlsx')).toContain('come Porte')
  })
})

// Sonar S9383: le promesse dei gestori di upload non erano gestite. Un errore
// inatteso (rete, file illeggibile) lasciava la drop zone bloccata su
// "Caricamento in corso..." con `pointer-events-none`: nessun messaggio e
// nessun modo di riprovare senza ricaricare la pagina.
describe('GestioneListini — un errore inatteso non blocca l upload', () => {
  beforeEach(() => {
    usePricelistStore.setState({ suMisura: null, marmeria: null, porte: null, cucine: null })
    listMock.mockReset()
    listMock.mockResolvedValue({ data: [], error: null })
    uploadMock.mockReset()
    parseValido()
  })
  afterEach(() => cleanup())

  function fileExcel(nome: string): File {
    const file = new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0])], nome, {
      type: 'application/vnd.ms-excel',
    })
    Object.defineProperty(file, 'name', { value: nome })
    return file
  }

  async function carica(file: File) {
    const { container } = render(<GestioneListini />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } })
    })
  }

  it('upload che lancia: il motivo nel banner, la drop zone torna usabile', async () => {
    uploadMock.mockRejectedValue(new Error('rete giù'))
    await carica(fileExcel('listino marmeria.xlsx'))

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('rete giù'))
    expect(screen.queryByText('Caricamento in corso...')).toBeNull()
  })

  it('file illeggibile prima dell upload: il motivo nel banner', async () => {
    const file = fileExcel('listino marmeria.xlsx')
    // Il file cambiato su disco dopo la scelta: la lettura della firma rigetta.
    Object.defineProperty(file, 'slice', {
      value: () => ({ arrayBuffer: () => Promise.reject(new Error('file illeggibile')) }),
    })
    await carica(file)

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('file illeggibile'))
    expect(uploadMock).not.toHaveBeenCalled()
  })

  it('elenco che lancia: niente "..." per sempre, e un toast dice perché', async () => {
    listMock.mockRejectedValue(new Error('rete giù'))
    render(
      <ToastProvider>
        <GestioneListini />
      </ToastProvider>
    )

    expect(await screen.findByText('Nessun file presente nel bucket.')).toBeTruthy()
    expect(screen.getByText(/Errore caricamento elenco: rete giù/)).toBeTruthy()
  })
})

// Sonar S1082/S6819: la drop zone si apriva solo col mouse. Ora è un
// <button> nativo: Invio e Spazio li gestisce il browser (jsdom non li
// simula), quindi qui si verifica che sia quel bottone e che il click
// arrivi all'input file.
describe('GestioneListini — drop zone da tastiera', () => {
  let apri: ReturnType<typeof vi.spyOn> | undefined
  beforeEach(() => {
    listMock.mockReset()
    listMock.mockResolvedValue({ data: [], error: null })
  })
  afterEach(() => {
    apri?.mockRestore()
    cleanup()
  })

  it('è un <button type="button"> raggiungibile col Tab; il click apre il selettore file', () => {
    apri = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
    const { container } = render(<GestioneListini />)
    const zona = screen.getByRole('button', { name: 'Scegli un file Excel da caricare' })
    expect(zona.tagName).toBe('BUTTON')
    expect(zona.getAttribute('type')).toBe('button')
    expect(zona.tabIndex).toBe(0)

    fireEvent.click(zona)

    expect(apri).toHaveBeenCalledTimes(1)
    // Il click arriva all'input file, non a un elemento qualunque.
    expect(apri.mock.contexts[0]).toBe(container.querySelector('input[type="file"]'))
  })
})

// I due ingressi che il triage Sonar ha toccato oltre al file picker: il drop
// e il bottone "Aggiorna" (che ora passa da `ricaricaElenco`).
describe('GestioneListini — drop e aggiornamento elenco', () => {
  beforeEach(() => {
    usePricelistStore.setState({ suMisura: null, marmeria: null, porte: null, cucine: null })
    listMock.mockReset()
    listMock.mockResolvedValue({ data: [], error: null })
    uploadMock.mockReset()
    parseValido()
    uploadMock.mockResolvedValue({ error: null })
  })
  afterEach(() => cleanup())

  it('un file trascinato sulla drop zone viene caricato', async () => {
    render(<GestioneListini />)
    const file = new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0])], 'listino marmeria.xlsx', {
      type: 'application/vnd.ms-excel',
    })
    fireEvent.drop(screen.getByRole('button', { name: 'Scegli un file Excel da caricare' }), {
      dataTransfer: { files: [file] },
    })

    await waitFor(() => expect(uploadMock).toHaveBeenCalled())
    expect(uploadMock.mock.calls[0][0]).toBe('listino marmeria.xlsx')
  })

  it('"Aggiorna" rilegge il bucket e mostra il file nuovo', async () => {
    render(<GestioneListini />)
    await screen.findByText('Nessun file presente nel bucket.')
    listMock.mockResolvedValue({ data: [fileEntry(PORTE_ATTIVO)], error: null })

    fireEvent.click(screen.getByRole('button', { name: 'Aggiorna' }))

    expect(await screen.findByText(PORTE_ATTIVO)).toBeTruthy()
    expect(listMock).toHaveBeenCalledTimes(2)
  })
})

describe('GestioneListini — un file non valido non entra nel bucket (A4)', () => {
  beforeEach(() => {
    usePricelistStore.setState({
      suMisura: null, marmeria: null, porte: null,
      errors: { suMisura: null, marmeria: null, porte: null, cucine: null },
      referti: { suMisura: null, marmeria: null, porte: null, cucine: null },
    })
    listMock.mockReset()
    listMock.mockResolvedValue({ data: [], error: null })
    uploadMock.mockReset()
    uploadMock.mockResolvedValue({ error: null })
    downloadMock.mockReset()
    parseValido()
  })
  afterEach(() => cleanup())

  function excel(nome: string): File {
    const file = new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0])], nome, { type: 'application/vnd.ms-excel' })
    Object.defineProperty(file, 'name', { value: nome })
    return file
  }
  async function carica(file: File) {
    const { container } = render(<ToastProvider><GestioneListini /></ToastProvider>)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } })
    })
  }
  const banner = () => screen.getByText('Caricamento non riuscito').closest('[role="alert"]')?.textContent ?? ''

  it('marmeria con una colonna spostata (il parser lancia): non caricata, il motivo resta a schermo', async () => {
    parseMock.mockRejectedValueOnce(
      new Error('Foglio GAMMA_COLORI, colonna T: intestazione attesa «prezzo 13mm prof 63 - 70», trovata «nuova»')
    )
    await carica(excel('LUG26 MARMERIA Rev_84.xlsx'))
    await waitFor(() => expect(banner()).toContain('Foglio GAMMA_COLORI, colonna T'))
    expect(uploadMock).not.toHaveBeenCalled()
    expect(usePricelistStore.getState().marmeria).toBeNull()
  })

  it('porte che non passano lo schema: non caricate, il motivo dice cosa manca', async () => {
    parseMock.mockResolvedValueOnce({ ...PORTE_VALIDO, modelli: [] })
    await carica(excel('LISTINO PORTE.xlsx'))
    await waitFor(() => expect(banner()).toContain('non è un listino Porte valido: nessun modello'))
    expect(uploadMock).not.toHaveBeenCalled()
  })

  it('su misura con parse fallito: NON caricato (prima entrava lo stesso)', async () => {
    parseMock.mockRejectedValueOnce(new Error('file corrotto'))
    await carica(excel('listino su misura.xlsx'))
    await waitFor(() => expect(banner()).toContain('Errore lettura file Arredi: file corrotto'))
    expect(uploadMock).not.toHaveBeenCalled()
  })

  it('un Excel che non è un listino (workbook sintetico): rifiutato prima della scelta dei fogli', async () => {
    // Come la tabella colori RAL: fogli che non hanno la struttura del listino.
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['RAL', 'NCS', 'Sikkens'], ['1013', 'S 1005-Y20R', 'F0.05.85']]), 'RAL')
    parseMock.mockImplementationOnce(async () => parseSuMisura(wb))
    await carica(excel('Codici colore.xlsx'))
    await waitFor(() => expect(banner()).toContain('non è un listino Arredi valido: non contiene fogli riconoscibili'))
    expect(screen.queryByText(/Togli la spunta/)).toBeNull()
    expect(uploadMock).not.toHaveBeenCalled()
  })

  it('upload riuscito: un solo parse, nessun nuovo download, listino e referto in memoria', async () => {
    await carica(excel('LUG26 MARMERIA Rev_84.xlsx'))
    await waitFor(() => expect(usePricelistStore.getState().marmeria?.aggiornato).toBe('LUG26 MARMERIA Rev_84.xlsx'))
    expect(parseMock).toHaveBeenCalledTimes(1)
    expect(downloadMock).not.toHaveBeenCalled()
    expect(usePricelistStore.getState().referti.marmeria?.caricati).toContainEqual({ nome: 'materiali', voci: 1 })
  })

  it('upload in errore: lo store non cambia e l admin vede l errore', async () => {
    uploadMock.mockResolvedValueOnce({ error: { message: 'bucket pieno' } })
    await carica(excel('LUG26 MARMERIA Rev_84.xlsx'))
    await waitFor(() => expect(banner()).toContain('Errore upload: bucket pieno'))
    expect(usePricelistStore.getState().marmeria).toBeNull()
    expect(usePricelistStore.getState().referti.marmeria).toBeNull()
  })
})

describe('GestioneListini — il rev1 con FINITURE e ACCESSORI (L20)', () => {
  beforeEach(() => {
    usePricelistStore.setState({
      suMisura: null, marmeria: null, porte: null, cucine: null,
      errors: { suMisura: null, marmeria: null, porte: null, cucine: null },
      referti: { suMisura: null, marmeria: null, porte: null, cucine: null },
    })
    listMock.mockReset()
    listMock.mockResolvedValue({ data: [], error: null })
    uploadMock.mockReset()
    uploadMock.mockResolvedValue({ error: null })
    parseMock.mockReset()
    // Un rev1 finto: SU MISURA, FINITURE e ACCESSORI, prezzi finti.
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['T'], ['n'], ['FINITURA', 'PREZZO', 'U.MISURA'], ['Anta', 107, 'MQ']]), 'SU MISURA')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(FINITURE_FINTE), 'FINITURE')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ACCESSORI_FINTI), 'ACCESSORI')
    parseMock.mockImplementation(async () => parseSuMisura(wb))
  })
  afterEach(() => cleanup())

  it('la selezione propone FINITURE e ACCESSORI; dopo il caricamento il referto dice le combinazioni per tipo', async () => {
    const file = new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0])], 'rev1 prospetto su misura.xlsx')
    const { container } = render(<ToastProvider><GestioneListini /></ToastProvider>)
    await act(async () => {
      fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [file] } })
    })
    await waitFor(() => expect(screen.getByText('Quali fogli sono il listino?')).toBeTruthy())
    const riga = (nome: string) => screen.getByText(nome, { selector: 'span' }).closest('label')!
    expect(riga('FINITURE').textContent).toContain('2 voci · 7 combinazioni')
    expect((within(riga('FINITURE')).getByRole('checkbox') as HTMLInputElement).checked).toBe(true)
    expect(riga('ACCESSORI').textContent).toContain('2 voci')
    expect((within(riga('ACCESSORI')).getByRole('checkbox') as HTMLInputElement).checked).toBe(true)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Carica 3 di 3' }))
    })
    await waitFor(() =>
      expect(
        screen.getByText(/FINITURE, combinazioni lette: 7/).textContent
      ).toBe('FINITURE, combinazioni lette: 7 (MOBILE A GIORNO 2 · ARMADIO CON ANTE 3 · TELAIO CON ANTE 1 · MENSOLE A MURO 1)')
    )
    expect(usePricelistStore.getState().suMisura?.fogli.find((f) => f.nome === 'FINITURE')?.matrice).toHaveLength(7)
  })
})

describe('GestioneListini — listino Cucine (PR 10b-1)', () => {
  const CUCINE = 'LISTINO CUCINA COLETTA.xls'
  beforeEach(() => {
    usePricelistStore.setState({
      suMisura: null, marmeria: null, porte: null, cucine: null,
      errors: { suMisura: null, marmeria: null, porte: null, cucine: null },
      referti: { suMisura: null, marmeria: null, porte: null, cucine: null },
    })
    listMock.mockReset()
    uploadMock.mockReset()
    uploadMock.mockResolvedValue({ error: null })
    parseValido()
  })
  afterEach(() => cleanup())

  it('il file ha il badge «Cucine» e, caricato, è «In uso»', async () => {
    usePricelistStore.setState({ cucine: validatoPerTest({ ...CUCINE_VALIDO, aggiornato: CUCINE }) })
    listMock.mockResolvedValue({ data: [fileEntry(CUCINE), fileEntry('listino cucina 2025.xls')], error: null })
    render(<GestioneListini />)

    const riga = (await screen.findByText(CUCINE)).closest('li')!
    expect(within(riga).getByText('Cucine').className).toContain('text-warning')
    expect(within(riga).getByText('In uso')).toBeTruthy()
    expect(within(screen.getByText('listino cucina 2025.xls').closest('li')!).getByText('Non attivo')).toBeTruthy()
  })

  it('presente ma rotto: «Non caricato», come le altre categorie (O8)', async () => {
    usePricelistStore.setState({
      errors: { suMisura: null, marmeria: null, porte: null, cucine: `Errore lettura file Cucine: Foglio CUCINA non trovato` },
    })
    listMock.mockResolvedValue({ data: [fileEntry(CUCINE)], error: null })
    render(<GestioneListini />)

    const riga = (await screen.findByText(CUCINE)).closest('li')!
    expect(within(riga).getByText('Non caricato')).toBeTruthy()
  })

  it('il referto dice cosa è entrato, con gli avvisi', async () => {
    usePricelistStore.setState({
      referti: {
        suMisura: null, marmeria: null, porte: null,
        cucine: { file: CUCINE, caricati: [{ nome: 'voci con prezzo', voci: 54 }], esclusi: [], note: ['manca la riga «VASCA INTEGRATA IN GRES»'] },
      },
    })
    listMock.mockResolvedValue({ data: [], error: null })
    render(<GestioneListini />)

    expect(await screen.findByText(`— ${CUCINE}`)).toBeTruthy()
    expect(screen.getByText('voci con prezzo: 54')).toBeTruthy()
    expect(screen.getByText(/manca la riga «VASCA INTEGRATA IN GRES»/)).toBeTruthy()
  })

  it('upload: esaminato come cucine con la sola struttura (nessun prezzo nel worker), poi caricato', async () => {
    listMock.mockResolvedValue({ data: [], error: null })
    const file = new File([new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])], CUCINE, { type: 'application/vnd.ms-excel' })
    const { container } = render(<ToastProvider><GestioneListini /></ToastProvider>)
    await act(async () => {
      fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [file] } })
    })

    await waitFor(() => expect(usePricelistStore.getState().cucine?.aggiornato).toBe(CUCINE))
    expect(parseMock).toHaveBeenCalledWith('cucine', expect.any(ArrayBuffer), CUCINE, strutturaCucina)
    expect(uploadMock).toHaveBeenCalledTimes(1)
  })
})

describe('avvisoCollisioneCategoria — anche «cucina»', () => {
  it('porte e cucina: vince porte, e lo dice', () => {
    const avviso = avvisoCollisioneCategoria('listino porte cucina.xlsx')
    expect(avviso).toContain('sia "porte" sia "cucina"')
    expect(avviso).toContain('come Porte')
  })

  it('tre parole: le elenca tutte', () => {
    expect(avvisoCollisioneCategoria('porte marmeria cucina.xlsx')).toContain('"porte", "marmeria" e "cucina"')
  })

  it('solo cucina: nessun avviso', () => {
    expect(avvisoCollisioneCategoria('LISTINO CUCINA COLETTA.xls')).toBeNull()
  })
})

// O29: `handleDelete` leggeva il solo `error` di `remove`. `data: []` (nulla
// rimosso: oggetto già sparito, o RLS che nega senza errore) diventava
// «eliminato», e un'eccezione lasciava il pulsante spento per sempre.
describe('GestioneListini — eliminare un listino (O29)', () => {
  const SU_MISURA = 'COLETTA_APR26_AGGIORNATO.xls'
  let caricaDefaults: ReturnType<typeof vi.spyOn>
  let conferma: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    usePricelistStore.setState({
      suMisura: null, marmeria: null, porte: null, cucine: null,
      errors: { suMisura: null, marmeria: null, porte: null, cucine: null },
    })
    listMock.mockReset()
    removeMock.mockReset()
    caricaDefaults = vi.spyOn(usePricelistStore.getState(), 'loadDefaults').mockResolvedValue(undefined)
    conferma = vi.spyOn(window, 'confirm')
  })
  afterEach(() => {
    cleanup()
    caricaDefaults.mockRestore()
    // L21-B: la conferma è quella del design system, mai `window.confirm`.
    expect(conferma).not.toHaveBeenCalled()
    conferma.mockRestore()
  })

  async function elimina(nome: string) {
    listMock.mockResolvedValue({ data: [fileEntry(nome)], error: null })
    render(<ToastProvider><GestioneListini /></ToastProvider>)
    const pulsante = await screen.findByRole('button', { name: `Elimina ${nome}` })
    fireEvent.click(pulsante)
    const dialogo = await screen.findByRole('alertdialog', { name: `Eliminare "${nome}"?` })
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole('button', { name: 'Elimina il listino' }))
    })
    return pulsante as HTMLButtonElement
  }

  it('remove() risponde con data vuota: toast di errore, nessun «eliminato», elenco riletto, loadDefaults chiamato, sidecar non toccato', async () => {
    removeMock.mockResolvedValue({ data: [], error: null })
    await elimina(SU_MISURA)

    await waitFor(() => expect(caricaDefaults).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('alert').textContent).toContain(
      `Eliminazione non riuscita: "${SU_MISURA}" non è stato rimosso dal bucket (già eliminato o permesso mancante). Elenco aggiornato.`
    )
    expect(screen.queryByText(`"${SU_MISURA}" eliminato`)).toBeNull()
    expect(listMock).toHaveBeenCalledTimes(2)
    expect(removeMock).toHaveBeenCalledTimes(1)
    expect(removeMock).toHaveBeenCalledWith([SU_MISURA])
  })

  it('remove() che lancia: toast di errore col motivo, pulsante di nuovo attivo, sidecar non toccato', async () => {
    removeMock.mockRejectedValue(new Error('rete giù'))
    const pulsante = await elimina(SU_MISURA)

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Errore eliminazione: rete giù'))
    expect(pulsante.disabled).toBe(false)
    expect(removeMock).toHaveBeenCalledTimes(1)
    // Stato ignoto: niente rilettura (c'è «Aggiorna»).
    expect(listMock).toHaveBeenCalledTimes(1)
    expect(caricaDefaults).not.toHaveBeenCalled()
  })

  it('eliminazione riuscita di un file Porte: «eliminato», una sola remove, elenco riletto, loadDefaults una volta', async () => {
    removeMock.mockResolvedValue({ data: [{ name: PORTE_VECCHIO }], error: null })
    await elimina(PORTE_VECCHIO)

    await waitFor(() => expect(caricaDefaults).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('status').textContent).toContain(`"${PORTE_VECCHIO}" eliminato`)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(removeMock).toHaveBeenCalledTimes(1)
    expect(removeMock).toHaveBeenCalledWith([PORTE_VECCHIO])
    expect(listMock).toHaveBeenCalledTimes(2)
  })

  it('eliminazione riuscita di un file Su Misura: prima la remove del file, poi quella del suo .meta.json', async () => {
    removeMock.mockImplementation(async (nomi: string[]) => ({ data: nomi.map((name) => ({ name })), error: null }))
    await elimina(SU_MISURA)

    await waitFor(() => expect(caricaDefaults).toHaveBeenCalledTimes(1))
    expect(removeMock.mock.calls).toEqual([[[SU_MISURA]], [[nomeSidecar(SU_MISURA)]]])
    expect(screen.getByRole('status').textContent).toContain(`"${SU_MISURA}" eliminato`)
  })

  it('il sidecar che non si riesce a togliere (la remove lancia) non cambia l esito: «eliminato»', async () => {
    removeMock
      .mockResolvedValueOnce({ data: [{ name: SU_MISURA }], error: null })
      .mockRejectedValueOnce(new Error('sidecar irraggiungibile'))
    await elimina(SU_MISURA)

    await waitFor(() => expect(caricaDefaults).toHaveBeenCalledTimes(1))
    expect(removeMock).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('status').textContent).toContain(`"${SU_MISURA}" eliminato`)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(listMock).toHaveBeenCalledTimes(2)
  })
})

// N5: il riquadro taceva le cucine, che `categorizzaListino` controlla. Il testo
// è scritto a mano: questo test lo tiene allineato alla funzione.
describe('GestioneListini — Info categorizzazione (N5)', () => {
  beforeEach(() => {
    listMock.mockReset()
    listMock.mockResolvedValue({ data: [], error: null })
  })
  afterEach(() => cleanup())

  it('il riquadro nomina ogni categoria di ETICHETTA e le parole «porte», «marmeria», «cucin» nell ordine di categorizzaListino', async () => {
    render(<GestioneListini />)
    await screen.findByText('Nessun file presente nel bucket.')
    const testo = (screen.getByText(/I file vengono categorizzati/).textContent ?? '').toLowerCase()

    // Ogni categoria ha la sua riga: una nuova in ETICHETTA senza testo fallisce qui.
    for (const etichetta of Object.values(ETICHETTA)) {
      expect(testo).toContain(`→ listino ${etichetta.toLowerCase()}`)
    }

    // Le parole nell'ordine in cui la funzione le controlla, ognuna con la sua categoria.
    const regole = [
      ['porte', 'porte'],
      ['marmeria', 'marmeria'],
      ['cucin', 'cucine'],
    ] as const
    const posizioni = regole.map(([parola, categoria]) => {
      expect(categorizzaListino(`listino ${parola}.xlsx`)).toBe(categoria)
      expect(testo).toContain(`contiene "${parola}"`)
      return testo.indexOf(`contiene "${parola}"`)
    })
    expect(posizioni).toEqual([...posizioni].sort((a, b) => a - b))
    // L'ordine conta davvero: un nome con tutte e tre le parole finisce nella prima.
    expect(categorizzaListino('cucina marmeria porte.xlsx')).toBe('porte')
    expect(categorizzaListino('listino 2026.xlsx')).toBe('sumisura')
    expect(testo.indexOf('qualsiasi altro nome')).toBeGreaterThan(posizioni.at(-1)!)
  })
})

// L24, punti 3 e 4: il menu dice «Arredi» e «Gres», Gestione Listini diceva «Su
// Misura» e «Marmeria». Cambiano solo le etichette per l'operatore: id, chiavi
// dello store, la parola «marmeria» nel nome del file e i titoli del PDF restano.
describe('GestioneListini — i nomi del menu e «Non caricare il file» (L24)', () => {
  beforeEach(() => {
    usePricelistStore.setState({
      suMisura: null, marmeria: null, porte: null, cucine: null,
      errors: { suMisura: null, marmeria: null, porte: null, cucine: null },
      referti: { suMisura: null, marmeria: null, porte: null, cucine: null },
    })
    listMock.mockReset()
    listMock.mockResolvedValue({ data: [], error: null })
  })
  afterEach(() => cleanup())

  it('ETICHETTA dice i nomi del menu; le chiavi non cambiano', () => {
    expect(ETICHETTA).toEqual({ sumisura: 'Arredi', marmeria: 'Gres', porte: 'Porte', cucine: 'Cucine' })
  })

  it('il riquadro dice che il file del Gres si riconosce da «marmeria» nel nome, e non nomina più Su Misura', async () => {
    render(<GestioneListini />)
    await screen.findByText('Nessun file presente nel bucket.')
    const testo = (screen.getByText(/I file vengono categorizzati/).textContent ?? '').toLowerCase()
    expect(testo).toContain('contiene "marmeria" → listino gres')
    expect(testo).toContain('qualsiasi altro nome → listino arredi')
    expect(testo).not.toContain('su misura')
    expect(testo).not.toContain('listino marmeria')
    // La regola sul nome del file non cambia.
    expect(categorizzaListino('LUG26 MARMERIA Rev_84.xlsx')).toBe('marmeria')
  })

  it('badge del file e «Cosa è caricato in memoria» dicono Gres e Arredi', async () => {
    usePricelistStore.setState({
      referti: {
        suMisura: { file: 'listino arredi.xlsx', caricati: [], esclusi: [], note: [] },
        marmeria: { file: 'LUG26 MARMERIA Rev_84.xlsx', caricati: [], esclusi: [], note: [] },
        porte: null,
        cucine: null,
      },
    })
    listMock.mockResolvedValue({ data: [fileEntry('LUG26 MARMERIA Rev_84.xlsx'), fileEntry('listino arredi.xlsx')], error: null })
    render(<GestioneListini />)
    const riga = (await screen.findByText('LUG26 MARMERIA Rev_84.xlsx', { selector: 'p' })).closest('li')!
    expect(within(riga).getByText('Gres')).toBeTruthy()
    const arredi = screen.getByText('listino arredi.xlsx', { selector: 'p' }).closest('li')!
    expect(within(arredi).getByText('Arredi')).toBeTruthy()
    const referto = screen.getByText('Cosa è caricato in memoria').parentElement!.textContent ?? ''
    expect(referto).toContain('Arredi — listino arredi.xlsx')
    expect(referto).toContain('Gres — LUG26 MARMERIA Rev_84.xlsx')
    expect(referto).not.toMatch(/Su Misura|Marmeria —/)
  })

  it('la scelta dei fogli ha «Non caricare il file», non «Annulla», e chiude senza caricare', async () => {
    uploadMock.mockReset()
    parseMock.mockReset()
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['T'], ['n'], ['FINITURA', 'PREZZO', 'U.MISURA'], ['Anta', 107, 'MQ']]), 'SU MISURA')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ACCESSORI_FINTI), 'ACCESSORI')
    parseMock.mockImplementation(async () => parseSuMisura(wb))
    const file = new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0])], 'listino arredi.xlsx')
    const { container } = render(<ToastProvider><GestioneListini /></ToastProvider>)
    await act(async () => {
      fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [file] } })
    })
    await waitFor(() => expect(screen.getByText('Quali fogli sono il listino?')).toBeTruthy())
    expect(screen.queryByRole('button', { name: 'Annulla' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Non caricare il file' }))
    expect(screen.queryByText('Quali fogli sono il listino?')).toBeNull()
    expect(uploadMock).not.toHaveBeenCalled()
  })
})
