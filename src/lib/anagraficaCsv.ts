/**
 * Lettura dell'anagrafica da importare (L21, PR C). Accetta SOLO il file pulito
 * dal revisore il 12/10: UTF-8 (con o senza BOM), separatore `;`, campi fra
 * virgolette, intestazioni esatte nell'ordine di `INTESTAZIONI_ANAGRAFICA`.
 * Un'intestazione diversa rifiuta il file intero, col motivo; una riga che non
 * va si scarta da sola, col motivo. Funzioni pure: girano nel worker
 * (`excelParser.worker.ts`, come i listini), e nei test su un CSV finto.
 *
 * I messaggi citano solo numeri di riga e nomi di colonna, mai un valore del
 * file: un file senza intestazione ha un cliente nella prima riga.
 */

export const INTESTAZIONI_ANAGRAFICA = [
  'codice_gestionale',
  'ragione_sociale',
  'telefono',
  'email',
  'indirizzo',
  'cap',
  'localita',
  'provincia',
  'partita_iva',
  'note',
  'segnalazioni',
] as const

/** I campi del cliente che arrivano dal file, oltre a codice e ragione sociale. `segnalazioni` non si importa. */
export const CAMPI_CLIENTE = ['telefono', 'email', 'indirizzo', 'cap', 'localita', 'provincia', 'partita_iva', 'note'] as const
export type CampoCliente = (typeof CAMPI_CLIENTE)[number]

export type RigaAnagrafica = Record<CampoCliente, string | null> & {
  /** Il numero della riga nel file, contando l'intestazione come riga 1 (come in Excel). */
  riga: number
  codice_gestionale: string
  ragione_sociale: string
  /** Per Marco (nessun contatto, possibile doppione…): si mostra nell'anteprima, non si importa. */
  segnalazioni: string | null
}

export interface RigaScartata {
  riga: number
  motivo: string
}

export interface LetturaAnagrafica {
  righe: RigaAnagrafica[]
  scartate: RigaScartata[]
}

/** U+FFFD, costruito: un carattere invisibile o di controllo non si scrive nel sorgente (CLAUDE.md). */
const SOSTITUZIONE = String.fromCodePoint(0xfffd)

/**
 * Testo del file: UTF-8, il BOM tolto dal decoder. Un file che non è UTF-8
 * (riesportato da Excel come «CSV» semplice) si rifiuta: le accentate
 * diventerebbero altre lettere in silenzio.
 */
export function decodificaAnagrafica(buffer: ArrayBuffer): string {
  let testo: string
  try {
    testo = new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    // Il messaggio del decoder non serve a chi importa: il motivo è uno solo.
    throw new Error('il file non è in UTF-8: va esportato come «CSV UTF-8»')
  }
  // F5 (verdetto del 15/10): un file già passato da una conversione sbagliata è
  // UTF-8 valido, ma ha il carattere di sostituzione al posto delle accentate.
  if (testo.includes(SOSTITUZIONE)) {
    throw new Error('il file ha caratteri illeggibili (le accentate sono andate perse in una conversione): riesportalo dal gestionale come «CSV UTF-8»')
  }
  return testo
}

/**
 * Un campo e il suo terminatore. Fra virgolette: tutto fino alle virgolette di
 * chiusura, con `;`, a capo e `""` dentro; senza: fino a `;` o a capo, e le
 * virgolette in mezzo sono un carattere come un altro. Le due alternative
 * cominciano con caratteri diversi: nessun backtracking che esplode.
 */
const CAMPO = /(?:"((?:[^"]|"")*)"|([^;\r\n]*))(;|\r\n|\n|\r|$)/y

/** CSV con `;` (RFC 4180), LF o CRLF. Lancia sulle virgolette non chiuse (file tagliato, o non un CSV). */
export function dividiCsv(testo: string): string[][] {
  const record: string[][] = []
  let riga: string[] = []
  let fine = ''
  CAMPO.lastIndex = 0
  while (CAMPO.lastIndex < testo.length) {
    const m = CAMPO.exec(testo)
    const fraVirgolette = m?.[1]
    const libero = m?.[2] ?? ''
    if (!m || (fraVirgolette === undefined && libero.startsWith('"'))) {
      throw new Error(`virgolette non chiuse nella riga ${record.length + 1}: il file è tagliato o non è un CSV`)
    }
    riga.push(fraVirgolette === undefined ? libero : fraVirgolette.replaceAll('""', '"'))
    fine = m[3]
    if (fine !== ';') {
      record.push(riga)
      riga = []
    }
  }
  // Un `;` in fondo al testo apre un ultimo campo, vuoto.
  if (fine === ';') record.push([...riga, ''])
  return record
}

/** Il BOM di UTF-8, costruito: un carattere invisibile non si scrive nel sorgente (CLAUDE.md). */
const BOM = String.fromCodePoint(0xfeff)

const pulito = (v: string | undefined): string | null => {
  const t = (v ?? '').trim()
  return t.length > 0 ? t : null
}

function verificaIntestazione(testa: string[] | undefined): void {
  if (!testa) throw new Error('il file è vuoto')
  const attese = INTESTAZIONI_ANAGRAFICA.length
  if (testa.length !== attese) {
    throw new Error(`l’intestazione ha ${testa.length} colonne invece di ${attese}: il file non è l’anagrafica pulita, nessuna riga è stata letta`)
  }
  INTESTAZIONI_ANAGRAFICA.forEach((attesa, i) => {
    if (testa[i].trim().toLowerCase() !== attesa) {
      throw new Error(`colonna ${i + 1} dell’intestazione: attesa «${attesa}». Il file non è l’anagrafica pulita: nessuna riga è stata letta`)
    }
  })
}

/** Perché una riga non entra, o null. Solo numeri e nomi di colonna, mai un valore. */
function motivoScarto(campi: number, codice: string | null, ragione: string | null, prima: number | undefined): string | null {
  const attesi = INTESTAZIONI_ANAGRAFICA.length
  if (campi !== attesi) return `${campi} campi invece di ${attesi}`
  if (!codice) return 'codice gestionale mancante'
  if (!ragione) return 'ragione sociale vuota'
  if (prima !== undefined) return `codice gestionale ripetuto nel file (già alla riga ${prima})`
  return null
}

/** Legge il file: righe buone e scartate col motivo. Lancia se il file non è quello (intestazione, virgolette). */
export function leggiCsvAnagrafica(testo: string): LetturaAnagrafica {
  const [testa, ...corpo] = dividiCsv(testo.startsWith(BOM) ? testo.slice(1) : testo)
  verificaIntestazione(testa)
  const righe: RigaAnagrafica[] = []
  const scartate: RigaScartata[] = []
  const codiciVisti = new Map<string, number>()
  for (const [i, campi] of corpo.entries()) {
    const riga = i + 2
    if (campi.every((c) => c.trim() === '')) continue
    const v = Object.fromEntries(INTESTAZIONI_ANAGRAFICA.map((nome, k) => [nome, pulito(campi[k])])) as Record<
      (typeof INTESTAZIONI_ANAGRAFICA)[number],
      string | null
    >
    const codice = v.codice_gestionale ?? ''
    const motivo = motivoScarto(campi.length, v.codice_gestionale, v.ragione_sociale, codiciVisti.get(codice))
    if (motivo) {
      scartate.push({ riga, motivo })
      continue
    }
    codiciVisti.set(codice, riga)
    righe.push({ ...v, riga, codice_gestionale: codice, ragione_sociale: v.ragione_sociale ?? '' })
  }
  return { righe, scartate }
}
