import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// quoteStore importa pricelistStore → supabase: mock minimale (hermetico).
vi.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: () => ({}) } },
  LISTINI_BUCKET: 'Listini',
}))

import { useQuoteStore } from '@/store/quoteStore'
import { FALLBACK_CUCINE } from '@/store/quoteFallbacks'
import { ADEG_DEFAULT } from '@/types/cucina'
import { calcCucina } from '@/engine/calcCucina'
import { catalogoCucinaFinto } from '@/test-utils/catalogoCucinaFinto'
import { blobPrimaDiL18, CHIAVE_BLOB } from '@/test-utils/blobPrimaDiL18'
import { migrateQuoteState } from '@/store/quoteMigrations'

const cucine = () => useQuoteStore.getState().sezioni.cucine

describe('quoteStore — Cucine (sezioni.cucine)', () => {
  beforeEach(() => useQuoteStore.getState().resetAll())

  it('lazy-init: la sezione è undefined finché non si scrive; il primo write parte dal fallback', () => {
    expect(cucine()).toBeUndefined()
    useQuoteStore.getState().setVoceQuantita('colonna-210-laccato', 1)
    const c = cucine()!
    expect(c.voci).toEqual([{ voceId: 'colonna-210-laccato', quantita: 1 }])
    // eredita i default del fallback (adeguamento allo snapshot di default)
    expect(c.adeguamentoPct).toBe(ADEG_DEFAULT)
    expect(c.casse).toBe(false)
    expect(c.ante).toBe(false)
    expect(c.profonditaOltre65).toBe(false)
    expect(c.sconto).toBe(0)
  })

  it('setProfonditaOltre65 (L25): accende e spegne la spunta, senza toccare casse e ante', () => {
    const s = useQuoteStore.getState()
    s.toggleMoltiplicatore('casse')
    s.setProfonditaOltre65(true)
    expect(cucine()!.profonditaOltre65).toBe(true)
    expect(cucine()!.casse).toBe(true)
    expect(cucine()!.ante).toBe(false)
    s.setProfonditaOltre65(false)
    expect(cucine()!.profonditaOltre65).toBe(false)
    expect(FALLBACK_CUCINE.profonditaOltre65).toBe(false)
  })

  it('setVoceQuantita: add, update in-place (ordine preservato), q≤0 rimuove', () => {
    const s = useQuoteStore.getState()
    s.setVoceQuantita('anta-vetro-visarm', 2)
    s.setVoceQuantita('striscia-led', 5)
    expect(cucine()!.voci).toEqual([
      { voceId: 'anta-vetro-visarm', quantita: 2 },
      { voceId: 'striscia-led', quantita: 5 },
    ])

    // update in-place: NON sposta in coda
    s.setVoceQuantita('anta-vetro-visarm', 3)
    expect(cucine()!.voci).toEqual([
      { voceId: 'anta-vetro-visarm', quantita: 3 },
      { voceId: 'striscia-led', quantita: 5 },
    ])

    // q = 0 → deseleziona (rimuove)
    s.setVoceQuantita('anta-vetro-visarm', 0)
    expect(cucine()!.voci).toEqual([{ voceId: 'striscia-led', quantita: 5 }])

    // q negativo → rimuove anche l'altra
    s.setVoceQuantita('striscia-led', -1)
    expect(cucine()!.voci).toEqual([])
  })

  it('toggle-fisso via setVoceQuantita: add con 1 seleziona, 0 deseleziona', () => {
    const s = useQuoteStore.getState()
    s.setVoceQuantita('isola-laminato-fuorimisura', 1)
    expect(cucine()!.voci).toEqual([{ voceId: 'isola-laminato-fuorimisura', quantita: 1 }])
    s.setVoceQuantita('isola-laminato-fuorimisura', 0)
    expect(cucine()!.voci).toEqual([])
  })

  it('toggleMoltiplicatore: casse e ante indipendenti e CUMULABILI', () => {
    const s = useQuoteStore.getState()
    s.toggleMoltiplicatore('casse')
    expect(cucine()!.casse).toBe(true)
    expect(cucine()!.ante).toBe(false)
    s.toggleMoltiplicatore('ante')
    expect(cucine()!.casse).toBe(true)
    expect(cucine()!.ante).toBe(true) // coesistono
    s.toggleMoltiplicatore('casse')
    expect(cucine()!.casse).toBe(false)
    expect(cucine()!.ante).toBe(true)
  })

  it('setGiorniExtra: non-negativo (negativo/NaN → 0)', () => {
    const s = useQuoteStore.getState()
    s.setGiorniExtra(9)
    expect(cucine()!.giorniExtra).toBe(9)
    s.setGiorniExtra(-3)
    expect(cucine()!.giorniExtra).toBe(0)
    s.setGiorniExtra(NaN)
    expect(cucine()!.giorniExtra).toBe(0)
  })

  it('setExtraManuale: imposta oggetto e azzera con null', () => {
    const s = useQuoteStore.getState()
    s.setExtraManuale({ descrizione: 'maniglie speciali', importo: 500 })
    expect(cucine()!.extraManuale).toEqual({ descrizione: 'maniglie speciali', importo: 500 })
    s.setExtraManuale(null)
    expect(cucine()!.extraManuale).toBeNull()
  })

  it('setAdeguamentoCucina: non-negativo, NON clampato a 1 (0.35 ammesso; negativo → 0)', () => {
    const s = useQuoteStore.getState()
    s.setAdeguamentoCucina(0.35)
    expect(cucine()!.adeguamentoPct).toBe(0.35)
    s.setAdeguamentoCucina(0)
    expect(cucine()!.adeguamentoPct).toBe(0)
    s.setAdeguamentoCucina(-0.1)
    expect(cucine()!.adeguamentoPct).toBe(0)
  })

  it('setDescrizioneCucina: imposta il testo a corpo', () => {
    useQuoteStore.getState().setDescrizioneCucina('Cucina lineare 360 cm, laccato opaco')
    expect(cucine()!.descrizione).toBe('Cucina lineare 360 cm, laccato opaco')
  })

  it('setScontoSezione("cucine"): clamp [0,1] (NaN → 0)', () => {
    const s = useQuoteStore.getState()
    s.setScontoSezione('cucine', 0.2)
    expect(cucine()!.sconto).toBe(0.2)
    s.setScontoSezione('cucine', 1.5)
    expect(cucine()!.sconto).toBe(1)
    s.setScontoSezione('cucine', -0.5)
    expect(cucine()!.sconto).toBe(0)
    s.setScontoSezione('cucine', NaN)
    expect(cucine()!.sconto).toBe(0)
  })

  it('resetCucine: riporta la sezione al fallback', () => {
    const s = useQuoteStore.getState()
    s.setVoceQuantita('colonna-210-laccato', 2)
    s.toggleMoltiplicatore('ante')
    s.setGiorniExtra(4)
    s.resetCucine()
    const c = cucine()!
    expect(c.voci).toEqual([])
    expect(c.ante).toBe(false)
    expect(c.giorniExtra).toBe(0)
    expect(c.adeguamentoPct).toBe(ADEG_DEFAULT)
  })

  it('isolamento: operare su cucine non tocca arredi/gres/valore/porte, né muta il FALLBACK', () => {
    const s = useQuoteStore.getState()
    s.setScontoSezione('arredi', 0.2)
    s.setScontoSezione('gres', 0.3)
    s.setScontoSezione('progettoValore', 0.4)
    s.setScontoSezione('porte', 0.5)
    s.setVoceQuantita('colonna-210-laccato', 1)
    s.setScontoSezione('cucine', 0.15)

    const sez = useQuoteStore.getState().sezioni
    expect(sez.arredi!.sconto).toBe(0.2)
    expect(sez.gres!.sconto).toBe(0.3)
    expect(sez.progettoValore!.sconto).toBe(0.4)
    expect(sez.porte!.sconto).toBe(0.5)
    expect(sez.cucine!.sconto).toBe(0.15)

    // Fallback module-level congelato: mai mutato (spread immutabile).
    expect(FALLBACK_CUCINE.voci).toEqual([])
    expect(FALLBACK_CUCINE.sconto).toBe(0)
    expect(FALLBACK_CUCINE.adeguamentoPct).toBe(ADEG_DEFAULT)
    expect(Object.isFrozen(FALLBACK_CUCINE)).toBe(true)
  })
})

