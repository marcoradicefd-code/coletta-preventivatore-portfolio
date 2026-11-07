import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import {
  parseMarmeria,
  INTESTAZIONI_GAMMA_COLORI,
  INTESTAZIONI_MASTER_LAVORAZIONI,
} from '@/parsers/parseMarmeria'

// Workbook sintetici per parseMarmeria. Replicano gli INDICI COLONNA reali
// (GAMMA_COLORI usa colonne fino alla 56): pinnano le costanti di indice oltre
// al golden snapshot, così un eventuale off-by-one viene colto qui.
function sheet(aoa: unknown[][]): XLSX.WorkSheet {
  return XLSX.utils.aoa_to_sheet(aoa)
}

/**
 * Riga di intestazione con le etichette che il parser verifica (la prima ammessa
 * per colonna). Costruita dalla costante: la costante stessa è fissata con le
 * stringhe letterali nel test «le intestazioni attese», qui sotto.
 */
function intestazioni(
  attese: ReadonlyArray<readonly [number, readonly string[]]>,
  lunghezza: number,
  prima = ''
): string[] {
  const h: string[] = Array(lunghezza).fill('')
  h[0] = prima
  for (const [col, ammesse] of attese) h[col] = ammesse[0]
  return h
}
const HEADER_GAMMA = intestazioni(INTESTAZIONI_GAMMA_COLORI, 57)
const HEADER_MASTER = intestazioni(INTESTAZIONI_MASTER_LAVORAZIONI, 4, 'PROFILO LAVORAZIONE')
const SEZIONE_VARIE = intestazioni(INTESTAZIONI_MASTER_LAVORAZIONI, 4, 'LAVORAZIONI VARIE')

/** Riga GAMMA_COLORI lunga 57 con i valori ai loro indici reali. */
function gammaRow(
  produttore: string,
  key: string,
  opts: { disp13?: boolean; prezzo13?: number; alzatinaMl?: number } = {}
): unknown[] {
  const r: unknown[] = Array(57).fill('')
  r[0] = produttore
  r[1] = 'Bianco'
  r[2] = 'Opaco'
  r[3] = key
  r[4] = 'COLLEZIONE'
  if (opts.disp13 ?? true) {
    r[6] = 1 // disponibile 13mm
    r[18] = opts.prezzo13 ?? 100 // prezzo fino62
    r[19] = opts.prezzo13 ?? 100 // prezzo 63a70
    r[20] = (opts.prezzo13 ?? 100) * 2 // prezzo oltre70
    r[54] = 5 // minimo mq 13mm
  }
  r[46] = 0.08 // H alzatina
  r[49] = opts.alzatinaMl ?? 80 // alzatina €/ml
  r[52] = 1135 // schienale €/mq
  return r
}

/**
 * `over` accetta sia una matrice di celle sia un `WorkSheet` già costruito:
 * serve per i casi in cui il test deve attaccare una FORMULA a una cella
 * (`aoa_to_sheet` produce solo valori, e la percentuale del montaggio vive
 * nella formula, non nel valore).
 */
function buildWorkbook(
  over: Partial<Record<string, unknown[][] | XLSX.WorkSheet>> = {}
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()
  const sheets: Record<string, unknown[][] | XLSX.WorkSheet> = {
    GAMMA_COLORI: [
      HEADER_GAMMA,
      gammaRow('SILESTONE', 'Bianco_Opaco', { prezzo13: 100 }),
      gammaRow('PIPPO', 'Sconosciuto_Opaco'),
    ],
    MASTER_LAVORAZIONI: [
      HEADER_MASTER,
      ['Costa retta', 48, 61, 61],
      ['Costa toro', 60, 0, 70],
      SEZIONE_VARIE,
      ['Foro rettangolare', 120, 132, 132],
      ['VASCHE INTEGRATE', '', '', ''],
      ['Vasca integrata X', 500, '', ''],
    ],
    RIL_MONT: [
      ['DA', 'A', 'IMPORTO'],
      [0, 1000, 300],
      [1000.01, 1500, 250],
      [2000.01, '', 209],
      ['', '', ''],
      ['x', 5, ''],
    ],
    'PERCENTUALI SCONTO': [
      ['SCONTI'],
      [0],
      [0.05],
      [0.15000000000000002],
      [0.12500000000000003],
      [''],
    ],
    ...over,
  }
  for (const [name, contenuto] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(
      wb,
      Array.isArray(contenuto) ? sheet(contenuto) : contenuto,
      name
    )
  }
  return wb
}

