import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { parseExcelInWorker, TIMEOUT_PARSE_MS } from '@/lib/excelWorker'
import { dichiaraDimensioni, xlsxMinimo } from '@/test-utils/zipSintetico'

/**
 * jsdom non ha `Worker`: un finto registra ogni istanza e lascia al test il
 * ruolo del worker vero (risposta, errore, messaggio illeggibile, silenzio).
 */
class WorkerFinto {
  static istanze: WorkerFinto[] = []
  static postMessageLancia = false

  onmessage: ((e: MessageEvent) => void) | null = null
  onerror: ((e: ErrorEvent) => void) | null = null
  onmessageerror: ((e: MessageEvent) => void) | null = null
  postMessage = vi.fn(() => {
    if (WorkerFinto.postMessageLancia) throw new DOMException('buffer già trasferito', 'DataCloneError')
  })
  terminate = vi.fn()

  constructor() {
    WorkerFinto.istanze.push(this)
  }

  /** Come il worker vero: consegna solo a chi è ancora in ascolto. */
  rispondi(data: unknown) {
    this.onmessage?.({ data } as MessageEvent)
  }
}

const TESTO_TIMEOUT =
  "il file non è stato letto entro 30 secondi. Ricarica la pagina e riprova; se succede ancora, avvisa l'assistenza"

function ultimoWorker(): WorkerFinto {
  const w = WorkerFinto.istanze.at(-1)
  if (!w) throw new Error('nessun Worker costruito')
  return w
}

beforeEach(() => {
  WorkerFinto.istanze = []
  WorkerFinto.postMessageLancia = false
  vi.useFakeTimers()
  vi.stubGlobal('Worker', WorkerFinto)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('parseExcelInWorker — fine del job', () => {
  it('risolve con il listino nei tempi, spegne il timer e termina il worker una volta sola', async () => {
    const buffer = new ArrayBuffer(8)
    const job = parseExcelInWorker('sumisura', buffer, 'listino.xlsx')
    const w = ultimoWorker()
    expect(w.postMessage).toHaveBeenCalledWith({ type: 'sumisura', buffer, filename: 'listino.xlsx' }, [buffer])

    const listino = { fogli: [] }
    w.rispondi({ status: 'success', type: 'sumisura', data: listino, filename: 'listino.xlsx' })

    await expect(job).resolves.toBe(listino)
    expect(vi.getTimerCount()).toBe(0)
    expect(w.terminate).toHaveBeenCalledTimes(1)
  })

  it('anagrafica (L21, PR C): lo stesso worker, il messaggio senza struttura, la lettura come risposta', async () => {
    const buffer = new ArrayBuffer(8)
    const job = parseExcelInWorker('anagrafica', buffer, 'anagrafica.csv')
    const w = ultimoWorker()
    expect(w.postMessage).toHaveBeenCalledWith({ type: 'anagrafica', buffer, filename: 'anagrafica.csv' }, [buffer])
    const lettura = { righe: [], scartate: [] }
    w.rispondi({ status: 'success', type: 'anagrafica', data: lettura, filename: 'anagrafica.csv' })
    await expect(job).resolves.toBe(lettura)
    expect(w.terminate).toHaveBeenCalledTimes(1)
  })

  it('onerror del worker rigetta, spegne il timer e termina il worker', async () => {
    const job = parseExcelInWorker('marmeria', new ArrayBuffer(8), 'm.xlsx')
    const w = ultimoWorker()
    w.onerror?.({ message: '' } as ErrorEvent)

    await expect(job).rejects.toThrow('Errore nel worker durante il parsing del listino Excel')
    expect(vi.getTimerCount()).toBe(0)
    expect(w.terminate).toHaveBeenCalledTimes(1)
  })

  it('senza risposta entro TIMEOUT_PARSE_MS rigetta col testo del timeout e termina il worker', async () => {
    const job = parseExcelInWorker('porte', new ArrayBuffer(8), 'p.xlsx')
    const esito = job.then(
      () => 'risolta',
      (e: Error) => e.message
    )
    const w = ultimoWorker()

    await vi.advanceTimersByTimeAsync(TIMEOUT_PARSE_MS - 1)
    expect(w.terminate).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(await esito).toBe(TESTO_TIMEOUT)
    expect(w.terminate).toHaveBeenCalledTimes(1)
  })

  it('onmessageerror rigetta con "risposta del worker illeggibile" e termina il worker', async () => {
    const job = parseExcelInWorker('sumisura', new ArrayBuffer(8), 's.xlsx')
    const w = ultimoWorker()
    w.onmessageerror?.({} as MessageEvent)

    await expect(job).rejects.toThrow('risposta del worker illeggibile')
    expect(vi.getTimerCount()).toBe(0)
    expect(w.terminate).toHaveBeenCalledTimes(1)
  })

  it('una risposta arrivata dopo il timeout è ignorata: la promessa resta rigettata', async () => {
    const job = parseExcelInWorker('sumisura', new ArrayBuffer(8), 's.xlsx')
    const rigetto = expect(job).rejects.toThrow(TESTO_TIMEOUT)
    const w = ultimoWorker()

    await vi.advanceTimersByTimeAsync(TIMEOUT_PARSE_MS)
    w.rispondi({ status: 'success', type: 'sumisura', data: { fogli: [] }, filename: 's.xlsx' })

    await rigetto
    expect(w.onmessage).toBeNull()
    expect(w.terminate).toHaveBeenCalledTimes(1)
  })

  it('postMessage che lancia in modo sincrono rigetta, termina il worker e non lascia timer pendenti', async () => {
    WorkerFinto.postMessageLancia = true
    const job = parseExcelInWorker('sumisura', new ArrayBuffer(8), 's.xlsx')
    const w = ultimoWorker()

    await expect(job).rejects.toThrow('Errore nel worker durante il parsing del listino Excel')
    expect(w.terminate).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('parseExcelInWorker — tetto sulla dimensione decompressa', () => {
  const MIB = 1024 * 1024

  it('uno zip che dichiara più del tetto è rifiutato col testo del tetto e il Worker non viene costruito', async () => {
    // Una voce da 39 MiB e un byte, più le altre di pochi KB: 40 MB per eccesso.
    const bomba = dichiaraDimensioni(xlsxMinimo(), [39 * MIB + 1])

    await expect(parseExcelInWorker('marmeria', bomba, 'bomba.xlsx')).rejects.toThrow(
      'il file occupa 40 MB una volta decompresso, il massimo ammesso è 32 MB. Riesporta il listino da Excel'
    )
    expect(WorkerFinto.istanze).toHaveLength(0)
    expect(bomba.byteLength).toBeGreaterThan(0) // non trasferito
  })

  it('un buffer non zip sopra il tetto (caso .xls) è rifiutato senza costruire il Worker', async () => {
    const xls = new ArrayBuffer(33 * MIB)

    await expect(parseExcelInWorker('sumisura', xls, 'grosso.xls')).rejects.toThrow(
      'il file occupa 33 MB una volta decompresso, il massimo ammesso è 32 MB. Riesporta il listino da Excel'
    )
    expect(WorkerFinto.istanze).toHaveLength(0)
  })
})
