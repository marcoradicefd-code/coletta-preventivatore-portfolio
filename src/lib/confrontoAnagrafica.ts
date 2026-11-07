import { normalizzaRicerca } from '@/utils/ricerca'
import { perCodice } from '@/utils/impronta'
import type { RigaAnagrafica } from '@/lib/anagraficaCsv'

/**
 * Il confronto fra il file da importare e i clienti già nell'app (L21, PR C,
 * aggiunta del 14/10). Un cliente creato a mano non ha il codice gestionale,
 * quindi l'upsert sul codice non lo ritrova: lo si cerca per nome, email,
 * telefono e partita IVA, e ogni corrispondenza è un «possibile doppione» da mostrare, MAI da
 * fondere in automatico. Tutto puro: indici per chiave, niente O(n²).
 */

/** I campi scaricati per il confronto: solo questi (GDPR art. 5(1)(c), selettore minimo). */
export interface ClienteConfronto {
  id: string
  ragione_sociale: string
  nome: string | null
  cognome: string | null
  email: string | null
  telefono: string | null
  /** F3 (verdetto del 15/10): località e partita IVA distinguono due omonimi senza contatti. */
  localita: string | null
  partita_iva: string | null
}

export type Motivo = 'nome' | 'email' | 'telefono' | 'piva'
export const MOTIVI: readonly Motivo[] = ['nome', 'email', 'telefono', 'piva']
export const ETICHETTA_MOTIVO: Record<Motivo, string> = {
  nome: 'stesso nome',
  email: 'stessa email',
  telefono: 'stesso telefono',
  piva: 'stessa partita IVA',
}

/**
 * Titoli che precedono un nome nel gestionale o nell'app, scritti senza punti e
 * accenti («Sig.ra» → «sigra»): restano in `ragione_sociale`, ma non contano
 * nel confronto.
 */
const TITOLI = new Set([
  'arch', 'ing', 'geom', 'dott', 'dottssa', 'dssa', 'dr', 'drssa', 'avv', 'prof', 'profssa', 'rag',
  'sig', 'sigra', 'signa', 'sigri', 'sigre', 'sigina', 'sigg', 'siggri', 'spett', 'spettle', 'egr', 'gent', 'gentmo', 'gentma',
  'ill', 'illmo', 'illma', 'cav', 'comm',
])

/**
 * Una parola senza il titolo davanti. I punti dividono la parola in pezzi: il
 * titolo è il prefisso più lungo di pezzi che, uniti, è nell'elenco («sig.ra»
 * tutto, «arch» di «arch.rossi»); il resto si unisce senza punti («s.r.l.» →
 * «srl»). F1 del verdetto del 15/10: prima i punti si toglievano prima di
 * cercare il titolo, e «Arch.Rossi» diventava «archrossi».
 */
function senzaTitolo(parola: string): string {
  const pezzi = parola.split('.').filter(Boolean)
  for (let n = pezzi.length; n > 0; n--) {
    if (TITOLI.has(pezzi.slice(0, n).join(''))) return pezzi.slice(n).join('')
  }
  return pezzi.join('')
}

/**
 * La chiave del nome: minuscole e accenti tolti (`normalizzaRicerca`, NFD),
 * apostrofi tolti («D'Amico» → «damico»), ogni altro segno tranne il punto uno
 * spazio, titoli tolti (`senzaTitolo`), parole in ordine: «Rossi Mario» e
 * «Mario Rossi» hanno la stessa chiave.
 */
