import type { ComponentType } from 'react'
import { type LucideIcon, Sofa, Layers, ChefHat, DoorOpen, FileText, FileUp, User, Users, FolderOpen, ShieldCheck } from 'lucide-react'
import { SuMisuraPage } from '@/components/sumisura/SuMisuraPage'
import { MarmeriaPage } from '@/components/marmeria/MarmeriaPage'
import { ProgettoValorePage } from '@/components/valore/ProgettoValorePage'
import { PortePage } from '@/components/porte/PortePage'
import { CucinePage } from '@/components/cucine/CucinePage'
import type {
  SezioneArredi,
  SezioneCucine,
  SezioneGres,
  SezionePorte,
  SezioneProgettoValore,
  SezioniState,
} from '@/types/quote'
import type { Cliente, Preventivo } from '@/types/common'
import { initialPreventivo } from '@/store/quoteStore'
import { dataOggiItalia } from '@/utils/format'
import { ALIQUOTA_IVA_PREDEFINITA, aliquotaIvaSezione } from '@/engine/iva'
import {
  FALLBACK_ARREDI,
  FALLBACK_CUCINE,
  FALLBACK_GRES,
  FALLBACK_PORTE,
  FALLBACK_PROGETTO_VALORE,
} from '@/store/quoteFallbacks'

// ── Registry delle sezioni del preventivo (Fase 2 / shell a 5 sezioni) ──
// Unica fonte di verità per nav (Sidebar) + contenuto (AppShell): aggiungere una
// sezione = una riga qui, non edit in 3 punti. cliente/admin NON sono sezioni-
// preventivo → gestite a parte (`OTHER_TABS`). Vedi SPEC_FASE2 §A.2/§B.2.

/** Le 5 sezioni-preventivo. */
export type SezioneId = 'arredi' | 'gres' | 'cucine' | 'porte' | 'progettoValore'
/** Tutte le tab navigabili: 5 sezioni + cliente + preventivi e clienti salvati + admin. */
export type TabId = SezioneId | 'cliente' | 'preventivi' | 'clienti' | 'admin' | 'importa'

export interface SectionTab {
  id: SezioneId
  label: string
  icon: LucideIcon
  /** Pagina della sezione; `null` finché la sezione è solo placeholder (fasi 6-8). */
  Page: ComponentType | null
  /** false → navigabile ma mostra `<SezioneInArrivo>` e non popola il PDF. */
  implemented: boolean
}

// Ordine = SPEC §A.2 (Cucine · Arredi · Porte · Progetto a valore · Gres).
// arredi ← ex "Su Misura", gres ← ex "Marmeria", progettoValore ← fase 6, porte ← fase 7,
// cucine ← fase 8 (configuratore sul listino cucine dalla PR 10b-2).
export const SECTION_TABS: readonly SectionTab[] = [
  { id: 'cucine', label: 'Cucine', icon: ChefHat, Page: CucinePage, implemented: true },
  { id: 'arredi', label: 'Arredi', icon: Sofa, Page: SuMisuraPage, implemented: true },
  { id: 'porte', label: 'Porte', icon: DoorOpen, Page: PortePage, implemented: true },
  { id: 'progettoValore', label: 'Progetto a valore', icon: FileText, Page: ProgettoValorePage, implemented: true },
  { id: 'gres', label: 'Gres', icon: Layers, Page: MarmeriaPage, implemented: true },
]

export interface OtherTab {
  id: 'cliente' | 'preventivi' | 'clienti' | 'admin' | 'importa'
  label: string
  icon: LucideIcon
  /** Mostrata solo agli admin. */
  adminOnly?: boolean
}

export const OTHER_TABS: readonly OtherTab[] = [
  // L21-B: «Cliente» e «Clienti» uno sotto l'altro confondevano (test del 13/10).
  { id: 'cliente', label: 'Dati preventivo', icon: User },
  // L21: preventivi e anagrafica nel database (RLS: chi ha un profilo legge e scrive).
  { id: 'preventivi', label: 'Preventivi', icon: FolderOpen },
  { id: 'clienti', label: 'Anagrafica clienti', icon: Users },
  { id: 'admin', label: 'Gestione Listini', icon: ShieldCheck, adminOnly: true },
  // L21, PR C: l'import dell'anagrafica, solo admin (lo ripete il database, 0006).
  { id: 'importa', label: 'Importa anagrafica', icon: FileUp, adminOnly: true },
]

