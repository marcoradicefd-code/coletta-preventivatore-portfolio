import { supabase } from '@/lib/supabase'
import { esegui, eseguiConLock, esitoErrore, type Esito } from '@/lib/erroriDb'
import { nuovoUuid } from '@/utils/uuid'
import type { Cliente } from '@/types/common'

/**
 * Un cliente dell'anagrafica (`public.clienti`, migration 0003). Niente codice
 * fiscale: a un preventivo non serve (Marco, 12/10). `created_*` e `updated_at`
 * li scrive il trigger, il client non li sceglie.
 */
export interface ClienteDb {
  id: string
  codice_gestionale: string | null
  ragione_sociale: string
  nome: string | null
  cognome: string | null
  telefono: string | null
  email: string | null
  indirizzo: string | null
  cap: string | null
  localita: string | null
  provincia: string | null
  partita_iva: string | null
  note: string | null
  updated_at: string
}

/** I campi che la scheda scrive. Il codice gestionale arriva solo dall'import (PR B). */
export type DatiCliente = Omit<ClienteDb, 'id' | 'codice_gestionale' | 'updated_at'>

/** Colonne lette: esplicite, mai `*` (una colonna nuova non entra in UI da sola). */
export const COLONNE =
  'id, codice_gestionale, ragione_sociale, nome, cognome, telefono, email, indirizzo, cap, localita, provincia, partita_iva, note, updated_at'

/** Testo vuoto o di soli spazi ⇒ null; il resto senza spazi agli estremi. */
function pulito(v: string | null | undefined): string | null {
  const t = (v ?? '').trim()
  return t.length > 0 ? t : null
}

function datiPuliti(d: DatiCliente): DatiCliente {
  return {
    ragione_sociale: (d.ragione_sociale ?? '').trim(),
    nome: pulito(d.nome),
    cognome: pulito(d.cognome),
    telefono: pulito(d.telefono),
    email: pulito(d.email),
    indirizzo: pulito(d.indirizzo),
    cap: pulito(d.cap),
    localita: pulito(d.localita),
    provincia: pulito(d.provincia),
    partita_iva: pulito(d.partita_iva),
    note: pulito(d.note),
  }
}

/**
 * Un cliente nella scelta del preventivo: solo ciò che serve a riconoscerlo
 * (GDPR art. 25, verdetto sulla #96, osservazione 5). Niente telefono, email,
 * indirizzo né note nella lista: il record completo si legge quando lo si
 * sceglie (`leggiCliente`).
 */
export type ClienteInScelta = Pick<ClienteDb, 'id' | 'ragione_sociale' | 'nome' | 'cognome' | 'localita'>

export const COLONNE_SCELTA = 'id, ragione_sociale, nome, cognome, localita'

// ponytail: come `elencaClienti`, una lettura sola fino al tetto di PostgREST.
export function elencaClientiPerScelta(): Promise<Esito<ClienteInScelta[]>> {
  return esegui(() => supabase.from('clienti').select(COLONNE_SCELTA).order('ragione_sociale'))
}

/** Il record completo di un cliente, quando lo si sceglie. */
export function leggiCliente(id: string): Promise<Esito<ClienteDb>> {
  return esegui(
    () => supabase.from('clienti').select(COLONNE).eq('id', id).maybeSingle(),
    'Il cliente non c’è più nell’anagrafica: scegline un altro.'
  )
}

// ponytail: una lettura sola, ordinata, fino al tetto di righe di PostgREST
// (1000 di default su Supabase; l'anagrafica ne ha circa 540). Oltre, paginare.
export function elencaClienti(): Promise<Esito<ClienteDb[]>> {
  return esegui(() => supabase.from('clienti').select(COLONNE).order('ragione_sociale'))
}

/** Due versioni dei dati di un cliente sono uguali, una volta tolti spazi e vuoti? */
export function stessiDati(a: DatiCliente, b: DatiCliente): boolean {
  const pa = datiPuliti(a)
  const pb = datiPuliti(b)
  return (Object.keys(pa) as (keyof DatiCliente)[]).every((k) => pa[k] === pb[k])
}

export const MSG_CONFLITTO_CLIENTE =
  'Il cliente è stato modificato da un’altra parte dopo che l’hai aperto, o non è più accessibile: le tue modifiche non sono state salvate. Riapri la scheda e riprova.'

