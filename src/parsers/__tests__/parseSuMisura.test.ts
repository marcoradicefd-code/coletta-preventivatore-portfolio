import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { parseSuMisura, INTESTAZIONE_FINITURE } from '@/parsers/parseSuMisura'
import { FINITURE_FINTE, ACCESSORI_FINTI } from '@/test-utils/finitureFinte'

// Workbook sintetici (niente fixture reali) per testare la robustezza del parser
// Su Misura su edge case: fogli vuoti, righe non valide, varianti di foglio.
function makeWorkbook(sheets: Record<string, unknown[][]>): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()
  for (const [name, aoa] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name)
  }
  return wb
}

describe('parseSuMisura — foglio standard', () => {
  it('estrae le voci valide e scarta righe senza prezzo / UM ignota / TOTALE', () => {
    const wb = makeWorkbook({
      MENSOLE: [
        ['MENSOLE'],
        ['Regola 3mq: maggiorazione +20%'],
        ['FINITURA', 'PREZZO', 'U.MISURA', 'QUANTITA', 'TOTALE'],
        ['Mensola laccata', 150, 'MQ'],
        ['Riga senza prezzo', '', 'MQ'],
        ['UM non riconosciuta', 50, 'XYZ'],
        ['TOTALE', 999, 'MQ'],
        ['Quota progettazione', 0.08, 'VALORE'],
      ],
    })

    const listino = parseSuMisura(wb)
    expect(listino.fogli).toHaveLength(1)
    const f = listino.fogli[0]
    expect(f.nome).toBe('MENSOLE')
    expect(f.nota).toMatch(/Regola 3mq/)
    expect(f.voci.map((v) => v.descrizione)).toEqual([
      'Mensola laccata',
      'Quota progettazione',
    ])
    expect(f.voci[0].unitaMisura).toBe('MQ')
    expect(f.voci[0].prezzoUnitario).toBe(150)
    // VALORE con prezzo < 1 → marcata come quota progettazione
    expect(f.voci[1].isProgrammazione).toBe(true)
  })

  it('normalizza la UM ripulendo i caratteri non alfabetici (M.Q. → MQ)', () => {
    const wb = makeWorkbook({
      F: [
        ['T'],
        ['nota'],
        ['FINITURA', 'PREZZO', 'U.MISURA'],
        ['Voce ml', 12, 'M.L.'],
      ],
    })
    const f = parseSuMisura(wb).fogli[0]
    expect(f.voci[0].unitaMisura).toBe('ML')
  })
})

describe('parseSuMisura — variante RETI LETTO', () => {
  it('usa header diverso: prezzo fornitore + prezzo cliente', () => {
    const wb = makeWorkbook({
      'RETI LETTO DEBERNARDIS': [
        ['RETE LETTO', 'PREZZO', 'CLIENTE'],
        ['Rete singola', 100, 130],
        ['Senza prezzo cliente', 100, ''],
      ],
    })
    const f = parseSuMisura(wb).fogli[0]
    expect(f.voci).toHaveLength(1)
    expect(f.voci[0].descrizione).toBe('Rete singola')
    expect(f.voci[0].unitaMisura).toBe('PEZZO')
    expect(f.voci[0].prezzoUnitario).toBe(100)
    expect(f.voci[0].prezzoCliente).toBe(130)
  })
})

