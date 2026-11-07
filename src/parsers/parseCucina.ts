import * as XLSX from 'xlsx'
import type { ListinoCucina, VoceStrutturaCucina } from '@/types/cucina'
import { normLabel, safeString, sheetToRows } from './parserUtils'

// ── Parser del listino cucine (foglio CUCINA, PR 10b-1) ──
// Gira nel worker. Riceve la STRUTTURA delle voci (id, nome, blocco, kind, unità)
// e nessun prezzo: i prezzi li porta solo il file (D7). Legge i nomi in colonna A,
// i valori in colonna B e le unità in colonna C, e abbina per nome dopo `normLabel`.
// Nessuna formula: il listino porta ogni prezzo e percentuale come numero in B.

export const FOGLIO_CUCINA = 'CUCINA'

/** Intestazioni di riga 2 verificate prima di leggere: il foglio si legge per colonna. */
export const INTESTAZIONI_CUCINA: ReadonlyArray<readonly [colonna: 'B' | 'C', indice: number, attesa: string]> = [
  ['B', 1, 'prezzo unitario'],
  ['C', 2, "unita'"],
]

/** Unità in colonna C di toggle e moltiplicatori: il foglio le scrive così. */
const UNITA_INTERRUTTORE = '1vero 0falso'

/**
 * Righe con un valore in B che non sono voci del catalogo. Le prime quattro si
 * leggono; le ultime due no: l'extra manuale nell'app è una casella a parte e
 * l'IVA non entra nell'imponibile. Nessuna finisce fra le righe sconosciute.
 */
const RIGHE_NOTE = {
  vasca: 'vasca integrata in gres',
  giorni: 'giorni extra realizzazione',
  progettazione: 'progettazione',
  adeguamento: 'adeguamento prezzi',
  extra: 'extra legno extra finitura / varie',
  iva: 'iva',
} as const

/** Prima riga dati (1-based, come Excel): riga 1 titolo, riga 2 intestazioni, riga 3 vuota. */
const PRIMA_RIGA = 4

function cella(colonna: 'B' | 'C', riga: number): string {
  return `${FOGLIO_CUCINA}!${colonna}${riga}`
}

/** Un numero finito ≥ 0, o l'errore che dice dove. */
function valoreB(v: unknown, riga: number, nome: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
    throw new Error(
      `${cella('B', riga)}: valore non valido per «${nome}» (${safeString(v) || 'vuoto'}). ` +
        'Serve un numero maggiore o uguale a zero'
    )
  }
  return v
}

/** Cosa si accumula leggendo il foglio, riga per riga. */
interface Lettura {
  prezzi: ListinoCucina['prezzi']
  percentuali: ListinoCucina['percentuali']
  giornoRate: number | null
  vascaGres: number | null
  righeSconosciute: string[]
  /** id → riga dove la voce è stata letta: serve a riconoscere i doppioni. */
  viste: Map<string, number>
}

function foglioCucina(workbook: XLSX.WorkBook): XLSX.WorkSheet {
  const nomeFoglio = workbook.SheetNames.find((n) => normLabel(n) === normLabel(FOGLIO_CUCINA))
  const sheet = nomeFoglio ? workbook.Sheets[nomeFoglio] : undefined
  if (!sheet) throw new Error(`Foglio ${FOGLIO_CUCINA} non trovato`)
  return sheet
}

function verificaIntestazioni(rigaDue: unknown[] | undefined): void {
  for (const [colonna, indice, attesa] of INTESTAZIONI_CUCINA) {
    const trovata = normLabel(rigaDue?.[indice])
    if (trovata !== attesa) {
      throw new Error(
        `Foglio ${FOGLIO_CUCINA}, riga 2, colonna ${colonna}: intestazione attesa «${attesa.toUpperCase()}», ` +
          `trovata «${trovata || '(vuota)'}». L'app legge questo foglio per colonna: con una colonna ` +
          'spostata i prezzi finirebbero sulla voce sbagliata, quindi il listino non si carica'
      )
    }
  }
}

