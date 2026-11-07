import { create } from 'zustand'
import { parseExcelInWorker } from '@/lib/excelWorker'
import { supabase, LISTINI_BUCKET } from '@/lib/supabase'
import { validaListino, type Categoria, type Validato } from '@/parsers/validaListino'
import { AVVISO_SELEZIONE_NON_APPLICATA, leggiSelezione, nomeSidecar } from '@/lib/selezioneFogli'
import type { ListinoSuMisura, RigaMatrice } from '@/types/sumisura'
import { chiaveMatrice } from '@/engine/matriceFiniture'
import type { ListinoMarmeria } from '@/types/marmeria'
import type { ListinoPorte } from '@/types/porte'
import { PROG_PCT, ADEG_DEFAULT, type ListinoCucina } from '@/types/cucina'
import { catalogoSenzaPrezzi, strutturaCucina } from '@/data/cucina/strutturaCucina'
import { formatPercent } from '@/utils/format'

interface PricelistErrors {
  suMisura: string | null
  marmeria: string | null
  porte: string | null
  cucine: string | null
}

/**
 * Cosa è entrato e cosa no, in chiaro. Non decide niente: misura.
 *
 * Serve perché il fallimento peggiore di un listino non è l'errore, è il
 * silenzio: 51 voci ieri, 3 oggi, e nessuno se ne accorge. Il referto rende la
 * differenza leggibile in un secondo, senza chiedere a nessuno di fidarsi.
 */
export interface RefertoListino {
  file: string
  /**
   * `combinazioni`: solo il foglio FINITURE di Su Misura (L20), le combinazioni
   * della matrice per tipo di arredo, nell'ordine del file.
   */
  caricati: Array<{ nome: string; voci: number; combinazioni?: Array<{ tipo: string; numero: number }> }>
  esclusi: Array<{ nome: string; motivo: string }>
  /**
   * Avvisi non bloccanti, dettaglio tecnico per l'admin: es. una selezione fogli
   * ignorata perché stantia. Portano anche gli avvisi di Marmeria e Cucine, quindi
   * NON si specchiano in UI per tutti: per quello c'è `avviso`.
   */
  note: string[]
  /**
   * Solo Su Misura: la selezione dei fogli non si è applicata e nei prezzi possono
   * esserci fogli di lavoro. Testo per chi compila i preventivi; `AppShell` lo
   * specchia in una notifica persistente. Presente solo se entra più di un foglio.
   */
  avviso?: string
}

interface PricelistReferti {
  suMisura: RefertoListino | null
  marmeria: RefertoListino | null
  porte: RefertoListino | null
  cucine: RefertoListino | null
}

export interface OpzioniIngest {
  /**
   * Fogli ammessi (E14, solo su misura). `undefined`/`null` = TUTTI, cioè il
   * comportamento di ieri: è il fallback obbligatorio, mai "listino assente".
   */
  fogliAmmessi?: string[] | null
  /** Note da riportare nel referto (es. sidecar stantio). */
  note?: string[]
  /**
   * L'avviso per tutti quando la selezione fogli non si è applicata (O9). Finisce
   * nel referto solo se poi entra più di un foglio: con un foglio solo non c'è
   * niente da includere per sbaglio.
   */
  avviso?: string
  /**
   * Controllo di `loadDefaults`: "questa lettura è ancora la più recente?".
   * `ingestListino` lo interroga dopo l'esame e PRIMA di `impostaListino`, nello
   * stesso tick sincrono (nessun `await` in mezzo), e se è falso non scrive.
   */
  ancoraValida?: () => boolean
}

interface PricelistState {
  // `Validato<...>`: NON è decorazione. Solo `validaListino` sa produrre quel
  // tipo, quindi un `setState({ marmeria: parsedGrezzo })` non compila. È il
  // compilatore a tenere chiusa la porta, non la buona volontà di chi scrive.
  suMisura: Validato<ListinoSuMisura> | null
  marmeria: Validato<ListinoMarmeria> | null
  porte: Validato<ListinoPorte> | null
  /** Listino cucine (PR 10b): prezzi della cucina, tariffa dei giorni e vasca in gres (D7). */
  cucine: Validato<ListinoCucina> | null
  loadingDefaults: boolean
  /** Errori separati per categoria, popolati da loadDefaults. */
  errors: PricelistErrors
  /** Cosa è entrato e cosa no, per categoria. Sempre popolato quando il listino c'è. */
  referti: PricelistReferti

