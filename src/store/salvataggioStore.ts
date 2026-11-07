import { create } from 'zustand'
import { useMemo } from 'react'
import { useQuoteStore } from '@/store/quoteStore'
import { usePricelistStore } from '@/store/pricelistStore'
import { componiCatalogoCucina } from '@/data/cucina/strutturaCucina'
import type { ListiniPreventivo } from '@/engine/calcPreventivo'
import { vistaPrezzi } from '@/engine/vistaPrezzi'
import { aggiornaStato, apriPreventivo, nuovaRevisione, salvaPreventivo } from '@/lib/preventiviDb'
import { bloccoListiniAdesso } from '@/hooks/useBloccoPdf'
import { impronta } from '@/utils/impronta'
import type { Esito } from '@/lib/erroriDb'
import type { PrezziCongelati, PreventivoSalvato, StatoPreventivo } from '@/types/archivio'
import type { Preventivo } from '@/types/common'
import type { SezioniState } from '@/types/quote'

/** Il preventivo com'era all'ultimo salvataggio (o apertura): gli oggetti, non una copia. */
interface Fotografia {
  preventivo: Preventivo
  sezioni: SezioniState
  clienteId: string | null
}

/**
 * Un errore del salvataggio, già pronto per la UI (mai dati personali), con il
 * gesto che lo rifà: «Riprova» chiama `riprova`, qualunque sia il percorso da
 * cui è partito (barra, «Genera», pagina Preventivi, ricaricamento). Revisione
 * del 14/10 sulla #97, difetto 2: prima la barra rifaceva solo i suoi gesti.
 */
export type ErroreSalvataggio = Extract<Esito<never>, { ok: false }> & { riprova: () => void }

interface StatoSalvataggio {
  /** Una scrittura del preventivo aperto è in volo («Salvataggio…»). */
  inCorso: boolean
  /**
   * Un gesto sul preventivo aperto è in corso («Genera», o nella pagina
   * Preventivi Apri, Annulla, Nuovo, Nuova revisione, il cambio di stato): un
   * secondo gesto non parte finché il primo non finisce (`inEsclusiva`).
   */
  occupato: boolean
  /** Quando è riuscito l'ultimo salvataggio di questa sessione. */
  salvatoAlle: Date | null
  ultimo: Fotografia | null
  errore: ErroreSalvataggio | null
}

/**
 * Lo stato del salvataggio del preventivo aperto (L21-B), condiviso dalla barra
 * del preventivo, da «Genera» e dalla pagina Preventivi. Non si persiste: è lo
 * stato di questa sessione.
 *
 * «Modifiche non salvate» si decide per IDENTITÀ: lo store del preventivo è
 * immutabile, quindi un oggetto diverso da quello salvato è una modifica.
 * Costa un confronto di riferimenti, non un JSON del preventivo a ogni tasto.
 * Dopo un riavvio (preventivo «ricordato») la fotografia non c'è: la barra dice
 * «modifiche non salvate» finché non si salva (scelta prudente).
 */
export const useSalvataggio = create<StatoSalvataggio>()(() => ({
  inCorso: false,
  occupato: false,
  salvatoAlle: null,
  ultimo: null,
  errore: null,
}))

function fotografia(): Fotografia {
  const q = useQuoteStore.getState()
  return { preventivo: q.preventivo, sezioni: q.sezioni, clienteId: q.archivio?.clienteId ?? null }
}

/** I listini caricati adesso, nella forma del calcolo. */
function listiniAdesso(): ListiniPreventivo {
  const p = usePricelistStore.getState()
  return { gres: p.marmeria, porte: p.porte, catalogoCucina: p.cucine ? componiCatalogoCucina(p.cucine) : null }
}

/**
 * I prezzi di queste sezioni coi listini di adesso, pronti da congelare in
 * `dati` (strada A): il calcolo che il PDF stampa, quando, con quali listini.
 * Il totale imponibile salvato è `vista.calcolo.iva.totaleImponibile`: lo
 * stesso del PDF, allo stesso euro.
 */
export function prezziAdesso(sezioni: SezioniState): PrezziCongelati {
  const p = usePricelistStore.getState()
  const vista = vistaPrezzi(sezioni, listiniAdesso())
  return {
    calcolatiIl: new Date().toISOString(),
    listini: { gres: p.marmeria?.aggiornato ?? null, porte: p.porte?.aggiornato ?? null, cucine: p.cucine?.aggiornato ?? null },
    impronta: impronta(vista),
    sezioni: impronta(sezioni),
    vista,
  }
}

