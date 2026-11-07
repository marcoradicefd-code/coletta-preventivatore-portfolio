import type * as XLSX from 'xlsx'
import type { ListinoPorte, ModelloPorta, OptionalPorta, UnitaOptionalPorta } from '@/types/porte'
import { safeString, sheetToRows, isEmptyRow, findHeaderRow, normLabel } from './parserUtils'

// ── Parser LISTINO Porte (SPEC_FASE2 §B.4) ──
// Legge il workbook (xlsx/ods) per INTESTAZIONE/label, non per indice fisso.
//
// La colonna dei prezzi è "PREZZO <anno>", NON "PREZZO 2026" fisso (E8): il match
// era accoppiato all'anno, e il listino 2027 sarebbe fallito finché qualcuno non
// aggiornava l'app. Ora si prende la colonna `PREZZO <anno>` col numero d'anno
// (`20\d\d`) e, se ce n'è più d'una, vince l'ANNO PIÙ ALTO — così un file che
// tiene sia il 2026 sia il 2027 usa il nuovo.
//
// `PREZZO 1` (il listino 2024) non matcha per costruzione: "1" non è `20\d\d`.
// Il campo prodotto si chiama ancora `prezzo2026` — è il nome INTERNO, persistito
// nello snapshot dei preventivi (#22): rinominarlo sarebbe una migrate, non un
// refactor cosmetico. Il vincolo temporale era nel match dell'header, e lì è tolto.
//
// I prezzi del .ods portano rumore float (880.0000000000001) → arrotondati a 2.

const round2 = (n: number): number => Math.round(n * 100) / 100

/** Header di una colonna prezzo annuale, dopo `normLabel`: "prezzo 2026", "prezzo 2027". */
const COLONNA_PREZZO_ANNO = /^prezzo\s+(20\d{2})$/

/** Numero da cella: number nativo, o stringa INTERAMENTE numerica ("200" / "1,2"). */
function cellNumber(cell: unknown): number | null {
  if (typeof cell === 'number') return Number.isFinite(cell) ? cell : null
  const s = String(cell ?? '').trim().replace(/\s|€/g, '')
  if (/^\d+([.,]\d+)?$/.test(s)) return parseNumIt(s)
  return null
}

/** Primo numero in una stringa, con virgola decimale IT ("1,2€ …" → 1.2). */
function parseNumIt(s: string): number | null {
  const m = String(s).match(/(\d+)(?:[.,](\d+))?/)
  if (!m) return null
  const n = parseFloat(m[2] != null ? `${m[1]}.${m[2]}` : m[1])
  return Number.isFinite(n) ? n : null
}

/**
 * Indice della colonna "PREZZO <anno>" nella riga d'intestazione, o `null`.
 * Se più colonne matchano (il file tiene 2026 e 2027), vince l'anno più alto.
 * `PREZZO 1` e `PREZZO 1.320,00` NON matchano: l'ancora `$` e `20\d\d` li escludono.
 */
function colonnaPrezzoAnno(headerRow: unknown[] | undefined): number | null {
  if (!headerRow) return null
  let col: number | null = null
  let annoMax = -1
  for (let c = 0; c < headerRow.length; c++) {
    const m = normLabel(headerRow[c]).match(COLONNA_PREZZO_ANNO)
    if (!m) continue
    const anno = Number(m[1])
    if (anno > annoMax) {
      annoMax = anno
      col = c
    }
  }
  return col
}

// ── Foglio `modello_porta` ──
function parseModelli(sheet: XLSX.WorkSheet): { modelli: ModelloPorta[]; avvisi: string[] } {
  const rows = sheetToRows(sheet)
  // Le colonne STRUTTURALI (nome + fasce) hanno nomi fissi. La colonna prezzo no:
  // il suo header porta l'anno, quindi la si cerca a parte col pattern.
  const header = findHeaderRow(rows, ['MODELLO PORTA', 'H>215', 'H>240'])
  if (!header) {
    throw new Error(
      'Foglio "modello_porta": intestazione (MODELLO PORTA / H>215 / H>240) non trovata'
    )
  }
  const cNome = header.cols['modello porta']
  const c215 = header.cols['h>215']
  const c240 = header.cols['h>240']

  // Colonna prezzo = "PREZZO <anno>" nella riga d'intestazione; più d'una → l'anno
  // più alto. Il messaggio d'errore è quello che Antonio legge nella notifica
  // persistente: dice cosa cercavo e cosa ho trovato al suo posto.
  const c2026 = colonnaPrezzoAnno(rows[header.rowIndex])
  if (c2026 === null) {
    const intestazioni = (rows[header.rowIndex] ?? [])
      .map((c) => safeString(c))
      .filter((c) => c !== '')
      .join(' / ')
    throw new Error(
      'Foglio "modello_porta": manca la colonna dei prezzi. Cercavo una colonna ' +
        '"PREZZO <anno>" (es. PREZZO 2027). ' +
        `Intestazioni trovate: ${intestazioni || '(nessuna)'}.`
    )
  }

  const modelli: ModelloPorta[] = []
  const senzaPrezzo: string[] = []
  for (let i = header.rowIndex + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || isEmptyRow(row)) continue
    const nome = safeString(row[cNome])
    if (!nome) continue // riga-spazzatura / nota senza modello
    const prezzo2026 = cellNumber(row[c2026])
    if (prezzo2026 === null) {
      // Un modello senza numero nella colonna dell'anno (vuota o testo come
      // «n.d.») non entra nel listino: non avrebbe un prezzo base. Zod non lo
      // vede (guarda i modelli letti, non quelli scartati), quindi lo dice il
      // referto, e l'upload resta consentito.
      senzaPrezzo.push(nome)
      continue
    }
    modelli.push({
      nome,
      prezzo2026: round2(prezzo2026),
      h215: round2(cellNumber(row[c215]) ?? 0),
      h240: round2(cellNumber(row[c240]) ?? 0),
    })
  }
  const avvisi =
    senzaPrezzo.length > 0
      ? [
          `Colonna «${safeString(rows[header.rowIndex]?.[c2026])}»: modelli senza prezzo, non caricati ` +
            `e non selezionabili nelle Porte (${senzaPrezzo.length}): ${senzaPrezzo.join(', ')}`,
        ]
      : []
  return { modelli, avvisi }
}