  /**
   * UNICA via d'ingresso: parse nel worker → validazione → store.
   * Ritorna il messaggio d'errore in italiano, o `null` se è andata.
   * Chi chiama decide dove mostrarlo (bucket → `errors` → toast di AppShell;
   * upload manuale → inline nella modale), ma il testo nasce qui, uno solo.
   */
  ingestListino: (
    categoria: Categoria,
    buffer: ArrayBuffer,
    filename: string,
    opzioni?: OpzioniIngest
  ) => Promise<string | null>
  /**
   * Mette in memoria un listino GIÀ esaminato (`esaminaListino`), senza un altro
   * parse. L'upload admin la chiama solo DOPO che il file è entrato nel bucket.
   */
  impostaListino: (esame: ListinoEsaminato) => void
  /** Scarica i listini dal bucket Supabase "Listini". */
  loadDefaults: () => Promise<void>
}

/**
 * Etichette per i messaggi utente: una sola fonte, niente varianti per percorso.
 * Sono i nomi del menu (L24): «Arredi» per la categoria `sumisura`, «Gres» per
 * `marmeria`. Le chiavi restano, come la parola «marmeria» nel nome del file che
 * fa riconoscere il listino Gres (`categorizzaListino`) e i titoli del PDF.
 */
export const ETICHETTA: Record<Categoria, string> = {
  sumisura: 'Arredi',
  marmeria: 'Gres',
  porte: 'Porte',
  cucine: 'Cucine',
}

/**
 * Cosa dire a chi ha appena rotto un listino. Il messaggio resta a schermo
 * finché non lo si chiude, quindi non può dire il falso.
 *
 * Su Misura: `parseSuMisura` cerca l'intestazione per etichetta nelle prime 20
 * righe (`INTESTAZIONI_SU_MISURA`, e `INTESTAZIONE_RETI_LETTO` per il foglio
 * delle reti), non in una riga fissa. Il suggerimento nomina quindi le
 * etichette, non le righe: un foglio con la riga vuota in meno o il titolo
 * vuoto si legge lo stesso.
 */
const SUGGERIMENTO: Record<Categoria, string> = {
  sumisura:
    "Verifica che ogni foglio abbia l'intestazione con «PREZZO UNITARIO» e «UNITA'» " +
    '(oppure «PREZZO» e «U.MISURA») nelle prime 20 righe; ' +
    'il foglio RETI LETTO vuole «RETE LETTO», «PREZZO» e «CLIENTE».',
  marmeria: 'Verifica che la struttura del file corrisponda al template De Bari.',
  porte: 'Verifica che la struttura del file corrisponda al template porte.',
  cucine: 'Verifica che il file sia il listino cucine: foglio CUCINA, nomi in colonna A, prezzi in colonna B.',
}

/**
 * Categorizza un file del bucket in base al nome (case-insensitive):
 * contiene "porte" → porte; "marmeria" → marmeria; "cucin" → cucine; tutto il
 * resto → sumisura. L'ordine conta: ogni parola è controllata PRIMA del fallback
 * sumisura, così un listino porte o cucine non viene scambiato per su misura (né
 * sposta gli altri). `cucin` copre «cucina» e «cucine».
 */
export function categorizzaListino(nomeFile: string): Categoria {
  if (/porte/i.test(nomeFile)) return 'porte'
  if (/marmeria/i.test(nomeFile)) return 'marmeria'
  if (/cucin/i.test(nomeFile)) return 'cucine'
  return 'sumisura'
}

function devLog(...args: unknown[]): void {
  if (import.meta.env.DEV) {
    console.info('[pricelistStore]', ...args)
  }
}

function devError(...args: unknown[]): void {
  if (import.meta.env.DEV) {
    console.error('[pricelistStore]', ...args)
  }
}

