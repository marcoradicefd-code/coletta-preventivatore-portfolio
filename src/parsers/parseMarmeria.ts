import type * as XLSX from 'xlsx'
import type {
  ListinoMarmeria,
  Materiale,
  MaterialeSpessore,
  PrezzoPerFascia,
  SpessoreType,
  TipologiaMateriale,
  LavorazioneBordo,
  LavorazioneVaria,
  VascaIntegrata,
  RilMontScaglione,
} from '@/types/marmeria'
import {
  safeString,
  safeFloat,
  sheetToRows,
  isEmptyRow,
  findHeaderRow,
  formulaCella,
  moltiplicatoreDaFormula,
  normLabel,
} from './parserUtils'

// ── Intestazioni delle colonne lette PER INDICE ──
// GAMMA_COLORI e MASTER_LAVORAZIONI si leggono per posizione: se il fornitore
// inserisce una colonna i prezzi scivolano su quella accanto e Zod non se ne
// accorge (A3 della review del 07/10). Prima di leggere si verifica che ogni
// colonna abbia l'intestazione attesa, confrontata dopo `normLabel`: uguale a una
// delle etichette ammesse, niente regex né ricerca per nome. Diversa → il parse
// FALLISCE e dice foglio, colonna, atteso e trovato.
//
// Colonne 6 e 54: dal Rev_82 il fornitore chiama «12mm» disponibilità e minimo,
// ma le colonne prezzo 18-20 dicono ancora «13mm». È lo stesso spessore: il parser
// lo tratta come 13. Le due etichette sono ammesse entrambe (Rev_77 dice 13).
export const INTESTAZIONI_GAMMA_COLORI: ReadonlyArray<readonly [number, readonly string[]]> = [
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
]

/** Prezzi per tipologia, colonne 1-3: nella riga 0 e nella riga «LAVORAZIONI VARIE». */
export const INTESTAZIONI_MASTER_LAVORAZIONI: ReadonlyArray<readonly [number, readonly string[]]> = [
  [1, ['prezzo qres']],
  [2, ['prezzo lapitec']],
  [3, ['prezzo gres']],
]

/** Indice 0-based → lettera di colonna Excel (0 → A, 26 → AA). */
function letteraColonna(i: number): string {
  return (i >= 26 ? letteraColonna(Math.floor(i / 26) - 1) : '') + String.fromCharCode(65 + (i % 26))
}

function verificaIntestazioni(
  foglio: string,
  riga: unknown[] | undefined,
  attese: ReadonlyArray<readonly [number, readonly string[]]>
): void {
  for (const [col, ammesse] of attese) {
    const trovata = normLabel(riga?.[col])
    if (!ammesse.includes(trovata)) {
      throw new Error(
        `Foglio ${foglio}, colonna ${letteraColonna(col)}: intestazione attesa ` +
          `«${ammesse.join('» oppure «')}», trovata «${trovata || '(vuota)'}». ` +
          "L'app legge questo foglio per posizione: con una colonna spostata i prezzi " +
          'finirebbero sulla colonna sbagliata, quindi il listino non si carica'
      )
    }
  }
}

// ── Mapping PRODUTTORE → TipologiaMateriale (per lavorazioni) ──
const PRODUTTORE_TO_TIPOLOGIA: Record<string, TipologiaMateriale> = {
  SILESTONE: 'QUARZO',
  PROMO_QUARZO: 'QUARZO',
  SILESTONE_SELECTION: 'QUARZO',
  DEKTON: 'LAPITEC',
  DEKTON_SELECTION: 'LAPITEC',
  LAMINAM: 'GRES',
  FLORIM: 'GRES',
  MARAZZI: 'GRES',
  LAMINAM_SELECTION: 'GRES',
  MARAZZI_SELECTION: 'GRES',
  GENERICO: 'GRES',
}

function parsePrezzoFascia(
  row: unknown[],
  colFino62: number,
  col63a70: number,
  colOltre70: number
): PrezzoPerFascia {
  return {
    fino62: parsePrezzoCell(row[colFino62]),
    da63a70: parsePrezzoCell(row[col63a70]),
    oltre70: parsePrezzoCell(row[colOltre70]),
  }
}

function parsePrezzoCell(value: unknown): number | 'Non Disp.' {
  if (value === 'Non Disp.' || value === 'Non Disp') return 'Non Disp.'
  const n = safeFloat(value)
  if (n === null || n === 0) return 'Non Disp.'
  return n
}