/**
 * Predicato condiviso "sezione non vuota" → decide se una sezione compare nel
 * PDF (le sezioni vuote sono navigabili ma ESCLUSE dalla stampa, SPEC §B.2).
 * Definizione UNICA usata da `PreventivoPrint` (e, in futuro, dai riepiloghi):
 *  - arredi: almeno un articolo;
 *  - progettoValore: almeno una riga (fase 6);
 *  - porte: almeno una riga porta, oppure almeno un battiscopa a corpo (fase 7 + PR C);
 *  - gres: totale lordo > 0, oppure almeno una lavorazione «da definire»; richiede
 *    il calcolo del listino, quindi il chiamante passa `gresTotLordo` e
 *    `gresDaDefinire` via `calc`;
 *  - cucine: ha contenuto a valore — almeno una voce, o giorni extra, o un extra
 *    manuale con importo > 0. La sola descrizione NON basta (eviterebbe un blocco
 *    a €0 nel PDF): la descrizione è l'etichetta di una cucina che esiste già.
 *    Una voce fuori catalogo conta (O5): il blocco si stampa e dice «da definire».
 */
/**
 * Quante voci ha il gres, A PRESCINDERE dal listino: righe delle quattro
 * tabelle più la vasca inclusa. `sezioneNonVuota('gres')` invece guarda il
 * lordo calcolato, che senza listino vale 0: per lei un gres compilato ma non
 * prezzabile è vuoto, ed è da lì che il blocco spariva dal PDF in silenzio.
 */
export function vociGres(sezioni: SezioniState): number {
  const gres = sezioni.gres
  if (!gres) return 0
  return (
    gres.righeMateriali.length +
    gres.righeAlzatine.length +
    gres.righeLavorazioniBordo.length +
    gres.righeVarie.length +
    (gres.vasca?.inclusa ? 1 : 0)
  )
}

/** Il gres ha contenuto, che il listino ci sia o no (vedi `vociGres`). */
export function gresCompilato(sezioni: SezioniState): boolean {
  return vociGres(sezioni) > 0
}

/**
 * Le sezioni il cui importo nel PDF è incompleto, nell'ordine del PDF. Se ce n'è
 * almeno una, il totale finale è PARZIALE e lo dice. Un solo predicato per tutte:
 * la prossima sezione con un "da definire" si aggiunge qui e lo eredita.
 *  - cucine: almeno una voce (o casse/ante, o i giorni senza tariffa) che il
 *    catalogo non sa prezzare (`vociDaDefinire` di calcCucina, O5). Come le
 *    porte, NON spegne «Genera»;
 *  - cucine: compilata ma senza listino cucine (non si può prezzare; spegne
 *    «Genera», useBloccoPdf);
 *  - gres: compilato ma senza listino (non si può prezzare);
 *  - porte: almeno una riga o un battiscopa non valorizzati, irrisolvibili o da
 *    completare (`daDefinire` di calcPorte);
 *  - gres: anche con il listino, una lavorazione che il listino non sa prezzare
 *    (`lavorazioniDaDefinire` di calcMarmeria). Questo caso NON spegne «Genera».
 */
export function sezioniDaDefinire(
  sezioni: SezioniState,
  calc: {
    cucineDaDefinire: number
    listinoCucine: boolean
    listinoGres: boolean
    porteDaDefinire: number
    gresLavorazioniDaDefinire: number
  }
): SezioneId[] {
  const out: SezioneId[] = []
  if (calc.cucineDaDefinire > 0 || (!calc.listinoCucine && sezioneNonVuota('cucine', sezioni))) out.push('cucine')
  if ((!calc.listinoGres && gresCompilato(sezioni)) || calc.gresLavorazioniDaDefinire > 0) out.push('gres')
  if (calc.porteDaDefinire > 0) out.push('porte')
  return out
}