/**
 * I prezzi del preventivo aperto, ricalcolati adesso, sono diversi da quelli
 * dell'ultimo salvataggio (il listino è cambiato), o non ce ne sono (salvato
 * prima della strada A)? Per una bozza «Genera» allora riscrive (C2).
 */
export function prezziDaAggiornare(): boolean {
  const q = useQuoteStore.getState()
  return q.archivio?.prezzi?.impronta !== impronta(vistaPrezzi(q.sezioni, listiniAdesso()))
}

/** Gli stati il cui `dati` non si riscrive, se non per mano di un admin (0005, strada A). */
export function statoInviato(stato: StatoPreventivo | undefined): boolean {
  return stato === 'inviato' || stato === 'accettato'
}

export const MSG_INVIATO =
  'Il preventivo è già stato inviato al cliente e non si riscrive: le modifiche vanno in una nuova revisione.'

/** L'impronta canonica di una fotografia: indipendente dall'identità degli oggetti e dall'ordine delle chiavi. */
function improntaDi(f: Fotografia): string {
  return impronta({ preventivo: f.preventivo, sezioni: f.sezioni, clienteId: f.clienteId })
}

/**
 * Dopo un salvataggio o un'apertura: la fotografia in memoria (il confronto
 * veloce, per identità) e la sua impronta canonica nel legame col database,
 * che si persiste col preventivo ricordato.
 */
function ricordaSalvato(f: Fotografia): void {
  useSalvataggio.setState({ ultimo: f })
  useQuoteStore.getState().impostaImprontaSalvata(improntaDi(f))
}

/**
 * Il preventivo aperto ha modifiche che il database non ha (o non è mai stato
 * salvato)? Con la fotografia in memoria il confronto è per identità (lo store
 * è immutabile: costa un confronto di riferimenti). Senza, cioè dopo un
 * riavvio con «ricorda preventivo» (revisione di Marco sulla #98), si confronta
 * l'impronta canonica di adesso con quella salvata: niente falso «modificato»
 * per un preventivo inviato riaperto com'era.
 */
export function haModificheNonSalvate(): boolean {
  const q = useQuoteStore.getState()
  const u = useSalvataggio.getState().ultimo
  if (!q.archivio?.preventivo) return true
  if (u) return u.preventivo !== q.preventivo || u.sezioni !== q.sezioni || u.clienteId !== (q.archivio?.clienteId ?? null)
  return !q.archivio.impronta || q.archivio.impronta !== improntaDi(fotografia())
}

/** Per la barra: cosa dire del salvataggio adesso. */
export type StatoBarra = 'inCorso' | 'nonSalvato' | 'modificato' | 'salvato'

export function useStatoSalvataggio(): StatoBarra {
  const inCorso = useSalvataggio((s) => s.inCorso)
  const ultimo = useSalvataggio((s) => s.ultimo)
  const preventivo = useQuoteStore((s) => s.preventivo)
  const sezioni = useQuoteStore((s) => s.sezioni)
  const clienteId = useQuoteStore((s) => s.archivio?.clienteId ?? null)
  const salvato = useQuoteStore((s) => s.archivio?.preventivo ?? null)
  const improntaSalvata = useQuoteStore((s) => s.archivio?.impronta ?? null)
  // Il confronto canonico solo senza fotografia (dopo un riavvio), e memoizzato:
  // gira quando cambiano documento, sezioni o cliente, non a ogni render. Col
  // primo salvataggio della sessione torna il confronto per identità.
  const ugualeDopoRiavvio = useMemo(
    () => !ultimo && improntaSalvata !== null && improntaSalvata === improntaDi({ preventivo, sezioni, clienteId }),
    [ultimo, improntaSalvata, preventivo, sezioni, clienteId]
  )
  if (inCorso) return 'inCorso'
  if (!salvato) return 'nonSalvato'
  const uguale = ultimo
    ? ultimo.preventivo === preventivo && ultimo.sezioni === sezioni && ultimo.clienteId === clienteId
    : ugualeDopoRiavvio
  return uguale ? 'salvato' : 'modificato'
}

/**
 * Dopo un'apertura dal database: quello che c'è adesso è quello salvato. L'ora
 * dell'ultimo salvataggio si dimentica: era di un altro preventivo, o di prima
 * del ricaricamento (revisione del 14/10, difetto 7).
 */
export function segnaAllineato(): void {
  ricordaSalvato(fotografia())
  useSalvataggio.setState({ salvatoAlle: null, errore: null })
}

/** «Nuovo preventivo»: niente di salvato, niente errori. */
export function dimenticaSalvataggio(): void {
  useSalvataggio.setState({ ultimo: null, salvatoAlle: null, errore: null })
}

