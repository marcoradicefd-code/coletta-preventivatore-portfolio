import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// quoteStore importa pricelistStore → supabase: mock minimale (hermetico).
vi.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: () => ({}) } },
  LISTINI_BUCKET: 'Listini',
}))

import { useQuoteStore } from '@/store/quoteStore'
import { calcSuMisuraArticoli } from '@/engine/calcSuMisura'
import { calcIva, sezioneIvaArredi } from '@/engine/iva'
import { articoloPZ } from '@/test-utils/articoli'
import { blobPrimaDiL18, CHIAVE_BLOB } from '@/test-utils/blobPrimaDiL18'
import type { SezioneArredi } from '@/types/quote'

const s = () => useQuoteStore.getState()
const arredi = () => s().sezioni.arredi!
const totaleArredi = (a: SezioneArredi) => calcSuMisuraArticoli(a.articoli, a.quotaProgettazione, a.sconto)

describe('quoteStore — arredi che raggruppano gli articoli (L19)', () => {
  beforeEach(() => s().resetAll())

  it('addArredo parte dal fallback, accoda nell\'ordine e restituisce l\'id', () => {
    expect(s().sezioni.arredi?.arredi).toBeUndefined()
    const ingresso = s().addArredo('Ingresso')
    const matrimoniale = s().addArredo('Matrimoniale')
    expect(arredi().arredi).toEqual([
      { id: ingresso, nome: 'Ingresso' },
      { id: matrimoniale, nome: 'Matrimoniale' },
    ])
    expect(ingresso).not.toBe(matrimoniale)
    // Gli articoli non si toccano.
    expect(arredi().articoli).toEqual([])
  })

  it('rinominaArredo cambia solo il nome di quell\'arredo', () => {
    const a = s().addArredo('Ingresso')
    const b = s().addArredo('Studio')
    s().rinominaArredo(a, 'Ingresso e corridoio')
    expect(arredi().arredi!.map((x) => x.nome)).toEqual(['Ingresso e corridoio', 'Studio'])
    expect(arredi().arredi![1].id).toBe(b)
  })

  it('un articolo entra in un arredo e ne esce con updateArticoloSuMisura, il totale non cambia', () => {
    s().addArticoloSuMisura(articoloPZ)
    s().setScontoSezione('arredi', 0.1)
    const prima = totaleArredi(arredi())
    const ingresso = s().addArredo('Ingresso')
    const id = arredi().articoli[0].id
    s().updateArticoloSuMisura(id, { arredoId: ingresso })
    expect(arredi().articoli[0].arredoId).toBe(ingresso)
    expect(totaleArredi(arredi())).toEqual(prima)
    s().updateArticoloSuMisura(id, { arredoId: undefined })
    expect(arredi().articoli[0].arredoId).toBeUndefined()
  })

  it("removeArredo 'sposta': i suoi articoli vanno in «Altre voci», gli altri restano, il totale non cambia", () => {
    const ingresso = s().addArredo('Ingresso')
    const studio = s().addArredo('Studio')
    s().addArticoloSuMisura({ ...articoloPZ, descrizione: 'Armadio', arredoId: ingresso })
    s().addArticoloSuMisura({ ...articoloPZ, descrizione: 'Libreria', arredoId: studio })
    s().addArticoloSuMisura({ ...articoloPZ, descrizione: 'Mensola' })
    const prima = totaleArredi(arredi())
    s().removeArredo(ingresso, 'sposta')
    expect(arredi().arredi).toEqual([{ id: studio, nome: 'Studio' }])
    expect(arredi().articoli.map((a) => [a.descrizione, a.arredoId])).toEqual([
      ['Armadio', undefined],
      ['Libreria', studio],
      ['Mensola', undefined],
    ])
    expect(totaleArredi(arredi())).toEqual(prima)
  })

  it("removeArredo 'elimina': spariscono l'arredo e solo i suoi articoli", () => {
    const ingresso = s().addArredo('Ingresso')
    const studio = s().addArredo('Studio')
    s().addArticoloSuMisura({ ...articoloPZ, descrizione: 'Armadio', arredoId: ingresso })
    s().addArticoloSuMisura({ ...articoloPZ, descrizione: 'Libreria', arredoId: studio })
    s().addArticoloSuMisura({ ...articoloPZ, descrizione: 'Mensola' })
    s().removeArredo(ingresso, 'elimina')
    expect(arredi().arredi!.map((x) => x.id)).toEqual([studio])
    expect(arredi().articoli.map((a) => a.descrizione)).toEqual(['Libreria', 'Mensola'])
  })
})

describe('presidio: un preventivo salvato prima di L19 si apre senza arredi e con gli stessi totali', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => {
    localStorage.clear()
    s().resetAll()
  })

  it('il blob senza arredi si idrata senza inventarne, e totale e IVA della sezione sono quelli di prima', async () => {
    // Il blob di prima di L18 è anche di prima di L19; due articoli, uno al 10%
    // e uno a mq con la maggiorazione, perché il totale abbia qualcosa da sommare.
    const blob = structuredClone(blobPrimaDiL18)
    const articoli = blob.state.sezioni.arredi.articoli as Record<string, unknown>[]
    articoli.push({ ...articoli[0], id: 'a2', um: 'MQ', larghezzaCm: 120, altezzaCm: 200, quantita: null, aliquotaIva: 10 })
    blob.state.sezioni.arredi.sconto = 0.1
    const attesoTotale = totaleArredi(blob.state.sezioni.arredi as SezioneArredi)
    localStorage.setItem(CHIAVE_BLOB, JSON.stringify(blob))
    await useQuoteStore.persist.rehydrate()

    const a = arredi()
    expect(a.arredi).toBeUndefined()
    expect(a.articoli.map((x) => x.arredoId)).toEqual([undefined, undefined])
    const r = totaleArredi(a)
    expect(r).toEqual(attesoTotale)
    expect(r.totale).toBeGreaterThan(0)
    expect(calcIva([sezioneIvaArredi(a, r)])).toEqual(
      calcIva([sezioneIvaArredi(blob.state.sezioni.arredi as SezioneArredi, attesoTotale)])
    )
  })
})
