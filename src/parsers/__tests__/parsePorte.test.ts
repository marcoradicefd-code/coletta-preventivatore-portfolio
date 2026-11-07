import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { parsePorte } from '@/parsers/parsePorte'
import { validaListinoPorte } from '@/parsers/porteSchema'

// Workbook sintetici (nessun prezzo reale): pinnano header/indici e le insidie
// del .ods reale — rumore float, riga-spazzatura, modello senza PREZZO 1,
// optional numerici E testuali (1,2€/cm · +20% · campo vuoto).
function sheet(aoa: unknown[][]): XLSX.WorkSheet {
  return XLSX.utils.aoa_to_sheet(aoa)
}

function buildWorkbook(over: Partial<Record<string, unknown[][]>> = {}): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()
  const sheets: Record<string, unknown[][]> = {
    modello_porta: [
      ['MODELLO PORTA', 'PREZZO 1', 'PREZZO 2026', 'H>215', 'H>240', 'nota'],
      ['RAFFAELLA', 800, 880.0000000000001, 1060, 1150.0000000000002, ''], // rumore float
      ['', '', '', '', 6, ''], // riga-spazzatura (modello vuoto) → skip
      ['LINEA FILOMURO LACCATA', '', 570, 700, 750, ''], // senza PREZZO 1
    ],
    optional: [
      ['', "UNITA' DI MISURA", '', ''],
      ['STIPITI E MOSTRINE', 'PER OGNI PORTA', 150, ''],
      ['SPECCHIO TRADIZIONALE', 'MQ', 40, ''],
      ['PIVOT FRITSJURGENS', 'PEZZO', 1500, ''],
      ['BATTISCOPA MASSELLO', 'ML', '1,2€ PER OGNI CM DI ALTEZZA', ''],
      ['LAVORAZIONE EXTRA BATTISCOPA', '', '+20% RISPETTO AL PREZZO DEL BATTISCOPA', ''],
      ['IMPIALLACCIATA ALTRE ESSENZE', 'PER OGNI PORTA', 'CAMPO VUOTO DA INSERIRE MANUALMENTE', ''],
    ],
    ...over,
  }
  for (const [name, aoa] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, sheet(aoa), name)
  }
  return wb
}

describe('parsePorte — fogli mancanti', () => {
  it.each(['modello_porta', 'optional'])('throw se manca il foglio %s', (missing) => {
    const wb = XLSX.utils.book_new()
    for (const name of ['modello_porta', 'optional']) {
      if (name !== missing) XLSX.utils.book_append_sheet(wb, sheet([['h']]), name)
    }
    expect(() => parsePorte(wb)).toThrow(new RegExp(missing))
  })
})

describe('parsePorte — modello_porta', () => {
  it('legge i modelli per intestazione e SCARTA PREZZO 1 (colonna mai letta)', () => {
    const listino = parsePorte(buildWorkbook())
    const raffaella = listino.modelli.find((m) => m.nome === 'RAFFAELLA')!
    expect(raffaella).toBeDefined()
    expect(raffaella.prezzo2026).toBe(880)
    expect(raffaella.h215).toBe(1060)
    expect(raffaella.h240).toBe(1150)
    // ModelloPorta NON ha alcun campo prezzo1: la colonna 2024 è ignorata al parse.
    expect('prezzo1' in raffaella).toBe(false)
  })

  it('arrotonda il rumore float del .ods a 2 decimali', () => {
    const raffaella = parsePorte(buildWorkbook()).modelli.find((m) => m.nome === 'RAFFAELLA')!
    // 880.0000000000001 / 1150.0000000000002 → puliti.
    for (const v of [raffaella.prezzo2026, raffaella.h215, raffaella.h240]) {
      expect(v * 100).toBe(Math.round(v * 100))
    }
  })

  it('salta la riga-spazzatura (modello vuoto) e tiene il modello senza PREZZO 1', () => {
    const listino = parsePorte(buildWorkbook())
    // Solo RAFFAELLA + LINEA FILOMURO (la riga vuota con un 6 sparso è scartata).
    expect(listino.modelli).toHaveLength(2)
    const filomuro = listino.modelli.find((m) => m.nome === 'LINEA FILOMURO LACCATA')!
    expect(filomuro.prezzo2026).toBe(570) // PREZZO 1 assente, 2026 presente → OK
    expect(filomuro.h240).toBe(750)
  })
})

