import type { ListinoSuMisura } from './sumisura'
import type { ListinoMarmeria } from './marmeria'
import type { ListinoPorte } from './porte'
import type { ListinoCucina, VoceStrutturaCucina } from './cucina'
import type { LetturaAnagrafica } from '@/lib/anagraficaCsv'

export type WorkerMessage =
  | { type: 'sumisura' | 'marmeria' | 'porte'; buffer: ArrayBuffer; filename: string }
  // Il listino cucine abbina i nomi a una struttura senza prezzi, che arriva col
  // messaggio: così il worker non importa il catalogo, e nessun prezzo ci entra (D7).
  | { type: 'cucine'; buffer: ArrayBuffer; filename: string; struttura: readonly VoceStrutturaCucina[] }
  // L21, PR C: l'anagrafica da importare (CSV), letta nel worker come i listini.
  | { type: 'anagrafica'; buffer: ArrayBuffer; filename: string }

export type WorkerResult =
  | { type: 'sumisura'; data: ListinoSuMisura; filename: string }
  | { type: 'marmeria'; data: ListinoMarmeria; filename: string }
  | { type: 'porte'; data: ListinoPorte; filename: string }
  | { type: 'cucine'; data: ListinoCucina; filename: string }
  | { type: 'anagrafica'; data: LetturaAnagrafica; filename: string }

export type WorkerResponse =
  | ({ status: 'success' } & WorkerResult)
  | { status: 'error'; message: string }
