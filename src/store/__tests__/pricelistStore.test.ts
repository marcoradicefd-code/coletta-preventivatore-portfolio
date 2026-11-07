import { describe, it, expect, beforeEach, vi } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as XLSX from 'xlsx'
import { parseSuMisura } from '@/parsers/parseSuMisura'
import type { ListinoSuMisura } from '@/types/sumisura'
import type { ListinoMarmeria, Materiale } from '@/types/marmeria'
import type { ListinoCucina } from '@/types/cucina'
import type { ListinoPorte } from '@/types/porte'

// Mocks must be hoisted via vi.hoisted so they exist before the modules under
// test are evaluated (zustand creates the store at import time).
const mocks = vi.hoisted(() => ({
  listMock: vi.fn(),
  downloadMock: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    storage: {
      from: () => ({
        list: mocks.listMock,
        download: mocks.downloadMock,
      }),
    },
  },
  LISTINI_BUCKET: 'Listini',
}))

// loadDefaults delega il parsing al Web Worker via parseExcelInWorker: lo
// mockiamo così il test resta hermetico (niente Worker reale, niente xlsx).
vi.mock('@/lib/excelWorker', () => ({
  parseExcelInWorker: vi.fn(),
}))

import { usePricelistStore, categorizzaListino, esaminaListino } from '@/store/pricelistStore'
import { strutturaCucina } from '@/data/cucina/strutturaCucina'
import { parseExcelInWorker } from '@/lib/excelWorker'
import { FINITURE_FINTE, ACCESSORI_FINTI } from '@/test-utils/finitureFinte'

/** Helper: mocka parseExcelInWorker risolvendo in base alla categoria. */
function mockParse(suMisura: ListinoSuMisura, marmeria: ListinoMarmeria, cucine?: ListinoCucina | Error) {
  vi.mocked(parseExcelInWorker).mockImplementation(
    ((type: 'sumisura' | 'marmeria' | 'cucine') => {
      if (type === 'cucine') return cucine instanceof Error ? Promise.reject(cucine) : Promise.resolve(cucine)
      return Promise.resolve(type === 'sumisura' ? suMisura : marmeria)
    }) as unknown as typeof parseExcelInWorker
  )
}

/** Listino cucine conforme, prezzi inventati (D7); percentuali uguali a quelle del codice. */
function listinoCucina(p: Partial<ListinoCucina> = {}): ListinoCucina {
  return {
    prezzi: [{ id: 'base-pensile-laminato', prezzo: 111 }],
    percentuali: { casse: 0.1, ante: 0.2, progettazione: 0.1, adeguamento: 0.2 },
    giornoRate: 66,
    vascaGres: 555,
    vociMancanti: [],
    righeSconosciute: [],
    aggiornato: '',
    ...p,
  }
}

const emptySuMisura: ListinoSuMisura = { fogli: [], aggiornato: '' }
const validSuMisura: ListinoSuMisura = {
  fogli: [{ nome: 'F1', nota: '', voci: [{ descrizione: 'x', prezzoUnitario: 1, unitaMisura: 'MQ' }] }],
  aggiornato: '',
}

// Materiale realistico: chiave non vuota + uno spessore con prezzi numerici,
// così supera la validazione Zod (validaListinoMarmeria) del modulo store.
const fakeMateriale: Materiale = {
  produttore: 'TEST',
  colore: 'Bianco',
  tipoSuperficie: 'Opaco',
  coloreFinituraCompleto: 'TEST_Bianco_Opaco',
  collezione: '',
  tipologia: 'QUARZO',
  spessori: {
    13: {
      spessore: 13,
      disponibile: true,
      prezziMq: { fino62: 100, da63a70: 100, oltre70: 200 },
      minimoFatturabile: 5,
    },
  },
  alzatinaAltezza: 0,
  alzatinaEuroMl: 0,
  schienaleEuroMq: 0,
}
const emptyMarmeria: ListinoMarmeria = {
  materiali: [],
  lavorazioniBordo: [],
  lavorazioniVarie: [],
  vascheIntegrate: [],
  rilMontScaglioni: [],
  scontiDisponibili: [],
  aggiornato: '',
}
// Listino marmeria conforme alla validazione Zod (materiali con prezzi, bordo,
// scaglioni RIL_MONT coerenti, sconti) → marmeriaJob lo carica senza errori.
const validMarmeria: ListinoMarmeria = {
  ...emptyMarmeria,
  materiali: [fakeMateriale],
  lavorazioniBordo: [
    { id: 1, descrizione: 'Costa retta', prezzoMlPerTipologia: { QUARZO: 48, LAPITEC: 61, GRES: 61 } },
  ],
  rilMontScaglioni: [{ da: 0, a: null, importo: 300 }],
  scontiDisponibili: [0],
}