describe('parsePorte — modelli senza prezzo nella colonna dell anno', () => {
  const conModelli = (...righe: unknown[][]) =>
    buildWorkbook({ modello_porta: [['MODELLO PORTA', 'PREZZO 2027', 'H>215', 'H>240'], ...righe] })

  it('cella prezzo vuota: il modello non entra nel listino e l avviso lo nomina con la colonna', () => {
    const listino = parsePorte(conModelli(['RAFFAELLA', 900, 1060, 1150], ['MASACCIO', '', 1060, 1150]))
    expect(listino.modelli.map((m) => m.nome)).toEqual(['RAFFAELLA'])
    expect(listino.avvisi).toEqual([
      'Colonna «PREZZO 2027»: modelli senza prezzo, non caricati e non selezionabili nelle Porte (1): MASACCIO',
    ])
  })

  it('cella con testo conta come senza prezzo, la riga-spazzatura no, l elenco segue l ordine del foglio', () => {
    const listino = parsePorte(
      conModelli(
        ['DONATELLO', 'n.d.', 1060, 1150],
        ['RAFFAELLA', 900, 1060, 1150],
        ['', '', '', 6], // riga-spazzatura: nessun nome, nessun avviso
        ['MASACCIO', '', 1060, 1150]
      )
    )
    expect(listino.modelli.map((m) => m.nome)).toEqual(['RAFFAELLA'])
    expect(listino.avvisi).toEqual([
      'Colonna «PREZZO 2027»: modelli senza prezzo, non caricati e non selezionabili nelle Porte (2): DONATELLO, MASACCIO',
    ])
  })

  it('nessun modello senza prezzo: avvisi assente', () => {
    // Il workbook base ha una riga-spazzatura (nome vuoto): non conta.
    expect('avvisi' in parsePorte(buildWorkbook())).toBe(false)
  })
})

describe('parsePorte — optional (unità eterogenee)', () => {
  it('numerici: PORTA / MQ / PEZZO col loro prezzo', () => {
    const opt = parsePorte(buildWorkbook()).optional
    const byName = (n: string) => opt.find((o) => o.nome.startsWith(n))!
    expect(byName('STIPITI')).toMatchObject({ unita: 'PORTA', prezzo: 150 })
    expect(byName('SPECCHIO')).toMatchObject({ unita: 'MQ', prezzo: 40 })
    expect(byName('PIVOT')).toMatchObject({ unita: 'PEZZO', prezzo: 1500 })
  })

  it('battiscopa ML "1,2€ per ogni cm" → ML 1.2 (virgola IT)', () => {
    const batt = parsePorte(buildWorkbook()).optional.find((o) => o.nome.startsWith('BATTISCOPA'))!
    expect(batt).toMatchObject({ unita: 'ML', prezzo: 1.2 })
  })

  it('"+20% rispetto al battiscopa" → ML = ultimo rate ML × 1,2 = 1.44', () => {
    const extra = parsePorte(buildWorkbook()).optional.find((o) => o.nome.startsWith('LAVORAZIONE EXTRA'))!
    expect(extra).toMatchObject({ unita: 'ML', prezzo: 1.44 })
  })

  it('"campo vuoto da inserire manualmente" → MANUALE, prezzo null', () => {
    const man = parsePorte(buildWorkbook()).optional.find((o) => o.nome.startsWith('IMPIALLACCIATA'))!
    expect(man).toMatchObject({ unita: 'MANUALE', prezzo: null })
  })
})

describe('parsePorte — la percentuale del battiscopa', () => {
  // Presidio della regex di `pctM` (O37): passano anche con l'espressione di
  // prima, fissano che il lookbehind non cambia cosa si legge. Il caso del rumore
  // float è quello che i quantificatori limitati sbaglierebbero (leggono 4).
  // Battiscopa a 10 €/cm, finto.
  it.each([
    ['20 %', 'ML', 12],
    ['+15,5% sul battiscopa', 'ML', 11.55],
    ['1.5%', 'ML', 10.15],
    ['+30.000000000000004% sul battiscopa', 'ML', 13],
    ['nessuna percentuale', 'MANUALE', null],
  ])('«%s» → %s, prezzo %s', (testo, unita, prezzo) => {
    const wb = buildWorkbook({
      optional: [
        ['', "UNITA' DI MISURA", '', ''],
        ['BATTISCOPA FINTO', 'ML', '10€ PER OGNI CM DI ALTEZZA', ''],
        ['VARIANTE', '', testo, ''],
      ],
    })
    const variante = parsePorte(wb).optional.find((o) => o.nome === 'VARIANTE')!
    expect(variante).toMatchObject({ unita, prezzo })
  })
})