function parseMinimoCell(value: unknown): number | 'Non Disp.' {
  if (value === 'Non Disp.' || value === 'Non Disp') return 'Non Disp.'
  const n = safeFloat(value)
  if (n === null) return 'Non Disp.'
  return n
}

function parseSpessore(
  row: unknown[],
  spessore: SpessoreType,
  dispCol: number,
  priceStartCol: number,
  minimoCol: number
): MaterialeSpessore {
  const disponibile = safeFloat(row[dispCol]) === 1

  return {
    spessore,
    disponibile,
    prezziMq: parsePrezzoFascia(
      row,
      priceStartCol,
      priceStartCol + 1,
      priceStartCol + 2
    ),
    minimoFatturabile: parseMinimoCell(row[minimoCol]),
  }
}

// ── GAMMA_COLORI ──
function parseGammaColori(sheet: XLSX.WorkSheet): Materiale[] {
  const rows = sheetToRows(sheet)
  const materiali: Materiale[] = []
  const seenKeys = new Set<string>()

  verificaIntestazioni('GAMMA_COLORI', rows[0], INTESTAZIONI_GAMMA_COLORI)

  // Skip row 0 (header)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || isEmptyRow(row)) continue

    const produttore = safeString(row[0])
    if (!produttore) continue

    const colore = safeString(row[1])
    const tipoSuperficie = safeString(row[2])
    let coloreFinituraCompleto = safeString(row[3])

    // Ensure unique key — append suffix for duplicates
    if (seenKeys.has(coloreFinituraCompleto)) {
      let suffix = 2
      while (seenKeys.has(`${coloreFinituraCompleto}_${suffix}`)) suffix++
      coloreFinituraCompleto = `${coloreFinituraCompleto}_${suffix}`
    }
    seenKeys.add(coloreFinituraCompleto)
    const collezione = safeString(row[4])

    // Derive tipologia from produttore (for lavorazioni pricing)
    const tipologia: TipologiaMateriale =
      PRODUTTORE_TO_TIPOLOGIA[produttore] ?? 'GRES'

    // Parse spessori — actual column indices from file:
    // 13mm: disp[6], prices[18,19,20], minimo[54]
    // 20mm: disp[7], prices[30,31,32], minimo[55]
    // 30mm: disp[8], prices[42,43,44], minimo[56]
    const spessori: Partial<Record<SpessoreType, MaterialeSpessore>> = {}

    const sp13 = parseSpessore(row, 13, 6, 18, 54)
    if (sp13.disponibile) spessori[13] = sp13

    const sp20 = parseSpessore(row, 20, 7, 30, 55)
    if (sp20.disponibile) spessori[20] = sp20

    const sp30 = parseSpessore(row, 30, 8, 42, 56)
    if (sp30.disponibile) spessori[30] = sp30

    // Alzatine/Schienale — actual indices:
    // [46] H ALZ., [49] ALZATINA FINALE, [52] SCHIENALE FINALE
    const alzatinaAltezza = safeFloat(row[46]) ?? 0
    const alzatinaEuroMl = safeFloat(row[49]) ?? 0
    const schienaleEuroMq = safeFloat(row[52]) ?? 0

    materiali.push({
      produttore,
      colore,
      tipoSuperficie,
      coloreFinituraCompleto,
      collezione,
      tipologia,
      spessori,
      alzatinaAltezza,
      alzatinaEuroMl,
      schienaleEuroMq,
    })
  }

  return materiali
}

