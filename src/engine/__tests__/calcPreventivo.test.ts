import { describe, it, expect } from 'vitest'
import { calcolaPreventivo } from '@/engine/calcPreventivo'
import { componiCatalogoCucina } from '@/data/cucina/strutturaCucina'
import { listinoCucinaFinto, GIORNO_RATE_FINTO } from '@/test-utils/catalogoCucinaFinto'
import { articoloPZ } from '@/test-utils/articoli'
import { FALLBACK_ARREDI, FALLBACK_CUCINE, FALLBACK_PROGETTO_VALORE } from '@/store/quoteFallbacks'
import type { SezioniState } from '@/types/quote'

const NESSUN_LISTINO = { gres: null, porte: null, catalogoCucina: null }

describe('calcolaPreventivo — un calcolo per PDF e salvataggio (L21)', () => {
  it('senza listini: gres e cucine non si calcolano, l\'imponibile è la somma di arredi e progetto a valore', () => {
    const sezioni: SezioniState = {
      arredi: { ...FALLBACK_ARREDI, articoli: [{ ...articoloPZ, id: 'a1', quantita: 3 }], sconto: 0.1 },
      progettoValore: { ...FALLBACK_PROGETTO_VALORE, righe: [{ id: 'v1', descrizione: 'Voce di prova', prezzo: 250 }] },
    }
    const r = calcolaPreventivo(sezioni, NESSUN_LISTINO)
    expect(r.resultMM).toBeNull()
    expect(r.resultCucine).toBeNull()
    expect(r.resultSM.totale).toBe(270)
    expect(r.iva.totaleImponibile).toBe(270 + 250)
  })

  it('con il listino cucine finto la cucina entra nell\'imponibile, come nel PDF', () => {
    const sezioni: SezioniState = { cucine: { ...FALLBACK_CUCINE, giorniExtra: 2 } }
    const r = calcolaPreventivo(sezioni, { ...NESSUN_LISTINO, catalogoCucina: componiCatalogoCucina(listinoCucinaFinto) })
    expect(r.resultCucine?.imponibile).toBe(2 * GIORNO_RATE_FINTO)
    expect(r.iva.totaleImponibile).toBe(2 * GIORNO_RATE_FINTO)
  })
})
