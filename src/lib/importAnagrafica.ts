import { supabase } from '@/lib/supabase'
import { esegui, eseguiConLock, type Esito } from '@/lib/erroriDb'
import { COLONNE, type ClienteDb } from '@/lib/clientiDb'
import { CAMPI_CLIENTE, type CampoCliente, type RigaAnagrafica, type RigaScartata } from '@/lib/anagraficaCsv'
import { controllaScelte, type ClienteConfronto, type Piano, type Scelta } from '@/lib/confrontoAnagrafica'

/**
 * Le scritture dell'import dell'anagrafica (L21, PR C). Scrive come l'admin
 * autenticato, con la chiave anon e l'RLS: nessuna chiave di servizio, niente
 * lato server. Il codice gestionale lo scrive solo l'admin (0006, lo ripete il
 * database). Nessun log: gli esiti hanno solo numeri di riga e motivi, mai un
 * valore del file (`erroriDb`).
 */

/**
 * I campi scaricati per il confronto dei doppioni: solo questi (selettore
 * minimo, GDPR art. 5(1)(c)). Località e partita IVA (F3 del verdetto del
 * 15/10) distinguono due omonimi senza contatti, nella chiave e nella scelta.
 */
export const COLONNE_CONFRONTO = 'id, ragione_sociale, nome, cognome, email, telefono, localita, partita_iva'

/** Righe per INSERT, e id per lettura (un `in` più lungo allunga troppo l'URL). */
export const LOTTO_IMPORT = 100

const MSG_CODICE_GIA = 'il codice gestionale c’è già nell’anagrafica: rilancia l’import per aggiornare il cliente'
const MSG_DATO_NON_VALIDO = 'un valore della riga non è accettato dal database (troppo lungo, mancante o di formato sbagliato)'

/** DB-1: il server non ha risposto, o ha risposto con un errore suo (5xx, nessun codice): una scrittura in volo può essere arrivata. */
export const MSG_FERMO_SCONOSCIUTO =
  'Import fermato: il server non ha risposto, o ha risposto con un errore suo. Per le righe qui sotto l’esito è sconosciuto o non sono state scritte: rilancia l’import, le righe già arrivate risultano presenti e non si duplicano.'
export const MSG_FERMO_NON_CONSENTITO =
  'Import fermato: operazione non consentita per questo account (l’import è dell’amministratore). Le righe qui sotto non sono state scritte.'
export const MSG_FERMO_SESSIONE =
  'Import fermato: la sessione è scaduta. Esci, accedi di nuovo e rilancia l’import: le righe già scritte risultano presenti.'
export const MSG_FERMO_TROPPE =
  'Import fermato: troppe richieste al server. Aspetta qualche minuto e rilancia l’import: le righe già scritte risultano presenti.'

type ErroreDb = Extract<Esito<never>, { ok: false }>

/**
 * DB-2 del verdetto sulla #99: un errore dei dati di una riga (unicità,
 * check, NOT NULL, classe 22) si ripiega riga per riga; ogni altro errore vale
 * per tutte le righe (permessi, sessione, 429, 5xx, rete) e l'import si ferma,
 * invece di ripetere la stessa richiesta riga per riga.
 */
function erroreDeiDati(e: ErroreDb): boolean {
  return !e.rete && (e.status ?? 0) < 500 && !!e.codice && (['23505', '23514', '23502'].includes(e.codice) || e.codice.startsWith('22'))
}

/** Il motivo per cui l'import si ferma, per un errore che non è dei dati. */
function motivoFermo(e: ErroreDb): string {
  if (e.rete || (e.status ?? 0) >= 500) return MSG_FERMO_SCONOSCIUTO
  if (e.status === 429) return MSG_FERMO_TROPPE
  if (e.codice === '42501') return MSG_FERMO_NON_CONSENTITO
  if (e.codice === 'PGRST301' || e.codice === 'PGRST303') return MSG_FERMO_SESSIONE
  if (!e.codice) return MSG_FERMO_SCONOSCIUTO
  return `Import fermato: ${e.errore} Le righe qui sotto non sono state scritte: rilancia l’import.`
}
const MSG_CONFLITTO = 'il cliente è stato modificato da un’altra parte durante l’import: rilancia l’import'
const MSG_HA_CODICE = 'il cliente dell’app ha già un codice gestionale: rilancia l’import'
const MSG_SPARITO = 'il cliente dell’app non c’è più: rilancia l’import'

