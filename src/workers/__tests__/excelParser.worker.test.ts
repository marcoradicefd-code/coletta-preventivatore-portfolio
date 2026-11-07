import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { csvFinto, INTESTAZIONE_FINTA, RIGHE_FINTE } from '@/test-utils/anagraficaFinta'

/**
 * Il worker vero, importato in jsdom: il suo `message` si consegna con un
 * evento, e la risposta si legge dalla spia di `postMessage`. Solo il ramo
 * dell'anagrafica (L21, PR C): i listini passano da `XLSX.read`, provato coi
 * workbook sintetici dei parser.
 */
const risposte: unknown[] = []

beforeAll(async () => {
  const spia = (m: unknown) => {
    risposte.push(m)
  }
  vi.spyOn(globalThis, 'postMessage').mockImplementation(spia)
  if (self !== globalThis) vi.spyOn(self, 'postMessage').mockImplementation(spia)
  await import('@/workers/excelParser.worker')
})
beforeEach(() => {
  risposte.length = 0
})

const consegna = (testo: string) => {
  const buffer = new TextEncoder().encode(testo).buffer
  self.dispatchEvent(new MessageEvent('message', { data: { type: 'anagrafica', buffer, filename: 'anagrafica.csv' } }))
}

describe('excelParser.worker — l’anagrafica si legge nel worker, senza XLSX.read', () => {
  it('risponde con le righe lette dal CSV finto: CAP e codici restano testo', () => {
    consegna(csvFinto(RIGHE_FINTE))
    expect(risposte).toHaveLength(1)
    expect(risposte[0]).toMatchObject({ status: 'success', type: 'anagrafica', filename: 'anagrafica.csv' })
    const data = (risposte[0] as { data: { righe: { codice_gestionale: string; cap: string | null }[] } }).data
    expect(data.righe.map((r) => r.codice_gestionale)).toEqual(['101', '102', '103', '104'])
    expect(data.righe[3].cap).toBe('00000')
  })

  it('intestazione sbagliata: risponde con l’errore e il motivo, senza righe', () => {
    consegna(csvFinto(RIGHE_FINTE, { intestazione: INTESTAZIONE_FINTA.replace('cap', 'codice_postale') }))
    expect(risposte).toEqual([{ status: 'error', message: expect.stringMatching(/colonna 6 dell’intestazione: attesa «cap»/) }])
  })
})