/** Blob-like: loadDefaults only uses .arrayBuffer() and .size */
function fakeBlob(): Blob {
  return {
    arrayBuffer: async () => new ArrayBuffer(8),
    size: 8,
  } as unknown as Blob
}

function resetStore() {
  usePricelistStore.setState({
    suMisura: null,
    marmeria: null,
    porte: null,
    cucine: null,
    loadingDefaults: false,
    errors: { suMisura: null, marmeria: null, porte: null, cucine: null },
    referti: { suMisura: null, marmeria: null, porte: null, cucine: null },
  })
}

describe('pricelistStore.loadDefaults', () => {
  beforeEach(() => {
    mocks.listMock.mockReset()
    mocks.downloadMock.mockReset()
    vi.mocked(parseExcelInWorker).mockReset()
    resetStore()
  })

  it('bucket vuoto → errori identici su entrambe le categorie', async () => {
    mocks.listMock.mockResolvedValue({ data: [], error: null })

    await usePricelistStore.getState().loadDefaults()

    const s = usePricelistStore.getState()
    expect(s.suMisura).toBeNull()
    expect(s.marmeria).toBeNull()
    expect(s.loadingDefaults).toBe(false)
    expect(s.errors.suMisura).toMatch(/Nessun listino disponibile/i)
    expect(s.errors.marmeria).toMatch(/Nessun listino disponibile/i)
  })

  it('list error → errori identici con il messaggio di Supabase', async () => {
    mocks.listMock.mockResolvedValue({
      data: null,
      error: { message: 'Bucket not found' },
    })

    await usePricelistStore.getState().loadDefaults()

    const s = usePricelistStore.getState()
    expect(s.errors.suMisura).toMatch(/Bucket not found/)
    expect(s.errors.marmeria).toMatch(/Bucket not found/)
  })

  it('parseSuMisura ritorna 0 fogli → errore mirato, marmeria indipendente', async () => {
    mocks.listMock.mockResolvedValue({
      data: [
        { name: 'sumisura_default.xlsx' },
        { name: 'marmeria_default.xls' },
      ],
      error: null,
    })
    mocks.downloadMock.mockResolvedValue({ data: fakeBlob(), error: null })
    mockParse(emptySuMisura, validMarmeria)

    await usePricelistStore.getState().loadDefaults()

    const s = usePricelistStore.getState()
    expect(s.suMisura).toBeNull()
    expect(s.errors.suMisura).toMatch(/non contiene fogli riconoscibili/i)
    expect(s.errors.suMisura).toMatch(/sumisura_default\.xlsx/)
    expect(s.marmeria).not.toBeNull()
    expect(s.errors.marmeria).toBeNull()
  })

  it('download sumisura fallisce → marmeria viene comunque caricata', async () => {
    mocks.listMock.mockResolvedValue({
      data: [
        { name: 'sumisura_default.xlsx' },
        { name: 'marmeria_default.xls' },
      ],
      error: null,
    })
    mocks.downloadMock.mockImplementation(async (name: string) => {
      if (/marmeria/i.test(name)) {
        return { data: fakeBlob(), error: null }
      }
      return { data: null, error: { message: 'new row violates row-level security' } }
    })
    mockParse(emptySuMisura, validMarmeria)

    await usePricelistStore.getState().loadDefaults()

    const s = usePricelistStore.getState()
    expect(s.suMisura).toBeNull()
    expect(s.errors.suMisura).toMatch(/row-level security/i)
    expect(s.marmeria).not.toBeNull()
    expect(s.errors.marmeria).toBeNull()
  })

  it('caso felice → entrambi popolati, nessun errore', async () => {
    mocks.listMock.mockResolvedValue({
      data: [
        { name: 'sumisura_default.xlsx' },
        { name: 'marmeria_default.xls' },
      ],
      error: null,
    })
    mocks.downloadMock.mockResolvedValue({ data: fakeBlob(), error: null })
    mockParse(validSuMisura, validMarmeria)

    await usePricelistStore.getState().loadDefaults()

    const s = usePricelistStore.getState()
    expect(s.suMisura).not.toBeNull()
    expect(s.suMisura?.aggiornato).toBe('sumisura_default.xlsx')
    expect(s.marmeria).not.toBeNull()
    expect(s.marmeria?.aggiornato).toBe('marmeria_default.xls')
    expect(s.errors.suMisura).toBeNull()
    expect(s.errors.marmeria).toBeNull()
    expect(s.loadingDefaults).toBe(false)
  })
})

