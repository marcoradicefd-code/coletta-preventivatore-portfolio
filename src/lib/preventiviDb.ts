import { supabase } from '@/lib/supabase'
import { esegui, eseguiConLock, type Esito, type MessaggiPer } from '@/lib/erroriDb'
import { migrateQuoteState } from '@/store/quoteMigrations'
import { prezziValidi, preventivoValido, sezioniValide } from '@/store/quoteSchema'
import { QUOTE_VERSION, initialPreventivo } from '@/store/quoteStore'
import { nuovoUuid } from '@/utils/uuid'
import type { Preventivo } from '@/types/common'
import type { SezioniState } from '@/types/quote'
import type { CollegamentoArchivio, NumeroRiservato, PrezziCongelati, PreventivoSalvato, StatoPreventivo } from '@/types/archivio'

/** Le colonne che identificano un preventivo salvato e il suo lock. */
const COLONNE_SALVATO = 'id, anno, numero, revisione, stato, updated_at'

interface RigaSalvata {
  id: string
  anno: number
  numero: number
  revisione: number
  stato: StatoPreventivo
  updated_at: string
}

/** Una riga dell'elenco: niente `dati` (il preventivo intero si legge solo all'apertura). */
export interface RigaElencoPreventivi extends RigaSalvata {
  totale_imponibile: number | null
  cliente_id: string
  clienti: { ragione_sociale: string } | null
}

/**
 * Cosa sta in `preventivi.dati`: lo stato di quoteStore con la versione del
 * formato, e i prezzi congelati al salvataggio (strada A). `prezzi` è una
 * chiave opzionale: nessun cambio di versione, e un preventivo salvato prima
 * si apre senza (PDF dal vivo, con la nota).
 */
export interface DatiPreventivoDb {
  versione: number
  preventivo: Preventivo
  sezioni: SezioniState
  prezzi?: PrezziCongelati
}

// «Nella barra del preventivo», non «in alto»: su mobile la barra sta in basso (revisione del 14/10, difetto 15).
export const MSG_SENZA_CLIENTE = 'Scegli il cliente del preventivo («Scegli il cliente», nella barra del preventivo) prima di salvare.'
export const MSG_CONFLITTO =
  'Il preventivo è stato modificato da un’altra parte dopo che l’hai aperto, o non è più accessibile. Le tue modifiche non sono state salvate.'
/** 22023 dal numero: l'anno chiesto non è quello del server (cambio d'anno in corso, o data del computer sbagliata). */
export const MSG_ANNO_NON_VALIDO =
  'Il server non ha assegnato il numero: la data e l’ora di questo computer non coincidono con quelle del server, o l’anno sta cambiando proprio ora. Controlla data e ora e riprova.'
export const MSG_ANNULLATO = 'Un preventivo annullato non si modifica: salvalo come nuova revisione.'
/** 23514 su un UPDATE (0005: S7 e strada A): il database non accetta la modifica. */
export const MSG_MODIFICA_RIFIUTATA =
  'Il database non accetta questa modifica: una revisione tiene il cliente del preventivo, e un preventivo inviato, accettato o annullato lo cambia solo un amministratore. Fai una nuova revisione, o un preventivo nuovo per un altro cliente.'

function salvatoDa(r: RigaSalvata): PreventivoSalvato {
  return { id: r.id, anno: r.anno, numero: r.numero, revisione: r.revisione, stato: r.stato, updatedAt: r.updated_at }
}

/** Il preventivo aperto, pronto per il database. */
export interface Salvataggio {
  archivio: CollegamentoArchivio
  preventivo: Preventivo
  sezioni: SezioniState
  stato: Exclude<StatoPreventivo, 'annullato'>
  /** `calcolaPreventivo(...).iva.totaleImponibile`: quello che il PDF stampa. */
  totaleImponibile: number
  /** I prezzi di questo salvataggio (strada A), da congelare in `dati`. */
  prezzi?: PrezziCongelati
}

