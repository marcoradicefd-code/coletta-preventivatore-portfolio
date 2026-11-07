import * as XLSX from 'xlsx'
import { parseSuMisura } from '@/parsers/parseSuMisura'
import { parseMarmeria } from '@/parsers/parseMarmeria'
import { parsePorte } from '@/parsers/parsePorte'
import { parseCucina } from '@/parsers/parseCucina'
import { MAX_EXCEL_ROWS } from '@/parsers/parserUtils'
import { decodificaAnagrafica, leggiCsvAnagrafica } from '@/lib/anagraficaCsv'
import type { WorkerMessage, WorkerResponse } from '@/types/worker'

self.addEventListener('message', (event: MessageEvent<WorkerMessage>) => {
  const { type, buffer, filename } = event.data

  try {
    // L'anagrafica da importare (L21, PR C) è un CSV: niente `XLSX.read`, che
    // indovinerebbe i tipi (un CAP «00100» diventerebbe il numero 100). La legge
    // un parser scritto qui, in `anagraficaCsv.ts`, comunque nel worker.
    if (type === 'anagrafica') {
      globalThis.postMessage({
        status: 'success',
        type,
        data: leggiCsvAnagrafica(decodificaAnagrafica(buffer)),
        filename,
      } satisfies WorkerResponse)
      return
    }

    // Il tetto righe è UNO: `MAX_EXCEL_ROWS`, lo stesso che i parser usano per
    // troncare. Qui era cablato a 2000 — stesso valore, ma due posti da cambiare
    // insieme e nessuno che lo dicesse.
    //
    // `cellFormula: true` — le formule SERVONO, non sono un lusso.
    //
    // Nel foglio RIL_MONT la fascia aperta non contiene un prezzo ma
    // `CEILING(E2*0.15,1)`: il valore in cache è 0, perché il file è salvato con
    // un preventivo vuoto, e la percentuale vive SOLO nel testo della formula.
    // Con le formule spente il parser leggeva quello 0 e lo trattava da prezzo →
    // montaggio gratis sopra i 3.000 €.
    //
    // Costo misurato sul listino più grosso (Rev_83, 481 kB), mediana di 12 run:
    //   read senza formule ................ 84,7 ms
    //   read CON formule (questa) ......... 93,7 ms  → +9,0 ms (+10,6%)
    //   due read complete ................ 172,5 ms  → +104%, scartata
    //   read + seconda mirata a RIL_MONT .. 91,9 ms  → 1,8 ms meglio di questa,
    //     ma vuole un secondo workbook nella firma di `parseMarmeria`: due verità
    //     sullo stesso foglio, che possono divergere. Non vale 1,8 ms.
    //
    // Il parsing dei valori non cambia di una virgola: `sheet_to_json` legge
    // `.v`, presente in entrambi i casi. Cresce solo ciò che il workbook porta.
    const workbook = XLSX.read(new Uint8Array(buffer), {
      type: 'array',
      cellFormula: true,
      sheetRows: MAX_EXCEL_ROWS,
    })

    let response: WorkerResponse

    if (type === 'sumisura') {
      response = { status: 'success', type: 'sumisura', data: parseSuMisura(workbook), filename }
    } else if (type === 'marmeria') {
      response = { status: 'success', type: 'marmeria', data: parseMarmeria(workbook), filename }
    } else if (type === 'porte') {
      response = { status: 'success', type: 'porte', data: parsePorte(workbook), filename }
    } else if (event.data.type === 'cucine') {
      response = { status: 'success', type: 'cucine', data: parseCucina(workbook, event.data.struttura), filename }
    } else {
      throw new Error(`Tipo parser sconosciuto: ${type}`)
    }

    self.postMessage(response)
  } catch (error) {
    const response: WorkerResponse = {
      status: 'error',
      message: error instanceof Error ? error.message : 'Errore sconosciuto',
    }
    self.postMessage(response)
  }
})