describe('parseMarmeria — fogli mancanti', () => {
  it.each([
    'GAMMA_COLORI',
    'MASTER_LAVORAZIONI',
    'RIL_MONT',
    'PERCENTUALI SCONTO',
  ])('throw se manca il foglio %s', (missing) => {
    const wb = XLSX.utils.book_new()
    for (const name of ['GAMMA_COLORI', 'MASTER_LAVORAZIONI', 'RIL_MONT', 'PERCENTUALI SCONTO']) {
      if (name !== missing) XLSX.utils.book_append_sheet(wb, sheet([['h']]), name)
    }
    expect(() => parseMarmeria(wb)).toThrow(new RegExp(missing))
  })
})

describe('parseMarmeria — GAMMA_COLORI', () => {
  it('mappa produttore→tipologia e legge lo spessore disponibile', () => {
    const listino = parseMarmeria(buildWorkbook())
    const silestone = listino.materiali.find((m) => m.produttore === 'SILESTONE')!
    expect(silestone.tipologia).toBe('QUARZO')
    expect(silestone.spessori[13]?.disponibile).toBe(true)
    expect(silestone.spessori[13]?.prezziMq.fino62).toBe(100)
    expect(silestone.spessori[13]?.prezziMq.oltre70).toBe(200)
    expect(silestone.alzatinaEuroMl).toBe(80)
  })

  it('produttore sconosciuto → tipologia GRES (default)', () => {
    const listino = parseMarmeria(buildWorkbook())
    const sconosciuto = listino.materiali.find((m) => m.produttore === 'PIPPO')!
    expect(sconosciuto.tipologia).toBe('GRES')
  })

  it('chiavi duplicate ricevono un suffisso univoco', () => {
    const listino = parseMarmeria(
      buildWorkbook({
        GAMMA_COLORI: [
          HEADER_GAMMA,
          gammaRow('SILESTONE', 'Dup'),
          gammaRow('DEKTON', 'Dup'),
        ],
      })
    )
    const keys = listino.materiali.map((m) => m.coloreFinituraCompleto)
    expect(keys).toContain('Dup')
    expect(keys).toContain('Dup_2')
  })

  it('spessore non disponibile (disp=0) non viene incluso', () => {
    const listino = parseMarmeria(
      buildWorkbook({
        GAMMA_COLORI: [HEADER_GAMMA, gammaRow('SILESTONE', 'NoSp', { disp13: false })],
      })
    )
    expect(listino.materiali[0].spessori[13]).toBeUndefined()
  })
})

describe('parseMarmeria — MASTER_LAVORAZIONI', () => {
  it('separa bordo / varie / vasche e azzera i prezzi 0 → null', () => {
    const listino = parseMarmeria(buildWorkbook())
    expect(listino.lavorazioniBordo.map((l) => l.descrizione)).toEqual([
      'Costa retta',
      'Costa toro',
    ])
    expect(listino.lavorazioniBordo[1].prezzoMlPerTipologia.LAPITEC).toBeNull() // era 0
    expect(listino.lavorazioniVarie.map((l) => l.descrizione)).toEqual(['Foro rettangolare'])
    expect(listino.vascheIntegrate[0]).toMatchObject({
      descrizione: 'Vasca integrata X',
      prezzoQres: 500,
    })
  })
})

describe('parseMarmeria — RIL_MONT e SCONTI', () => {
  it('scaglioni: salta righe non valide, ultimo con a=null', () => {
    const listino = parseMarmeria(buildWorkbook())
    expect(listino.rilMontScaglioni).toHaveLength(3)
    expect(listino.rilMontScaglioni[2]).toEqual({ da: 2000.01, a: null, importo: 209 })
  })

  it('sconti: ignora i non numerici e arrotonda il floating point, senza perdere il 12,5% (O18)', () => {
    const listino = parseMarmeria(buildWorkbook())
    // A 2 decimali 0,125 diventava 0,13: l'anti-rumore ora è a 4.
    expect(listino.scontiDisponibili).toEqual([0, 0.05, 0.15, 0.125])
  })
})

