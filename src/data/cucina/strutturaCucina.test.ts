import { describe, it, expect } from 'vitest'
import {
  catalogoSenzaPrezzi,
  componiCatalogoCucina,
  strutturaCucina,
  validateStrutturaCucina,
} from '@/data/cucina/strutturaCucina'
import { listinoCucinaFinto } from '@/test-utils/catalogoCucinaFinto'

/**
 * Pin della struttura del catalogo Cucina (dalle formule del foglio "CUCINA").
 * Nel codice non c'è nessun prezzo (D7): li porta il listino cucine, e i test
 * girano sul listino finto, che questo file tiene allineato alla struttura.
 */
describe('strutturaCucina — le voci del codice', () => {
  it('validateStrutturaCucina() non lancia (fail-loud sull integrità)', () => {
    expect(() => validateStrutturaCucina()).not.toThrow()
  })

  it('id univoci', () => {
    const ids = catalogoSenzaPrezzi.map((v) => v.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('nessuna voce del codice porta un prezzo (D7)', () => {
    expect(JSON.stringify(catalogoSenzaPrezzi)).not.toMatch(/prezzo/)
  })

  it('conteggi per blocco/kind: 18 base + 2 molt. + 22 opzionali + 14 open = 56', () => {
    const baseQty = catalogoSenzaPrezzi.filter((v) => v.blocco === 'base' && v.kind === 'qty')
    const molt = catalogoSenzaPrezzi.filter((v) => v.kind === 'moltiplicatore')
    const opzQty = catalogoSenzaPrezzi.filter((v) => v.blocco === 'opzionali' && v.kind === 'qty')
    const open = catalogoSenzaPrezzi.filter((v) => v.blocco === 'open')
    const openToggle = open.filter((v) => v.kind === 'toggleFisso')

    expect(baseQty).toHaveLength(18)
    expect(molt).toHaveLength(2)
    expect(opzQty).toHaveLength(22)
    expect(open).toHaveLength(14)
    expect(openToggle).toHaveLength(2) // isole fuorimisura E61/E63
    expect(catalogoSenzaPrezzi).toHaveLength(56)
  })

  it('moltiplicatori: casse 10%, ante 20% (percentuali, restano nel codice)', () => {
    const pct = (id: string) => {
      const v = catalogoSenzaPrezzi.find((x) => x.id === id)
      return v?.kind === 'moltiplicatore' ? v.percentuale : undefined
    }
    expect(pct('casse')).toBe(0.1)
    expect(pct('ante')).toBe(0.2)
  })

  it('LED: voce qty a ML; isole fuorimisura: toggleFisso', () => {
    const voce = (id: string) => catalogoSenzaPrezzi.find((x) => x.id === id)
    expect(voce('striscia-led')).toMatchObject({ kind: 'qty', unita: 'ML' })
    expect(voce('isola-laminato-fuorimisura')?.kind).toBe('toggleFisso')
    expect(voce('isola-laccato-impiallacciato-fuorimisura')?.kind).toBe('toggleFisso')
  })
})

describe('strutturaCucina — la tabella che il parser riceve nel worker (10b-1)', () => {
  it('stesse voci, nello stesso ordine, e solo id, nome, blocco, kind, unità: niente prezzi né percentuali', () => {
    expect(strutturaCucina.map((v) => v.id)).toEqual(catalogoSenzaPrezzi.map((v) => v.id))
    for (const v of strutturaCucina) expect(Object.keys(v).sort()).toEqual(['blocco', 'id', 'kind', 'nome', 'unita'])
    expect(JSON.stringify(strutturaCucina)).not.toMatch(/prezzo|percentuale/)
  })

  it('unità solo per le voci a quantità; toggle e moltiplicatori senza (in colonna C hanno «1VERO 0FALSO»)', () => {
    expect(strutturaCucina.filter((v) => v.kind === 'qty').every((v) => v.unita !== null)).toBe(true)
    expect(strutturaCucina.filter((v) => v.kind !== 'qty').every((v) => v.unita === null)).toBe(true)
  })
})

describe('componiCatalogoCucina — struttura del codice + prezzi del listino', () => {
  it('ogni voce prezzata dal listino entra col suo prezzo; casse e ante dal codice', () => {
    const c = componiCatalogoCucina(listinoCucinaFinto)
    expect(c.voci).toHaveLength(56)
    const prezzoLed = listinoCucinaFinto.prezzi.find((p) => p.id === 'striscia-led')?.prezzo
    expect(c.voci.find((v) => v.id === 'striscia-led')).toMatchObject({ kind: 'qty', unita: 'ML', prezzo: prezzoLed })
    expect(c.voci.find((v) => v.id === 'ante')).toMatchObject({ kind: 'moltiplicatore', percentuale: 0.2 })
  })

  it('una voce che il listino non prezza resta fuori; i moltiplicatori ci sono comunque', () => {
    const c = componiCatalogoCucina({ prezzi: [{ id: 'striscia-led', prezzo: 9 }], giornoRate: null })
    expect(c.voci.map((v) => v.id)).toEqual(['casse', 'ante', 'striscia-led'])
  })

  it('la tariffa dei giorni viene dal listino, anche quando manca', () => {
    expect(componiCatalogoCucina(listinoCucinaFinto).giornoRate).toBe(listinoCucinaFinto.giornoRate)
    expect(componiCatalogoCucina({ prezzi: [], giornoRate: null }).giornoRate).toBeNull()
  })
})

describe('listino finto dei test (src/test-utils)', () => {
  it('prezza esattamente le voci a prezzo della struttura, nello stesso ordine', () => {
    const conPrezzo = catalogoSenzaPrezzi.filter((v) => v.kind !== 'moltiplicatore').map((v) => v.id)
    expect(listinoCucinaFinto.prezzi.map((p) => p.id)).toEqual(conPrezzo)
  })
})
