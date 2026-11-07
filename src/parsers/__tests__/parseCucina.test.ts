import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { parseCucina } from '@/parsers/parseCucina'
import type { VoceStrutturaCucina } from '@/types/cucina'

// Workbook SINTETICI, prezzi inventati: il listino vero è una fixture gitignorata
// (golden in parsers.golden.test.ts). La struttura qui è un sottoinsieme di quella
// vera, con le stesse forme: una voce a pezzo, una a ml, un toggle, un moltiplicatore.
const STRUTTURA: VoceStrutturaCucina[] = [
  { id: 'base-pensile-laminato', nome: 'BASE\\PENSILE LAMINATO', blocco: 'base', kind: 'qty', unita: 'PEZZO' },
  { id: 'colonna-210-laminato', nome: 'COLONNA  210 LAMINATO', blocco: 'base', kind: 'qty', unita: 'PEZZO' },
  { id: 'casse', nome: 'CASSE IN LAMINATO A SCELTA ABET/LAMICOLOR', blocco: 'base', kind: 'moltiplicatore', unita: null },
  { id: 'striscia-led', nome: 'STRISCIA LED (al ml)', blocco: 'opzionali', kind: 'qty', unita: 'ML' },
  { id: 'isola-laminato-fuorimisura', nome: 'ISOLA LAMINATO FUORIMISURA', blocco: 'open', kind: 'toggleFisso', unita: null },
]

const TOGGLE = '1VERO 0FALSO'
const INTESTAZIONE = ['', 'PREZZO UNITARIO', "UNITA'", "QUANTITA'", 'TOTALE']

/** Le righe dati, dalla riga 4. Default: un listino completo e corretto. */
function righeDati(): unknown[][] {
  return [
    ['BASE\\PENSILE LAMINATO', 111, 'PEZZO', 0],
    ['COLONNA  210 LAMINATO', 222, 'PEZZO', 0],
    ['PRIMO TOTALE', '', '', ''],
    ['CASSE IN LAMINATO A SCELTA ABET/LAMICOLOR', 0.1, TOGGLE, 0],
    ['STRISCIA LED (al ml)', 33, 'ML', 0],
    ['ISOLA LAMINATO FUORIMISURA', 444, TOGGLE, 0],
    ['VASCA INTEGRATA IN GRES', 555, 'PEZZO'],
    ['GIORNI EXTRA REALIZZAZIONE', 66, 'GIORNO', 0],
    ['TOTALE CUCINA', '', '', ''],
    ['PROGETTAZIONE ', 0.1, ''],
    ['ADEGUAMENTO PREZZI', 0.2, ''],
    ['EXTRA LEGNO EXTRA FINITURA / VARIE ', 777, 'VALORE VARIABILE ', 0],
    ['IVA', 0.22, ''],
  ]
}

function workbook(dati: unknown[][] = righeDati(), opts: { foglio?: string; intestazione?: unknown[]; senzaTitolo?: boolean } = {}) {
  const ws = XLSX.utils.aoa_to_sheet([opts.senzaTitolo ? [] : ['PROSPETTO CUCINA'], opts.intestazione ?? INTESTAZIONE, [], ...dati])
  // Un foglio con la riga 1 vuota: il range (`!ref`) parte dalla riga 2, come
  // lo salva Excel. `aoa_to_sheet` lo farebbe partire comunque da A1.
  if (opts.senzaTitolo) ws['!ref'] = ws['!ref']!.replace(/^A1:/, 'A2:')
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, opts.foglio ?? 'CUCINA')
  return wb
}

/** Le righe dati con una sostituita (indice 0 = riga 4 del foglio). */
function con(indice: number, riga: unknown[]): unknown[][] {
  const d = righeDati()
  d[indice] = riga
  return d
}