/**
 * Tutte le righe di una lettura, a pagine: la pagina dopo parte da dove è
 * finita quella prima, e ci si ferma alla pagina vuota. Così il tetto di righe
 * di PostgREST (1000 di default, ma si configura) non tronca in silenzio.
 */
async function leggiTutte<T>(
  pagina: (da: number, a: number) => PromiseLike<{ data: T[] | null; error: unknown; status?: number }>
): Promise<Esito<T[]>> {
  const tutte: T[] = []
  for (;;) {
    const esito = await esegui(() => pagina(tutte.length, tutte.length + 999))
    if (!esito.ok) return esito
    if (esito.dato.length === 0) return { ok: true, dato: tutte }
    tutte.push(...esito.dato)
  }
}

/** I clienti per il confronto: senza codice i campi del confronto, col codice solo id e codice. */
export async function leggiPerConfronto(): Promise<
  Esito<{ senzaCodice: ClienteConfronto[]; conCodice: Map<string, string> }>
> {
  const senza = await leggiTutte<ClienteConfronto>((da, a) =>
    supabase.from('clienti').select(COLONNE_CONFRONTO).is('codice_gestionale', null).order('id').range(da, a)
  )
  if (!senza.ok) return senza
  const con = await leggiTutte<{ id: string; codice_gestionale: string }>((da, a) =>
    supabase.from('clienti').select('id, codice_gestionale').not('codice_gestionale', 'is', null).order('id').range(da, a)
  )
  if (!con.ok) return con
  return {
    ok: true,
    dato: { senzaCodice: senza.dato, conCodice: new Map(con.dato.map((c) => [c.codice_gestionale, c.id])) },
  }
}

/**
 * I campi del file che vanno dove l'app ha un campo vuoto: quelli scritti a
 * mano non si sovrascrivono mai («Collega», e il rilancio sui clienti col codice).
 */
export function campiDaRiempire(esistente: ClienteDb, riga: RigaAnagrafica): Partial<Record<CampoCliente, string>> {
  const patch: Partial<Record<CampoCliente, string>> = {}
  for (const campo of CAMPI_CLIENTE) {
    const nelFile = riga[campo]
    if (nelFile && !esistente[campo]?.trim()) patch[campo] = nelFile
  }
  return patch
}

const rigaDaInserire = (r: RigaAnagrafica) => ({
  codice_gestionale: r.codice_gestionale,
  ragione_sociale: r.ragione_sociale,
  ...Object.fromEntries(CAMPI_CLIENTE.map((c) => [c, r[c]])),
})

export interface EsitoImport {
  importati: number
  aggiornati: number
  invariati: number
  collegati: number
  saltati: number
  scartate: RigaScartata[]
  /** DB-2: l'import si è fermato a un errore che vale per tutti; le righe non scritte (o dall'esito sconosciuto). */
  fermato: { motivo: string; righe: number[] } | null
}

interface DaAggiornare {
  riga: RigaAnagrafica
  clienteId: string
  collega: boolean
}

/**
 * Scrive il piano con le scelte dell'admin. Senza una scelta valida per ogni
 * possibile doppione non parte (lancia, prima di ogni chiamata). Poi:
 * 1. legge, a lotti per id, i clienti da aggiornare o collegare;
 * 2. li aggiorna uno alla volta, solo nei campi vuoti, con l'optimistic lock
 *    su `updated_at` (zero righe = modificato da un'altra parte: non si
 *    sovrascrive); «Collega» dà anche il codice, solo se il cliente non ce l'ha;
 * 3. inserisce i nuovi a lotti; un lotto rifiutato per i dati si riprova riga
 *    per riga.
 * Un errore che vale per tutti (permessi, sessione, 429, 5xx, rete) ferma
 * l'import lì (DB-1 e DB-2): le righe da lì in poi vanno in `fermato`, con
 * l'esito sconosciuto se la scrittura era in volo; il rilancio lo chiarisce,
 * perché l'unicità del codice non fa nascere doppioni. I cicli con `await`
 * sono voluti: lotti in ordine, stop al primo errore, niente raffiche.
 * Un esito per riga: importati, aggiornati, invariati, collegati, saltati, scartate col motivo.
 */