function campi(s: Salvataggio, clienteId: string) {
  const dati: DatiPreventivoDb = { versione: QUOTE_VERSION, preventivo: s.preventivo, sezioni: s.sezioni, ...(s.prezzi ? { prezzi: s.prezzi } : {}) }
  return { cliente_id: clienteId, stato: s.stato, dati, totale_imponibile: s.totaleImponibile }
}

async function inserisci(riga: Record<string, unknown>, propri?: MessaggiPer): Promise<Esito<PreventivoSalvato>> {
  const e = await esegui<RigaSalvata>(() => supabase.from('preventivi').insert(riga).select(COLONNE_SALVATO).single(), undefined, propri)
  return e.ok ? { ok: true, dato: salvatoDa(e.dato) } : e
}

/**
 * INSERT di una riga con l'id generato nel client e tenuto fra un tentativo e
 * l'altro: se la riga con quell'id c'è già (23505), il tentativo di prima era
 * arrivato e la sua risposta si è persa. La si ritrova e la si aggiorna col
 * lock con `aggiorna`: niente riga doppia. Un 23505 su un'altra unicità (due
 * salvataggi insieme) non trova l'id e resta l'errore che era.
 */
async function inserisciIdempotente(
  riga: Record<string, unknown> & { id: string },
  aggiorna: Record<string, unknown>,
  propri?: MessaggiPer
): Promise<Esito<PreventivoSalvato>> {
  const nuovo = await inserisci(riga, propri)
  if (nuovo.ok || nuovo.codice !== '23505') return nuovo
  const gia = await esegui<RigaSalvata>(
    () => supabase.from('preventivi').select(COLONNE_SALVATO).eq('id', riga.id).maybeSingle(),
    nuovo.errore
  )
  return gia.ok ? aggiornaConLock(salvatoDa(gia.dato), aggiorna) : gia
}

/**
 * UPDATE con optimistic lock: passa solo se `updated_at` è ancora quello letto.
 * Zero righe = qualcuno ha salvato nel frattempo (o la riga non è più
 * accessibile): `conflitto`, e niente sovrascrittura. Decide l'utente.
 */
async function aggiornaConLock(aperto: Pick<PreventivoSalvato, 'id' | 'updatedAt'>, patch: Record<string, unknown>): Promise<Esito<PreventivoSalvato>> {
  const e = await eseguiConLock<RigaSalvata>(
    () =>
      supabase
        .from('preventivi')
        .update(patch)
        .eq('id', aperto.id)
        .eq('updated_at', aperto.updatedAt)
        .select(COLONNE_SALVATO)
        .maybeSingle(),
    MSG_CONFLITTO,
    { '23514': MSG_MODIFICA_RIFIUTATA }
  )
  return e.ok ? { ok: true, dato: salvatoDa(e.dato) } : e
}

/**
 * «Salva». Al primo salvataggio anno e numero li assegna il database
 * (`nuovo_numero_preventivo`, 0005: l'anno è quello di Roma letto dal server,
 * S11) e la riga nasce con revisione 0; dopo,
 * si aggiorna la stessa riga con il lock.
 *
 * Il primo salvataggio è idempotente (verdetto sulla #96, osservazione 8):
 * l'id della riga si genera qui insieme al numero, e `onRiservato` li fa tenere
 * al chiamante (`archivio.riservato`). Se la risposta dell'INSERT si perde, il
 * nuovo tentativo riusa id e numero: niente secondo numero; e se la riga era
 * arrivata, l'unicità dell'id (23505) la fa ritrovare e aggiornare, niente riga
 * doppia. Resta un buco solo se si perde la risposta del numero stesso.
 * L'id nasce prima di chiedere il numero: se il browser non sa generarlo
 * (revisione del 14/10, difetto 11) non si brucia un numero.
 */