/**
 * Il messaggio di listino invalido, uno solo per tutti i percorsi. Prima ce
 * n'erano due per categoria — uno dal bucket, uno dall'upload manuale — e quello
 * manuale era più povero perché a monte non validava (E2).
 */
function messaggioInvalido(categoria: Categoria, filename: string, errore: string): string {
  return (
    `Il file "${filename}" non è un listino ${ETICHETTA[categoria]} valido: ${errore}. ` +
    SUGGERIMENTO[categoria]
  )
}

/** Un file appena letto dal worker, col tipo legato alla categoria. */
export type ListinoLetto =
  | { categoria: 'sumisura'; parsed: ListinoSuMisura }
  | { categoria: 'marmeria'; parsed: ListinoMarmeria }
  | { categoria: 'porte'; parsed: ListinoPorte }
  | { categoria: 'cucine'; parsed: ListinoCucina }

/** Un listino che ha passato l'esame: validato, col suo referto, pronto per lo store. */
export type ListinoEsaminato =
  | { categoria: 'sumisura'; listino: Validato<ListinoSuMisura>; referto: RefertoListino }
  | { categoria: 'marmeria'; listino: Validato<ListinoMarmeria>; referto: RefertoListino }
  | { categoria: 'porte'; listino: Validato<ListinoPorte>; referto: RefertoListino }
  | { categoria: 'cucine'; listino: Validato<ListinoCucina>; referto: RefertoListino }

export type EsitoEsame = { ok: true; esame: ListinoEsaminato } | { ok: false; errore: string }

/**
 * Parse nel worker. Lo switch risolve l'overload di `parseExcelInWorker` sul tipo
 * letterale di ogni ramo: catena tipata senza cast. Rigetta se il parser lancia
 * (foglio mancante, intestazione spostata): il messaggio è `messaggioLettura`.
 */
export async function leggiListino(categoria: Categoria, buffer: ArrayBuffer, filename: string): Promise<ListinoLetto> {
  switch (categoria) {
    case 'sumisura':
      return { categoria, parsed: await parseExcelInWorker('sumisura', buffer, filename) }
    case 'marmeria':
      return { categoria, parsed: await parseExcelInWorker('marmeria', buffer, filename) }
    case 'porte':
      return { categoria, parsed: await parseExcelInWorker('porte', buffer, filename) }
    case 'cucine':
      // Solo la struttura senza prezzi: i prezzi li porta il file (D7).
      return { categoria, parsed: await parseExcelInWorker('cucine', buffer, filename, strutturaCucina) }
  }
}

/** La percentuale di un moltiplicatore nella struttura del codice (casse, ante). */
function percentualeCodice(id: 'casse' | 'ante'): number | null {
  const v = catalogoSenzaPrezzi.find((x) => x.id === id)
  return v?.kind === 'moltiplicatore' ? v.percentuale : null
}

/**
 * Gli avvisi del listino cucine: non bloccano, dicono cosa l'app non userà o
 * userà diversamente da come il file lo scrive.
 */
function avvisiCucina(l: ListinoCucina): string[] {
  const note: string[] = []
  if (l.righeSconosciute.length > 0) {
    note.push(
      `${l.righeSconosciute.length} righe non sono voci che l'app conosce, quindi non si useranno: ` +
        `${l.righeSconosciute.join(', ')}. Per usarle serve un aggiornamento dell'app`
    )
  }
  if (l.vociMancanti.length > 0) {
    note.push(
      `${l.vociMancanti.length} voci dell'app non sono nel file e resteranno da definire: ${l.vociMancanti.join(', ')}`
    )
  }
  const confronti: [string, number | null, number | null][] = [
    ['casse', l.percentuali.casse, percentualeCodice('casse')],
    ['ante', l.percentuali.ante, percentualeCodice('ante')],
    ['progettazione', l.percentuali.progettazione, PROG_PCT],
    ['adeguamento', l.percentuali.adeguamento, ADEG_DEFAULT],
  ]
  for (const [nome, file, codice] of confronti) {
    if (file !== null && codice !== null && Math.abs(file - codice) > 1e-9) {
      note.push(`percentuale ${nome}: nel file ${formatPercent(file)}, l'app usa ${formatPercent(codice)}`)
    }
  }
  if (l.vascaGres === null) note.push('manca la riga «VASCA INTEGRATA IN GRES»: la vasca non avrà un prezzo di default')
  if (l.giornoRate === null) note.push('manca la riga «GIORNI EXTRA REALIZZAZIONE»: i giorni extra non avranno una tariffa')
  return note
}