// O30: due `loadDefaults` che si sovrappongono (avvio + cancellazione in
// Gestione Listini, due cancellazioni di fila). Vince la PARTITA per ultima, non
// quella che FINISCE per ultima. Ogni test costruisce a mano l'ordine di arrivo
// con promesse differite: il tempo non c'entra.
describe('pricelistStore.loadDefaults — chiamate sovrapposte (O30)', () => {
  beforeEach(() => {
    mocks.listMock.mockReset()
    mocks.downloadMock.mockReset()
    vi.mocked(parseExcelInWorker).mockReset()
    resetStore()
  })

  /** Una promessa che si risolve quando lo decide il test. */
  function differita<T>() {
    let risolvi!: (v: T) => void
    const promessa = new Promise<T>((r) => {
      risolvi = r
    })
    return { promessa, risolvi }
  }
  /** Lascia girare tutte le catene di microtask già pronte (i mock non usano timer). */
  const svuota = () => new Promise<void>((r) => setTimeout(r, 0))

  const elenco = (...nomi: string[]) => ({ data: nomi.map((name) => ({ name })), error: null })
  const scaricoRiuscito = () => ({ data: fakeBlob(), error: null })
  const sidecarAssente = () => Promise.resolve({ data: null, error: { message: 'Object not found' } })

  /** I download per nome: quelli senza una promessa differita rispondono subito. */
  function scarichi(differiti: Record<string, Promise<unknown>>) {
    mocks.downloadMock.mockImplementation((nome: string) => {
      if (nome.endsWith('.meta.json')) return sidecarAssente()
      return differiti[nome] ?? Promise.resolve(scaricoRiuscito())
    })
  }

  const stato = () => usePricelistStore.getState()
  const avvia = () => stato().loadDefaults()

  it('A lenta e B veloce: lo store finisce sul file di B, la più recente', async () => {
    mocks.listMock
      .mockResolvedValueOnce(elenco('A_sumisura.xlsx'))
      .mockResolvedValueOnce(elenco('B_sumisura.xlsx'))
    const lentaA = differita<unknown>()
    scarichi({ 'A_sumisura.xlsx': lentaA.promessa })
    mockParse(validSuMisura, validMarmeria)

    const a = avvia()
    await svuota() // A è ferma al download del suo file
    const b = avvia()
    await b
    expect(stato().suMisura?.aggiornato).toBe('B_sumisura.xlsx')

    // A arriva per ultima, con un file vecchio: non deve riscrivere niente.
    lentaA.risolvi(scaricoRiuscito())
    await a
    expect(stato().suMisura?.aggiornato).toBe('B_sumisura.xlsx')
    expect(stato().referti.suMisura?.file).toBe('B_sumisura.xlsx')
    expect(stato().loadingDefaults).toBe(false)
  })

  it('A termina prima di B ma B è partita dopo: A non scrive, vince B in qualunque ordine di arrivo', async () => {
    mocks.listMock
      .mockResolvedValueOnce(elenco('A_sumisura.xlsx'))
      .mockResolvedValueOnce(elenco('B_sumisura.xlsx'))
    const lentaA = differita<unknown>()
    const lentaB = differita<unknown>()
    scarichi({ 'A_sumisura.xlsx': lentaA.promessa, 'B_sumisura.xlsx': lentaB.promessa })
    mockParse(validSuMisura, validMarmeria)

    const a = avvia()
    await svuota()
    const b = avvia()
    await svuota()

    lentaA.risolvi(scaricoRiuscito())
    await svuota()
    // A ha finito di leggere, ma B è partita dopo: A non scrive.
    expect(stato().suMisura).toBeNull()

    lentaB.risolvi(scaricoRiuscito())
    await Promise.all([a, b])
    expect(stato().suMisura?.aggiornato).toBe('B_sumisura.xlsx')
  })

  it('una corsa superata non tocca loadingDefaults né errors (nemmeno con un suo errore di download)', async () => {
    mocks.listMock
      .mockResolvedValueOnce(elenco('A_sumisura.xlsx'))
      .mockResolvedValueOnce(elenco('B_sumisura.xlsx'))
    const lentaA = differita<unknown>()
    const lentaB = differita<unknown>()
    scarichi({ 'A_sumisura.xlsx': lentaA.promessa, 'B_sumisura.xlsx': lentaB.promessa })
    mockParse(validSuMisura, validMarmeria)

    const a = avvia()
    await svuota()
    const b = avvia()
    await svuota()

    lentaA.risolvi({ data: null, error: { message: 'download di A rotto' } })
    await svuota()
    // B è ancora in corso: il flag è suo, e l'errore di A non è un errore dello store.
    expect(stato().loadingDefaults).toBe(true)
    expect(JSON.stringify(stato().errors)).not.toContain('download di A rotto')
    expect(stato().errors.suMisura).toBeNull()

    lentaB.risolvi(scaricoRiuscito())
    await Promise.all([a, b])
    expect(stato().loadingDefaults).toBe(false)
    expect(JSON.stringify(stato().errors)).not.toContain('download di A rotto')
    expect(stato().errors.suMisura).toBeNull()
    expect(stato().suMisura?.aggiornato).toBe('B_sumisura.xlsx')
  })

  it('un impostaListino a metà corsa resta: la corsa non lo sovrascrive e le altre categorie entrano', async () => {
    mocks.listMock.mockResolvedValueOnce(
      elenco('sumisura_default.xlsx', 'marmeria_default.xls', 'LISTINO CUCINA COLETTA.xls')
    )
    const lentaSuMisura = differita<unknown>()
    const lentaMarmeria = differita<unknown>()
    scarichi({ 'sumisura_default.xlsx': lentaSuMisura.promessa, 'marmeria_default.xls': lentaMarmeria.promessa })
    mockParse(validSuMisura, validMarmeria, listinoCucina())

    const corsa = avvia()
    await svuota() // cucine è entrata dal bucket; su misura e marmeria sono al download

    // Due upload admin a metà corsa: il file del bucket che sta per arrivare è più vecchio.
    for (const letto of [
      { categoria: 'sumisura', parsed: validSuMisura },
      { categoria: 'marmeria', parsed: validMarmeria },
    ] as const) {
      const esito = esaminaListino(letto, `${letto.categoria}_caricato.xlsx`)
      if (!esito.ok) throw new Error(esito.errore)
      stato().impostaListino(esito.esame)
    }

    lentaSuMisura.risolvi(scaricoRiuscito()) // la lettura vecchia arriva: non deve scrivere
    lentaMarmeria.risolvi({ data: null, error: { message: 'download rotto' } }) // e un suo errore non deve spegnere l'upload
    await corsa

    const s = stato()
    expect(s.suMisura?.aggiornato).toBe('sumisura_caricato.xlsx')
    expect(s.marmeria?.aggiornato).toBe('marmeria_caricato.xlsx')
    expect(s.cucine?.aggiornato).toBe('LISTINO CUCINA COLETTA.xls')
    expect(s.errors.suMisura).toBeNull()
    expect(s.errors.marmeria).toBeNull()
    expect(s.errors.cucine).toBeNull()
    expect(s.loadingDefaults).toBe(false)
  })

  it('la corsa superata si risolve solo dopo la vincente', async () => {
    mocks.listMock
      .mockResolvedValueOnce(elenco('A_sumisura.xlsx'))
      .mockResolvedValueOnce(elenco('B_sumisura.xlsx'))
    const lentaB = differita<unknown>()
    scarichi({ 'B_sumisura.xlsx': lentaB.promessa })
    mockParse(validSuMisura, validMarmeria)

    // Nel cuore del problema: `AppShell` scatta lo snapshot delle porte quando la
    // PROMESSA dell'avvio si risolve. Ciò che lo store contiene in quel momento
    // è ciò che lo snapshot vedrebbe.
    const visto: Array<string | undefined> = []
    const a = avvia().then(() => visto.push(stato().suMisura?.aggiornato))
    const b = avvia()
    await svuota()
    expect(visto).toEqual([]) // A è superata ma aspetta: B non ha ancora scritto

    lentaB.risolvi(scaricoRiuscito())
    await Promise.all([a, b])
    expect(visto).toEqual(['B_sumisura.xlsx'])
  })

  it('se la vincente è già finita, la corsa superata si risolve subito', async () => {
    const elencoA = differita<ReturnType<typeof elenco>>()
    mocks.listMock
      .mockImplementationOnce(() => elencoA.promessa)
      .mockResolvedValueOnce(elenco('B_sumisura.xlsx'))
    scarichi({})
    mockParse(validSuMisura, validMarmeria)

    let aFinita = false
    const a = avvia().then(() => {
      aFinita = true
    })
    await avvia() // B parte dopo e finisce mentre A è ancora all'elenco
    expect(stato().suMisura?.aggiornato).toBe('B_sumisura.xlsx')
    expect(aFinita).toBe(false)

    elencoA.risolvi(elenco('A_sumisura.xlsx'))
    await a // se aspettasse una vincente già finita, resterebbe appesa
    expect(aFinita).toBe(true)
    expect(stato().suMisura?.aggiornato).toBe('B_sumisura.xlsx')
    expect(stato().loadingDefaults).toBe(false)
  })
})