describe('quoteStore — un preventivo salvato prima di L25 (senza la profondità)', () => {
  afterEach(() => {
    localStorage.clear()
    useQuoteStore.getState().resetAll()
  })

  it('si carica con la spunta spenta: il blob non si riscrive e gli importi sono quelli di prima', async () => {
    expect('profonditaOltre65' in blobPrimaDiL18.state.sezioni.cucine).toBe(false)
    localStorage.setItem(CHIAVE_BLOB, JSON.stringify(blobPrimaDiL18))
    await useQuoteStore.persist.rehydrate()
    const c = cucine()!
    // Assente vale `false` in lettura: la chiave non si aggiunge, così l'impronta
    // delle sezioni (e i prezzi congelati di un inviato) resta quella (strada A).
    expect(c.profonditaOltre65 ?? false).toBe(false)
    expect('profonditaOltre65' in c).toBe(false)
    const r = calcCucina(c, catalogoCucinaFinto)
    expect(r).toEqual(calcCucina({ ...c, profonditaOltre65: false }, catalogoCucinaFinto))
    expect(r.supplementoProfondita).toBeUndefined()
    // Anche «Apri» dal database passa da `migrateQuoteState`: la sezione esce com'era.
    expect(migrateQuoteState(blobPrimaDiL18.state, 4).sezioni.cucine).toEqual(blobPrimaDiL18.state.sezioni.cucine)
  })
})