/** Quante combinazioni della matrice per tipo di arredo (L20), con la prima grafia del file. */
function combinazioniPerTipo(matrice: readonly RigaMatrice[]): Array<{ tipo: string; numero: number }> {
  const perTipo = new Map<string, { tipo: string; numero: number }>()
  for (const r of matrice) {
    const chiave = chiaveMatrice(r.tipo)
    const voce = perTipo.get(chiave) ?? { tipo: r.tipo, numero: 0 }
    voce.numero++
    perTipo.set(chiave, voce)
  }
  return [...perTipo.values()]
}

/** Il messaggio di un file che il parser non è riuscito a leggere. */
export function messaggioLettura(categoria: Categoria, e: unknown): string {
  const msg = e instanceof Error ? e.message : 'formato non riconosciuto'
  return `Errore lettura file ${ETICHETTA[categoria]}: ${msg}`
}

/**
 * L'esame di un listino letto: filtro fogli (E14, solo su misura), Zod, referto e
 * messaggio d'errore. Pura: nessuno store, nessun parse. È la stessa per il bucket
 * e per l'upload admin, che la chiama PRIMA di caricare (A4).
 *
 * `aggiornato` si aggiunge PRIMA di validare: il marchio finisce così sull'oggetto
 * ESATTO che entra nello store. Validare `parsed` e poi fare lo spread produrrebbe
 * un oggetto nuovo, senza marchio — e senza garanzia.
 */
