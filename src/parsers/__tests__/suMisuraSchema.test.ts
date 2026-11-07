import { describe, it, expect } from 'vitest'
import { validaListinoSuMisura } from '@/parsers/suMisuraSchema'
import type { ListinoSuMisura } from '@/types/sumisura'

function listino(voci: Array<Partial<ListinoSuMisura['fogli'][0]['voci'][0]>>): ListinoSuMisura {
  return {
    fogli: [
      {
        nome: 'ANTE',
        nota: 'maggiorazione 20% sotto i 3 mq',
        voci: voci as ListinoSuMisura['fogli'][0]['voci'],
      },
    ],
    aggiornato: 'test.xlsx',
  }
}

const voceOk = { descrizione: 'Anta laccata', prezzoUnitario: 450, unitaMisura: 'MQ' as const }

describe('validaListinoSuMisura — listini validi', () => {
  it('listino normale: ok', () => {
    expect(validaListinoSuMisura(listino([voceOk])).ok).toBe(true)
  })

  it('quota progettazione (prezzo 0.08, UM VALORE): ok — è un moltiplicatore, non un prezzo', () => {
    const l = listino([voceOk, { descrizione: 'Quota progettazione', prezzoUnitario: 0.08, unitaMisura: 'VALORE' }])
    expect(validaListinoSuMisura(l).ok).toBe(true)
  })

  it('reti letto (prezzoCliente presente): ok', () => {
    const l = listino([{ descrizione: 'Rete 160', prezzoUnitario: 200, unitaMisura: 'PEZZO', prezzoCliente: 320 }])
    expect(validaListinoSuMisura(l).ok).toBe(true)
  })

  it('una voce a prezzo 0 in mezzo a voci valide: ok — è un caso legittimo', () => {
    const l = listino([voceOk, { descrizione: 'Omaggio', prezzoUnitario: 0, unitaMisura: 'PEZZO' }])
    expect(validaListinoSuMisura(l).ok).toBe(true)
  })
})

describe('validaListinoSuMisura — E4: quello che prima entrava in silenzio', () => {
  it('COLONNA PREZZI SPOSTATA su una colonna di zeri: RIFIUTATO', () => {
    // Il caso reale: l'header è FINITURA | PREZZO | U.MISURA | QUANTITA | TOTALE.
    // Se le colonne si spostano e al posto di PREZZO finisce TOTALE di un
    // preventivo non compilato, il parser legge zeri — con descrizione e UM
    // perfettamente validi. Prima passava: l'app mostrava € 0,00 su tutto senza
    // dire niente. È il "prezzi sbagliati in silenzio" dell'audit.
    const l = listino([
      { descrizione: 'Anta laccata', prezzoUnitario: 0, unitaMisura: 'MQ' },
      { descrizione: 'Cassetto', prezzoUnitario: 0, unitaMisura: 'PEZZO' },
    ])
    const esito = validaListinoSuMisura(l)
    expect(esito.ok).toBe(false)
    expect(esito.ok === false && esito.errore).toMatch(/colonna dei prezzi sembra spostata/i)
  })

  it('colonna SCONTI letta come prezzo (negativi): RIFIUTATO', () => {
    const l = listino([{ descrizione: 'Anta laccata', prezzoUnitario: -0.15, unitaMisura: 'MQ' }])
    const esito = validaListinoSuMisura(l)
    expect(esito.ok).toBe(false)
    expect(esito.ok === false && esito.errore).toMatch(/negativo/i)
  })

  it('nessun foglio: RIFIUTATO (era l unico controllo che esisteva)', () => {
    const esito = validaListinoSuMisura({ fogli: [], aggiornato: 'x' })
    expect(esito.ok).toBe(false)
    expect(esito.ok === false && esito.errore).toMatch(/non contiene fogli/i)
  })

  it('voci senza descrizione: RIFIUTATO', () => {
    const l = listino([voceOk, { descrizione: '', prezzoUnitario: 100, unitaMisura: 'MQ' }])
    const esito = validaListinoSuMisura(l)
    expect(esito.ok).toBe(false)
    expect(esito.ok === false && esito.errore).toMatch(/senza descrizione/i)
  })

  it('unità di misura fuori dall enum: RIFIUTATO', () => {
    const l = listino([{ descrizione: 'Anta', prezzoUnitario: 100, unitaMisura: 'KG' as never }])
    const esito = validaListinoSuMisura(l)
    expect(esito.ok).toBe(false)
    expect(esito.ok === false && esito.errore).toMatch(/unità di misura/i)
  })

  it('il messaggio elenca PIÙ problemi insieme, non solo il primo', () => {
    const l = listino([{ descrizione: '', prezzoUnitario: -1, unitaMisura: 'KG' as never }])
    const esito = validaListinoSuMisura(l)
    expect(esito.ok).toBe(false)
    const errore = esito.ok === false ? esito.errore : ''
    expect(errore.split(';').length).toBeGreaterThan(1)
  })
})