export async function salvaPreventivo(s: Salvataggio, onRiservato?: (r: NumeroRiservato) => void): Promise<Esito<PreventivoSalvato>> {
  const clienteId = s.archivio.clienteId
  if (!clienteId) return { ok: false, errore: MSG_SENZA_CLIENTE }
  const aperto = s.archivio.preventivo
  if (aperto) {
    if (aperto.stato === 'annullato') return { ok: false, errore: MSG_ANNULLATO }
    return aggiornaConLock(aperto, campi(s, clienteId))
  }
  let r = s.archivio.riservato ?? null
  if (!r) {
    const id = nuovoUuid()
    // Anno e numero li sceglie il server (0005, S11): l'orologio del browser non conta.
    const numero = await esegui<{ anno: number; numero: number }>(
      () => supabase.rpc('nuovo_numero_preventivo').single(),
      undefined,
      { '22023': MSG_ANNO_NON_VALIDO }
    )
    if (!numero.ok) return numero
    r = { id, anno: numero.dato.anno, numero: numero.dato.numero }
    onRiservato?.(r)
  }
  const dati = campi(s, clienteId)
  return inserisciIdempotente({ id: r.id, anno: r.anno, numero: r.numero, revisione: 0, ...dati }, dati)
}

/**
 * «Nuova revisione»: lo stato aperto adesso diventa la revisione successiva
 * all'ultima dello stesso numero, in bozza. La revisione di prima resta com'era
 * salvata. Due revisioni insieme: la seconda trova l'unicità e lo dice.
 *
 * Idempotente come il primo salvataggio (revisione del 14/10, plausibile b):
 * l'id della riga nuova si genera qui e `onRiservato` lo fa tenere al
 * chiamante (`archivio.riservato`, con anno e numero del preventivo). Se la
 * risposta dell'INSERT si perde, il nuovo tentativo riusa l'id: la riga
 * arrivata fa scattare l'unicità dell'id (23505), si ritrova e si aggiorna,
 * invece di nascere una revisione in più. La 0004 non cambia: l'INSERT della
 * revisione dopo passa i suoi controlli (la precedente c'è) e si ferma
 * sull'unicità dell'id.
 */
export async function nuovaRevisione(
  s: Omit<Salvataggio, 'stato'>,
  onRiservato?: (r: NumeroRiservato) => void
): Promise<Esito<PreventivoSalvato>> {
  const clienteId = s.archivio.clienteId
  if (!clienteId) return { ok: false, errore: MSG_SENZA_CLIENTE }
  const aperto = s.archivio.preventivo
  if (!aperto) return { ok: false, errore: 'Salva il preventivo prima di farne una revisione.' }
  const pendente = s.archivio.riservato
  const tenuto = pendente && pendente.id !== aperto.id && pendente.anno === aperto.anno && pendente.numero === aperto.numero
  const r = tenuto ? pendente : { id: nuovoUuid(), anno: aperto.anno, numero: aperto.numero }
  if (!tenuto) onRiservato?.(r)
  const ultima = await esegui<{ revisione: number }>(() =>
    supabase
      .from('preventivi')
      .select('revisione')
      .eq('anno', aperto.anno)
      .eq('numero', aperto.numero)
      .order('revisione', { ascending: false })
      .limit(1)
      .single()
  )
  if (!ultima.ok) return ultima
  const dati = campi({ ...s, stato: 'bozza' }, clienteId)
  return inserisciIdempotente(
    { id: r.id, anno: aperto.anno, numero: aperto.numero, revisione: ultima.dato.revisione + 1, ...dati },
    dati,
    // Il database (0004) vuole per una revisione il cliente della revisione 0.
    { '23514': 'Una revisione tiene il cliente del preventivo: per un altro cliente fai un preventivo nuovo.' }
  )
}

/** «Annulla»: lo stato diventa `annullato`, il numero resta. Con il lock. */
export function annullaPreventivo(p: Pick<PreventivoSalvato, 'id' | 'updatedAt'>): Promise<Esito<PreventivoSalvato>> {
  return aggiornaConLock(p, { stato: 'annullato' })
}