describe('categorizzaListino — 3 categorie, /porte/i non ruba file alle esistenti', () => {
  it('un file "porte" → porte', () => {
    expect(categorizzaListino('LISTINO PORTE COLETTA EBANISTERIA.xlsx')).toBe('porte')
    expect(categorizzaListino('porte_2026.xls')).toBe('porte')
  })

  it('un file "sumisura" → sumisura (NON spostato su porte)', () => {
    expect(categorizzaListino('sumisura_default.xlsx')).toBe('sumisura')
    expect(categorizzaListino('COLETTA_APR26_AGGIORNATO.xls')).toBe('sumisura')
  })

  it('un file "marmeria" → marmeria (NON spostato su porte)', () => {
    expect(categorizzaListino('marmeria_default.xls')).toBe('marmeria')
    expect(categorizzaListino('MAGG26 MARMERIA_DE_BARI_INTERNO_Rev_82.xlsx')).toBe('marmeria')
  })

  it('nessuno spostamento nell\'altro verso (le esistenti non diventano porte, e viceversa)', () => {
    expect(categorizzaListino('sumisura_default.xlsx')).not.toBe('porte')
    expect(categorizzaListino('marmeria_default.xls')).not.toBe('porte')
    expect(categorizzaListino('porte.xlsx')).not.toBe('sumisura')
    expect(categorizzaListino('porte.xlsx')).not.toBe('marmeria')
  })
})