describe('validaListinoSuMisura — la matrice FINITURE (L20)', () => {
  type Riga = NonNullable<ListinoSuMisura['fogli'][0]['matrice']>[0]
  const riga = (cella: string, r: Partial<Riga> = {}): Riga => ({
    tipo: 'ARMADIO', interno: 'LAMINATO', esterno: 'LACCATO', prezzo: 523, unita: 'MQ', cella, ...r,
  })
  const conMatrice = (matrice: Riga[], voci: ListinoSuMisura['fogli'][0]['voci'] = []): ListinoSuMisura => ({
    fogli: [{ nome: 'FINITURE', nota: '', voci, matrice }],
    aggiornato: 'test.xlsx',
  })
  const errore = (l: ListinoSuMisura) => {
    const esito = validaListinoSuMisura(l)
    return esito.ok ? '' : esito.errore
  }

  it('una matrice valida passa, anche in un foglio senza voci standard', () => {
    const l = conMatrice([riga('FINITURE!A4'), riga('FINITURE!A5', { interno: '', esterno: 'LAMINATO', unita: 'ML' })])
    expect(validaListinoSuMisura(l)).toEqual({ ok: true })
  })

  it('prezzo zero, negativo o non numerico: bloccante, con la cella', () => {
    const l = conMatrice([
      riga('FINITURE!A4', { prezzo: 0 }),
      riga('FINITURE!A5', { esterno: 'ESSENZA', prezzo: -10 }),
      riga('FINITURE!A6', { esterno: 'METALLO', prezzo: Number.NaN }),
    ])
    expect(errore(l)).toBe(
      ['A4', 'A5', 'A6'].map((c) => `FINITURE!${c}: prezzo della combinazione non valido (serve un numero maggiore di zero)`).join('; ')
    )
  })

  it('unità fuori da MQ, ML, PEZZO (anche VALORE): bloccante, con la cella', () => {
    const l = conMatrice([riga('FINITURE!A4', { unita: 'VALORE' as never }), riga('FINITURE!A5', { esterno: 'ESSENZA', unita: '' as never })])
    expect(errore(l)).toBe(
      'FINITURE!A4: unità «VALORE» non ammessa nella matrice (MQ, ML o PEZZO); ' +
        'FINITURE!A5: unità «vuota» non ammessa nella matrice (MQ, ML o PEZZO)'
    )
  })

  it('combinazione doppia, anche scritta con un altro trattino: bloccante, cita le due celle', () => {
    const l = conMatrice([
      riga('FINITURE!A4', { interno: 'LAMINATO ABET-LAMICOLOR' }),
      riga('FINITURE!A9', { interno: 'Laminato abet – lamicolor', prezzo: 937 }),
    ])
    expect(errore(l)).toBe('FINITURE!A9: combinazione doppia, è già in FINITURE!A4')
  })
})