// ── Foglio `optional` ──
function mapUnita(unitaRaw: string): UnitaOptionalPorta | null {
  if (unitaRaw.includes('porta')) return 'PORTA'
  if (unitaRaw.includes('mq')) return 'MQ'
  if (unitaRaw.includes('pezzo')) return 'PEZZO'
  if (unitaRaw.includes('ml')) return 'ML'
  return null
}

/**
 * Classifica prezzo+unità di un optional. Il foglio mescola numeri (150/40/1500)
 * e testo: "campo vuoto…" → MANUALE; "1,2€ per ogni cm…" → ML formula; "+20%
 * rispetto al battiscopa" → ML = ultimo rate ML × (1+20%). `lastMlRate` porta il
 * rate dell'ML precedente (il battiscopa viene prima della sua variante).
 */
function classifyOptional(
  unitaRaw: string,
  cell: unknown,
  lastMlRate: number | null
): { unita: UnitaOptionalPorta; prezzo: number | null } {
  const num = cellNumber(cell)
  const mapped = mapUnita(unitaRaw)
  if (num !== null) return { unita: mapped ?? 'PORTA', prezzo: round2(num) }

  const text = normLabel(cell)
  if (text.includes('manuale') || text.includes('vuoto')) {
    return { unita: 'MANUALE', prezzo: null }
  }
  if (text.includes('cm')) {
    // Formula €/cm (battiscopa): "1,2€ per ogni cm di altezza".
    const rate = parseNumIt(text)
    return { unita: 'ML', prezzo: rate !== null ? round2(rate) : null }
  }
  // Il lookbehind fa partire il numero solo all'inizio di un gruppo di cifre: su
  // una fila di cifre senza «%» il tentativo non riparte da ogni cifra (costo
  // lineare, non quadratico). Stesso risultato di prima su ogni testo, perché il
  // primo match partiva già lì. Niente quantificatori limitati: su
  // «30.000000000000004%» partirebbero dai decimali e leggerebbero 4.
  const pctM = /(?<!\d)(\d+(?:[.,]\d+)?)\s*%/.exec(text)
  if (pctM) {
    // Modificatore sul battiscopa: "+20% rispetto al prezzo del battiscopa".
    const pct = parseNumIt(pctM[1])
    return {
      unita: 'ML',
      prezzo: lastMlRate !== null && pct !== null ? round2(lastMlRate * (1 + pct / 100)) : null,
    }
  }
  // Testo non riconosciuto → prezzo a mano.
  return { unita: mapped ?? 'MANUALE', prezzo: null }
}

function parseOptional(sheet: XLSX.WorkSheet): OptionalPorta[] {
  const rows = sheetToRows(sheet)

  // Header robusto: cerco la cella "UNITA' DI MISURA" (apostrofo dritto/curvo
  // variabile) nelle prime righe → ne ricavo la colonna unità.
  let hRow = -1
  let cUnita = -1
  for (let i = 0; i < Math.min(rows.length, 10) && hRow < 0; i++) {
    const row = rows[i] ?? []
    for (let c = 0; c < row.length; c++) {
      const lbl = normLabel(row[c])
      if (lbl.includes('unit') && lbl.includes('misura')) {
        hRow = i
        cUnita = c
        break
      }
    }
  }
  if (hRow < 0) {
    throw new Error('Foglio "optional": intestazione "UNITA\' DI MISURA" non trovata')
  }
  const cNome = Math.max(0, cUnita - 1)
  const cPrezzo = cUnita + 1
  const cNote = cUnita + 2

  const optional: OptionalPorta[] = []
  let lastMlRate: number | null = null

  for (let i = hRow + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || isEmptyRow(row)) continue
    const nome = safeString(row[cNome])
    if (!nome) continue
    const { unita, prezzo } = classifyOptional(normLabel(row[cUnita]), row[cPrezzo], lastMlRate)
    if (unita === 'ML' && prezzo !== null) lastMlRate = prezzo
    const note = safeString(row[cNote]) || undefined
    optional.push({ nome, unita, prezzo, note })
  }
  return optional
}

// ── ENTRY POINT ──
export function parsePorte(workbook: XLSX.WorkBook): ListinoPorte {
  const modelliSheet = workbook.Sheets['modello_porta']
  if (!modelliSheet) throw new Error('Foglio "modello_porta" non trovato')

  const optionalSheet = workbook.Sheets['optional']
  if (!optionalSheet) throw new Error('Foglio "optional" non trovato')

  const { modelli, avvisi } = parseModelli(modelliSheet)
  return {
    modelli,
    optional: parseOptional(optionalSheet),
    aggiornato: new Date().toISOString(),
    ...(avvisi.length > 0 ? { avvisi } : {}),
  }
}