describe('parseMarmeria — RIL_MONT robusto (lettura per intestazione)', () => {
  it('trova header DA/A/IMPORTO sotto una riga-titolo, ignora il blocco affiancato, legge la fascia aperta (layout Rev_82)', () => {
    const listino = parseMarmeria(
      buildWorkbook({
        RIL_MONT: [
          ['Calcolo Rilievo e Montaggio', '', '', '', '', ''], // riga-titolo sopra l'header
          ['DA', 'A', 'IMPORTO', '', 1388, 'Totale  Materiali e Lavorazioni'], // header NON in riga 0 + blocco affiancato
          [0, 1000, 300, '', 0, 'Totale  Materiali e Lavorazioni'],
          [1000.01, 1500, 350, '', '', ''], // nuovo prezzo Rev_82
          [1500.01, 2000, 400, '', 300, 'Calcolo Rilievo e Montaggio'], // nuovo prezzo + label affiancata
          [3000, '', 0, '', '', ''], // ultima fascia aperta (A vuoto → a=null), importo 0 ammesso
        ],
      })
    )
    // Le colonne affiancate (1388, 300, le label) NON devono inquinare i dati.
    //
    // La fascia aperta qui è uno 0 SENZA formula (il workbook è costruito da
    // array: nessuna cella ha `.f`). È il ramo di fallback dichiarato: mai uno
    // zero muto sul montaggio → 15% applicato E avviso a referto.
    expect(listino.rilMontScaglioni).toEqual([
      { da: 0, a: 1000, importo: 300 },
      { da: 1000.01, a: 1500, importo: 350 },
      { da: 1500.01, a: 2000, importo: 400 },
      { da: 3000, a: null, importo: 0, percentuale: 0.15 },
    ])
    expect(listino.avvisi?.[0]).toMatch(/fascia aperta.*non espone una formula/i)
    expect(listino.avvisi?.[0]).toMatch(/NON letto dal listino/i)
  })

  it('legge la percentuale DALLA FORMULA della cella IMPORTO (nessun avviso)', () => {
    // Il caso vero: la cella IMPORTO della fascia aperta contiene
    // `CEILING(E2*0.15,1)` e il suo valore in cache è 0. Il prezzo non sta nel
    // valore, sta nella formula. `aoa_to_sheet` non crea formule, quindi la
    // attacco alla cella come farebbe SheetJS leggendo il file con
    // `cellFormula: true`.
    const rilMont = XLSX.utils.aoa_to_sheet([
      ['DA', 'A', 'IMPORTO'],
      [0, 1000, 300],
      [3000, '', 0],
    ])
    rilMont['C3'] = { t: 'n', v: 0, f: 'CEILING(E2*0.15,1)' }

    const listino = parseMarmeria(buildWorkbook({ RIL_MONT: rilMont }))

    expect(listino.rilMontScaglioni).toEqual([
      { da: 0, a: 1000, importo: 300 },
      { da: 3000, a: null, importo: 0, percentuale: 0.15 },
    ])
    // Letto dal file = nessuna assunzione = niente da dichiarare.
    expect(listino.avvisi).toBeUndefined()
  })

  it('una percentuale diversa nel file cambia il calcolo senza toccare il codice', () => {
    const rilMont = XLSX.utils.aoa_to_sheet([
      ['DA', 'A', 'IMPORTO'],
      [0, 1000, 300],
      [3000, '', 0],
    ])
    rilMont['C3'] = { t: 'n', v: 0, f: 'CEILING(E2*0.18,1)' }

    const listino = parseMarmeria(buildWorkbook({ RIL_MONT: rilMont }))
    expect(listino.rilMontScaglioni[1].percentuale).toBe(0.18)
  })

  it('un moltiplicatore fuori dalla forbice 0-1 NON diventa una percentuale', () => {
    // `*2` non è una percentuale di montaggio. Promuoverlo produrrebbe prezzi
    // inventati con l'aria di essere letti dal listino: meglio il ramo
    // dichiarato (importo 0 senza formula valida → 15% + avviso).
    const rilMont = XLSX.utils.aoa_to_sheet([
      ['DA', 'A', 'IMPORTO'],
      [0, 1000, 300],
      [3000, '', 0],
    ])
    rilMont['C3'] = { t: 'n', v: 0, f: 'E2*2' }

    const listino = parseMarmeria(buildWorkbook({ RIL_MONT: rilMont }))
    expect(listino.rilMontScaglioni[1].percentuale).toBe(0.15)
    expect(listino.avvisi).toHaveLength(1)
  })

  it("fallback al layout storico (col 0/1/2, dati da riga 1) se l'header non è individuabile", () => {
    const listino = parseMarmeria(
      buildWorkbook({
        RIL_MONT: [
          ['scaglioni', '', ''], // nessun header DA/A/IMPORTO → fallback
          [0, 1000, 300],
          [1000.01, '', 250],
        ],
      })
    )
    expect(listino.rilMontScaglioni).toEqual([
      { da: 0, a: 1000, importo: 300 },
      { da: 1000.01, a: null, importo: 250 },
    ])
  })
})

describe('parseMarmeria — fogli presenti ma vuoti', () => {
  it('non lancia e ritorna collezioni vuote', () => {
    const listino = parseMarmeria(
      buildWorkbook({
        GAMMA_COLORI: [HEADER_GAMMA],
        MASTER_LAVORAZIONI: [HEADER_MASTER],
        RIL_MONT: [['DA', 'A', 'IMPORTO']],
        'PERCENTUALI SCONTO': [['SCONTI']],
      })
    )
    expect(listino.materiali).toEqual([])
    expect(listino.lavorazioniBordo).toEqual([])
    expect(listino.rilMontScaglioni).toEqual([])
    expect(listino.scontiDisponibili).toEqual([])
  })
})