describe('categorizzaListino — cucine (PR 10b-1): porte → marmeria → cucin → su misura', () => {
  it('«cucina» o «cucine» nel nome → cucine', () => {
    expect(categorizzaListino('LISTINO CUCINA COLETTA.xls')).toBe('cucine')
    expect(categorizzaListino('Cucine 2027.xlsx')).toBe('cucine')
  })

  it('i sei file del bucket di oggi non cambiano categoria', () => {
    expect(
      [
        'COLETTA 2026 prospetto preventivi sumisura.xlsx',
        'COLETTA 2026 prospetto preventivi sumisura.xlsx.meta.json',
        'LUG26 MARMERIA_DE_BARI_INTERNO_Rev_83_sconto_mob.xlsx',
        'LISTINO_PORTE_COLETTA_EBANISTERIA.xlsx',
        'MAGG26 MARMERIA_DE_BARI_INTERNO_Rev_82_sconto_mob.xlsx',
        'COLETTA_APR26 AGGIORNATO.xls',
      ].map(categorizzaListino)
    ).toEqual(['sumisura', 'sumisura', 'marmeria', 'porte', 'marmeria', 'sumisura'])
  })

  it('porte e marmeria vengono prima: cucina non ruba file alle altre categorie', () => {
    expect(categorizzaListino('listino porte cucina.xlsx')).toBe('porte')
    expect(categorizzaListino('marmeria per cucine.xlsx')).toBe('marmeria')
  })
})

