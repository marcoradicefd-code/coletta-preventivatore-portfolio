import {
  NOTE_PAGAMENTO_DEFAULT,
  DESCRIZIONE_CUCINA_DEFAULT,
  DESCRIZIONE_ARREDI_DEFAULT,
  descrizionePorteDefault,
  descrizioneBattiscopaDefault,
} from '@/data/testiDefault'
import type { Cliente, Preventivo } from '@/types/common'
import type { CollegamentoArchivio } from '@/types/archivio'
import { formatNumeroPreventivo } from '@/utils/numeroPreventivo'
import type { RigaBattiscopaCalcolata } from '@/engine/calcPorte'
import type { SezioneArredi, SezioneCucine, RigaPorta, RigaBattiscopa } from '@/types/quote'

// ── Default di LETTURA dei testi del preventivo ──
//
// Funzioni pure, sorgente unica della regola "cosa si stampa quando l'utente non
// ha scritto niente". Stanno tutte qui e non sparse nei componenti per due
// ragioni concrete:
//
// 1. I default NON vivono nello store. Se `DESCRIZIONE_ARREDI_DEFAULT` finisse
//    dentro lo stato salvato (o dentro i FALLBACK_*, che sono `Object.freeze`ati
//    e condivisi per riferimento), cambiare il testo domani non cambierebbe i
//    preventivi già salvati: resterebbe congelata una copia muta di oggi. E un
//    testo dentro FALLBACK_ARREDI comparirebbe anche in sezioni mai aperte.
// 2. La stessa regola serve al PDF e ai riepiloghi. Duplicarla è il modo di
//    farla divergere.

/**
 * Le note pagamento vanno nel PDF?
 *
 * Il flag è document-level su `preventivo`, ma nasceva su `arredi`. Il fallback
 * NON è teorico: `persist` riesegue `migrate` solo quando la versione persistita
 * è diversa da quella corrente, e qui la versione resta 4 — quindi un blob già
 * v4 che ha il flag ancora su `arredi` non passa MAI dal migrate. Senza questa
 * lettura difensiva, quei preventivi perderebbero la spunta in silenzio.
 *
 * Default `true` quando non l'ha deciso nessuno: la clausola di pagamento è
 * standard, come le condizioni contrattuali.
 */
export function includiNotePagamentoDi(
  preventivo: Preventivo,
  arredi: SezioneArredi | undefined
): boolean {
  return preventivo.includiNotePagamento ?? arredi?.includiNotePagamento ?? true
}

/** Testo delle note pagamento: quello scritto, o la clausola standard. */
export function testoNotePagamentoDi(preventivo: Preventivo): string {
  return nonVuoto(preventivo.notePagamento) ?? NOTE_PAGAMENTO_DEFAULT
}

/** Descrizione della sezione Arredi: quella scritta, o il testo del DOCX. */
export function descrizioneArrediDi(arredi: SezioneArredi): string {
  return nonVuoto(arredi.descrizione) ?? DESCRIZIONE_ARREDI_DEFAULT
}

/**
 * Descrizione della sezione Cucina: quella scritta, o il testo del DOCX.
 * `descrizione` qui è obbligatoria e nasce `''` (fase 8), quindi il tri-stato
 * si riduce a "vuota ⇒ default".
 */
export function descrizioneCucinaDi(cucine: SezioneCucine): string {
  return nonVuoto(cucine.descrizione) ?? DESCRIZIONE_CUCINA_DEFAULT
}

/**
 * Descrizione di una riga porta (tri-stato, vedi `RigaPorta.descrizione`):
 * scritta dall'utente ⇒ intoccabile; assente/null ⇒ composta dal modello di
 * ADESSO, così un cambio modello la aggiorna da sé.
 */
export function descrizionePortaDi(riga: RigaPorta): string {
  return (
    nonVuoto(riga.descrizione) ??
    // Il default DERIVA dalla riga: la maniglia entra nel testo, così non può
    // descrivere una maniglia diversa da quella che si sta fatturando. La
    // quantità no: sta solo nella colonna Qtà del PDF (punto 5 di Antonio, L23).
    descrizionePorteDefault(riga.modelloNome, riga.maniglia)
  )
}

