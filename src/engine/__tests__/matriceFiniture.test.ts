import { describe, it, expect } from 'vitest'
import {
  chiaveMatrice,
  elementoDaMatrice,
  esterniMatrice,
  interniMatrice,
  prezzoDaMatrice,
  righeMatrice,
  tipiMatrice,
} from '@/engine/matriceFiniture'
import type { RigaMatrice } from '@/types/sumisura'

// Matrice finta, prezzi finti non tondi: nessun prezzo del listino vero.
const riga = (tipo: string, interno: string, esterno: string, prezzo: number, unita: RigaMatrice['unita'] = 'MQ'): RigaMatrice => ({
  tipo, interno, esterno, prezzo, unita, cella: 'FINITURE!A1',
})
const MATRICE: RigaMatrice[] = [
  riga('MOBILE A GIORNO', 'LACCATO OPACO', 'LACCATO OPACO', 413),
  riga('ARMADIO CON ANTE', 'LAMINATO BIANCO', 'LACCATO OPACO', 523),
  riga('ARMADIO CON ANTE', 'LAMINATO ABET-LAMICOLOR', 'LACCATO OPACO', 637),
  riga('ARMADIO CON ANTE', 'LAMINATO ABET – LAMICOLOR', 'ESSENZA', 743),
  riga('TELAIO CON ANTE', '', 'LACCATO OPACO', 853),
  riga('MENSOLE A MURO', '', 'LAMINATO', 57, 'ML'),
]

describe('prezzoDaMatrice (L20)', () => {
  it('tre combinazioni, ognuna col suo prezzo; maiuscole, spazi e trattini non contano', () => {
    expect(prezzoDaMatrice(MATRICE, 'MOBILE A GIORNO', 'LACCATO OPACO', 'LACCATO OPACO')).toBe(413)
    expect(prezzoDaMatrice(MATRICE, 'Armadio con ante', 'laminato bianco', 'laccato opaco')).toBe(523)
    expect(prezzoDaMatrice(MATRICE, 'ARMADIO CON ANTE', 'LAMINATO ABET - LAMICOLOR', 'ESSENZA')).toBe(743)
  })

  it('interno vuoto nella matrice vale «qualsiasi interno»', () => {
    expect(prezzoDaMatrice(MATRICE, 'TELAIO CON ANTE', '', 'LACCATO OPACO')).toBe(853)
    expect(prezzoDaMatrice(MATRICE, 'TELAIO CON ANTE', 'LAMINATO BIANCO', 'LACCATO OPACO')).toBe(853)
  })

  it('combinazione assente: null («da definire»), mai 0', () => {
    expect(prezzoDaMatrice(MATRICE, 'MOBILE A GIORNO', 'LACCATO OPACO', 'ESSENZA')).toBeNull()
    expect(prezzoDaMatrice(MATRICE, 'ARMADIO CON ANTE', 'LACCATO OPACO', 'LACCATO OPACO')).toBeNull()
    expect(prezzoDaMatrice([], 'TELAIO CON ANTE', '', 'LACCATO OPACO')).toBeNull()
  })
})

describe('la scelta a cascata: tipo → interno → esterno (L20)', () => {
  it('tipi e interni distinti, con la prima grafia del file; un tipo «qualsiasi interno» non ne ha', () => {
    expect(tipiMatrice(MATRICE)).toEqual(['MOBILE A GIORNO', 'ARMADIO CON ANTE', 'TELAIO CON ANTE', 'MENSOLE A MURO'])
    expect(interniMatrice(MATRICE, 'ARMADIO CON ANTE')).toEqual(['LAMINATO BIANCO', 'LAMINATO ABET-LAMICOLOR'])
    expect(interniMatrice(MATRICE, 'TELAIO CON ANTE')).toEqual([])
  })

  it('gli esterni sono solo quelli che esistono con quell interno', () => {
    expect(esterniMatrice(MATRICE, 'ARMADIO CON ANTE', 'LAMINATO BIANCO')).toEqual(['LACCATO OPACO'])
    expect(esterniMatrice(MATRICE, 'ARMADIO CON ANTE', 'LAMINATO ABET-LAMICOLOR')).toEqual(['LACCATO OPACO', 'ESSENZA'])
    expect(esterniMatrice(MATRICE, 'MENSOLE A MURO', '')).toEqual(['LAMINATO'])
  })

  it('chiaveMatrice e righeMatrice', () => {
    expect(chiaveMatrice(' Laminato  ABET –LAMICOLOR ')).toBe(chiaveMatrice('LAMINATO ABET-LAMICOLOR'))
    expect(chiaveMatrice('ESSENZA ROVERE/PORO APERTO')).not.toBe(chiaveMatrice('ESSENZA ROVERE-PORO APERTO'))
    expect(righeMatrice([{ matrice: MATRICE.slice(0, 1) }, {}, { matrice: MATRICE.slice(1, 2) }])).toEqual(MATRICE.slice(0, 2))
  })
})

// C7 (revisione L15-L21): un tipo misto (interni specifici e una riga «qualsiasi
// interno»). Scelto un interno specifico con un esterno che c'è solo nella riga
// generica, il prezzo è quello generico ma l'interno scelto resta: l'elemento
// si riapre com'era. Prezzi finti.
describe('elementoDaMatrice su un tipo misto (C7)', () => {
  const MISTA: RigaMatrice[] = [
    riga('BOISERIE', 'LAMINATO BIANCO', 'LACCATO OPACO', 431),
    riga('BOISERIE', '', 'ROVERE', 389),
  ]
  it('tiene l’interno scelto, col prezzo della riga generica', () => {
    const el = elementoDaMatrice(MISTA, { tipo: 'BOISERIE', interno: 'LAMINATO BIANCO', esterno: 'ROVERE' })
    expect(el?.prezzoUnitario).toBe(389)
    expect(el?.combinazione).toEqual({ tipo: 'BOISERIE', interno: 'LAMINATO BIANCO', esterno: 'ROVERE' })
    expect(esterniMatrice(MISTA, 'BOISERIE', 'LAMINATO BIANCO')).toContain('ROVERE')
  })
})