describe('pricelistStore.loadDefaults — listino cucine (PR 10b)', () => {
  beforeEach(() => {
    mocks.listMock.mockReset()
    mocks.downloadMock.mockReset()
    vi.mocked(parseExcelInWorker).mockReset()
    resetStore()
  })

  const bucket = (...nomi: string[]) =>
    mocks.listMock.mockResolvedValue({ data: nomi.map((name) => ({ name })), error: null })

  it('presente e valido: in memoria col nome del file, nessun errore, referto', async () => {
    bucket('sumisura_default.xlsx', 'marmeria_default.xls', 'LISTINO CUCINA COLETTA.xls')
    mocks.downloadMock.mockResolvedValue({ data: fakeBlob(), error: null })
    mockParse(validSuMisura, validMarmeria, listinoCucina())

    await usePricelistStore.getState().loadDefaults()

    const s = usePricelistStore.getState()
    expect(s.cucine?.aggiornato).toBe('LISTINO CUCINA COLETTA.xls')
    expect(s.errors.cucine).toBeNull()
    expect(s.referti.cucine?.caricati).toEqual([
      { nome: 'voci con prezzo', voci: 1 },
      { nome: 'vasca', voci: 1 },
      { nome: 'tariffa giorni extra', voci: 1 },
    ])
  })

  it('il worker riceve la sola struttura delle voci, senza prezzi (D7)', async () => {
    bucket('LISTINO CUCINA COLETTA.xls')
    mocks.downloadMock.mockResolvedValue({ data: fakeBlob(), error: null })
    mockParse(validSuMisura, validMarmeria, listinoCucina())

    await usePricelistStore.getState().loadDefaults()

    const chiamata = vi.mocked(parseExcelInWorker).mock.calls.find((c) => c[0] === 'cucine')
    expect(chiamata?.[3]).toBe(strutturaCucina)
    expect(JSON.stringify(chiamata?.[3])).not.toMatch(/prezzo|percentuale/)
  })

  it('assente: si notifica come per gli altri (i prezzi della cucina vengono da lì, 10b-2), le altre categorie come prima', async () => {
    bucket('sumisura_default.xlsx', 'marmeria_default.xls')
    mocks.downloadMock.mockResolvedValue({ data: fakeBlob(), error: null })
    mockParse(validSuMisura, validMarmeria)

    await usePricelistStore.getState().loadDefaults()

    const s = usePricelistStore.getState()
    expect(s.cucine).toBeNull()
    expect(s.errors.cucine).toBe('Nessun file Cucine trovato nel bucket Listini.')
    expect(s.suMisura).not.toBeNull()
    expect(vi.mocked(parseExcelInWorker).mock.calls.some((c) => c[0] === 'cucine')).toBe(false)
  })

  it('presente ma rotto: l errore si notifica, le altre categorie non ne risentono', async () => {
    bucket('sumisura_default.xlsx', 'LISTINO CUCINA COLETTA.xls')
    mocks.downloadMock.mockResolvedValue({ data: fakeBlob(), error: null })
    mockParse(validSuMisura, validMarmeria, new Error('Foglio CUCINA non trovato'))

    await usePricelistStore.getState().loadDefaults()

    const s = usePricelistStore.getState()
    expect(s.cucine).toBeNull()
    expect(s.errors.cucine).toBe('Errore lettura file Cucine: Foglio CUCINA non trovato')
    expect(s.suMisura).not.toBeNull()
  })

  it('bucket vuoto o illeggibile: anche Cucine lo dice, come le altre categorie', async () => {
    mocks.listMock.mockResolvedValue({ data: [], error: null })
    await usePricelistStore.getState().loadDefaults()
    expect(usePricelistStore.getState().errors.cucine).toMatch(/Nessun listino disponibile/)
    expect(usePricelistStore.getState().errors.suMisura).toMatch(/Nessun listino disponibile/)
  })
})

describe('esaminaListino — cucine: avvisi nel referto, non errori', () => {
  const esamina = (l: ListinoCucina) => esaminaListino({ categoria: 'cucine', parsed: l }, 'LISTINO CUCINA.xls')
  const note = (l: ListinoCucina) => {
    const e = esamina(l)
    if (!e.ok) throw new Error(e.errore)
    return e.esame.referto.note
  }

  it('file che torna col codice: nessun avviso', () => {
    expect(note(listinoCucina())).toEqual([])
  })

  it('righe sconosciute e voci mancanti: li elenca per nome e per id', () => {
    const n = note(listinoCucina({ righeSconosciute: ['VOCE NUOVA'], vociMancanti: ['striscia-led'] }))
    expect(n).toEqual([
      "1 righe non sono voci che l'app conosce, quindi non si useranno: VOCE NUOVA. Per usarle serve un aggiornamento dell'app",
      "1 voci dell'app non sono nel file e resteranno da definire: striscia-led",
    ])
  })

  it('percentuale diversa da quella del codice: dice quale usa l app', () => {
    const n = note(listinoCucina({ percentuali: { casse: 0.15, ante: 0.2, progettazione: 0.1, adeguamento: 0.25 } }))
    expect(n).toEqual([
      "percentuale casse: nel file 15%, l'app usa 10%",
      "percentuale adeguamento: nel file 25%, l'app usa 20%",
    ])
  })

  it('vasca e tariffa dei giorni assenti: avvisi', () => {
    const n = note(listinoCucina({ vascaGres: null, giornoRate: null }))
    expect(n).toHaveLength(2)
    expect(n[0]).toMatch(/VASCA INTEGRATA IN GRES/)
    expect(n[1]).toMatch(/GIORNI EXTRA REALIZZAZIONE/)
  })

  it('listino non conforme allo schema: errore col suggerimento, non entra', () => {
    const e = esamina(listinoCucina({ prezzi: [] }))
    expect(e.ok).toBe(false)
    if (!e.ok) {
      expect(e.errore).toMatch(/non è un listino Cucine valido: nessuna voce con prezzo/)
      expect(e.errore).toMatch(/foglio CUCINA, nomi in colonna A, prezzi in colonna B/)
    }
  })
})

