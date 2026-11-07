import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// quoteStore importa pricelistStore → supabase: mock minimale (hermetico).
vi.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: () => ({}) } },
  LISTINI_BUCKET: 'Listini',
}))

import { useQuoteStore } from '@/store/quoteStore'
import { aliquotaIvaSezione, aliquotaIvaValida, calcIva, sezioneIvaArredi, sezioneIvaPorte } from '@/engine/iva'
import { calcSuMisuraArticoli } from '@/engine/calcSuMisura'
import { calcPorte } from '@/engine/calcPorte'
import { articoloPZ } from '@/test-utils/articoli'
import { blobPrimaDiL18, CHIAVE_BLOB } from '@/test-utils/blobPrimaDiL18'

const s = () => useQuoteStore.getState()
const SEZIONI = ['arredi', 'gres', 'progettoValore', 'porte', 'cucine'] as const

describe('quoteStore — aliquota IVA di sezione e di riga (L18)', () => {
  beforeEach(() => s().resetAll())

  it('setAliquotaIvaSezione scrive le cinque sezioni, dal fallback se mai toccate', () => {
    for (const sez of SEZIONI) {
      expect(s().sezioni[sez]?.aliquotaIva).toBeUndefined()
      s().setAliquotaIvaSezione(sez, 10)
      expect(s().sezioni[sez]?.aliquotaIva).toBe(10)
    }
  })

  it('aliquota di riga su articolo, porta e battiscopa; undefined torna «come la sezione»', () => {
    s().addArticoloSuMisura({ ...articoloPZ, aliquotaIva: 4 })
    const articolo = s().sezioni.arredi!.articoli[0]
    expect(articolo.aliquotaIva).toBe(4)
    s().updateArticoloSuMisura(articolo.id, { aliquotaIva: undefined })
    expect(aliquotaIvaValida(s().sezioni.arredi!.articoli[0].aliquotaIva)).toBeUndefined()

    s().addRigaPorta({ modelloNome: 'GIOTTO', altezzaCm: 210 })
    const porta = s().sezioni.porte!.righe[0]
    s().updateRigaPorta(porta.id, { aliquotaIva: 10 })
    expect(s().sezioni.porte!.righe[0].aliquotaIva).toBe(10)
    // Il resto della riga resta com'era: la quantità e il modello non si toccano.
    expect(s().sezioni.porte!.righe[0].modelloNome).toBe('GIOTTO')
    s().updateRigaPorta(porta.id, { aliquotaIva: undefined })
    expect(s().sezioni.porte!.righe[0].aliquotaIva).toBeUndefined()

    s().addBattiscopa('BATTISCOPA MASSELLO')
    const b = s().sezioni.porte!.battiscopa![0]
    s().updateBattiscopa(b.id, { aliquotaIva: 22 })
    expect(s().sezioni.porte!.battiscopa![0].aliquotaIva).toBe(22)
  })
})

describe('presidio: un preventivo salvato prima di L18 si apre e vale 22% su tutto', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => {
    localStorage.clear()
    s().resetAll()
  })

  it('il blob senza aliquote si idrata senza inventarne, e ogni importo va al 22%', async () => {
    localStorage.setItem(CHIAVE_BLOB, JSON.stringify(blobPrimaDiL18))
    await useQuoteStore.persist.rehydrate()
    const { sezioni } = s()
    // Tutte e cinque le sezioni ci sono, e nessuna ha un'aliquota: vale la predefinita.
    for (const sez of SEZIONI) {
      expect(sezioni[sez]).toBeDefined()
      expect(sezioni[sez]?.aliquotaIva).toBeUndefined()
      expect(aliquotaIvaSezione(sezioni[sez]?.aliquotaIva)).toBe(22)
    }
    // Le righe vendute singolarmente ereditano la sezione: anche loro al 22%.
    const arredi = sezioni.arredi!
    const porte = sezioni.porte!
    const r = calcIva([
      sezioneIvaArredi(arredi, calcSuMisuraArticoli(arredi.articoli, arredi.quotaProgettazione, arredi.sconto)),
      sezioneIvaPorte(porte, calcPorte(porte, null)),
      { totale: 500, aliquota: sezioni.progettoValore!.aliquotaIva },
    ])
    expect(r.righe.map((x) => x.aliquota)).toEqual([22])
    // 200 (arredi) + 700 + 100 (porta e battiscopa) + 500 (progetto a valore).
    expect(r.righe[0].imponibile).toBe(1500)
  })
})
