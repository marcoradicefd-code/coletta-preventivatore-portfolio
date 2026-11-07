import type * as XLSX from 'xlsx'
import type { ListinoSuMisura, FoglioSuMisura, VoceSuMisura, RigaMatrice } from '@/types/sumisura'
import { safeString, safeFloat, sheetToRows, isEmptyRow, findHeaderRow, normLabel } from './parserUtils'
import { chiaveMatrice } from '@/engine/matriceFiniture'

// ── Intestazioni dei fogli standard, lette PER ETICHETTA (O7) ──
// Una coppia [prezzo, unità] per generazione del listino: «PREZZO UNITARIO» /
// «UNITA'» (APR26, foglio CUCINA) e «PREZZO» / «U.MISURA» (prospetto 2026, foglio
// SU MISURA). Elenco esplicito come `INTESTAZIONI_GAMMA_COLORI` di Marmeria:
// niente regex, confronto esatto dopo `normLabel`, la prima coppia trovata vince.
// Un listino con altre diciture si aggiunge qui, non si indovina. La descrizione
// resta in colonna 0: nella generazione APR26 la cella sopra è vuota, non c'è
// un'etichetta da cercare.
export const INTESTAZIONI_SU_MISURA: ReadonlyArray<readonly [prezzo: string, unita: string]> = [
  ['PREZZO UNITARIO', "UNITA'"],
  ['PREZZO', 'U.MISURA'],
]

/** Le tre etichette del foglio RETI LETTO: descrizione, prezzo fornitore, prezzo cliente (O16). */
export const INTESTAZIONE_RETI_LETTO = ['RETE LETTO', 'PREZZO', 'CLIENTE'] as const

/**
 * Le cinque etichette del foglio FINITURE (rev1 del prospetto 2026, L20): la
 * matrice tipo di arredo × interno × esterno. Si cerca PRIMA di
 * `INTESTAZIONI_SU_MISURA`, perché contiene anche «PREZZO»/«U.MISURA»: letto
 * come foglio standard, il tipo di arredo in colonna 0 diventava la descrizione
 * di ogni riga («MOBILE GIORNO/LIBRERIA» cinque volte, ognuna col suo prezzo).
 */
export const INTESTAZIONE_FINITURE = ['TIPO ARREDO', 'INTERNO', 'ESTERNO', 'PREZZO', 'U.MISURA'] as const

function parseFoglioSuMisura(sheet: XLSX.WorkSheet, sheetName: string, avvisi: string[]): FoglioSuMisura | null {
  const rows = sheetToRows(sheet)

  // Foglio "RETI LETTO DEBERNARDIS" ha struttura diversa
  if (sheetName.toUpperCase().includes('RETI LETTO')) {
    return parseRetiLetto(rows, sheetName, avvisi)
  }

  const finiture = findHeaderRow(rows, [...INTESTAZIONE_FINITURE])
  if (finiture) return parseFoglioFiniture(rows, sheetName, finiture, avvisi)

  return parseFoglioStandard(rows, sheetName, avvisi)
}

/**
 * Il foglio FINITURE, letto per etichetta (L20). Le righe con un tipo di arredo
 * e un esterno sono la matrice: `{ tipo, interno, esterno, prezzo, unita }`,
 * con `interno` vuoto che vale «qualsiasi». Prezzo e unità si prendono come
 * sono: un prezzo non numerico o un'unità fuori da MQ, ML, PEZZO li ferma Zod
 * sul main thread, con la cella. Le righe senza tipo o senza esterno (le
 * lavorazioni millerighi, la quota progettazione, che ha la descrizione nella
 * colonna INTERNO) restano voci standard, con la descrizione nella prima
 * colonna piena fra tipo e interno.
 *
 * Avvisi, che non bloccano: nessuna combinazione letta, e grafie diverse della
 * stessa finitura («ABET-LAMICOLOR» e «ABET – LAMICOLOR»), che `chiaveMatrice`
 * legge come una.
 */