export async function eseguiImport(
  piano: Piano,
  scelte: ReadonlyMap<number, Scelta>,
  avanzamento?: (fatte: number, totale: number) => void
): Promise<EsitoImport> {
  const controllo = controllaScelte(piano, scelte)
  const nonValide = controllo.mancanti.length + controllo.collegatiDueVolte.length + controllo.fuoriElenco.length
  if (nonValide > 0) throw new Error(`manca la scelta per ${nonValide} possibili doppioni: l’import non parte`)

  const esito: EsitoImport = { importati: 0, aggiornati: 0, invariati: 0, collegati: 0, saltati: 0, scartate: [], fermato: null }
  const { nuovi, daAggiornare, saltati } = smista(piano, scelte)
  esito.saltati = saltati
  const totale = daAggiornare.length + nuovi.length
  let fatte = 0
  const ctx: Contesto = {
    esito,
    fatta: (n = 1) => {
      fatte += n
      avanzamento?.(fatte, totale)
    },
    scarta: (riga, motivo) => esito.scartate.push({ riga, motivo }),
    ferma: (motivo, righe) => {
      esito.fermato ??= { motivo, righe: [] }
      esito.fermato.righe.push(...righe)
    },
  }

  // 1. I clienti da aggiornare, a lotti per id. Una lettura che non riesce ferma tutto, prima di scrivere.
  const letti = await leggiDaAggiornare(daAggiornare)
  if (letti.ok) {
    await aggiornaTutti(daAggiornare, letti.dato, ctx)
    await inserisciTutti(nuovi, ctx)
  } else {
    ctx.ferma(motivoFermo(letti), [...daAggiornare.map((d) => d.riga.riga), ...nuovi.map((r) => r.riga)])
  }
  esito.scartate.sort((a, b) => a.riga - b.riga)
  esito.fermato?.righe.sort((a, b) => a - b)
  return esito
}

/** Lo stato condiviso dei passi dell'import: l'esito, l'avanzamento, gli scarti e lo stop. */
interface Contesto {
  esito: EsitoImport
  fatta: (n?: number) => void
  scarta: (riga: number, motivo: string) => void
  ferma: (motivo: string, righe: number[]) => void
}

/** 2. Aggiornamenti e collegamenti, uno alla volta, fermi al primo errore che vale per tutti. */
async function aggiornaTutti(daAggiornare: readonly DaAggiornare[], letti: ReadonlyMap<string, ClienteDb>, ctx: Contesto) {
  for (const d of daAggiornare) {
    if (ctx.esito.fermato) {
      ctx.ferma(ctx.esito.fermato.motivo, [d.riga.riga])
      continue
    }
    const errore = await aggiorna(d, letti.get(d.clienteId), ctx.esito)
    if (errore && typeof errore !== 'string') ctx.ferma(motivoFermo(errore), [d.riga.riga])
    else if (errore) ctx.scarta(d.riga.riga, errore)
    ctx.fatta()
  }
}

/** 3. I nuovi, a lotti, fermi al primo errore che vale per tutti. */
async function inserisciTutti(nuovi: readonly RigaAnagrafica[], ctx: Contesto) {
  for (let i = 0; i < nuovi.length; i += LOTTO_IMPORT) {
    const lotto = nuovi.slice(i, i + LOTTO_IMPORT)
    if (ctx.esito.fermato) {
      ctx.ferma(ctx.esito.fermato.motivo, lotto.map((r) => r.riga))
      continue
    }
    await inserisci(lotto, ctx.esito, ctx.scarta, ctx.ferma)
    ctx.fatta(lotto.length)
  }
}

