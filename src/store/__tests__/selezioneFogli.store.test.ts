import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ListinoSuMisura } from '@/types/sumisura'

const mocks = vi.hoisted(() => ({ listMock: vi.fn(), downloadMock: vi.fn() }))
vi.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: () => ({ list: mocks.listMock, download: mocks.downloadMock }) } },
  LISTINI_BUCKET: 'Listini',
}))
vi.mock('@/lib/excelWorker', () => ({ parseExcelInWorker: vi.fn() }))

import { usePricelistStore } from '@/store/pricelistStore'
import { parseExcelInWorker } from '@/lib/excelWorker'
import {
  AVVISO_SELEZIONE_NON_APPLICATA,
  nomeSidecar,
  serializzaSelezione,
  type SelezioneFogli,
} from '@/lib/selezioneFogli'

const FILE = 'COLETTA_APR26.xlsx'
const SIZE = 19968

/**
 * Il caso di E14: il file ha il listino VERO ("CUCINA") e un foglio di lavoro
 * lasciato dentro ("PREVENTIVO MARIO"). Entrambi producono voci — l'intruso ha
 * la stessa forma del listino, per questo nessuna euristica lo distingue.
 */
const dueFogli: ListinoSuMisura = {
  fogli: [
    {
      nome: 'CUCINA',
      nota: '',
      voci: [
        { descrizione: 'BASE PENSILE LAMINATO', prezzoUnitario: 250, unitaMisura: 'PEZZO' },
        { descrizione: 'ANTA VETRO', prezzoUnitario: 150, unitaMisura: 'PEZZO' },
      ],
    },
    {
      nome: 'PREVENTIVO MARIO',
      nota: '',
      voci: [{ descrizione: 'Cucina Rossi acconto', prezzoUnitario: 4500, unitaMisura: 'PEZZO' }],
    },
  ],
  aggiornato: '',
}

/** Un file con un foglio solo: la selezione non ha niente da escludere. */
const unFoglio: ListinoSuMisura = {
  fogli: [
    { nome: 'ARREDI', nota: '', voci: [{ descrizione: 'ANTA VETRO', prezzoUnitario: 150, unitaMisura: 'PEZZO' }] },
  ],
  aggiornato: '',
}

function fileEntry(name: string, size = SIZE) {
  return { name, updated_at: '2026-07-17T10:00:00Z', metadata: { size } }
}

/** Il bucket: il listino + (opzionale) il suo sidecar. */
function bucket(sidecar: string | null) {
  mocks.listMock.mockResolvedValue({
    data: sidecar === null ? [fileEntry(FILE)] : [fileEntry(FILE), fileEntry(nomeSidecar(FILE), 120)],
    error: null,
  })
  mocks.downloadMock.mockImplementation((path: string) => {
    if (path === nomeSidecar(FILE)) {
      return sidecar === null
        ? Promise.resolve({ data: null, error: { message: 'Object not found' } })
        : Promise.resolve({ data: { text: () => Promise.resolve(sidecar), size: sidecar.length } })
    }
    return Promise.resolve({ data: { arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)), size: SIZE } })
  })
}

function selezione(fogli: string[], file = { nome: FILE, size: SIZE }): string {
  return serializzaSelezione({ v: 1, fogli, file } as SelezioneFogli)
}