export function sezioneNonVuota(
  id: SezioneId,
  sezioni: SezioniState,
  calc?: { gresTotLordo: number; gresDaDefinire?: number }
): boolean {
  switch (id) {
    case 'arredi':
      return (sezioni.arredi?.articoli.length ?? 0) > 0
    case 'progettoValore':
      return (sezioni.progettoValore?.righe.length ?? 0) > 0
    case 'porte':
      // Anche il solo battiscopa a corpo rende la sezione non vuota: senza
      // questo la feature esisterebbe e non si vedrebbe, né in tab né nel PDF.
      return (sezioni.porte?.righe.length ?? 0) > 0 || (sezioni.porte?.battiscopa?.length ?? 0) > 0
    case 'gres':
      // Anche un gres di sole righe «da definire» (lordo 0) si stampa: senza blocco
      // il totale direbbe «Gres da definire» senza mostrare cosa.
      return (calc?.gresTotLordo ?? 0) > 0 || (calc?.gresDaDefinire ?? 0) > 0
    case 'cucine': {
      const c = sezioni.cucine
      return (
        (c?.voci.length ?? 0) > 0 ||
        (c?.giorniExtra ?? 0) > 0 ||
        (c?.extraManuale?.importo ?? 0) > 0
      )
    }
    default:
      return false
  }
}

// ── Avviso di uscita (A6) ──
//
// C'è lavoro da perdere se l'operatore ha scritto o scelto QUALCOSA che non è
// il default. Non riusa `sezioneNonVuota`, che risponde a un'altra domanda
// (cosa va nel PDF): per il gres guarda il lordo, che senza listino vale 0, e
// per le cucine ignora apposta la sola descrizione.

/** Il campo non è lavoro dell'operatore. Ogni uso dice perché. */
const IGNORA = 'ignora'

/**
 * Per OGNI chiave di T: quando quel campo è lavoro da non perdere, oppure
 * `IGNORA`. Il `-?` rende obbligatorie anche le chiavi opzionali, quindi un
 * campo nuovo non classificato ferma `tsc -b`: A6 è nato da un elenco scritto a
 * mano che era rimasto indietro di tre sezioni.
 */
type CampiDi<T> = { readonly [K in keyof T]-?: ((x: T) => boolean) | typeof IGNORA }

const scritto = (s: string | null | undefined): boolean => (s ?? '').trim() !== ''

/** L'aliquota di sezione scelta e diversa dalla predefinita (L18). Le righe la portano già con sé. */
const ivaScelta = (x: { aliquotaIva?: unknown }): boolean => aliquotaIvaSezione(x.aliquotaIva) !== ALIQUOTA_IVA_PREDEFINITA

/** Una sezione mai toccata (`undefined`) non ha lavoro. */
function haLavoro<T>(x: T, campi: CampiDi<NonNullable<T>>): boolean {
  if (x == null) return false
  return (Object.values(campi) as (((x: NonNullable<T>) => boolean) | typeof IGNORA)[]).some(
    (f) => f !== IGNORA && f(x)
  )
}

const CAMPI_CLIENTE: CampiDi<Cliente> = {
  nome: (c) => scritto(c.nome),
  cognome: (c) => scritto(c.cognome),
  indirizzo: (c) => scritto(c.indirizzo),
  citta: (c) => scritto(c.citta),
  telefono: (c) => scritto(c.telefono),
  email: (c) => scritto(c.email),
}

const CAMPI_PREVENTIVO: CampiDi<Preventivo> = {
  numero: (p) => scritto(p.numero),
  // La data di default è quella del giorno in cui il preventivo nasce (C3): né
  // quella del caricamento dell'app né quella di oggi sono lavoro da non perdere.
  data: (p) => p.data !== initialPreventivo.data && p.data !== dataOggiItalia(),
  validitaGiorni: (p) => p.validitaGiorni !== initialPreventivo.validitaGiorni,
  cliente: (p) => haLavoro(p.cliente, CAMPI_CLIENTE),
  oggettoPreventivo: (p) => scritto(p.oggettoPreventivo),
  note: (p) => scritto(p.note),
  includiCondizioni: (p) => p.includiCondizioni !== initialPreventivo.includiCondizioni,
  includiNotePagamento: (p) => p.includiNotePagamento !== initialPreventivo.includiNotePagamento,
  notePagamento: (p) => scritto(p.notePagamento),
}

const CAMPI_ARREDI: CampiDi<SezioneArredi> = {
  articoli: (a) => a.articoli.length > 0,
  quotaProgettazione: (a) => a.quotaProgettazione !== FALLBACK_ARREDI.quotaProgettazione,
  noteGenerali: (a) => scritto(a.noteGenerali),
  // Deprecato: la spunta vive su `preventivo.includiNotePagamento`, qui si
  // legge soltanto come fallback dei blob vecchi e nessun controllo lo scrive.
  includiNotePagamento: IGNORA,
  mostraMqInPdf: (a) => a.mostraMqInPdf !== FALLBACK_ARREDI.mostraMqInPdf,
  sconto: (a) => a.sconto !== FALLBACK_ARREDI.sconto,
  descrizione: (a) => scritto(a.descrizione),
  aliquotaIva: ivaScelta,
  // Anche un arredo vuoto è lavoro: l'operatore l'ha creato e nominato (L19).
  arredi: (a) => (a.arredi?.length ?? 0) > 0,
}