// ── MASTER_LAVORAZIONI ──
function parseMasterLavorazioni(sheet: XLSX.WorkSheet): {
  lavorazioniBordo: LavorazioneBordo[]
  lavorazioniVarie: LavorazioneVaria[]
  vascheIntegrate: VascaIntegrata[]
} {
  const rows = sheetToRows(sheet)

  const lavorazioniBordo: LavorazioneBordo[] = []
  const lavorazioniVarie: LavorazioneVaria[] = []
  const vascheIntegrate: VascaIntegrata[] = []

  let section: 'bordo' | 'varie' | 'vasche' | null = 'bordo'
  let bordoId = 0

  verificaIntestazioni('MASTER_LAVORAZIONI', rows[0], INTESTAZIONI_MASTER_LAVORAZIONI)

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row) continue

    const desc = safeString(row[0])

    // Detect section headers
    if (desc.toUpperCase().startsWith('LAVORAZIONI VARIE')) {
      // Anche le varie si leggono dalle colonne 1-3: la riga di sezione le intitola.
      verificaIntestazioni('MASTER_LAVORAZIONI', row, INTESTAZIONI_MASTER_LAVORAZIONI)
      section = 'varie'
      continue
    }
    if (desc.toUpperCase().startsWith('VASCHE INTEGRATE')) {
      section = 'vasche'
      continue
    }

    // Skip empty rows
    if (!desc || isEmptyRow(row)) {
      if (section === 'bordo' && lavorazioniBordo.length > 0) {
        // Empty row after bordo items → done with bordo
      }
      continue
    }

    // Skip header row
    if (desc.toUpperCase().includes('PROFILO LAVORAZIONE')) continue

    const prezzoQres = parseLavPrezzo(row[1])
    const prezzoLapitec = parseLavPrezzo(row[2])
    const prezzoGres = parseLavPrezzo(row[3])

    if (section === 'bordo') {
      bordoId++
      lavorazioniBordo.push({
        id: bordoId,
        descrizione: desc,
        prezzoMlPerTipologia: {
          QUARZO: prezzoQres,
          LAPITEC: prezzoLapitec,
          GRES: prezzoGres,
        },
      })
    } else if (section === 'varie') {
      lavorazioniVarie.push({
        descrizione: desc,
        prezzoPerTipologia: {
          QUARZO: prezzoQres,
          LAPITEC: prezzoLapitec,
          GRES: prezzoGres,
        },
        unitaMisura: 'PEZZO',
      })
    } else if (section === 'vasche') {
      // DATO MORTO — non è la vasca del preventivo Gres.
      // Queste sono le "VASCHE INTEGRATE SANTA MARGHERITA" del listino De Bari:
      // quarzo resina, prezzate SOLO in colonna Qres (per Lapitec e Gres il
      // listino dice "Non Disp." → De Bari non fa vasche in gres). Le parsiamo
      // solo per fedeltà al foglio: nessun consumer le usa per calcolare.
      //
      // La vasca in gres è un'ALTRA cosa: voce commerciale di Coletta a prezzo
      // deciso da Antonio, che vive in `QuoteMarmeria.vasca` (default dal
      // listino cucine, vedi `@/data/gres/vascaGres`). NON cablarla qui e NON
      // derivarla da queste righe: nel listino De Bari non esiste.
      vascheIntegrate.push({
        descrizione: desc,
        prezzoQres,
      })
    }
  }

  return { lavorazioniBordo, lavorazioniVarie, vascheIntegrate }
}

function parseLavPrezzo(value: unknown): number | null {
  if (value === 'Non Disp.' || value === 'Non Disp') return null
  const n = safeFloat(value)
  return n === 0 ? null : n
}

// ── RIL_MONT ──
// Letto PER INTESTAZIONE (DA / A / IMPORTO), non per indice fisso: il foglio
// ospita, sulle stesse righe degli scaglioni, un blocchetto di calcolo affiancato
// (colonne con "Totale Materiali e Lavorazioni" / "Calcolo Rilievo e Montaggio")
// che NON va confuso con i dati. Trovando l'header si gestiscono: eventuali
// righe-titolo sopra, spostamenti di colonna e l'ultima fascia "aperta" (A vuoto
// → a=null). Fallback al layout storico (col 0/1/2, dati da riga 1) se l'header
// non è individuabile, così il parser non si rompe mai del tutto.
/** Percentuale assunta quando la fascia aperta è uno 0 senza formula. */
const PCT_MONTAGGIO_DICHIARATA = 0.15