describe('esaminaListino — porte: avvisi nel referto, non errori', () => {
  /** Listino porte conforme a Zod, prezzi inventati. */
  const listinoPorte = (avvisi?: string[]): ListinoPorte => ({
    modelli: [{ nome: 'RAFFAELLA', prezzo2026: 900, h215: 1000, h240: 1100 }],
    optional: [{ nome: 'STIPITI', unita: 'PORTA', prezzo: 100 }],
    aggiornato: '',
    ...(avvisi ? { avvisi } : {}),
  })
  const esamina = (l: ListinoPorte) => esaminaListino({ categoria: 'porte', parsed: l }, 'LISTINO PORTE.xlsx')

  it('con avvisi dal parser: ok, upload consentito, la riga è in referto.note, caricati conta i soli modelli letti', () => {
    const avviso = 'Colonna «PREZZO 2027»: modelli senza prezzo, non caricati e non selezionabili nelle Porte (1): MASACCIO'
    const e = esamina(listinoPorte([avviso]))
    if (!e.ok) throw new Error(e.errore)
    expect(e.esame.referto.note).toEqual([avviso])
    expect(e.esame.referto.caricati).toContainEqual({ nome: 'modelli', voci: 1 })
  })

  it('senza avvisi: note vuote', () => {
    const e = esamina(listinoPorte())
    if (!e.ok) throw new Error(e.errore)
    expect(e.esame.referto.note).toEqual([])
  })
})

describe('esaminaListino — su misura rifiuta un file col solo foglio CUCINA', () => {
  const foglio = (nome: string) => ({ nome, nota: '', voci: [{ descrizione: 'x', prezzoUnitario: 1, unitaMisura: 'PEZZO' as const }] })

  it('solo CUCINA: è il listino cucine con un nome sbagliato, non entra come su misura', () => {
    const e = esaminaListino({ categoria: 'sumisura', parsed: { fogli: [foglio('CUCINA')], aggiornato: '' } }, 'COLETTA_APR26 AGGIORNATO.xls')
    expect(e.ok).toBe(false)
    if (!e.ok) expect(e.errore).toMatch(/ha solo il foglio CUCINA: sembra il listino cucine.*Rinominalo con «cucina» nel nome/)
  })

  it('CUCINA accanto ad altri fogli: è un su misura, entra', () => {
    const e = esaminaListino(
      { categoria: 'sumisura', parsed: { fogli: [foglio('SU MISURA'), foglio('CUCINA')], aggiornato: '' } },
      'listino.xlsx'
    )
    expect(e.ok).toBe(true)
  })
})

describe("esaminaListino — su misura: l'avviso della selezione fogli", () => {
  const foglio = (nome: string) => ({ nome, nota: '', voci: [{ descrizione: 'x', prezzoUnitario: 1, unitaMisura: 'PEZZO' as const }] })
  const AVVISO = 'La scelta dei fogli non è stata applicata. Esempio.'

  it("con più fogli l'avviso delle opzioni finisce nel referto", () => {
    const e = esaminaListino(
      { categoria: 'sumisura', parsed: { fogli: [foglio('SU MISURA'), foglio('PREVENTIVO MARIO')], aggiornato: '' } },
      'listino.xlsx',
      { avviso: AVVISO, note: ['selezione fogli ignorata: prova'] }
    )
    expect(e.ok).toBe(true)
    if (e.ok) {
      expect(e.esame.referto.avviso).toBe(AVVISO)
      expect(e.esame.referto.note).toEqual(['selezione fogli ignorata: prova'])
    }
  })

  it('con un foglio solo nessun avviso, anche se le opzioni lo portano', () => {
    const e = esaminaListino(
      { categoria: 'sumisura', parsed: { fogli: [foglio('SU MISURA')], aggiornato: '' } },
      'listino.xlsx',
      { avviso: AVVISO }
    )
    expect(e.ok).toBe(true)
    if (e.ok) expect('avviso' in e.esame.referto).toBe(false)
  })
})