describe('E14 — selezione fogli persistita nel bucket', () => {
  beforeEach(() => {
    usePricelistStore.setState({
      suMisura: null,
      marmeria: null,
      porte: null,
      errors: { suMisura: null, marmeria: null, porte: null, cucine: null },
      referti: { suMisura: null, marmeria: null, porte: null, cucine: null },
    })
    mocks.listMock.mockReset()
    mocks.downloadMock.mockReset()
    vi.mocked(parseExcelInWorker).mockReset()
    vi.mocked(parseExcelInWorker).mockResolvedValue(dueFogli as never)
  })

  it('(a) scelta che approva 1 foglio su 2: l INTRUSO non entra e il referto lo elenca', async () => {
    bucket(selezione(['CUCINA']))
    await usePricelistStore.getState().loadDefaults()

    const listino = usePricelistStore.getState().suMisura
    expect(listino?.fogli.map((f) => f.nome)).toEqual(['CUCINA'])
    // Il prezzo del preventivo di Mario NON è finito tra le voci del listino.
    const voci = listino?.fogli.flatMap((f) => f.voci) ?? []
    expect(voci.some((v) => v.prezzoUnitario === 4500)).toBe(false)

    const referto = usePricelistStore.getState().referti.suMisura
    expect(referto?.caricati).toEqual([{ nome: 'CUCINA', voci: 2 }])
    expect(referto?.esclusi).toEqual([{ nome: 'PREVENTIVO MARIO', motivo: 'non selezionato come listino' }])
    // La scelta si è applicata: niente da avvisare.
    expect(referto?.avviso).toBeUndefined()
    expect(usePricelistStore.getState().errors.suMisura).toBeNull()
  })

  it('(b) nessuna scelta (il file che sta nel bucket oggi): TUTTI i fogli, come ieri', async () => {
    bucket(null)
    await usePricelistStore.getState().loadDefaults()

    expect(usePricelistStore.getState().suMisura?.fogli.map((f) => f.nome)).toEqual([
      'CUCINA',
      'PREVENTIVO MARIO',
    ])
    const referto = usePricelistStore.getState().referti.suMisura
    expect(referto?.esclusi).toEqual([])
    expect(referto?.note).toEqual([])
    // Sidecar assente e non elencato: lo stato di ogni file precedente a E14. Silenzio.
    expect(referto?.avviso).toBeUndefined()
    expect(usePricelistStore.getState().errors.suMisura).toBeNull()
  })

  it('(c) scelta che referenzia un foglio ASSENTE: errore visibile, listino non caricato', async () => {
    bucket(selezione(['FOGLIO CHE NON ESISTE']))
    await usePricelistStore.getState().loadDefaults()

    const errore = usePricelistStore.getState().errors.suMisura
    expect(errore).toMatch(/non contiene i fogli selezionati/i)
    expect(errore).toContain('FOGLIO CHE NON ESISTE')
    expect(usePricelistStore.getState().suMisura).toBeNull()
  })

  it('(d) sidecar STANTIO (il file è cambiato sotto): fallback a tutti i fogli + nota nel referto', async () => {
    // La size registrata non è quella del file nel bucket → il file è stato
    // sostituito senza aggiornare la scelta.
    bucket(selezione(['CUCINA'], { nome: FILE, size: 12345 }))
    await usePricelistStore.getState().loadDefaults()

    // Il peggio ammesso è "come ieri": il listino c'è, con tutti i fogli.
    expect(usePricelistStore.getState().suMisura?.fogli).toHaveLength(2)
    expect(usePricelistStore.getState().errors.suMisura).toBeNull()

    const note = usePricelistStore.getState().referti.suMisura?.note ?? []
    expect(note.join(' ')).toMatch(/selezione fogli ignorata/i)
    expect(note.join(' ')).toMatch(/il file è cambiato/i)
    // E con due fogli dentro, ora lo sa anche chi compila i preventivi.
    expect(usePricelistStore.getState().referti.suMisura?.avviso).toBe(AVVISO_SELEZIONE_NON_APPLICATA)
  })

  it('(d2) sidecar ILLEGGIBILE (JSON rotto): stesso fallback, nota diversa', async () => {
    bucket('{ questo non è json')
    await usePricelistStore.getState().loadDefaults()

    expect(usePricelistStore.getState().suMisura?.fogli).toHaveLength(2)
    expect(usePricelistStore.getState().referti.suMisura?.note.join(' ')).toMatch(/JSON non valido/i)
    expect(usePricelistStore.getState().referti.suMisura?.avviso).toBe(AVVISO_SELEZIONE_NON_APPLICATA)
  })

  it('il sidecar ESPLODE in lettura: il listino carica lo stesso (mai assente)', async () => {
    // Il sidecar è un ACCESSORIO: qualunque cosa gli succeda — rete, un Blob
    // senza `.text()`, una risposta inattesa dell SDK — non deve avere il potere
    // di spegnere il listino. Questo bug è esistito: l'eccezione risaliva al job
    // e diventava "Errore caricamento Su Misura", listino a null.
    mocks.listMock.mockResolvedValue({ data: [fileEntry(FILE)], error: null })
    mocks.downloadMock.mockImplementation((path: string) =>
      path === nomeSidecar(FILE)
        ? Promise.resolve({ data: { size: 10 } }) // niente .text(): rotto
        : Promise.resolve({ data: { arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)), size: SIZE } })
    )
    await usePricelistStore.getState().loadDefaults()

    expect(usePricelistStore.getState().suMisura?.fogli).toHaveLength(2)
    expect(usePricelistStore.getState().errors.suMisura).toBeNull()
    // Un download che risponde ma non è leggibile è sempre un guasto, elencato o no.
    expect(usePricelistStore.getState().referti.suMisura?.avviso).toBe(AVVISO_SELEZIONE_NON_APPLICATA)
  })

  /** Il bucket con il sidecar ELENCATO e un download del sidecar deciso dal test. */
  function bucketConSidecar(scaricoSidecar: () => Promise<unknown>) {
    mocks.listMock.mockResolvedValue({
      data: [fileEntry(FILE), fileEntry(nomeSidecar(FILE), 120)],
      error: null,
    })
    mocks.downloadMock.mockImplementation((path: string) =>
      path === nomeSidecar(FILE)
        ? scaricoSidecar()
        : Promise.resolve({ data: { arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)), size: SIZE } })
    )
  }

  it('(e) sidecar elencato ma scaricamento in errore: tutti i fogli, nota per l admin e avviso', async () => {
    // Elencato = esiste. Se non si scarica non è "assente" come i file di prima di
    // E14: è un guasto (rete, 5xx, permessi), e la selezione che c'era non si applica.
    bucketConSidecar(() => Promise.resolve({ data: null, error: { message: 'Internal Server Error 500' } }))
    await usePricelistStore.getState().loadDefaults()

    expect(usePricelistStore.getState().suMisura?.fogli).toHaveLength(2)
    expect(usePricelistStore.getState().errors.suMisura).toBeNull()
    const referto = usePricelistStore.getState().referti.suMisura
    expect(referto?.note).toEqual(['selezione fogli ignorata: il file della selezione non si è potuto leggere'])
    expect(referto?.avviso).toBe(AVVISO_SELEZIONE_NON_APPLICATA)
    // Il messaggio grezzo dell'SDK resta fuori dalle note.
    expect(referto?.note.join(' ')).not.toContain('500')
  })

  it('(f) scaricamento del sidecar che lancia: il listino carica lo stesso, con nota e avviso', async () => {
    // Senza sidecar nell'elenco: una eccezione non è un 404, è sempre un guasto.
    bucket(null)
    mocks.downloadMock.mockImplementation((path: string) =>
      path === nomeSidecar(FILE)
        ? Promise.reject(new Error('rete caduta'))
        : Promise.resolve({ data: { arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)), size: SIZE } })
    )
    await usePricelistStore.getState().loadDefaults()

    expect(usePricelistStore.getState().suMisura?.fogli).toHaveLength(2)
    expect(usePricelistStore.getState().errors.suMisura).toBeNull()
    const referto = usePricelistStore.getState().referti.suMisura
    expect(referto?.note).toEqual(['selezione fogli ignorata: il file della selezione non si è potuto leggere'])
    expect(referto?.avviso).toBe(AVVISO_SELEZIONE_NON_APPLICATA)
  })

  it('(g) sidecar con elenco fogli vuoto: ignorato come illeggibile, nota e avviso', async () => {
    // La UI vieta 0 fogli; un sidecar scritto a mano no. Prima passava per "ok" e
    // `esaminaListino` lo trattava come "tutti i fogli" senza dirlo.
    bucket(selezione([]))
    await usePricelistStore.getState().loadDefaults()

    expect(usePricelistStore.getState().suMisura?.fogli).toHaveLength(2)
    const referto = usePricelistStore.getState().referti.suMisura
    expect(referto?.note).toEqual(['selezione fogli ignorata: nessun foglio selezionato'])
    expect(referto?.avviso).toBe(AVVISO_SELEZIONE_NON_APPLICATA)
  })

  it('(h) sidecar stantio ma entra un foglio solo: la nota c è, l avviso no', async () => {
    vi.mocked(parseExcelInWorker).mockResolvedValue(unFoglio as never)
    bucket(selezione(['ARREDI'], { nome: FILE, size: 12345 }))
    await usePricelistStore.getState().loadDefaults()

    expect(usePricelistStore.getState().suMisura?.fogli).toHaveLength(1)
    const referto = usePricelistStore.getState().referti.suMisura
    expect(referto?.note.join(' ')).toMatch(/il file è cambiato/i)
    // Con un foglio solo non c'è niente da includere per sbaglio.
    expect(referto?.avviso).toBeUndefined()
  })

  it('il SIDECAR non viene mai scambiato per un listino', async () => {
    bucket(selezione(['CUCINA']))
    await usePricelistStore.getState().loadDefaults()

    // Il filtro estensione /\.(xlsx|xls)$/i lo esclude di suo (finisce in .json),
    // ma è un'invariante troppo importante per restare implicita: se qualcuno
    // allargasse il filtro, il sidecar diventerebbe "il listino su misura".
    expect(usePricelistStore.getState().suMisura?.aggiornato).toBe(FILE)
    expect(usePricelistStore.getState().referti.suMisura?.file).toBe(FILE)
  })
})