export function esaminaListino(letto: ListinoLetto, filename: string, opzioni?: OpzioniIngest): EsitoEsame {
  const note = [...(opzioni?.note ?? [])]
  switch (letto.categoria) {
    case 'sumisura': {
      const { parsed } = letto
      // ── E14: filtro fogli ──
      // `ammessi` assente = tutti, cioè ieri. È il fallback obbligatorio:
      // il file che sta nel bucket ADESSO non ha un sidecar, e deve
      // continuare a funzionare come sempre.
      const ammessi = opzioni?.fogliAmmessi
      const esclusi: RefertoListino['esclusi'] = []
      let fogli = parsed.fogli

      if (ammessi && ammessi.length > 0) {
        const mancanti = ammessi.filter((n) => !parsed.fogli.some((f) => f.nome === n))
        if (mancanti.length > 0) {
          // La selezione parla di fogli che nel file non ci sono: il file è
          // cambiato sotto la scelta in un modo che il fingerprint non ha
          // colto. Errore VISIBILE, non un silenzioso "carico quel che trovo".
          return {
            ok: false,
            errore:
              `Il file "${filename}" non contiene i fogli selezionati: ${mancanti.join(', ')}. ` +
              'Ricarica il file dalla Gestione Listini e riseleziona i fogli.',
          }
        }
        fogli = parsed.fogli.filter((f) => ammessi.includes(f.nome))
        for (const f of parsed.fogli) {
          if (!ammessi.includes(f.nome)) {
            esclusi.push({ nome: f.nome, motivo: 'non selezionato come listino' })
          }
        }
      }

      // Un file col solo foglio CUCINA è il listino cucine con un nome sbagliato:
      // come su misura passerebbe (righe con prezzo in B e unità in C), e da file
      // più recente sostituirebbe il listino Su Misura in uso.
      if (parsed.fogli.length > 0 && parsed.fogli.every((f) => f.nome.trim().toUpperCase() === 'CUCINA')) {
        return {
          ok: false,
          errore:
            `Il file "${filename}" ha solo il foglio CUCINA: sembra il listino cucine, non un listino ${ETICHETTA.sumisura}. ` +
            'Rinominalo con «cucina» nel nome e ricaricalo.',
        }
      }

      const esito = validaListino('sumisura', { ...parsed, fogli, aggiornato: filename })
      if (!esito.ok) return { ok: false, errore: messaggioInvalido('sumisura', filename, esito.errore) }
      // Come per Marmeria: i fogli che il parser non ha letto (intestazione non
      // trovata, O7) non bloccano, si dicono.
      note.push(...(parsed.avvisi ?? []))
      // La nota di testata della matrice (L20) porta le regole del listino
      // (sviluppo minimo, profondità): l'admin la legge nel referto.
      for (const f of fogli) {
        if (f.matrice && f.nota) note.push(`${f.nome}, nota di testata: ${f.nota}`)
      }
      const avviso = fogli.length > 1 ? opzioni?.avviso : undefined
      return {
        ok: true,
        esame: {
          categoria: 'sumisura',
          listino: esito.data,
          referto: {
            file: filename,
            caricati: fogli.map((f) => ({
              nome: f.nome,
              voci: f.voci.length,
              ...(f.matrice ? { combinazioni: combinazioniPerTipo(f.matrice) } : {}),
            })),
            esclusi,
            note,
            ...(avviso ? { avviso } : {}),
          },
        },
      }
    }
    case 'marmeria': {
      const { parsed } = letto
      const esito = validaListino('marmeria', { ...parsed, aggiornato: filename })
      if (!esito.ok) return { ok: false, errore: messaggioInvalido('marmeria', filename, esito.errore) }
      // Gli avvisi del parser finiscono nel referto insieme a quelli del
      // chiamante: sono il canale con cui il listino dice "qui ho assunto
      // io". Un valore assunto e taciuto è peggio di un errore.
      note.push(...(parsed.avvisi ?? []))
      return {
        ok: true,
        esame: {
          categoria: 'marmeria',
          listino: esito.data,
          referto: {
            file: filename,
            caricati: [
              { nome: 'materiali', voci: parsed.materiali.length },
              { nome: 'lavorazioni bordo', voci: parsed.lavorazioniBordo.length },
              { nome: 'lavorazioni varie', voci: parsed.lavorazioniVarie.length },
              { nome: 'scaglioni rilievo+montaggio', voci: parsed.rilMontScaglioni.length },
            ],
            esclusi: [],
            note,
          },
        },
      }
    }
    case 'porte': {
      const { parsed } = letto
      const esito = validaListino('porte', { ...parsed, aggiornato: filename })
      if (!esito.ok) return { ok: false, errore: messaggioInvalido('porte', filename, esito.errore) }
      // Come per Marmeria: i modelli senza prezzo non bloccano, si dicono.
      note.push(...(parsed.avvisi ?? []))
      return {
        ok: true,
        esame: {
          categoria: 'porte',
          listino: esito.data,
          referto: {
            file: filename,
            caricati: [
              { nome: 'modelli', voci: parsed.modelli.length },
              { nome: 'optional', voci: parsed.optional.length },
            ],
            esclusi: [],
            note,
          },
        },
      }
    }
    case 'cucine': {
      const { parsed } = letto
      const esito = validaListino('cucine', { ...parsed, aggiornato: filename })
      if (!esito.ok) return { ok: false, errore: messaggioInvalido('cucine', filename, esito.errore) }
      note.push(...avvisiCucina(parsed))
      return {
        ok: true,
        esame: {
          categoria: 'cucine',
          listino: esito.data,
          referto: {
            file: filename,
            caricati: [
              { nome: 'voci con prezzo', voci: parsed.prezzi.length },
              { nome: 'vasca', voci: parsed.vascaGres === null ? 0 : 1 },
              { nome: 'tariffa giorni extra', voci: parsed.giornoRate === null ? 0 : 1 },
            ],
            esclusi: [],
            note,
          },
        },
      }
    }
  }
}