function parseFoglioFiniture(
  rows: unknown[][],
  sheetName: string,
  header: { rowIndex: number; cols: Record<string, number> },
  avvisi: string[]
): FoglioSuMisura {
  const [colTipo, colInterno, colEsterno, colPrezzo, colUnita] = INTESTAZIONE_FINITURE.map(
    (e) => header.cols[normLabel(e)]
  )
  const voci: VoceSuMisura[] = []
  const matrice: RigaMatrice[] = []
  for (let i = header.rowIndex + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || isEmptyRow(row)) continue
    const tipo = safeString(row[colTipo])
    const esterno = safeString(row[colEsterno])
    if (tipo && esterno) {
      const unitaRaw = safeString(row[colUnita]).toUpperCase()
      matrice.push({
        tipo,
        interno: safeString(row[colInterno]),
        esterno,
        prezzo: safeFloat(row[colPrezzo]) ?? Number.NaN,
        // Un'unità non riconosciuta resta com'è scritta: la rifiuta lo schema.
        unita: (normalizeUM(unitaRaw) ?? unitaRaw) as RigaMatrice['unita'],
        cella: `${sheetName}!${colonnaExcel(colTipo)}${i + 1}`,
      })
      continue
    }
    const voce = voceStandard(tipo || safeString(row[colInterno]), row[colPrezzo], row[colUnita])
    if (voce) voci.push(voce)
  }
  if (matrice.length === 0) {
    avvisi.push(`Foglio "${sheetName}": intestazione della matrice trovata, ma nessuna combinazione letta.`)
  }
  avvisi.push(...avvisiGrafia(sheetName, matrice))
  return { nome: sheetName, nota: notaSopra(rows, header.rowIndex), voci, matrice }
}

/** «A», «B», … la lettera della colonna Excel (0 → A, 26 → AA). */
function colonnaExcel(indice: number): string {
  let n = indice + 1
  let lettere = ''
  while (n > 0) {
    const resto = (n - 1) % 26
    lettere = String.fromCodePoint(65 + resto) + lettere
    n = Math.floor((n - 1) / 26)
  }
  return lettere
}

/** Per colonna: le grafie diverse che `chiaveMatrice` legge come la stessa. */
function avvisiGrafia(sheetName: string, matrice: readonly RigaMatrice[]): string[] {
  const avvisi: string[] = []
  for (const [campo, etichetta] of [['tipo', 'TIPO ARREDO'], ['interno', 'INTERNO'], ['esterno', 'ESTERNO']] as const) {
    const grafie = new Map<string, Set<string>>()
    for (const r of matrice) {
      if (r[campo] === '') continue
      const chiave = chiaveMatrice(r[campo])
      grafie.set(chiave, (grafie.get(chiave) ?? new Set()).add(r[campo]))
    }
    for (const varianti of grafie.values()) {
      if (varianti.size < 2) continue
      avvisi.push(
        `Foglio "${sheetName}", colonna ${etichetta}: grafie diverse lette come la stessa finitura: ` +
          [...varianti].map((v) => `«${v}»`).join(', ') + '.'
      )
    }
  }
  return avvisi
}

/** La riga sopra l'intestazione, se sopra c'è anche un titolo: le sue celle piene, come testo. */
function notaSopra(rows: unknown[][], rowIndex: number): string {
  if (rowIndex < 2) return ''
  return (rows[rowIndex - 1] ?? []).map(safeString).filter(Boolean).join(' ')
}

/** Una voce standard da descrizione, prezzo e unità grezzi; `null` se la riga non è una voce. */
function voceStandard(descrizione: string, prezzoRaw: unknown, umRaw: unknown): VoceSuMisura | null {
  if (!descrizione || descrizione.toUpperCase() === 'TOTALE') return null
  const prezzo = safeFloat(prezzoRaw)
  if (prezzo === null) return null
  const unitaMisura = normalizeUM(safeString(umRaw).toUpperCase())
  if (!unitaMisura) return null
  // Quota progettazione ha prezzo 0.08 e UM "VALORE"
  const isProgrammazione = unitaMisura === 'VALORE' && prezzo < 1
  return { descrizione, prezzoUnitario: prezzo, unitaMisura, isProgrammazione }
}