export function chiaveNome(testo: string | null | undefined): string | null {
  const parole = normalizzaRicerca(testo ?? '')
    .replaceAll(/['’`]/g, '')
    .split(/[^\p{L}\p{N}.]+/u)
    .map(senzaTitolo)
    .filter(Boolean)
  return parole.length > 0 ? parole.toSorted(perCodice).join(' ') : null
}

/** La chiave dell'email: minuscole, senza spazi agli estremi; senza chiocciola nessuna chiave. */
export function chiaveEmail(testo: string | null | undefined): string | null {
  const e = (testo ?? '').trim().toLowerCase()
  return e.includes('@') ? e : null
}

/** Sotto queste cifre un telefono non identifica nessuno (un segnaposto, un interno). */
const CIFRE_MINIME = 6

/** Cifre tutte uguali («000 0000000»): un segnaposto, non un numero (F4 del verdetto del 15/10). */
const SEGNAPOSTO = /^(\d)\1*$/

/** Un numero: prima solo cifre e `+` («(+39)», «+ 39» e «00 39» diventano `+39…`/`0039…`), poi via il prefisso. */
function chiaveUnTelefono(parte: string): string | null {
  const cifre = parte.replaceAll(/[^\d+]/g, '').replace(/^(?:\+|00)39/, '').replaceAll('+', '')
  return cifre.length >= CIFRE_MINIME && !SEGNAPOSTO.test(cifre) ? cifre : null
}

/**
 * Le chiavi del telefono: il campo può avere più numeri, divisi da `/`, `;`,
 * `,` o « - » (F2 del verdetto del 15/10), e ognuno dà la sua chiave.
 */
export function chiaviTelefono(testo: string | null | undefined): string[] {
  return (testo ?? '')
    .split(/[/;,]| - /)
    .map(chiaveUnTelefono)
    .filter((c): c is string => c !== null)
}

/** La chiave della partita IVA: lettere e cifre, senza «IT» davanti; corta o segnaposto, nessuna (F3). */
export function chiavePiva(testo: string | null | undefined): string | null {
  const p = (testo ?? '').toUpperCase().replaceAll(/[^A-Z0-9]/g, '').replace(/^IT(?=\d)/, '')
  return p.length >= 8 && !SEGNAPOSTO.test(p) ? p : null
}

type Chiavi = Record<Motivo, (string | null)[]>

const chiaviCliente = (c: ClienteConfronto): Chiavi => ({
  nome: [chiaveNome(c.ragione_sociale), chiaveNome(`${c.nome ?? ''} ${c.cognome ?? ''}`)],
  email: [chiaveEmail(c.email)],
  telefono: chiaviTelefono(c.telefono),
  piva: [chiavePiva(c.partita_iva)],
})

const chiaviRiga = (r: RigaAnagrafica): Chiavi => ({
  nome: [chiaveNome(r.ragione_sociale)],
  email: [chiaveEmail(r.email)],
  telefono: chiaviTelefono(r.telefono),
  piva: [chiavePiva(r.partita_iva)],
})

type Indice<T> = Record<Motivo, Map<string, T[]>>

function aggiungi<T>(mappa: Map<string, T[]>, chiave: string, voce: T): void {
  const elenco = mappa.get(chiave)
  if (elenco) elenco.push(voce)
  else mappa.set(chiave, [voce])
}

function creaIndice<T>(voci: readonly T[], chiavi: (v: T) => Chiavi): Indice<T> {
  const indice: Indice<T> = { nome: new Map(), email: new Map(), telefono: new Map(), piva: new Map() }
  for (const v of voci) {
    const k = chiavi(v)
    for (const m of MOTIVI) {
      for (const chiave of new Set(k[m])) {
        if (chiave !== null) aggiungi(indice[m], chiave, v)
      }
    }
  }
  return indice
}

export interface Candidato {
  cliente: ClienteConfronto
  motivi: Motivo[]
}

export type VocePiano =
  | { tipo: 'nuovo'; riga: RigaAnagrafica }
  | { tipo: 'esistente'; riga: RigaAnagrafica; clienteId: string }
  | { tipo: 'doppione'; riga: RigaAnagrafica; candidati: Candidato[] }

export interface Piano {
  voci: VocePiano[]
  /** Righe del file con la stessa chiave: si mostrano, non si fondono. */
  doppioniNelFile: { motivo: Motivo; righe: number[] }[]
}

/** I clienti dell'app con una chiave in comune con la riga, e quali chiavi. */
function candidatiDi(riga: RigaAnagrafica, indice: Indice<ClienteConfronto>): Candidato[] {
  const trovati = new Map<ClienteConfronto, Motivo[]>()
  const chiavi = chiaviRiga(riga)
  for (const m of MOTIVI) {
    for (const c of chiavi[m].flatMap((k) => (k === null ? [] : (indice[m].get(k) ?? [])))) {
      const motivi = trovati.get(c) ?? []
      if (!motivi.includes(m)) motivi.push(m)
      trovati.set(c, motivi)
    }
  }
  return [...trovati].map(([cliente, motivi]) => ({ cliente, motivi }))
}

/**
 * Per ogni riga valida del file: col codice già nell'app è un aggiornamento
 * (`esistente`); senza, se nome, email o telefono combaciano con un cliente
 * dell'app senza codice è un `doppione`, altrimenti `nuovo`.
 */
export function pianificaImport(
  righe: readonly RigaAnagrafica[],
  senzaCodice: readonly ClienteConfronto[],
  conCodice: ReadonlyMap<string, string>
): Piano {
  const indice = creaIndice(senzaCodice, chiaviCliente)
  const voci = righe.map((riga): VocePiano => {
    const clienteId = conCodice.get(riga.codice_gestionale)
    if (clienteId) return { tipo: 'esistente', riga, clienteId }
    const candidati = candidatiDi(riga, indice)
    return candidati.length > 0 ? { tipo: 'doppione', riga, candidati } : { tipo: 'nuovo', riga }
  })
  const nelFile = creaIndice(righe, chiaviRiga)
  const doppioniNelFile = MOTIVI.flatMap((motivo) =>
    [...nelFile[motivo].values()].filter((g) => g.length > 1).map((g) => ({ motivo, righe: g.map((r) => r.riga) }))
  )
  return { voci, doppioniNelFile }
}

/** La scelta dell'admin per un possibile doppione. Di default nessuna. */
export type Scelta = { tipo: 'collega'; clienteId: string } | { tipo: 'nuovo' } | { tipo: 'salta' }

/**
 * Le scelte che mancano o non vanno: senza una scelta valida per ogni
 * doppione l'import non parte. Un cliente dell'app si collega a una riga sola
 * (il codice, una volta scritto, non cambia), e solo a una riga di cui è
 * candidato.
 */
export function controllaScelte(
  piano: Piano,
  scelte: ReadonlyMap<number, Scelta>
): { mancanti: number[]; collegatiDueVolte: number[]; fuoriElenco: number[] } {
  const mancanti: number[] = []
  const collegatiDueVolte: number[] = []
  const fuoriElenco: number[] = []
  const collegati = new Set<string>()
  for (const v of piano.voci) {
    if (v.tipo !== 'doppione') continue
    const s = scelte.get(v.riga.riga)
    if (!s) mancanti.push(v.riga.riga)
    else if (s.tipo === 'collega') {
      if (!v.candidati.some((c) => c.cliente.id === s.clienteId)) fuoriElenco.push(v.riga.riga)
      else if (collegati.has(s.clienteId)) collegatiDueVolte.push(v.riga.riga)
      else collegati.add(s.clienteId)
    }
  }
  return { mancanti, collegatiDueVolte, fuoriElenco }
}

/**
 * I conteggi del piano con le scelte, per la conferma prima di scrivere (F6 del
 * verdetto del 15/10): un «Collega» non si disfa, e la conferma deve dirlo.
 */
export function riassuntoScelte(
  piano: Piano,
  scelte: ReadonlyMap<number, Scelta>
): { nuovi: number; collegati: number; daRiempire: number; saltati: number } {
  const conta = { nuovi: 0, collegati: 0, daRiempire: 0, saltati: 0 }
  for (const v of piano.voci) {
    const s = v.tipo === 'doppione' ? scelte.get(v.riga.riga)?.tipo : v.tipo
    if (s === 'collega') conta.collegati++
    else if (s === 'esistente') conta.daRiempire++
    else if (s === 'salta') conta.saltati++
    else conta.nuovi++
  }
  return conta
}