const CAMPI_GRES: CampiDi<SezioneGres> = {
  tipologiaMateriale: (g) => g.tipologiaMateriale !== FALLBACK_GRES.tipologiaMateriale,
  // Righe e vasca come in `vociGres`: contano a prescindere dal listino.
  righeMateriali: (g) => g.righeMateriali.length > 0,
  righeAlzatine: (g) => g.righeAlzatine.length > 0,
  righeLavorazioniBordo: (g) => g.righeLavorazioniBordo.length > 0,
  righeVarie: (g) => g.righeVarie.length > 0,
  sconto: (g) => g.sconto !== FALLBACK_GRES.sconto,
  includiRilMont: (g) => g.includiRilMont !== FALLBACK_GRES.includiRilMont,
  // Solo inclusa: il prezzo di una vasca esclusa non va nel PDF né nel totale.
  vasca: (g) => g.vasca?.inclusa === true,
  aliquotaIva: ivaScelta,
}

const CAMPI_CUCINE: CampiDi<SezioneCucine> = {
  voci: (c) => c.voci.length > 0,
  casse: (c) => c.casse !== FALLBACK_CUCINE.casse,
  ante: (c) => c.ante !== FALLBACK_CUCINE.ante,
  // Assente (preventivo di prima di L25) vale false come il fallback.
  profonditaOltre65: (c) => c.profonditaOltre65 === true,
  giorniExtra: (c) => c.giorniExtra !== FALLBACK_CUCINE.giorniExtra,
  // `CucineRiepilogo` lo rimette a null quando descrizione e importo sono vuoti.
  extraManuale: (c) => c.extraManuale !== null,
  adeguamentoPct: (c) => c.adeguamentoPct !== FALLBACK_CUCINE.adeguamentoPct,
  descrizione: (c) => scritto(c.descrizione),
  sconto: (c) => c.sconto !== FALLBACK_CUCINE.sconto,
  aliquotaIva: ivaScelta,
}

const CAMPI_PORTE: CampiDi<SezionePorte> = {
  righe: (p) => p.righe.length > 0,
  battiscopa: (p) => (p.battiscopa?.length ?? 0) > 0,
  sconto: (p) => p.sconto !== FALLBACK_PORTE.sconto,
  aliquotaIva: ivaScelta,
}

const CAMPI_PROGETTO_VALORE: CampiDi<SezioneProgettoValore> = {
  righe: (p) => p.righe.length > 0,
  sconto: (p) => p.sconto !== FALLBACK_PROGETTO_VALORE.sconto,
  aliquotaIva: ivaScelta,
}

/** Una voce per sezione: una sezione nuova in `SezioniState` ferma `tsc -b` qui. */
const SEZIONE_HA_LAVORO: { readonly [K in keyof SezioniState]-?: (s: SezioniState) => boolean } = {
  arredi: (s) => haLavoro(s.arredi, CAMPI_ARREDI),
  gres: (s) => haLavoro(s.gres, CAMPI_GRES),
  cucine: (s) => haLavoro(s.cucine, CAMPI_CUCINE),
  porte: (s) => haLavoro(s.porte, CAMPI_PORTE),
  progettoValore: (s) => haLavoro(s.progettoValore, CAMPI_PROGETTO_VALORE),
}

/**
 * Il preventivo in memoria contiene lavoro dell'operatore? Decide l'avviso di
 * `beforeunload` in `AppShell`. Con lo stato iniziale e dopo `resetAll` è
 * `false`: un avviso che scatta sempre è rumore, e il rumore si impara a ignorare.
 */
export function quoteHaDati(preventivo: Preventivo, sezioni: SezioniState): boolean {
  return (
    haLavoro(preventivo, CAMPI_PREVENTIVO) ||
    Object.values(SEZIONE_HA_LAVORO).some((haLavoroSezione) => haLavoroSezione(sezioni))
  )
}