/**
 * Crea (`esistente` null) o aggiorna un cliente. La ragione sociale è
 * obbligatoria. L'aggiornamento ha l'optimistic lock su `updated_at`, come i
 * preventivi (verdetto sulla #96, osservazione 8): zero righe = qualcuno ha
 * salvato nel frattempo (o la riga non è più accessibile), niente
 * sovrascrittura.
 *
 * La creazione è idempotente come il primo salvataggio di un preventivo
 * (revisione L15-L21, S8): l'id della riga lo genera il chiamante alla prima
 * pressione e lo ripassa a ogni «Riprova». Se la risposta dell'INSERT si è
 * persa e la riga era arrivata, il nuovo INSERT trova l'unicità dell'id
 * (23505): la riga si rilegge e, se nel frattempo il form è cambiato, si
 * aggiorna col lock. Niente anagrafica doppia.
 */
export async function salvaCliente(
  esistente: { id: string; updatedAt: string } | null,
  dati: DatiCliente,
  idNuovo: string = nuovoUuid()
): Promise<Esito<ClienteDb>> {
  const riga = datiPuliti(dati)
  if (!riga.ragione_sociale) return { ok: false, errore: 'La ragione sociale (o nome e cognome) è obbligatoria.' }
  if (!esistente) {
    const nuovo = await esegui<ClienteDb>(() => supabase.from('clienti').insert({ id: idNuovo, ...riga }).select(COLONNE).single())
    if (nuovo.ok || nuovo.codice !== '23505') return nuovo
    // Un 23505 su un'altra unicità (il codice gestionale, che l'app non scrive) non trova l'id e resta l'errore che era.
    const gia = await esegui<ClienteDb>(() => supabase.from('clienti').select(COLONNE).eq('id', idNuovo).maybeSingle(), nuovo.errore)
    if (!gia.ok || stessiDati(gia.dato, riga)) return gia
    return salvaCliente({ id: gia.dato.id, updatedAt: gia.dato.updated_at }, riga)
  }
  return eseguiConLock(
    () =>
      supabase
        .from('clienti')
        .update(riga)
        .eq('id', esistente.id)
        .eq('updated_at', esistente.updatedAt)
        .select(COLONNE)
        .maybeSingle(),
    MSG_CONFLITTO_CLIENTE
  )
}

/** Quanti preventivi (annullati compresi) ha il cliente. */
export async function contaPreventiviCliente(id: string): Promise<Esito<number>> {
  try {
    const { count, error, status } = await supabase
      .from('preventivi')
      .select('id', { count: 'exact', head: true })
      .eq('cliente_id', id)
    if (error) return esitoErrore(error, status)
    return { ok: true, dato: count ?? 0 }
  } catch (e) {
    return esitoErrore(e)
  }
}

/**
 * Elimina un cliente (solo admin: lo decide l'RLS, la UI nasconde il pulsante).
 * Zero righe senza errore = non eliminato (già sparito, o RLS che nega in
 * silenzio): si dice, non si finge. La riga eliminata finisce nel registro
 * delle eliminazioni (0004), con il solo id.
 */
export async function eliminaCliente(id: string): Promise<Esito<true>> {
  const esito = await esegui(() => supabase.from('clienti').delete().eq('id', id).select('id'), undefined, {
    // La FK `on delete restrict`: il cliente ha preventivi (anche annullati).
    '23503': 'Il cliente ha preventivi collegati: non si può eliminare.',
  })
  if (!esito.ok) return esito
  return esito.dato.length > 0
    ? { ok: true, dato: true }
    : { ok: false, errore: 'Cliente non eliminato: non hai i permessi, o non c’è più.' }
}

/**
 * Il cliente dell'anagrafica nei campi del preventivo (quelli del PDF). Senza
 * nome e cognome (un'azienda) la ragione sociale va nel nome. Località con CAP
 * e provincia in un campo solo, come «Città» nel form.
 */
export function clienteDaArchivio(c: ClienteDb): Cliente {
  const nome = (c.nome ?? '').trim()
  const cognome = (c.cognome ?? '').trim()
  return {
    nome: nome || cognome ? nome : c.ragione_sociale,
    cognome,
    indirizzo: c.indirizzo ?? '',
    citta: [c.cap, c.localita, c.provincia ? `(${c.provincia})` : null].filter(Boolean).join(' '),
    telefono: c.telefono ?? '',
    email: c.email ?? '',
  }
}
