import { describe, it, expect } from 'vitest'
import { validaListinoMarmeria } from '@/parsers/marmeriaSchema'
import type { ListinoMarmeria } from '@/types/marmeria'

function listinoValido(): ListinoMarmeria {
  return {
    materiali: [
      {
        produttore: 'SILESTONE',
        colore: 'Bianco',
        tipoSuperficie: 'Opaco',
        coloreFinituraCompleto: 'Bianco_Opaco',
        collezione: 'X',
        tipologia: 'QUARZO',
        spessori: {
          13: {
            spessore: 13,
            disponibile: true,
            prezziMq: { fino62: 100, da63a70: 100, oltre70: 200 },
            minimoFatturabile: 5,
          },
        },
        alzatinaAltezza: 0.08,
        alzatinaEuroMl: 80,
        schienaleEuroMq: 1135,
      },
    ],
    lavorazioniBordo: [
      { id: 1, descrizione: 'Costa retta', prezzoMlPerTipologia: { QUARZO: 48, LAPITEC: 61, GRES: 61 } },
    ],
    lavorazioniVarie: [],
    vascheIntegrate: [],
    rilMontScaglioni: [
      { da: 0, a: 1000, importo: 300 },
      { da: 1000.01, a: 1500, importo: 350 },
      { da: 1500.01, a: 2000, importo: 400 },
      // Fascia aperta con importo 0 (layout Rev_82): deve essere VALIDA.
      { da: 3000, a: null, importo: 0 },
    ],
    scontiDisponibili: [0, 0.05, 0.15],
    aggiornato: '2026-06-29',
  }
}

describe('validaListinoMarmeria', () => {
  it('listino conforme → ok (inclusa fascia aperta con importo 0, caso Rev_82)', () => {
    expect(validaListinoMarmeria(listinoValido())).toEqual({ ok: true })
  })

  it('materiali vuoti → errore leggibile in italiano', () => {
    const l = listinoValido()
    l.materiali = []
    const r = validaListinoMarmeria(l)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errore).toMatch(/nessun materiale/i)
  })

  it('RIL_MONT vuoto → errore', () => {
    const l = listinoValido()
    l.rilMontScaglioni = []
    const r = validaListinoMarmeria(l)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errore).toMatch(/rilievo\/montaggio/i)
  })

  it('scaglione con A < DA → incoerente', () => {
    const l = listinoValido()
    l.rilMontScaglioni = [{ da: 1000, a: 500, importo: 300 }]
    const r = validaListinoMarmeria(l)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errore).toMatch(/incoerente con DA/i)
  })

  it('tutti gli importi RIL_MONT a 0 → errore (nessun importo > 0)', () => {
    const l = listinoValido()
    l.rilMontScaglioni = [{ da: 0, a: null, importo: 0 }]
    const r = validaListinoMarmeria(l)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errore).toMatch(/importo > 0/i)
  })

  it('prezzo €/mq non positivo → errore', () => {
    const l = listinoValido()
    l.materiali[0].spessori[13]!.prezziMq.fino62 = -10
    const r = validaListinoMarmeria(l)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errore).toMatch(/non positivi/i)
  })
})