/**
 * Il cambio del solo stato, senza toccare `dati` (strada A): un preventivo
 * inviato che diventa accettato tiene i prezzi congelati dell'invio. Con il lock.
 */
export function aggiornaStato(p: Pick<PreventivoSalvato, 'id' | 'updatedAt'>, stato: Exclude<StatoPreventivo, 'annullato'>): Promise<Esito<PreventivoSalvato>> {
  return aggiornaConLock(p, { stato })
}

// ponytail: una lettura sola fino al tetto di righe di PostgREST (1000); con
// gli anni si filtra per anno o si pagina.
export function elencaPreventivi(): Promise<Esito<RigaElencoPreventivi[]>> {
  return esegui<RigaElencoPreventivi[]>(() =>
    supabase
      .from('preventivi')
      .select(`${COLONNE_SALVATO}, totale_imponibile, cliente_id, clienti(ragione_sociale)`)
      .order('anno', { ascending: false })
      .order('numero', { ascending: false })
      .order('revisione', { ascending: false })
      // Senza i tipi generati, supabase-js deduce l'embed `clienti(...)` come
      // array; un embed molti-a-uno (FK cliente_id) arriva come oggetto.
      .overrideTypes<RigaElencoPreventivi[], { merge: false }>()
  )
}

/**
 * I `dati` di un preventivo salvato come stato di quoteStore, passando dalla
 * stessa migrazione del localStorage e dallo schema di `quoteSchema` (S3).
 * `null` se non si leggono (forma sbagliata, versione futura): meglio dirlo che
 * aprire un preventivo a metà, o che il PDF faccia cadere l'app.
 */
export function leggiDati(dati: unknown): { preventivo: Preventivo; sezioni: SezioniState; prezzi: PrezziCongelati | null } | null {
  if (typeof dati !== 'object' || dati === null) return null
  const { versione, prezzi, ...stato } = dati as Record<string, unknown>
  if (typeof versione !== 'number' || !Number.isInteger(versione) || versione < 1 || versione > QUOTE_VERSION) return null
  try {
    const m = migrateQuoteState(stato, versione)
    // La forma di sezioni e documento (S3, `quoteSchema`): un `dati` scritto male
    // non entra nello store, dove farebbe lanciare il PDF a ogni render.
    const p = preventivoValido(m.preventivo)
    const sezioni = sezioniValide(m.sezioni)
    if (!p || !sezioni) return null
    const preventivo: Preventivo = { ...initialPreventivo, ...p, cliente: { ...initialPreventivo.cliente, ...p.cliente } }
    // Prezzi congelati di forma sbagliata: si apre lo stesso, dal vivo (con la nota della barra).
    return { preventivo, sezioni, prezzi: prezzi === undefined ? null : prezziValidi(prezzi) }
  } catch {
    // Un blob che fa lanciare la migrazione non si apre: il chiamante lo dice.
    return null
  }
}

/** «Apri»: il preventivo intero, già migrato, col suo legame (cliente, numero, lock). */
export async function apriPreventivo(
  id: string
): Promise<Esito<{ preventivo: Preventivo; sezioni: SezioniState; archivio: CollegamentoArchivio }>> {
  const e = await esegui<RigaSalvata & { cliente_id: string; dati: unknown }>(
    () => supabase.from('preventivi').select(`${COLONNE_SALVATO}, cliente_id, dati`).eq('id', id).maybeSingle(),
    'Preventivo non trovato.'
  )
  if (!e.ok) return e
  const letti = leggiDati(e.dato.dati)
  if (!letti) return { ok: false, errore: 'Il preventivo salvato non è leggibile da questa versione dell’app.' }
  const { prezzi, ...stato } = letti
  return { ok: true, dato: { ...stato, archivio: { clienteId: e.dato.cliente_id, preventivo: salvatoDa(e.dato), ...(prezzi ? { prezzi } : {}) } } }
}