/** Una riga che è una voce della struttura: doppione, poi valore, poi unità. */
function leggiVoce(voce: VoceStrutturaCucina, row: unknown[] | undefined, r: number, nome: string, l: Lettura): void {
  const gia = l.viste.get(voce.id)
  if (gia !== undefined) {
    throw new Error(`${FOGLIO_CUCINA}: «${nome}» compare due volte (righe ${gia} e ${r}), il prezzo sarebbe ambiguo`)
  }
  l.viste.set(voce.id, r)
  const valore = valoreB(row?.[1], r, nome)
  const attesa = voce.unita === null ? UNITA_INTERRUTTORE : normLabel(voce.unita)
  if (normLabel(row?.[2]) !== attesa) {
    throw new Error(
      `${cella('C', r)}: unità «${safeString(row?.[2]) || 'vuota'}» per «${nome}», attesa ` +
        `«${voce.unita ?? '1VERO 0FALSO'}». Con un'unità diversa il prezzo vuol dire un'altra cosa`
    )
  }
  if (voce.kind !== 'moltiplicatore') l.prezzi.push({ id: voce.id, prezzo: valore })
  else if (voce.id === 'casse' || voce.id === 'ante') l.percentuali[voce.id] = valore
}

/** Una riga che non è una voce: una delle righe note, oppure sconosciuta se ha un valore. */
function leggiAltraRiga(n: string, b: unknown, r: number, nome: string, l: Lettura): void {
  switch (n) {
    case RIGHE_NOTE.vasca:
      l.vascaGres = valoreB(b, r, nome)
      return
    case RIGHE_NOTE.giorni:
      l.giornoRate = valoreB(b, r, nome)
      return
    case RIGHE_NOTE.progettazione:
      l.percentuali.progettazione = valoreB(b, r, nome)
      return
    case RIGHE_NOTE.adeguamento:
      l.percentuali.adeguamento = valoreB(b, r, nome)
      return
    case RIGHE_NOTE.extra:
    case RIGHE_NOTE.iva:
      return
    default:
      // Titoli e totali non hanno un numero in B: una riga sconosciuta CON un valore
      // è una voce che l'app non sa ancora prezzare.
      if (typeof b === 'number') l.righeSconosciute.push(nome)
  }
}

export function parseCucina(workbook: XLSX.WorkBook, struttura: readonly VoceStrutturaCucina[]): ListinoCucina {
  const sheet = foglioCucina(workbook)
  const rows = sheetToRows(sheet)
  // `sheet_to_json` parte dalla prima riga del range: l'indice diventa la riga Excel così.
  const primaRiga = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1').s.r + 1
  verificaIntestazioni(rows[2 - primaRiga])

  const perNome = new Map(struttura.map((v) => [normLabel(v.nome), v]))
  const l: Lettura = {
    prezzi: [],
    percentuali: { casse: null, ante: null, progettazione: null, adeguamento: null },
    giornoRate: null,
    vascaGres: null,
    righeSconosciute: [],
    viste: new Map(),
  }

  rows.forEach((row, i) => {
    const r = i + primaRiga
    const nome = safeString(row?.[0])
    if (r < PRIMA_RIGA || !nome) return
    const n = normLabel(nome)
    const voce = perNome.get(n)
    if (voce) leggiVoce(voce, row, r, nome, l)
    else leggiAltraRiga(n, row?.[1], r, nome, l)
  })

  if (l.viste.size === 0) {
    throw new Error(
      `Nessuna voce del catalogo cucine trovata nel foglio ${FOGLIO_CUCINA}: il file non sembra il listino cucine`
    )
  }

  return {
    prezzi: l.prezzi,
    percentuali: l.percentuali,
    giornoRate: l.giornoRate,
    vascaGres: l.vascaGres,
    vociMancanti: struttura.filter((v) => !l.viste.has(v.id)).map((v) => v.id),
    righeSconosciute: l.righeSconosciute,
    aggiornato: new Date().toISOString(),
  }
}