/**
 * ── O30: letture sovrapposte ──
 *
 * `loadDefaults` dura secondi e può partire due volte (avvio + cancellazione in
 * Gestione Listini, o due cancellazioni di fila). Senza una guardia vince chi
 * FINISCE per ultimo, non chi è PARTITO per ultimo: una lettura vecchia, lenta,
 * riscriveva il listino già aggiornato da quella nuova.
 *
 * Due numeri, non uno:
 * - `corsa` conta solo gli avvii di `loadDefaults` e guarda i due campi che le
 *   corse si contendono tutte (`loadingDefaults`, `errors`);
 * - `versione[categoria]` sale solo in `impostaListino`, cioè a ogni scrittura
 *   di un listino (upload admin o lettura andata a buon fine): invalida le letture
 *   già partite PER QUELLA categoria, senza toccare le altre tre. Un upload è per
 *   definizione l'informazione più fresca; non deve perdere contro una lettura.
 */
let corsa = 0
const versione: Record<Categoria, number> = { sumisura: 0, marmeria: 0, porte: 0, cucine: 0 }

/**
 * Risolve quando nessuna `loadDefaults` è in corso. Una corsa superata la aspetta
 * prima di risolversi: `AppShell` scatta lo snapshot delle porte alla risoluzione
 * della sua promessa, una volta sola, e se questa si risolvesse prima che la
 * corsa vincente abbia scritto, lo snapshot troverebbe `porte` a `null`.
 */
function attendiFineCaricamento(): Promise<void> {
  return new Promise((risolvi) => {
    if (!usePricelistStore.getState().loadingDefaults) return risolvi()
    const smetti = usePricelistStore.subscribe((s) => {
      if (s.loadingDefaults) return
      smetti()
      risolvi()
    })
  })
}

