import * as XLSX from 'xlsx'

export const MAX_EXCEL_ROWS = 2000
export const MAX_STRING_LENGTH = 500

export function safeString(value: unknown): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.length > MAX_STRING_LENGTH) {
    return str.substring(0, MAX_STRING_LENGTH)
  }
  // I caratteri di controllo SONO il bersaglio: toglie quelli invisibili delle
  // celle Excel e tiene tab e a capo (\x09, \x0A, \x0D). `\p{Cc}` li
  // toglierebbe tutti e cambierebbe il risultato.
  // eslint-disable-next-line no-control-regex -- vedi sopra
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim()
}

export function safeFloat(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : parseFloat(String(value))
  return isNaN(n) || !isFinite(n) ? null : n
}

export function safeInt(value: unknown): number | null {
  const f = safeFloat(value)
  return f === null ? null : Math.round(f)
}

export function sheetToRows(sheet: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
}

export function isEmptyRow(row: unknown[]): boolean {
  return row.every(
    (cell) => cell === '' || cell === null || cell === undefined
  )
}

/**
 * La formula grezza di una cella (`.f`), o `null` se non ne ha.
 *
 * Esiste solo se il workbook è stato letto con `cellFormula: true` (vedi
 * `excelParser.worker.ts`): con le formule spente SheetJS tiene solo `.v`, il
 * valore in cache, e qui torna sempre `null`. Chi chiama DEVE reggere il null —
 * è un caso normale, non un errore.
 */
export function formulaCella(
  sheet: XLSX.WorkSheet,
  riga: number,
  colonna: number
): string | null {
  const cell = sheet[XLSX.utils.encode_cell({ r: riga, c: colonna })] as XLSX.CellObject | undefined
  return cell && typeof cell.f === 'string' && cell.f.trim() !== '' ? cell.f : null
}

/**
 * Il moltiplicatore dentro una formula: `CEILING(E2*0.15,1)` → `0.15`.
 * Regge anche la forma percentuale (`E2*15%` → `0.15`).
 *
 * Perché la forbice 0 < x < 1: una percentuale di montaggio È una frazione. Un
 * `*2` o un `*1.15` che finisse sotto questa regex sarebbe un'altra cosa, e
 * promuoverlo a "percentuale del listino" produrrebbe prezzi inventati con
 * l'aria di essere stati letti dal file. Fuori range → `null`, e chi chiama
 * prende la sua strada dichiarata.
 */
export function moltiplicatoreDaFormula(formula: string): number | null {
  const m = formula.match(/\*\s*([0-9]+(?:\.[0-9]+)?)\s*(%?)/)
  if (!m) return null

  const grezzo = parseFloat(m[1])
  if (!Number.isFinite(grezzo)) return null

  const valore = m[2] === '%' ? grezzo / 100 : grezzo
  return valore > 0 && valore < 1 ? valore : null
}

/**
 * Normalizza un'etichetta di intestazione per il confronto: stringa pulita,
 * minuscola, spazi interni collassati. Es. "  DA " → "da", "IMPORTO" → "importo".
 */
export function normLabel(value: unknown): string {
  return safeString(value).toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * Individua la riga di intestazione che contiene TUTTE le etichette richieste
 * (match esatto dopo `normLabel`) entro le prime `maxScan` righe, e ne ricava la
 * colonna di ciascuna. Permette di leggere i fogli per intestazione invece che
 * per indice fisso: resiste a righe-titolo sopra l'header e a spostamenti di
 * colonna. Ritorna `null` se l'header non è individuabile.
 *
 * Le chiavi della mappa `cols` sono le etichette NORMALIZZATE.
 */
export function findHeaderRow(
  rows: unknown[][],
  labels: string[],
  maxScan = 20
): { rowIndex: number; cols: Record<string, number> } | null {
  const wanted = labels.map(normLabel)
  const limit = Math.min(rows.length, maxScan)

  for (let i = 0; i < limit; i++) {
    const row = rows[i]
    if (!row) continue

    const cols: Record<string, number> = {}
    for (let c = 0; c < row.length; c++) {
      const norm = normLabel(row[c])
      // Prima occorrenza vince (non sovrascrivo se l'etichetta ricompare).
      if (wanted.includes(norm) && !(norm in cols)) {
        cols[norm] = c
      }
    }

    if (wanted.every((w) => w in cols)) {
      return { rowIndex: i, cols }
    }
  }

  return null
}
