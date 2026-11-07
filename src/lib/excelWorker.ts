import type { WorkerMessage, WorkerResponse } from '@/types/worker'
import type { ListinoSuMisura } from '@/types/sumisura'
import type { ListinoMarmeria } from '@/types/marmeria'
import type { ListinoPorte } from '@/types/porte'
import type { ListinoCucina, VoceStrutturaCucina } from '@/types/cucina'
import type { LetturaAnagrafica } from '@/lib/anagraficaCsv'
import { dimensioneDecompressa, MAX_DECOMPRESSO_BYTE } from '@/lib/dimensioneZip'

/**
 * Tempo massimo di un job, da `new Worker` alla risposta (O24). Il parse vero
 * dura al massimo qualche centinaio di millisecondi: oltre, il worker è appeso.
 * Esportata per i test con i timer finti; non importarla da altri moduli (più
 * test mockano l'intero modulo).
 */
export const TIMEOUT_PARSE_MS = 30_000

const ERRORE_WORKER = 'Errore nel worker durante il parsing del listino Excel'

const MIB = 1024 * 1024

/**
 * Esegue il parsing di un workbook Excel **dentro un Web Worker**, mai sul main
 * thread. Confina `XLSX.read` (CVE prototype-pollution + ReDoS) fuori dal thread
 * UI: una cella malevola congela al massimo il worker, non l'app.
 *
 * Avvolge il worker (fire-and-forget) in una Promise: risolve con il listino
 * parsato, rigetta con un Error il cui messaggio è già in italiano.
 * Il buffer viene trasferito (zero-copy) e il worker terminato a fine job, a
 * errore o al timeout (`TIMEOUT_PARSE_MS`): una risposta che arriva dopo è ignorata.
 *
 * Un file che decompresso supera `MAX_DECOMPRESSO_BYTE` (O60) è rifiutato prima
 * di creare il worker: sul main thread si legge solo la central directory.
 */
export function parseExcelInWorker(
  type: 'sumisura',
  buffer: ArrayBuffer,
  filename: string
): Promise<ListinoSuMisura>
export function parseExcelInWorker(
  type: 'marmeria',
  buffer: ArrayBuffer,
  filename: string
): Promise<ListinoMarmeria>
export function parseExcelInWorker(
  type: 'porte',
  buffer: ArrayBuffer,
  filename: string
): Promise<ListinoPorte>
// L'ultima firma resta quella delle cucine: `mock.calls` dei test la usa per il tipo.
/** L'anagrafica da importare (L21, PR C): un CSV, letto nello stesso worker, con lo stesso tetto e lo stesso timeout. */
export function parseExcelInWorker(
  type: 'anagrafica',
  buffer: ArrayBuffer,
  filename: string
): Promise<LetturaAnagrafica>
export function parseExcelInWorker(
  type: 'cucine',
  buffer: ArrayBuffer,
  filename: string,
  struttura: readonly VoceStrutturaCucina[]
): Promise<ListinoCucina>
export function parseExcelInWorker(
  type: WorkerMessage['type'],
  buffer: ArrayBuffer,
  filename: string,
  struttura?: readonly VoceStrutturaCucina[]
): Promise<ListinoSuMisura | ListinoMarmeria | ListinoPorte | ListinoCucina | LetturaAnagrafica> {
  const decompresso = dimensioneDecompressa(buffer)
  if (decompresso > MAX_DECOMPRESSO_BYTE) {
    return Promise.reject(
      new Error(
        `il file occupa ${Math.ceil(decompresso / MIB)} MB una volta decompresso, il massimo ammesso è ${MAX_DECOMPRESSO_BYTE / MIB} MB. Riesporta il listino da Excel`
      )
    )
  }

  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL('../workers/excelParser.worker.ts', import.meta.url),
      { type: 'module' }
    )

    // Unica uscita del job: spegne il timer, disarma gli handler (una risposta
    // tardiva non arriva più a nessuno) e termina il worker una volta sola.
    const chiudi = (errore?: string) => {
      clearTimeout(timer)
      worker.onmessage = null
      worker.onerror = null
      worker.onmessageerror = null
      worker.terminate()
      if (errore !== undefined) reject(new Error(errore))
    }

    const timer = setTimeout(() => {
      chiudi(
        `il file non è stato letto entro ${TIMEOUT_PARSE_MS / 1000} secondi. Ricarica la pagina e riprova; se succede ancora, avvisa l'assistenza`
      )
    }, TIMEOUT_PARSE_MS)

    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const res = e.data
      if (res.status === 'error') {
        chiudi(res.message)
      } else {
        chiudi()
        resolve(res.data)
      }
    }

    worker.onerror = (e) => {
      chiudi(e.message || ERRORE_WORKER)
    }

    worker.onmessageerror = () => {
      chiudi('risposta del worker illeggibile')
    }

    const messaggio: WorkerMessage =
      type === 'cucine' ? { type, buffer, filename, struttura: struttura ?? [] } : { type, buffer, filename }
    try {
      worker.postMessage(messaggio, [buffer])
    } catch {
      // Un lancio sincrono (buffer già trasferito, messaggio non clonabile)
      // lasciava il worker vivo: ora chiude come un errore del worker.
      chiudi(ERRORE_WORKER)
    }
  })
}