function parseRilMont(sheet: XLSX.WorkSheet): {
  scaglioni: RilMontScaglione[]
  avvisi: string[]
} {
  const rows = sheetToRows(sheet)
  const header = findHeaderRow(rows, ['DA', 'A', 'IMPORTO'])

  const startRow = header ? header.rowIndex + 1 : 1
  const colDa = header ? header.cols['da'] : 0
  const colA = header ? header.cols['a'] : 1
  const colImporto = header ? header.cols['importo'] : 2

  const scaglioni: RilMontScaglione[] = []
  const avvisi: string[] = []

  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i]
    if (!row || isEmptyRow(row)) continue

    // Leggo SOLO le colonne risolte dall'header → ignoro il blocchetto di
    // calcolo affiancato. `da` non numerico = riga non-scaglione (titolo/nota).
    const da = safeFloat(row[colDa])
    if (da === null) continue

    const importo = safeFloat(row[colImporto])
    if (importo === null) continue

    // `a` vuoto/non numerico = fascia aperta (ultimo scaglione, "≥ da").
    const aVal = safeFloat(row[colA])

    // ── La percentuale si legge dalla FORMULA, non dal valore ──
    // Nella cella IMPORTO della fascia aperta il listino non tiene un prezzo:
    // tiene `CEILING(E2*0.15,1)`. Il suo `.v` è il risultato calcolato su un
    // preventivo VUOTO, cioè 0 — un numero che sembra un prezzo e non lo è.
    // Il moltiplicatore invece è stabile e sta nel testo della formula.
    const formula = formulaCella(sheet, i, colImporto)
    const percentuale = formula ? moltiplicatoreDaFormula(formula) : null

    if (percentuale !== null) {
      scaglioni.push({ da, a: aVal, importo, percentuale })
      continue
    }

    // ── Fascia aperta a ZERO senza formula: mai uno zero muto ──
    // Due modi di arrivarci: il workbook è stato letto senza `cellFormula`
    // (allora la formula c'è ma non la vediamo), oppure il listino ha davvero
    // uno 0 fisso. In entrambi i casi addebitare 0 sul montaggio di un lavoro
    // sopra i 3.000 € è il danno peggiore. Applico la percentuale nota e LO
    // DICHIARO nel referto: chi legge sa che quel numero non viene dal file.
    if (aVal === null && importo === 0) {
      avvisi.push(
        `Rilievo/Montaggio: la fascia aperta (da ${da} €) vale 0 e non espone una formula. ` +
          `Applicato il ${PCT_MONTAGGIO_DICHIARATA * 100}% come da accordo commerciale — ` +
          `valore NON letto dal listino. Verifica il foglio RIL_MONT.`
      )
      scaglioni.push({ da, a: aVal, importo, percentuale: PCT_MONTAGGIO_DICHIARATA })
      continue
    }

    // Numero puro: importo fisso, che è il caso delle fasce basse.
    scaglioni.push({ da, a: aVal, importo })
  }

  return { scaglioni, avvisi }
}

// ── PERCENTUALI SCONTO ──
function parsePercSconti(sheet: XLSX.WorkSheet): number[] {
  const rows = sheetToRows(sheet)
  const sconti: number[] = []

  for (const row of rows) {
    const val = safeFloat(row[0])
    if (val !== null) {
      // Anti-rumore a 4 decimali di frazione (0.15000000000000002 → 0.15): 2 decimali
      // portavano uno sconto del 12,5% a 13% (review 07/10, O18).
      sconti.push(Math.round(val * 10000) / 10000)
    }
  }

  return sconti
}

// ── ENTRY POINT ──
export function parseMarmeria(workbook: XLSX.WorkBook): ListinoMarmeria {
  const gammaSheet = workbook.Sheets['GAMMA_COLORI']
  if (!gammaSheet) throw new Error('Foglio GAMMA_COLORI non trovato')

  const masterSheet = workbook.Sheets['MASTER_LAVORAZIONI']
  if (!masterSheet) throw new Error('Foglio MASTER_LAVORAZIONI non trovato')

  const rilMontSheet = workbook.Sheets['RIL_MONT']
  if (!rilMontSheet) throw new Error('Foglio RIL_MONT non trovato')

  const scontiSheet = workbook.Sheets['PERCENTUALI SCONTO']
  if (!scontiSheet) throw new Error('Foglio PERCENTUALI SCONTO non trovato')

  const materiali = parseGammaColori(gammaSheet)
  const { lavorazioniBordo, lavorazioniVarie, vascheIntegrate } =
    parseMasterLavorazioni(masterSheet)
  const { scaglioni: rilMontScaglioni, avvisi } = parseRilMont(rilMontSheet)
  const scontiDisponibili = parsePercSconti(scontiSheet)

  return {
    materiali,
    lavorazioniBordo,
    lavorazioniVarie,
    vascheIntegrate,
    rilMontScaglioni,
    scontiDisponibili,
    aggiornato: new Date().toISOString(),
    ...(avvisi.length > 0 ? { avvisi } : {}),
  }
}