/** Toglie l'errore mostrato (es. «Lascia così»). */
export function chiudiErroreSalvataggio(): void {
  useSalvataggio.setState({ errore: null })
}

/** C'è un gesto o una scrittura in corso sul preventivo aperto? Per spegnere i comandi, col motivo accanto. */
export function useOccupato(): boolean {
  return useSalvataggio((s) => s.occupato || s.inCorso)
}

/**
 * Un gesto alla volta sul preventivo aperto: l'unica guardia «operazione in
 * corso» (revisione del 14/10 sulla #97, difetti 10, 12 e c). Il gesto parte
 * solo se nessun altro gesto né scrittura è in corso, altrimenti `null` e non
 * succede niente (il doppio tocco su «Genera» stampa una volta). Controllo e
 * segno sono sincroni: due tocchi nello stesso giro non passano entrambi.
 * Le scritture dentro il gesto passano da `inSerie`, che ha la sua guardia.
 */
export async function inEsclusiva<T>(gesto: () => Promise<T>): Promise<T | null> {
  const s = useSalvataggio.getState()
  if (s.occupato || s.inCorso) return null
  useSalvataggio.setState({ occupato: true })
  try {
    return await gesto()
  } finally {
    useSalvataggio.setState({ occupato: false })
  }
}

const MSG_IN_CORSO = 'Un salvataggio è già in corso: aspetta che finisca.'
export const MSG_ERRORE_IMPREVISTO =
  'Il salvataggio non è partito per un errore imprevisto di questo browser. Riprova; se si ripete, aggiorna il browser.'

/**
 * Esegue un salvataggio alla volta e ne tiene l'esito: stato, ora, errore con
 * il suo `riprova`. Non rigetta mai: un guasto nel client (non una risposta del
 * database, che `esegui` riduce già a un esito) diventa un errore leggibile
 * invece di un clic che non fa niente (difetto 11).
 */
async function inSerie(
  azione: (adesso: Fotografia, scritto: { prezzi?: PrezziCongelati }) => Promise<Esito<PreventivoSalvato>>,
  riprova: () => void
): Promise<Esito<PreventivoSalvato>> {
  if (useSalvataggio.getState().inCorso) return { ok: false, errore: MSG_IN_CORSO }
  const adesso = fotografia()
  // I prezzi che l'azione scrive in `dati`, se li scrive: dopo il salvataggio
  // sono quelli del preventivo aperto (il PDF di un inviato li userà).
  const scritto: { prezzi?: PrezziCongelati } = {}
  useSalvataggio.setState({ inCorso: true, errore: null })
  try {
    const esito = await Promise.resolve()
      .then(() => azione(adesso, scritto))
      // Un guasto del client, sincrono o no (es. nessun generatore di id): il
      // motivo non va in UI né nei log, perché può citare lo stato. Lo dice il
      // messaggio, e «Riprova» resta.
      .catch((): Esito<PreventivoSalvato> => ({ ok: false, errore: MSG_ERRORE_IMPREVISTO }))
    if (esito.ok) {
      useQuoteStore.getState().impostaSalvato(esito.dato, scritto.prezzi)
      ricordaSalvato(adesso)
      useSalvataggio.setState({ salvatoAlle: new Date(), errore: null })
    } else {
      useSalvataggio.setState({ errore: { ...esito, riprova } })
    }
    return esito
  } finally {
    useSalvataggio.setState({ inCorso: false })
  }
}

/**
 * Il controllo dei listini prima di scrivere `dati` (C1): quello di «Genera»
 * senza l'eccezione dei prezzi congelati, perché chi scrive ricalcola coi
 * listini di adesso (N2). Senza il listino di una sezione compilata il totale
 * verrebbe 0 e i prezzi congelati sarebbero «da definire»: non si scrive, e si
 * dice perché.
 */
function bloccoListini(): Esito<never> | null {
  const blocco = bloccoListiniAdesso()
  return blocco.bloccato ? { ok: false, errore: blocco.motivo ?? 'Manca un listino: il preventivo non si può salvare.' } : null
}