function parseFoglioStandard(rows: unknown[][], sheetName: string, avvisi: string[]): FoglioSuMisura | null {
  // L'intestazione si cerca per etichetta nelle prime 20 righe (`findHeaderRow`),
  // non si suppone in riga 1 con le voci da riga 3. Le due generazioni vere:
  //
  //   APR26, CUCINA      riga 0 titolo · riga 1 ["", "PREZZO UNITARIO", "UNITA'", ...] · riga 2 vuota
  //   prospetto 2026     riga 0 titolo · riga 1 nota · riga 2 ["FINITURA", "PREZZO", "U.MISURA", ...]
  //
  // Le voci partono dalla riga dopo l'intestazione: una riga vuota in mezzo si
  // salta, la sua assenza non costa più la prima voce, e una colonna inserita
  // prima del prezzo non sposta i prezzi.
  //
  // `nota` è la cella A della riga sopra l'intestazione, ma solo se sopra c'è
  // anche un titolo: in APR26 la riga sopra È il titolo, e la nota resta vuota
  // come prima.
  //
  // Intestazione non trovata: il foglio non si legge e lo si dice in `avvisi`.
  // Mai per posizione: un prezzo letto dalla colonna sbagliata sembra giusto.
  //
  // Le colonne QUANTITA' e TOTALE NON vengono lette: il file reale le ha
  // valorizzate su 7 righe — è un prospetto di lavoro usato come listino. Da qui
  // l'impossibilità di riconoscere un "foglio compilato" per euristica: il
  // listino vero LO È. Vedi la selezione fogli esplicita (E14).
  let header: { rowIndex: number; colPrezzo: number; colUnita: number } | null = null
  for (const [prezzo, unita] of INTESTAZIONI_SU_MISURA) {
    const trovato = findHeaderRow(rows, [prezzo, unita])
    if (trovato) {
      const { rowIndex, cols } = trovato
      header = { rowIndex, colPrezzo: cols[normLabel(prezzo)], colUnita: cols[normLabel(unita)] }
      break
    }
  }
  if (!header) {
    avvisi.push(
      `Foglio "${sheetName}" non letto: intestazione non trovata. ` +
        "Servono «PREZZO UNITARIO» e «UNITA'», oppure «PREZZO» e «U.MISURA»."
    )
    return null
  }

  const nota = header.rowIndex >= 2 ? safeString(rows[header.rowIndex - 1]?.[0] ?? '') : ''

  const voci: VoceSuMisura[] = []

  for (let i = header.rowIndex + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || isEmptyRow(row)) continue
    const voce = voceStandard(safeString(row[0]), row[header.colPrezzo], row[header.colUnita])
    if (voce) voci.push(voce)
  }

  return { nome: sheetName, nota, voci }
}

function parseRetiLetto(rows: unknown[][], sheetName: string, avvisi: string[]): FoglioSuMisura | null {
  // Intestazione per etichetta (O16): «RETE LETTO», «PREZZO», «CLIENTE», le tre
  // colonne dalle etichette. Nel prospetto 2026 stanno in riga 0 («PREZZO » con
  // lo spazio finale, che `normLabel` toglie). Una colonna «PREZZO 2027» fra
  // PREZZO e CLIENTE, letta per posizione, finiva nel prezzo cliente: quello
  // che Arredi usa nel preventivo. Intestazione assente = foglio non letto e
  // avviso, mai per posizione.
  const header = findHeaderRow(rows, [...INTESTAZIONE_RETI_LETTO])
  if (!header) {
    avvisi.push(
      `Foglio "${sheetName}" non letto: intestazione non trovata. ` +
        'Servono «RETE LETTO», «PREZZO» e «CLIENTE».'
    )
    return null
  }
  const [colDescrizione, colPrezzo, colCliente] = INTESTAZIONE_RETI_LETTO.map((e) => header.cols[normLabel(e)])

  const voci: VoceSuMisura[] = []

  for (let i = header.rowIndex + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || isEmptyRow(row)) continue

    const descrizione = safeString(row[colDescrizione])
    if (!descrizione) continue

    const prezzoFornitore = safeFloat(row[colPrezzo])
    const prezzoCliente = safeFloat(row[colCliente])
    if (prezzoFornitore === null || prezzoCliente === null) continue

    voci.push({
      descrizione,
      prezzoUnitario: prezzoFornitore,
      unitaMisura: 'PEZZO',
      prezzoCliente,
    })
  }

  return { nome: sheetName, nota: '', voci }
}

function normalizeUM(raw: string): VoceSuMisura['unitaMisura'] | null {
  const cleaned = raw.replace(/[^A-Z]/g, '')
  if (cleaned.includes('MQ')) return 'MQ'
  if (cleaned.includes('ML')) return 'ML'
  if (cleaned.includes('PEZZO')) return 'PEZZO'
  if (cleaned.includes('VALORE') || cleaned.includes('1VERO')) return 'VALORE'
  if (cleaned.includes('UNITA')) return 'PEZZO'
  return null
}

export function parseSuMisura(workbook: XLSX.WorkBook): ListinoSuMisura {
  const fogli: FoglioSuMisura[] = []
  const avvisi: string[] = []

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) continue

    const foglio = parseFoglioSuMisura(sheet, sheetName, avvisi)
    if (foglio && (foglio.voci.length > 0 || (foglio.matrice?.length ?? 0) > 0)) {
      fogli.push(foglio)
    }
  }

  // `avvisi` solo se non vuoto, come Marmeria: un listino senza fogli non letti
  // resta identico a prima (lo snapshot golden di APR26 non cambia).
  return {
    fogli,
    aggiornato: new Date().toISOString(),
    ...(avvisi.length > 0 ? { avvisi } : {}),
  }
}