describe('parsePorte — E8: la colonna prezzo è PREZZO <anno>, non "PREZZO 2026" fisso', () => {
  /** Un `modello_porta` con le colonne prezzo passate come header, nell'ordine dato. */
  function conColonnePrezzo(...headerPrezzo: string[]): XLSX.WorkBook {
    // Una riga con un valore diverso per ciascuna colonna prezzo, così il test
    // sa DA QUALE colonna è stato letto (900 = 2027, 800 = 2026, 700 = PREZZO 1).
    const valori: Record<string, number> = {
      'PREZZO 2027': 900,
      'PREZZO 2026': 800,
      'PREZZO 1': 700,
      'PREZZO 1.320,00': 1320,
    }
    return buildWorkbook({
      modello_porta: [
        ['MODELLO PORTA', ...headerPrezzo, 'H>215', 'H>240'],
        ['RAFFAELLA', ...headerPrezzo.map((h) => valori[h] ?? 0), 1060, 1150],
      ],
    })
  }

  it('(a) IL CASO: "PREZZO 2027" da solo → parsa (oggi: intestazione non trovata)', () => {
    const listino = parsePorte(conColonnePrezzo('PREZZO 2027'))
    const raffaella = listino.modelli.find((m) => m.nome === 'RAFFAELLA')!
    expect(raffaella).toBeDefined()
    // Il campo INTERNO resta `prezzo2026` (persistito nello snapshot #22, vedi E8):
    // porta il valore del 2027. Il vincolo era nel MATCH dell'header, non nel nome.
    expect(raffaella.prezzo2026).toBe(900)
  })

  it('(b) "PREZZO 2026" + "PREZZO 2027" insieme → vince il 2027', () => {
    const raffaella = parsePorte(conColonnePrezzo('PREZZO 2026', 'PREZZO 2027')).modelli[0]
    expect(raffaella.prezzo2026).toBe(900) // 2027, non 800
  })

  it('(b2) ordine invertito nel file → vince comunque l anno più alto, non la posizione', () => {
    const raffaella = parsePorte(conColonnePrezzo('PREZZO 2027', 'PREZZO 2026')).modelli[0]
    expect(raffaella.prezzo2026).toBe(900) // 2027 anche se sta prima
  })

  it('(c) "PREZZO 1" + "PREZZO 2027" → prende il 2027, MAI PREZZO 1', () => {
    const raffaella = parsePorte(conColonnePrezzo('PREZZO 1', 'PREZZO 2027')).modelli[0]
    expect(raffaella.prezzo2026).toBe(900) // 2027, mai 700
  })

  it('(d) nessuna colonna PREZZO <anno> → errore, e il messaggio dice cosa cercava', () => {
    // Header strutturale presente (MODELLO PORTA / H>215 / H>240) ma nessun prezzo-anno.
    const wb = buildWorkbook({
      modello_porta: [
        ['MODELLO PORTA', 'PREZZO 1', 'H>215', 'H>240'],
        ['RAFFAELLA', 700, 1060, 1150],
      ],
    })
    expect(() => parsePorte(wb)).toThrow(/PREZZO <anno>/)
  })

  it('(f) colonna FANTASMA "PREZZO 1.320,00" (un prezzo scambiato per header) → NON matcha', () => {
    // Un numero che sembra un anno solo a chi non guarda: "1.320,00" non è 20\d\d,
    // e il pattern è ancorato a `$`. Se questa fosse l unica colonna prezzo →
    // errore, esattamente come "nessuna colonna prezzo".
    const wb = buildWorkbook({
      modello_porta: [
        ['MODELLO PORTA', 'PREZZO 1.320,00', 'H>215', 'H>240'],
        ['RAFFAELLA', 1320, 1060, 1150],
      ],
    })
    expect(() => parsePorte(wb)).toThrow(/PREZZO <anno>/)
  })

  it('(f2) fantasma + anno vero insieme → prende l anno, ignora il fantasma', () => {
    const raffaella = parsePorte(conColonnePrezzo('PREZZO 1.320,00', 'PREZZO 2027')).modelli[0]
    expect(raffaella.prezzo2026).toBe(900) // 2027, non 1320
  })
})

describe('validaListinoPorte', () => {
  it('listino ben formato → ok', () => {
    expect(validaListinoPorte(parsePorte(buildWorkbook()))).toEqual({ ok: true })
  })

  it('nessun modello → errore in italiano', () => {
    const wb = buildWorkbook({
      modello_porta: [['MODELLO PORTA', 'PREZZO 1', 'PREZZO 2026', 'H>215', 'H>240']],
    })
    const res = validaListinoPorte(parsePorte(wb))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errore).toMatch(/nessun modello/i)
  })

  it('optional non-manuale senza prezzo → errore', () => {
    const wb = buildWorkbook({
      optional: [
        ['', "UNITA' DI MISURA", '', ''],
        ['ROTTO', 'MQ', 'testo non numerico', ''], // MQ ma prezzo non parsabile
      ],
    })
    const res = validaListinoPorte(parsePorte(wb))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errore).toMatch(/optional/i)
  })
})