describe('parseSuMisura — robustezza', () => {
  it('workbook vuoto → nessun foglio', () => {
    expect(parseSuMisura(makeWorkbook({})).fogli).toEqual([])
  })

  it('esclude i fogli che non producono voci', () => {
    const wb = makeWorkbook({
      VUOTO: [['Titolo'], ['nota'], ['FINITURA', 'PREZZO', 'U.MISURA']],
    })
    expect(parseSuMisura(wb).fogli).toHaveLength(0)
  })

  it('imposta sempre un timestamp aggiornato', () => {
    expect(parseSuMisura(makeWorkbook({})).aggiornato).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})

describe('parseSuMisura — intestazione letta per etichetta (O7)', () => {
  const descrizioni = (wb: XLSX.WorkBook) => parseSuMisura(wb).fogli.flatMap((f) => f.voci.map((v) => v.descrizione))

  it("le due generazioni di etichette («PREZZO UNITARIO»/«UNITA'» e «PREZZO»/«U.MISURA») danno le stesse voci, e senza fogli non letti la chiave avvisi non c'è", () => {
    const voci = [
      ['Anta laccata', 150, 'MQ'],
      ['Zoccolo', 12, 'ML'],
    ]
    const vecchia = parseSuMisura(makeWorkbook({ A: [['TITOLO'], ['', 'PREZZO UNITARIO', "UNITA'", "QUANTITA'", 'TOTALE'], [], ...voci] }))
    const nuova = parseSuMisura(makeWorkbook({ A: [['TITOLO'], ['nota'], ['FINITURA', 'PREZZO', 'U.MISURA'], ...voci] }))
    expect(vecchia.fogli[0].voci).toEqual(nuova.fogli[0].voci)
    expect(nuova.fogli[0].voci.map((v) => [v.descrizione, v.prezzoUnitario, v.unitaMisura])).toEqual([
      ['Anta laccata', 150, 'MQ'],
      ['Zoccolo', 12, 'ML'],
    ])
    expect('avvisi' in vecchia).toBe(false)
    expect('avvisi' in nuova).toBe(false)
  })

  it("la prima voce non si perde se manca la riga vuota sotto l'intestazione", () => {
    const wb = makeWorkbook({ A: [['TITOLO'], ['FINITURA', 'PREZZO', 'U.MISURA'], ['Prima voce', 10, 'MQ'], ['Seconda voce', 20, 'MQ']] })
    expect(descrizioni(wb)).toEqual(['Prima voce', 'Seconda voce'])
  })

  it('la prima voce non si perde se la riga del titolo è vuota e il foglio parte da A2', () => {
    const wb = XLSX.utils.book_new()
    const aoa = [['FINITURA', 'PREZZO', 'U.MISURA'], ['Prima voce', 10, 'MQ'], ['Seconda voce', 20, 'MQ'], ['Terza voce', 30, 'MQ']]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.sheet_add_aoa(XLSX.utils.aoa_to_sheet([]), aoa, { origin: 'A2' }), 'A')
    expect(descrizioni(wb)).toEqual(['Prima voce', 'Seconda voce', 'Terza voce'])
  })

  it("una colonna inserita prima del prezzo non sposta i prezzi: si leggono dalla colonna dell'etichetta", () => {
    const wb = makeWorkbook({
      A: [['TITOLO'], ['nota'], ['FINITURA', 'PREZZO FORNITORE', 'PREZZO', 'U.MISURA'], ['Anta', 90, 150, 'MQ'], ['Zoccolo', 7, 12, 'ML']],
    })
    const voci = parseSuMisura(wb).fogli[0]?.voci ?? []
    expect(voci.map((v) => [v.descrizione, v.prezzoUnitario, v.unitaMisura])).toEqual([
      ['Anta', 150, 'MQ'],
      ['Zoccolo', 12, 'ML'],
    ])
  })

  it('foglio senza intestazione riconoscibile: non letto e segnalato in avvisi, gli altri fogli restano', () => {
    const wb = makeWorkbook({
      'SU MISURA': [['TITOLO'], ['nota'], ['FINITURA', 'PREZZO', 'U.MISURA'], ['Anta', 150, 'MQ']],
      ALTRO: [['DESCRIZIONE', 'COSTO', 'UM'], ['Anta', 150, 'MQ']],
    })
    const listino = parseSuMisura(wb)
    expect(listino.fogli.map((f) => f.nome)).toEqual(['SU MISURA'])
    expect(listino.avvisi).toEqual([
      "Foglio \"ALTRO\" non letto: intestazione non trovata. Servono «PREZZO UNITARIO» e «UNITA'», oppure «PREZZO» e «U.MISURA».",
    ])
  })
})

describe('parseSuMisura — foglio FINITURE riconosciuto per intestazione (L20)', () => {
  it('le righe della matrice non diventano voci standard: restano la lavorazione e la quota progettazione', () => {
    const f = parseSuMisura(makeWorkbook({ FINITURE: FINITURE_FINTE })).fogli[0]
    expect(f.nome).toBe('FINITURE')
    // Letto come foglio standard (PREZZO/U.MISURA) il tipo in colonna 0 era la
    // descrizione di ogni riga, e la quota con la colonna 0 vuota spariva.
    expect(f.voci.map((v) => [v.descrizione, v.unitaMisura])).toEqual([
      ['LAVORAZIONE MILLERIGHI (MIN 1MQ)', 'MQ'],
      ['QUOTA PROGETTAZIONE', 'VALORE'],
    ])
    expect(f.voci[1].isProgrammazione).toBe(true)
    expect(f.nota).toBe('PREZZI DI PROVA. PER MOBILI CON PROFONDITA MINORE DI 40CM RIDUZIONE DEL 10%')
  })

  it('INTESTAZIONE_FINITURE è fissata coi letterali', () => {
    expect(INTESTAZIONE_FINITURE).toEqual(['TIPO ARREDO', 'INTERNO', 'ESTERNO', 'PREZZO', 'U.MISURA'])
  })

  it('ACCESSORI resta un foglio standard, con «ACCESSORI» in colonna 0', () => {
    const f = parseSuMisura(makeWorkbook({ ACCESSORI: ACCESSORI_FINTI })).fogli[0]
    expect(f.voci.map((v) => [v.descrizione, v.prezzoUnitario, v.unitaMisura])).toEqual([
      ['ILLUMINAZIONE LED', 27, 'ML'],
      ['CASSETTO', 97, 'PEZZO'],
    ])
  })
})

describe('parseSuMisura — la matrice FINITURE (L20)', () => {
  const finiture = (aoa: unknown[][] = FINITURE_FINTE) => parseSuMisura(makeWorkbook({ FINITURE: aoa }))

  it('esce la matrice { tipo, interno, esterno, prezzo, unita } con la cella del tipo; interno vuoto vale «qualsiasi»', () => {
    const matrice = finiture().fogli[0].matrice ?? []
    expect(matrice).toHaveLength(7)
    expect(matrice[0]).toEqual({
      tipo: 'MOBILE A GIORNO', interno: 'LACCATO OPACO', esterno: 'LACCATO OPACO', prezzo: 413, unita: 'MQ', cella: 'FINITURE!A4',
    })
    expect(matrice.find((r) => r.tipo === 'TELAIO CON ANTE')).toMatchObject({ interno: '', esterno: 'LACCATO OPACO', cella: 'FINITURE!A9' })
    expect(matrice.find((r) => r.tipo === 'MENSOLE A MURO')).toMatchObject({ interno: '', prezzo: 57, unita: 'ML' })
  })

  it('le grafie diverse della stessa finitura sono un avviso, non un errore', () => {
    expect(finiture().avvisi).toEqual([
      'Foglio "FINITURE", colonna INTERNO: grafie diverse lette come la stessa finitura: «LAMINATO ABET-LAMICOLOR», «LAMINATO ABET – LAMICOLOR».',
    ])
  })

  it('prezzo non numerico e unità sconosciuta restano nella matrice come sono: li ferma lo schema', () => {
    const [r] = finiture([FINITURE_FINTE[2], ['ARMADIO', 'LAMINATO', 'LACCATO', 'su richiesta', 'CAD']]).fogli[0].matrice!
    expect(r.prezzo).toBeNaN()
    expect(r.unita).toBe('CAD')
  })

  it('intestazione della matrice senza combinazioni: avviso; un foglio di sole combinazioni resta', () => {
    const vuota = finiture([FINITURE_FINTE[2], ['LAVORAZIONE', '', '', 109, 'MQ']])
    expect(vuota.fogli[0].matrice).toEqual([])
    expect(vuota.avvisi).toEqual(['Foglio "FINITURE": intestazione della matrice trovata, ma nessuna combinazione letta.'])
    const sole = finiture([FINITURE_FINTE[2], ['ARMADIO', '', 'LACCATO', 109, 'MQ']])
    expect(sole.fogli.map((f) => [f.nome, f.voci.length, f.matrice?.length])).toEqual([['FINITURE', 0, 1]])
  })

  it('i fogli standard non hanno la chiave matrice', () => {
    const f = parseSuMisura(makeWorkbook({ ACCESSORI: ACCESSORI_FINTI })).fogli[0]
    expect('matrice' in f).toBe(false)
  })
})

describe('parseSuMisura — RETI LETTO letto per etichetta (O16)', () => {
  const reti = (aoa: unknown[][]) => parseSuMisura(makeWorkbook({ 'RETI LETTO DEBERNARDIS': aoa }))

  it('una colonna «PREZZO 2027» fra PREZZO e CLIENTE non cambia i prezzi cliente', () => {
    const voci = reti([
      ['RETE LETTO', 'PREZZO', 'PREZZO 2027', 'CLIENTE'],
      ['Rete singola', 100, 110, 130],
      ['Rete doppia', 200, 220, 260],
    ]).fogli[0]?.voci ?? []
    expect(voci.map((v) => [v.descrizione, v.prezzoUnitario, v.prezzoCliente])).toEqual([
      ['Rete singola', 100, 130],
      ['Rete doppia', 200, 260],
    ])
  })

  it('una colonna inserita prima di RETE LETTO non sposta le descrizioni', () => {
    const voci = reti([
      ['CODICE', 'RETE LETTO', 'PREZZO', 'CLIENTE'],
      ['R1', 'Rete singola', 100, 130],
    ]).fogli[0]?.voci ?? []
    expect(voci.map((v) => [v.descrizione, v.prezzoUnitario, v.prezzoCliente])).toEqual([['Rete singola', 100, 130]])
  })

  it('intestazione RETE LETTO / PREZZO / CLIENTE assente: foglio non letto e segnalato, mai letto per posizione', () => {
    const listino = reti([
      ['DESCRIZIONE', 'COSTO', 'VENDITA'],
      ['Rete singola', 100, 130],
    ])
    expect(listino.fogli).toEqual([])
    expect(listino.avvisi).toEqual([
      'Foglio "RETI LETTO DEBERNARDIS" non letto: intestazione non trovata. Servono «RETE LETTO», «PREZZO» e «CLIENTE».',
    ])
  })
})