export const usePricelistStore = create<PricelistState>((set, get) => ({
  suMisura: null,
  marmeria: null,
  porte: null,
  cucine: null,
  loadingDefaults: false,
  errors: { suMisura: null, marmeria: null, porte: null, cucine: null },
  referti: { suMisura: null, marmeria: null, porte: null, cucine: null },

  ingestListino: async (categoria, buffer, filename, opzioni) => {
    // Parse nel worker → esame (filtro fogli, Zod, referto) → store. Le tre fasi
    // sono separate perché l'upload admin le usa una per volta: esamina PRIMA di
    // caricare nel bucket, e mette nello store SOLO dopo un upload riuscito (A4).
    try {
      const esito = esaminaListino(await leggiListino(categoria, buffer, filename), filename, opzioni)
      if (!esito.ok) return esito.errore
      // Nessun `await` fra questo controllo e la scrittura: la finestra non c'è.
      if (opzioni?.ancoraValida && !opzioni.ancoraValida()) return null
      get().impostaListino(esito.esame)
      return null
    } catch (e) {
      devError(`${categoria}:`, e)
      return messaggioLettura(categoria, e)
    }
  },

  impostaListino: (esame) => {
    // Uno switch e non una chiave calcolata: così il tipo `Validato<...>` di ogni
    // campo resta controllato dal compilatore, senza cast (vedi `validaListino`).
    const { referti, errors } = get()
    versione[esame.categoria] += 1
    switch (esame.categoria) {
      case 'sumisura':
        set({ suMisura: esame.listino, referti: { ...referti, suMisura: esame.referto }, errors: { ...errors, suMisura: null } })
        break
      case 'marmeria':
        set({ marmeria: esame.listino, referti: { ...referti, marmeria: esame.referto }, errors: { ...errors, marmeria: null } })
        break
      case 'porte':
        set({ porte: esame.listino, referti: { ...referti, porte: esame.referto }, errors: { ...errors, porte: null } })
        break
      case 'cucine':
        set({ cucine: esame.listino, referti: { ...referti, cucine: esame.referto }, errors: { ...errors, cucine: null } })
        break
    }
    devLog(`${esame.categoria} in memoria: ${esame.referto.file}`)
  },

  loadDefaults: async () => {
    // Il numero di questa corsa e le versioni dei listini al suo avvio (O30).
    const mia = ++corsa
    const versioniAvvio = { ...versione }

    set({
      loadingDefaults: true,
      errors: { suMisura: null, marmeria: null, porte: null, cucine: null },
    })

    const allError = (message: string) => {
      devError(message)
      set({
        errors: { suMisura: message, marmeria: message, porte: message, cucine: message },
        loadingDefaults: false,
      })
    }

    const { data: files, error: listError } = await supabase.storage
      .from(LISTINI_BUCKET)
      .list('', {
        limit: 100,
        sortBy: { column: 'updated_at', order: 'desc' },
      })

    // Una corsa partita dopo di noi ha la precedenza: non scarica niente e non
    // scrive. Il controllo sta PRIMA di `listError`, così nemmeno il suo errore
    // di elenco spegne i listini che la corsa vincente sta per mettere. Da qui a
    // `allError` non c'è nessun `await`: la guardia non ha bisogno di una sua.
    if (mia !== corsa) {
      await attendiFineCaricamento()
      return
    }

    if (listError) {
      allError(`Impossibile elencare i listini: ${listError.message}`)
      return
    }

    if (!files || files.length === 0) {
      allError(
        'Nessun listino disponibile nel bucket Supabase. ' +
          'Verifica che i file Excel siano stati caricati e che le RLS policy del bucket consentano la lettura.'
      )
      return
    }

    devLog(
      'bucket Listini contiene',
      files.length,
      'file:',
      files.map((f) => f.name)
    )

    // Filtro estensioni: .xlsx/.xls. Il supporto .ods è stato deciso non necessario (Antonio esporta in .xlsx).
    const excel = files.filter((f) => /\.(xlsx|xls)$/i.test(f.name))
    const sumisuraFile = excel.find((f) => categorizzaListino(f.name) === 'sumisura')
    const marmeriaFile = excel.find((f) => categorizzaListino(f.name) === 'marmeria')
    const porteFile = excel.find((f) => categorizzaListino(f.name) === 'porte')
    const cucineFile = excel.find((f) => categorizzaListino(f.name) === 'cucine')

    devLog('categorizzati:', {
      sumisura: sumisuraFile?.name ?? '(nessuno)',
      marmeria: marmeriaFile?.name ?? '(nessuno)',
      porte: porteFile?.name ?? '(nessuno)',
      cucine: cucineFile?.name ?? '(nessuno)',
    })

    /** I nomi che l'elenco del bucket ha reso: serve a sapere se un sidecar c'è (O9). */
    const elencati = new Set(files.map((f) => f.name))

    /**
     * Scarica dal bucket e passa la palla a `ingestListino`, che parsa, valida e
     * scrive. I tre job erano copie quasi identiche: la sola differenza vera era
     * che marmeria e porte validavano e su misura no. Ora la differenza non è
     * più esprimibile — c'è una porta sola.
     *
     * Cattura i propri errori e ritorna sempre una stringa-o-null: non rifiuta
     * mai, così un listino rotto non trascina giù gli altri due.
     */
    /**
     * Legge il sidecar della selezione fogli (E14) per un file del bucket.
     *
     * Non fallisce MAI in modo bloccante: qualunque cosa vada storta — sidecar
     * assente, JSON rotto, riferito a un altro file, dimensione che non torna —
     * ritorna "nessun filtro" più una nota per il referto. Il peggio ammesso è
     * il comportamento di ieri, mai un listino che non carica.
     *
     * Ma il peggio ammesso non è più silenzioso (O9): quando una selezione c'è e
     * non si applica, oltre alla nota per l'admin torna un `avviso` per tutti. Il
     * 404 di un sidecar che non esiste (ogni file precedente a E14) si distingue
     * da un guasto con l'ELENCO del bucket, che `loadDefaults` ha già in mano: se
     * il sidecar è fra i nomi elencati e il download fallisce, è un guasto; se non
     * c'è, è assente e si tace. Zero chiamate in più, nessun codice di Supabase
     * da interpretare. Il messaggio grezzo dell'SDK non entra nelle note.
     */
    const selezionePerFile = async (
      nomeFile: string,
      size: number | undefined,
      sidecarElencato: boolean
    ): Promise<OpzioniIngest> => {
      const nonApplicata = (motivo: string): OpzioniIngest => ({
        note: [`selezione fogli ignorata: ${motivo}`],
        avviso: AVVISO_SELEZIONE_NON_APPLICATA,
      })
      const NON_LEGGIBILE = 'il file della selezione non si è potuto leggere'

      // try/catch INTERNO, non delegato al job: qui qualunque eccezione — rete,
      // un Blob senza `.text()`, JSON gigante — deve morire, non risalire. Se
      // risalisse, il job la trasformerebbe in "Errore caricamento Su Misura" e
      // il listino non caricherebbe: il sidecar, che è un ACCESSORIO, avrebbe
      // il potere di spegnere il listino. Il peggio ammesso è "come ieri".
      try {
        const { data, error } = await supabase.storage
          .from(LISTINI_BUCKET)
          .download(nomeSidecar(nomeFile))
        if (error || !data) return sidecarElencato ? nonApplicata(NON_LEGGIBILE) : {}
        if (typeof data.text !== 'function') return nonApplicata(NON_LEGGIBILE)

        const esito = leggiSelezione(await data.text(), nomeFile, size)
        switch (esito.stato) {
          case 'ok':
            devLog(`selezione fogli per ${nomeFile}:`, esito.fogli)
            return { fogliAmmessi: esito.fogli }
          case 'stantio':
          case 'illeggibile':
            devLog(`selezione fogli IGNORATA per ${nomeFile}: ${esito.motivo}`)
            return nonApplicata(esito.motivo)
          case 'assente':
            return {}
        }
      } catch (e) {
        devError(`selezione fogli illeggibile per ${nomeFile}:`, e)
        return nonApplicata(NON_LEGGIBILE) // tutti i fogli, come ieri, ma detto
      }
    }

    const leggiDalBucket = async (
      categoria: Categoria,
      file: { name: string; metadata?: { size?: number } | null } | undefined,
      ancoraValida: () => boolean
    ): Promise<string | null> => {
      if (!file) {
        return `Nessun file ${ETICHETTA[categoria]} trovato nel bucket Listini.`
      }
      try {
        const { data, error } = await supabase.storage.from(LISTINI_BUCKET).download(file.name)
        if (error || !data) {
          return `Errore download ${ETICHETTA[categoria]}: ${error?.message ?? 'file non disponibile'}`
        }
        devLog(`${categoria} scaricato: ${file.name} (${data.size} bytes)`)

        // Solo su misura itera i fogli, quindi solo lì la selezione ha senso:
        // marmeria e porte leggono fogli con nomi fissi. `ancoraValida` invece
        // va a TUTTE le categorie.
        const opzioni: OpzioniIngest = {
          ...(categoria === 'sumisura'
            ? await selezionePerFile(file.name, file.metadata?.size, elencati.has(nomeSidecar(file.name)))
            : {}),
          ancoraValida,
        }

        return await usePricelistStore
          .getState()
          .ingestListino(categoria, await data.arrayBuffer(), file.name, opzioni)
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'errore sconosciuto'
        devError(`${categoria}:`, e)
        return `Errore caricamento ${ETICHETTA[categoria]}: ${msg}`
      }
    }

    const job = async (
      categoria: Categoria,
      file: { name: string; metadata?: { size?: number } | null } | undefined
    ): Promise<string | null> => {
      // Ancora valida = nessuna corsa più recente e nessun listino di questa
      // categoria messo da altri (upload admin) dopo il nostro avvio.
      const ancoraValida = () => mia === corsa && versione[categoria] === versioniAvvio[categoria]
      const esito = await leggiDalBucket(categoria, file, ancoraValida)
      // Una lettura superata vale `null` qualunque cosa abbia trovato: un errore
      // vecchio non deve spegnere un listino che un upload ha appena messo a posto.
      return ancoraValida() ? esito : null
    }

    const [suErr, marErr, porteErr, cucineErr] = await Promise.all([
      job('sumisura', sumisuraFile),
      job('marmeria', marmeriaFile),
      job('porte', porteFile),
      // Dalla 10b-2 i prezzi della cucina vengono da qui: l'assenza si notifica
      // come per gli altri.
      job('cucine', cucineFile),
    ])

    // Una corsa superata non tocca `errors` né `loadingDefaults` (sono della
    // vincente) e si risolve solo quando questa ha finito.
    if (mia !== corsa) {
      await attendiFineCaricamento()
      return
    }

    set({
      errors: { suMisura: suErr, marmeria: marErr, porte: porteErr, cucine: cucineErr },
      loadingDefaults: false,
    })
  },
}))