/**
 * Descrizione di una riga battiscopa (tri-stato come le porte): scritta
 * dall'utente ⇒ intoccabile; assente/null ⇒ composta da nome e centimetri di
 * ADESSO, così cambiare la metratura aggiorna il testo da sé.
 */
export function descrizioneBattiscopaDi(
  riga: RigaBattiscopa,
  calc: Pick<RigaBattiscopaCalcolata, 'altezzaCm' | 'metriLineari' | 'prezzoMl'>
): string {
  return (
    nonVuoto(riga.descrizione) ??
    descrizioneBattiscopaDefault(riga.nome, calc.altezzaCm, calc.metriLineari, calc.prezzoMl)
  )
}

/**
 * Il cliente come lo stampa il blocco CLIENTE del PDF: nome e cognome, oppure
 * la ragione sociale (che `clienteDaArchivio` mette in `nome` quando nome e
 * cognome mancano). Una funzione sola per il blocco e per il titolo del PDF.
 */
export function nomeClienteDi(cliente: Partial<Cliente> | null | undefined): string {
  return `${cliente?.nome ?? ''} ${cliente?.cognome ?? ''}`.replaceAll(/\s+/g, ' ').trim()
}

/** Il titolo del PDF senza numero né cliente (era il titolo fisso fino a L23). */
const TITOLO_PDF_RIPIEGO = 'Preventivo Coletta'
/** Tetto del titolo, in caratteri: tronca il cliente, mai il numero. */
const TITOLO_PDF_MAX = 120
const SEPARATORE_TITOLO = ' – '

/**
 * Un testo buono per un nome di file: i caratteri vietati (`/ \ : * ? " < > |`)
 * e quelli di controllo (`\p{Cc}`) diventano spazi, gli spazi ripetuti uno solo.
 */
function perNomeFile(testo: string): string {
  return testo.replaceAll(/[/\\:*?"<>|\p{Cc}]/gu, ' ').replaceAll(/\s+/g, ' ').trim()
}

/**
 * Il titolo del PDF (punto 1 di Antonio, 14/10): il nome del file che Chrome
 * propone al salvataggio e l'intestazione di ogni pagina.
 * `Preventivo N. <numero> – <cliente>`, con « – ANNULLATO» in fondo per un
 * annullato. Senza numero (mai salvato) o senza cliente resta il ripiego
 * «Preventivo Coletta», coi pezzi che ci sono. Il numero è quello del
 * database, come in intestazione; il cliente è quello del blocco CLIENTE.
 */
export function titoloPdf(
  preventivo: { cliente?: Partial<Cliente> | null },
  archivio: Pick<CollegamentoArchivio, 'preventivo'> | null | undefined
): string {
  const salvato = archivio?.preventivo
  const testa = salvato ? `Preventivo N. ${formatNumeroPreventivo(salvato)}` : TITOLO_PDF_RIPIEGO
  const coda = salvato?.stato === 'annullato' ? `${SEPARATORE_TITOLO}ANNULLATO` : ''
  const spazio = TITOLO_PDF_MAX - testa.length - coda.length - SEPARATORE_TITOLO.length
  const cliente = Array.from(perNomeFile(nomeClienteDi(preventivo.cliente)))
    .slice(0, Math.max(0, spazio))
    .join('')
    .trimEnd()
  return testa + (cliente ? SEPARATORE_TITOLO + cliente : '') + coda
}

/**
 * Una stringa "scritta davvero", o `null`.
 *
 * Il trim è la regola condivisa: una casella lasciata con soli spazi è una
 * casella vuota, non un testo che azzera la clausola nel PDF del cliente.
 */
function nonVuoto(v: string | null | undefined): string | null {
  if (typeof v !== 'string') return null
  return v.trim() === '' ? null : v
}