/** Le voci del piano secondo le scelte: da inserire, da aggiornare o collegare, saltate. */
function smista(piano: Piano, scelte: ReadonlyMap<number, Scelta>) {
  const nuovi: RigaAnagrafica[] = []
  const daAggiornare: DaAggiornare[] = []
  let saltati = 0
  for (const v of piano.voci) {
    const s = v.tipo === 'doppione' ? scelte.get(v.riga.riga) : undefined
    if (v.tipo === 'esistente') daAggiornare.push({ riga: v.riga, clienteId: v.clienteId, collega: false })
    else if (s?.tipo === 'collega') daAggiornare.push({ riga: v.riga, clienteId: s.clienteId, collega: true })
    else if (s?.tipo === 'salta') saltati++
    else nuovi.push(v.riga)
  }
  return { nuovi, daAggiornare, saltati }
}

/** I clienti da aggiornare, a lotti per id, in serie; al primo lotto che non si legge, l'errore. */
async function leggiDaAggiornare(daAggiornare: readonly DaAggiornare[]): Promise<Esito<Map<string, ClienteDb>>> {
  const letti = new Map<string, ClienteDb>()
  for (let i = 0; i < daAggiornare.length; i += LOTTO_IMPORT) {
    const lotto = daAggiornare.slice(i, i + LOTTO_IMPORT)
    const lettura = await esegui<ClienteDb[]>(() =>
      supabase.from('clienti').select(COLONNE).in('id', lotto.map((d) => d.clienteId))
    )
    if (!lettura.ok) return lettura
    for (const c of lettura.dato) letti.set(c.id, c)
  }
  return { ok: true, dato: letti }
}

/**
 * Un aggiornamento o un collegamento. Restituisce null se è andato, il motivo
 * dello scarto della riga (stringa), o l'errore che ferma l'import.
 */
async function aggiorna(d: DaAggiornare, esistente: ClienteDb | undefined, esito: EsitoImport): Promise<string | ErroreDb | null> {
  if (!esistente) return MSG_SPARITO
  if (d.collega && esistente.codice_gestionale !== null) return MSG_HA_CODICE
  const patch = { ...(d.collega ? { codice_gestionale: d.riga.codice_gestionale } : {}), ...campiDaRiempire(esistente, d.riga) }
  if (Object.keys(patch).length === 0) {
    esito.invariati++
    return null
  }
  const scritto = await eseguiConLock(() => {
    const q = supabase.from('clienti').update(patch).eq('id', esistente.id).eq('updated_at', esistente.updated_at)
    return (d.collega ? q.is('codice_gestionale', null) : q).select('id').maybeSingle()
  }, MSG_CONFLITTO)
  if (!scritto.ok) return scritto.conflitto || erroreDeiDati(scritto) ? scritto.errore : scritto
  if (d.collega) esito.collegati++
  else esito.aggiornati++
  return null
}

/**
 * Un lotto di nuovi. Rifiutato per i dati: si ripiega riga per riga. Ogni
 * altro errore, anche a metà del ripiego, ferma l'import con le righe che restano.
 */
async function inserisci(
  lotto: RigaAnagrafica[],
  esito: EsitoImport,
  scarta: (riga: number, motivo: string) => void,
  ferma: (motivo: string, righe: number[]) => void
) {
  const insieme = await esegui(() => supabase.from('clienti').insert(lotto.map(rigaDaInserire)).select('codice_gestionale'))
  if (insieme.ok) {
    esito.importati += lotto.length
    return
  }
  if (!erroreDeiDati(insieme)) {
    ferma(motivoFermo(insieme), lotto.map((r) => r.riga))
    return
  }
  for (const [i, r] of lotto.entries()) {
    const una = await esegui(
      () => supabase.from('clienti').insert(rigaDaInserire(r)).select('codice_gestionale').single(),
      undefined,
      { '23505': MSG_CODICE_GIA }
    )
    if (una.ok) esito.importati++
    else if (erroreDeiDati(una)) scarta(r.riga, una.codice === '23505' || una.codice === '23514' ? una.errore : MSG_DATO_NON_VALIDO)
    else {
      ferma(motivoFermo(una), lotto.slice(i).map((x) => x.riga))
      return
    }
  }
}
