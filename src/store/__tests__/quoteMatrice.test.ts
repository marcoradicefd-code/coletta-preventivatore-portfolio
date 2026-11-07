import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// quoteStore importa pricelistStore → supabase: mock minimale (hermetico).
vi.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: () => ({}) } },
  LISTINI_BUCKET: 'Listini',
}))

import { useQuoteStore } from '@/store/quoteStore'
import { calcArticolo, calcSuMisuraArticoli } from '@/engine/calcSuMisura'
import { elementoDaMatrice } from '@/engine/matriceFiniture'
import { articoloPZ } from '@/test-utils/articoli'
import { blobPrimaDiL18, CHIAVE_BLOB } from '@/test-utils/blobPrimaDiL18'
import type { RigaMatrice } from '@/types/sumisura'

// Matrice finta, prezzi finti non tondi: nessun prezzo del listino vero.
const riga = (tipo: string, interno: string, esterno: string, prezzo: number, unita: RigaMatrice['unita'] = 'MQ'): RigaMatrice => ({
  tipo, interno, esterno, prezzo, unita, cella: 'FINITURE!A1',
})
const MATRICE = [
  riga('ARMADIO CON ANTE', 'LAMINATO BIANCO', 'LACCATO OPACO', 523),
  riga('TELAIO CON ANTE', '', 'LACCATO OPACO', 853),
  riga('MENSOLE A MURO', '', 'LAMINATO', 57, 'ML'),
]
const s = () => useQuoteStore.getState()
const arredi = () => s().sezioni.arredi!

describe('elemento da matrice: campi nuovi e snapshot del prezzo (L20)', () => {
  beforeEach(() => s().resetAll())

  it('elementoDaMatrice: descrizione dal tipo, prezzo e unità della riga, combinazione; assente ⇒ null', () => {
    expect(elementoDaMatrice(MATRICE, { tipo: 'ARMADIO CON ANTE', interno: 'LAMINATO BIANCO', esterno: 'LACCATO OPACO' })).toEqual({
      origine: 'listino',
      descrizione: 'Armadio con ante',
      prezzoUnitario: 523,
      um: 'MQ',
      combinazione: { tipo: 'ARMADIO CON ANTE', interno: 'LAMINATO BIANCO', esterno: 'LACCATO OPACO' },
    })
    // «Qualsiasi interno»: la combinazione salvata non porta un interno che il listino non dice.
    expect(elementoDaMatrice(MATRICE, { tipo: 'TELAIO CON ANTE', interno: 'X', esterno: 'LACCATO OPACO' })?.combinazione?.interno).toBe('')
    expect(elementoDaMatrice(MATRICE, { tipo: 'MENSOLE A MURO', interno: '', esterno: 'LAMINATO' })?.um).toBe('ML')
    expect(elementoDaMatrice(MATRICE, { tipo: 'ARMADIO CON ANTE', interno: 'LAMINATO BIANCO', esterno: 'ESSENZA' })).toBeNull()
  })

  it('il prezzo è fissato alla scelta: una matrice ricaricata con altri prezzi non cambia l elemento salvato', () => {
    const scelta = { tipo: 'ARMADIO CON ANTE', interno: 'LAMINATO BIANCO', esterno: 'LACCATO OPACO' }
    s().addArticoloSuMisura({ ...articoloPZ, ...elementoDaMatrice(MATRICE, scelta)!, um: 'MQ', larghezzaCm: 300, altezzaCm: 100, quantita: null, profonditaSotto40: true })
    const prima = calcSuMisuraArticoli(arredi().articoli, false)
    const ricaricata = MATRICE.map((r) => ({ ...r, prezzo: r.prezzo * 2 }))
    expect(elementoDaMatrice(ricaricata, scelta)?.prezzoUnitario).toBe(1046)
    expect(arredi().articoli[0]).toMatchObject({ prezzoUnitario: 523, combinazione: scelta, profonditaSotto40: true })
    expect(calcSuMisuraArticoli(arredi().articoli, false)).toEqual(prima)
    // 3 mq × 523 = 1.569, −10% = 157.
    expect(calcArticolo(arredi().articoli[0]).totale).toBe(1412)
  })
})

describe('presidio: un preventivo salvato prima di L20 si apre identico', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => {
    localStorage.clear()
    s().resetAll()
  })

  it('nessun campo nuovo sugli articoli, stessi totali; i campi nuovi sopravvivono a un salvataggio', async () => {
    localStorage.setItem(CHIAVE_BLOB, JSON.stringify(blobPrimaDiL18))
    await useQuoteStore.persist.rehydrate()
    const [a] = arredi().articoli
    expect('combinazione' in a || 'profonditaSotto40' in a).toBe(false)
    expect(calcSuMisuraArticoli(arredi().articoli, false).totale).toBe(200)

    s().updateArticoloSuMisura(a.id, { combinazione: { tipo: 'T', interno: '', esterno: 'E' }, profonditaSotto40: true })
    const salvato = JSON.parse(localStorage.getItem(CHIAVE_BLOB)!)
    expect(salvato.state.sezioni.arredi.articoli[0]).toMatchObject({ combinazione: { tipo: 'T', interno: '', esterno: 'E' }, profonditaSotto40: true })
  })
})