describe('esaminaListino — su misura: gli avvisi del parser vanno nel referto', () => {
  const foglio = (nome: string) => ({ nome, nota: '', voci: [{ descrizione: 'x', prezzoUnitario: 1, unitaMisura: 'PEZZO' as const }] })

  it('gli avvisi del parser finiscono in referto.note e il listino entra', () => {
    const avviso = 'Foglio "ALTRO" non letto: intestazione non trovata. Esempio.'
    const e = esaminaListino(
      { categoria: 'sumisura', parsed: { fogli: [foglio('SU MISURA')], aggiornato: '', avvisi: [avviso] } },
      'listino.xlsx',
      { note: ['nota del chiamante'] }
    )
    if (!e.ok) throw new Error(e.errore)
    expect(e.esame.referto.note).toEqual(['nota del chiamante', avviso])
    expect(e.esame.referto.caricati).toEqual([{ nome: 'SU MISURA', voci: 1 }])
  })
})

describe('esaminaListino — su misura: la matrice FINITURE nel referto (L20)', () => {
  const rev1Finto = () => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['T'], ['n'], ['FINITURA', 'PREZZO', 'U.MISURA'], ['Anta', 107, 'MQ']]), 'SU MISURA')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(FINITURE_FINTE), 'FINITURE')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ACCESSORI_FINTI), 'ACCESSORI')
    return parseSuMisura(wb)
  }

  it('combinazioni per tipo, nota di testata e grafie diverse nel referto; il listino entra', () => {
    const e = esaminaListino({ categoria: 'sumisura', parsed: rev1Finto() }, 'rev1.xlsx')
    if (!e.ok) throw new Error(e.errore)
    expect(e.esame.referto.caricati).toEqual([
      { nome: 'SU MISURA', voci: 1 },
      {
        nome: 'FINITURE',
        voci: 2,
        combinazioni: [
          { tipo: 'MOBILE A GIORNO', numero: 2 },
          { tipo: 'ARMADIO CON ANTE', numero: 3 },
          { tipo: 'TELAIO CON ANTE', numero: 1 },
          { tipo: 'MENSOLE A MURO', numero: 1 },
        ],
      },
      { nome: 'ACCESSORI', voci: 2 },
    ])
    expect(e.esame.referto.note).toEqual([
      expect.stringContaining('colonna INTERNO: grafie diverse'),
      'FINITURE, nota di testata: PREZZI DI PROVA. PER MOBILI CON PROFONDITA MINORE DI 40CM RIDUZIONE DEL 10%',
    ])
  })

  it('FINITURE non selezionato: niente matrice nel listino e nel referto', () => {
    const e = esaminaListino({ categoria: 'sumisura', parsed: rev1Finto() }, 'rev1.xlsx', { fogliAmmessi: ['SU MISURA', 'ACCESSORI'] })
    if (!e.ok || e.esame.categoria !== 'sumisura') throw new Error('atteso un su misura valido')
    expect(e.esame.listino.fogli.some((f) => f.matrice)).toBe(false)
    expect(e.esame.referto.caricati.some((c) => c.combinazioni)).toBe(false)
    expect(e.esame.referto.esclusi).toEqual([{ nome: 'FINITURE', motivo: 'non selezionato come listino' }])
  })
})

// Golden sul file vero (gitignorato, auto-skip): è il vecchio listino col solo
// foglio CUCINA che sta ancora nel bucket fra i su misura. Ricaricato, oggi
// diventerebbe il su misura più recente e sostituirebbe quello in uso.
const APR26 = resolve(process.cwd(), 'src/parsers/__tests__/fixtures/COLETTA_APR26_AGGIORNATO.xls')
describe.skipIf(!existsSync(APR26))('golden — il vecchio APR26 del bucket non entra come su misura', () => {
  it('il parser su misura lo legge, l esame lo rifiuta col motivo', () => {
    const parsed = parseSuMisura(XLSX.read(readFileSync(APR26), { type: 'buffer', cellFormula: true, sheetRows: 2000 }))
    expect(parsed.fogli.map((f) => f.nome)).toEqual(['CUCINA'])
    const e = esaminaListino({ categoria: 'sumisura', parsed }, 'COLETTA_APR26 AGGIORNATO.xls')
    expect(e.ok).toBe(false)
    if (!e.ok) expect(e.errore).toMatch(/ha solo il foglio CUCINA/)
  })
})