describe('parseCucina — lettura per nome, colonna B', () => {
  it('caso felice: prezzi per id, percentuali, vasca e tariffa dei giorni', () => {
    const l = parseCucina(workbook(), STRUTTURA)
    expect(l.prezzi).toEqual([
      { id: 'base-pensile-laminato', prezzo: 111 },
      { id: 'colonna-210-laminato', prezzo: 222 },
      { id: 'striscia-led', prezzo: 33 },
      { id: 'isola-laminato-fuorimisura', prezzo: 444 },
    ])
    expect(l.percentuali).toEqual({ casse: 0.1, ante: null, progettazione: 0.1, adeguamento: 0.2 })
    expect(l.vascaGres).toBe(555)
    expect(l.giornoRate).toBe(66)
    expect(l.vociMancanti).toEqual([])
    // Titoli, totali, IVA ed extra non sono righe sconosciute.
    expect(l.righeSconosciute).toEqual([])
  })

  it('i nomi si abbinano dopo normLabel: maiuscole, spazi doppi e in coda non contano', () => {
    const l = parseCucina(workbook(con(1, ['colonna 210 laminato ', 222, 'pezzo', 0])), STRUTTURA)
    expect(l.prezzi.find((p) => p.id === 'colonna-210-laminato')?.prezzo).toBe(222)
  })

  it('una riga con un valore che l app non conosce: avviso, non errore', () => {
    const l = parseCucina(workbook([...righeDati(), ['VOCE NUOVA DI ANTONIO', 99, 'PEZZO', 0]]), STRUTTURA)
    expect(l.righeSconosciute).toEqual(['VOCE NUOVA DI ANTONIO'])
  })

  it('una voce della struttura assente dal file: elencata fra le mancanti', () => {
    const d = righeDati().filter((r) => r[0] !== 'STRISCIA LED (al ml)')
    expect(parseCucina(workbook(d), STRUTTURA).vociMancanti).toEqual(['striscia-led'])
  })

  it('vasca e giorni assenti: null, il file resta valido', () => {
    const d = righeDati().filter((r) => r[0] !== 'VASCA INTEGRATA IN GRES' && r[0] !== 'GIORNI EXTRA REALIZZAZIONE')
    const l = parseCucina(workbook(d), STRUTTURA)
    expect(l.vascaGres).toBeNull()
    expect(l.giornoRate).toBeNull()
  })

  it('senza la riga del titolo il range parte dalla riga 2: le righe restano quelle di Excel', () => {
    const l = parseCucina(workbook(righeDati(), { senzaTitolo: true }), STRUTTURA)
    expect(l.prezzi).toHaveLength(4)
    expect(() => parseCucina(workbook(con(0, ['BASE\\PENSILE LAMINATO', 'x', 'PEZZO']), { senzaTitolo: true }), STRUTTURA)).toThrow(
      'CUCINA!B4'
    )
  })
})

describe('parseCucina — errori bloccanti, con foglio, riga e colonna', () => {
  it('foglio CUCINA assente', () => {
    expect(() => parseCucina(workbook(righeDati(), { foglio: 'Foglio1' }), STRUTTURA)).toThrow('Foglio CUCINA non trovato')
  })

  it('intestazione B2 diversa da «PREZZO UNITARIO»', () => {
    const intestazione = ['', 'PREZZO', "UNITA'"]
    expect(() => parseCucina(workbook(righeDati(), { intestazione }), STRUTTURA)).toThrow(
      /riga 2, colonna B: intestazione attesa «PREZZO UNITARIO», trovata «prezzo»/
    )
  })

  it('intestazione C2 diversa da «UNITA\'»', () => {
    const intestazione = ['', 'PREZZO UNITARIO', 'QUANTITA']
    expect(() => parseCucina(workbook(righeDati(), { intestazione }), STRUTTURA)).toThrow(/riga 2, colonna C/)
  })

  it('prezzo non numerico: dice la cella', () => {
    expect(() => parseCucina(workbook(con(1, ['COLONNA  210 LAMINATO', 'a richiesta', 'PEZZO'])), STRUTTURA)).toThrow(
      /CUCINA!B5: valore non valido per «COLONNA {2}210 LAMINATO» \(a richiesta\)/
    )
  })

  it('prezzo negativo o vuoto', () => {
    expect(() => parseCucina(workbook(con(0, ['BASE\\PENSILE LAMINATO', -1, 'PEZZO'])), STRUTTURA)).toThrow('CUCINA!B4')
    expect(() => parseCucina(workbook(con(0, ['BASE\\PENSILE LAMINATO', '', 'PEZZO'])), STRUTTURA)).toThrow(/CUCINA!B4.*vuoto/)
  })

  it('unità diversa da quella della struttura (decisione: errore bloccante)', () => {
    expect(() => parseCucina(workbook(con(4, ['STRISCIA LED (al ml)', 33, 'PEZZO'])), STRUTTURA)).toThrow(
      /CUCINA!C8: unità «PEZZO» per «STRISCIA LED \(al ml\)», attesa «ML»/
    )
  })

  it('toggle o moltiplicatore senza «1VERO 0FALSO»', () => {
    expect(() => parseCucina(workbook(con(5, ['ISOLA LAMINATO FUORIMISURA', 444, 'PEZZO'])), STRUTTURA)).toThrow(
      /CUCINA!C9.*attesa «1VERO 0FALSO»/
    )
    expect(() => parseCucina(workbook(con(3, ['CASSE IN LAMINATO A SCELTA ABET/LAMICOLOR', 0.1, ''])), STRUTTURA)).toThrow(
      'CUCINA!C7'
    )
  })

  it('una voce due volte: il prezzo sarebbe ambiguo', () => {
    const d = [...righeDati(), ['BASE\\PENSILE LAMINATO', 112, 'PEZZO']]
    expect(() => parseCucina(workbook(d), STRUTTURA)).toThrow(/compare due volte \(righe 4 e 17\)/)
  })

  it('nessuna voce della struttura: non è il listino cucine', () => {
    expect(() => parseCucina(workbook([['ALTRO', 1, 'PEZZO']]), STRUTTURA)).toThrow(/non sembra il listino cucine/)
  })

  it('valore non valido anche su vasca e giorni, se la riga c è', () => {
    expect(() => parseCucina(workbook(con(6, ['VASCA INTEGRATA IN GRES', 'da vedere', 'PEZZO'])), STRUTTURA)).toThrow(
      'CUCINA!B10'
    )
  })
})