/**
 * «Salva» (barra, «Genera», cambio di stato): il primo salvataggio prende il
 * numero dal database, i successivi aggiornano la stessa riga col lock. Lo stato
 * resta quello salvato, salvo `stato` (la scelta nella pagina Preventivi).
 *
 * Strada A (Marco, 14/10) e revisione L15-L21:
 *  - niente da scrivere (già salvato, nessuna modifica, stesso stato, e per
 *    una bozza gli stessi prezzi): nessuna scrittura (difetto 12 del 14/10);
 *  - una bozza i cui prezzi sono cambiati col listino si riscrive (C2);
 *  - solo lo stato cambia: si scrive solo lo stato, e i prezzi congelati
 *    restano quelli dell'ultimo salvataggio (un inviato che diventa accettato
 *    tiene i prezzi dell'invio). Una bozza salvata prima dei prezzi congelati
 *    li prende ora, con una scrittura intera;
 *  - un inviato o accettato non si riscrive (`MSG_INVIATO`), se non con
 *    `correggi` («Correggi questo preventivo», solo admin: lo ripete il
 *    database);
 *  - prima di scrivere `dati`, i listini (C1).
 * `riprova` è il gesto che rifà «Riprova» se fallisce (per «Genera», salva e
 * stampa); senza, rifà questo salvataggio.
 */
export function salvaAperto(
  stato?: Exclude<StatoPreventivo, 'annullato'>,
  riprova?: () => void,
  opzioni: { correggi?: boolean } = {}
): Promise<Esito<PreventivoSalvato>> {
  const q0 = useQuoteStore.getState()
  const salvato = q0.archivio?.preventivo
  const rifai = riprova ?? (() => void salvaAperto(stato, undefined, opzioni))
  if (salvato && salvato.stato !== 'annullato' && !haModificheNonSalvate()) {
    const stessoStato = stato === undefined || stato === salvato.stato
    const daRicalcolare = salvato.stato === 'bozza' && prezziDaAggiornare()
    if (stessoStato && !daRicalcolare) return Promise.resolve({ ok: true, dato: salvato })
    if (!stessoStato && (q0.archivio.prezzi || salvato.stato !== 'bozza')) {
      return inSerie(() => aggiornaStato(salvato, stato), rifai)
    }
  }
  return inSerie((adesso, scritto) => {
    const q = useQuoteStore.getState()
    const aperto = q.archivio?.preventivo
    if (aperto && statoInviato(aperto.stato) && !opzioni.correggi) return Promise.resolve({ ok: false, errore: MSG_INVIATO })
    const bloccato = bloccoListini()
    if (bloccato) return Promise.resolve(bloccato)
    const statoDaSalvare = stato ?? (aperto && aperto.stato !== 'annullato' ? aperto.stato : 'bozza')
    const prezzi = prezziAdesso(adesso.sezioni)
    scritto.prezzi = prezzi
    return salvaPreventivo(
      {
        archivio: q.archivio,
        preventivo: adesso.preventivo,
        sezioni: adesso.sezioni,
        stato: statoDaSalvare,
        totaleImponibile: prezzi.vista.calcolo.iva.totaleImponibile,
        prezzi,
      },
      q.riservaNumero
    )
  }, rifai)
}

/**
 * «Nuova revisione»: lo stato aperto diventa la revisione successiva, in bozza,
 * coi prezzi di adesso (per un inviato è il modo di aggiornarli). Idempotente
 * come il primo salvataggio: l'id della riga nuova si tiene (`riservaNumero`) e
 * «Riprova» lo riusa (plausibile b). Con un listino che manca non scrive (C1).
 */
export function revisioneAperto(riprova?: () => void): Promise<Esito<PreventivoSalvato>> {
  return inSerie(
    (adesso, scritto) => {
      const bloccato = bloccoListini()
      if (bloccato) return Promise.resolve(bloccato)
      const q = useQuoteStore.getState()
      const prezzi = prezziAdesso(adesso.sezioni)
      scritto.prezzi = prezzi
      return nuovaRevisione(
        { archivio: q.archivio, preventivo: adesso.preventivo, sezioni: adesso.sezioni, totaleImponibile: prezzi.vista.calcolo.iva.totaleImponibile, prezzi },
        q.riservaNumero
      )
    },
    riprova ?? (() => void revisioneAperto())
  )
}

/** «Ricarica la versione salvata» dopo un conflitto: il preventivo com'è nel database. */
export async function ricaricaAperto(): Promise<Esito<true>> {
  const salvato = useQuoteStore.getState().archivio?.preventivo
  if (!salvato) return { ok: false, errore: 'Nessun preventivo salvato da ricaricare.' }
  const esito = await apriPreventivo(salvato.id)
  if (!esito.ok) {
    useSalvataggio.setState({ errore: { ...esito, riprova: () => void ricaricaAperto() } })
    return esito
  }
  useQuoteStore.getState().apriDaArchivio(esito.dato.preventivo, esito.dato.sezioni, esito.dato.archivio)
  segnaAllineato()
  return { ok: true, dato: true }
}
