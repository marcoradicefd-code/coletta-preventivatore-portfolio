import { describe, it, expect } from 'vitest'
import { validaListinoCucina } from '@/parsers/cucinaSchema'
import type { ListinoCucina } from '@/types/cucina'

// Prezzi inventati: il listino vero non entra nei test (D7).
function listino(p: Partial<ListinoCucina> = {}): ListinoCucina {
  return {
    prezzi: [
      { id: 'base-pensile-laminato', prezzo: 111 },
      { id: 'striscia-led', prezzo: 33 },
    ],
    percentuali: { casse: 0.1, ante: 0.2, progettazione: 0.1, adeguamento: 0.2 },
    giornoRate: 66,
    vascaGres: 555,
    vociMancanti: [],
    righeSconosciute: [],
    aggiornato: 'LISTINO CUCINA.xls',
    ...p,
  }
}

describe('validaListinoCucina', () => {
  it('listino conforme: ok', () => {
    expect(validaListinoCucina(listino())).toEqual({ ok: true })
  })

  it('vasca, giorni e percentuali assenti (null): ok, sono avvisi del referto', () => {
    const l = listino({
      vascaGres: null,
      giornoRate: null,
      percentuali: { casse: null, ante: null, progettazione: null, adeguamento: null },
    })
    expect(validaListinoCucina(l)).toEqual({ ok: true })
  })

  it('nessun prezzo: errore leggibile', () => {
    const r = validaListinoCucina(listino({ prezzi: [] }))
    expect(r).toEqual({ ok: false, errore: 'nessuna voce con prezzo letta dal foglio CUCINA' })
  })

  it('prezzo negativo: dice quale campo', () => {
    const r = validaListinoCucina(listino({ prezzi: [{ id: 'x', prezzo: -5 }] }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errore).toBe('prezzi.0.prezzo: valore non valido')
  })

  it('una voce con due prezzi: errore', () => {
    const r = validaListinoCucina(listino({ prezzi: [{ id: 'x', prezzo: 1 }, { id: 'x', prezzo: 2 }] }))
    expect(r).toEqual({ ok: false, errore: 'voci con due prezzi: x' })
  })

  it('percentuale fuori da [0, 1] o tariffa non finita: errore', () => {
    const r = validaListinoCucina(
      listino({ percentuali: { casse: 10, ante: 0.2, progettazione: 0.1, adeguamento: 0.2 }, giornoRate: Infinity })
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errore).toBe('percentuali.casse: valore non valido; giornoRate: valore non valido')
  })

  it('un oggetto che non è un listino: errore, non un throw', () => {
    expect(validaListinoCucina({ voci: [] }).ok).toBe(false)
  })
})