describe('parseMarmeria — intestazioni delle colonne lette per indice (A3)', () => {
  // Fissa la costante con le stringhe LETTERALI misurate su Rev_77, Rev_82 e
  // Rev_83: i test sintetici sono costruiti dalla costante e non vedrebbero un suo
  // errore, e in CI i golden sui file veri sono saltati.
  it('le intestazioni attese, dopo normLabel', () => {
    expect(INTESTAZIONI_GAMMA_COLORI).toEqual([
      [0, ['produttore']],
      [1, ['colore']],
      [2, ['tipo sup.']],
      [3, ['colore/finitura']],
      [4, ['collezione']],
      [6, ['disponibilitàspessore 13mm', 'disponibilitàspessore 12mm']],
      [7, ['disponibilitàspessore 20mm']],
      [8, ['disponibilitàspessore 30mm']],
      [18, ['prezzo 13mm prof fino a 62']],
      [19, ['prezzo 13mm prof 63 - 70']],
      [20, ['prezzo 13mm oltre 70cm a mq']],
      [30, ['prezzo 20mm prof fino a 62']],
      [31, ['prezzo 20mm prof 63 - 70']],
      [32, ['prezzo 20mm oltre 70cm a mq']],
      [42, ['prezzo 30mm prof fino a 62']],
      [43, ['prezzo 30mm prof 63 - 70']],
      [44, ['prezzo 30mm oltre 70cm a mq']],
      [46, ['h alz.']],
      [49, ['alzatina']],
      [52, ['schienale']],
      [54, ['minimo 2 mq spessore 13', 'minimo 2 mq spessore 12']],
      [55, ['minimo 2 mq spessore 20']],
      [56, ['minimo 2 mq spessore 30']],
    ])
    expect(INTESTAZIONI_MASTER_LAVORAZIONI).toEqual([
      [1, ['prezzo qres']],
      [2, ['prezzo lapitec']],
      [3, ['prezzo gres']],
    ])
  })

  it('GAMMA_COLORI con una colonna inserita: il parse fallisce e dice foglio, colonna, atteso e trovato', () => {
    const inserisci = (r: unknown[]) => [...r.slice(0, 19), 'NUOVA', ...r.slice(19)]
    const wb = buildWorkbook({
      GAMMA_COLORI: [inserisci(HEADER_GAMMA), inserisci(gammaRow('SILESTONE', 'X'))],
    })
    expect(() => parseMarmeria(wb)).toThrow(
      'Foglio GAMMA_COLORI, colonna T: intestazione attesa «prezzo 13mm prof 63 - 70», trovata «nuova»'
    )
  })

  it('colonne 6 e 54: ammesse sia «13» (Rev_77) sia «12» (dal Rev_82), con spazi e maiuscole', () => {
    for (const spessore of ['13', '12']) {
      const h = [...HEADER_GAMMA]
      h[6] = `  DisponibilitàSpessore ${spessore}mm `
      h[54] = `MINIMO 2 MQ  SPESSORE ${spessore}`
      const listino = parseMarmeria(buildWorkbook({ GAMMA_COLORI: [h, gammaRow('SILESTONE', 'X')] }))
      expect(listino.materiali[0].spessori[13]?.disponibile).toBe(true)
    }
  })

  it('MASTER_LAVORAZIONI: intestazione diversa nella riga 0 o nella riga «LAVORAZIONI VARIE» → il parse fallisce', () => {
    const marmo = ['PROFILO LAVORAZIONE', 'Prezzo Qres', 'Prezzo MARMO', 'Prezzo LAPITEC', 'Prezzo Gres']
    expect(() => parseMarmeria(buildWorkbook({ MASTER_LAVORAZIONI: [marmo, ['Costa retta', 48, 50, 61, 61]] }))).toThrow(
      'Foglio MASTER_LAVORAZIONI, colonna C: intestazione attesa «prezzo lapitec», trovata «prezzo marmo»'
    )
    const variaSpostata = ['LAVORAZIONI VARIE', 'Prezzo Gres', 'Prezzo Qres', 'Prezzo LAPITEC']
    expect(() =>
      parseMarmeria(buildWorkbook({ MASTER_LAVORAZIONI: [HEADER_MASTER, ['Costa retta', 48, 61, 61], variaSpostata] }))
    ).toThrow('Foglio MASTER_LAVORAZIONI, colonna B: intestazione attesa «prezzo qres», trovata «prezzo gres»')
  })
})
