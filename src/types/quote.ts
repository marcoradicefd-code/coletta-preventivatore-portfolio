import type { Arredo, QuoteSuMisura } from './sumisura'
import type { QuoteMarmeria } from './marmeria'
import type { UnitaOptionalPorta } from './porte'
import type { AliquotaIva } from '@/engine/iva'

// ── Stato preventivo per-sezione (Fase 2 / FASE 1) ──
// Rimpiazza il vecchio `{ suMisura, marmeria }` di quoteStore con un modello a
// sezioni opzionali. In FASE 1 sono reali solo `arredi` (ex Su Misura) e `gres`
// (ex Marmeria); progettoValore/porte/cucine sono sezioni opzionali (`undefined` se mai toccate).
// Riferimento prodotto: SPEC_FASE2 §B.1.

/**
 * Sezione "Arredi" (ex "Su Misura per articolo"). È esattamente `QuoteSuMisura`
 * più uno `sconto` per-sezione (regola A.3: scontistica separata per sezione).
 * Su Misura non aveva sconto → il migrate v3→v4 lo inizializza a 0.
 */
export interface SezioneArredi extends QuoteSuMisura {
  /** Sconto frazionario nell'intervallo [0,1] applicato alla sola sezione arredi. */
  sconto: number
  /**
   * Testo descrittivo stampato in testa alla sezione nel PDF (DOCX 25/07).
   * `undefined` = mai toccato ⇒ si stampa `DESCRIZIONE_ARREDI_DEFAULT`; una
   * stringa (anche vuota) è una scelta dell'utente e vale così com'è.
   * Chiave opzionale su una sezione esistente → nessun bump di versione.
   */
  descrizione?: string
  /** Aliquota IVA della sezione (L18); assente ⇒ 22. Vedi `ConAliquotaIva`. */
  aliquotaIva?: AliquotaIva
  /**
   * Gli arredi (L19), nell'ordine in cui escono nel PDF. Assente ⇒ nessun
   * arredo: tutti gli articoli stanno in «Altre voci» e pagina e PDF sono
   * quelli di prima. Sconto e progettazione restano di sezione. Chiave
   * opzionale → nessun bump di versione.
   */
  arredi?: Arredo[]
}

/**
 * Aliquota IVA (L18, Antonio 12/10: «l'IVA cambia in base agli articoli: 4, 10,
 * 22»). Sulle sezioni è l'aliquota di sezione, **assente ⇒ 22**; sulle righe
 * vendute singolarmente (articoli Arredi, porte, battiscopa) **assente ⇒ quella
 * della sezione**. Un valore fuori da `ALIQUOTE_IVA` letto da un blob vale come
 * assente (`aliquotaIvaValida`). Chiave opzionale dentro sezioni esistenti →
 * nessun bump di versione: un blob di prima si apre e vale 22% su tutto.
 */
export interface ConAliquotaIva {
  aliquotaIva?: AliquotaIva
}

/**
 * Sezione "Gres / Marmeria" (ex Marmeria). È `QuoteMarmeria`, che ha già
 * `sconto` e `includiRilMont` (il rilievo+montaggio resta FUORI dallo sconto —
 * vedi `calcMarmeria`), più l'aliquota di sezione: materiali, lavorazioni e
 * montaggio sono un lavoro unico, quindi niente aliquota per riga.
 */
export interface SezioneGres extends QuoteMarmeria, ConAliquotaIva {}

/**
 * Sezione "Progetto a valore" (SPEC_FASE2 §B.5-bis / fase 6): righe a testo
 * libero con prezzo "a mano", sommate, con sconto per-sezione (regola A.3).
 * NESSUN calcolo automatico — niente listino, maggiorazioni o progettazione
 * (vedi `@/engine/calcProgettoValore`).
 */
export interface RigaProgettoValore {
  /** ID stabile (crypto.randomUUID), come le righe di arredi/gres. */
  id: string
  descrizione: string
  /**
   * Prezzo "a mano" in €. I negativi sono vietati a monte (input `min=0`); il
   * calcolo resta difensivo (non-finite → 0 via `safeFin`).
   */
  prezzo: number
}

/** A corpo: solo l'aliquota di sezione. */
export interface SezioneProgettoValore extends ConAliquotaIva {
  righe: RigaProgettoValore[]
  /** Sconto frazionario [0,1] applicato alla sola sezione (regola A.3). */
  sconto: number
}

/**
 * Sezione "Porte" (SPEC_FASE2 §B.4 / fase 7).
 *
 * I prezzi sono CONGELATI sulla riga alla scelta (E3), non risolti a runtime dal
 * listino. Il commento precedente diceva il contrario ed era la descrizione fedele
 * di un bug: una porta è un articolo SCELTO, e il fornitore che rinomina un
 * modello nel listino nuovo azzerava in silenzio i preventivi già promessi.
 *
 * Il distinguo che resta (vedi #18): articoli SCELTI → snapshot; lavorazioni a
 * catalogo (bordo/varie del gres) → live, perché lì il listino È il prezzo
 * corrente e le righe sono voci di un tariffario, non promesse.
 */
export interface OptionalScelto {
  id: string
  /** Nome dell'optional nel listino (per unità PORTA/MQ/PEZZO/ML). */
  nome: string
  /** Unità copiata dall'optional del listino alla scelta (comodità di lettura). */
  unita: UnitaOptionalPorta
  /** mq / pezzi / cm secondo l'unità; ignorata per PORTA (fisso ×1) e MANUALE. */
  quantita: number
  /** Prezzo a mano, usato SOLO per unità MANUALE. */
  prezzoManuale: number | null
  /**
   * Rate €/unità CONGELATO alla scelta (E3). Assente = scelta pre-snapshot, che
   * l'engine risolve ancora dal listino vivo (comportamento di ieri). MANUALE non
   * lo usa: il suo prezzo è già `prezzoManuale`.
   */
  prezzoUnitario?: number
}

/**
 * I tre prezzi di fascia di un modello, congelati alla scelta (E3).
 *
 * È la TERNA e non il singolo prezzo già risolto perché `updateRigaPorta` accetta
 * patch su `altezzaCm`: alzare una porta da 210 a 230 cambia fascia, e
 * chiederebbe un prezzo (h215) che non avremmo mai salvato.
 */
export interface PrezziModelloSnapshot {
  prezzo2026: number
  h215: number
  h240: number
}

/**
 * Maniglia della riga porta: prezzo A MANO, nessun listino la contiene.
 *
 * Il listino porte ha `STIPITI E MOSTRINE`, `BATTISCOPA MASSELLO` e la sua
 * variante +20%, e basta: le maniglie non ci sono e non ci saranno (le uniche
 * nel progetto sono voci del catalogo CUCINA, altra sezione, altro prezzo).
 * Per questo modello e finitura sono testo libero e il prezzo è a mano — e per
 * questo non c'è niente da congelare: un prezzo scritto dall'utente non può
 * andare fuori sincrono con un listino che non lo contiene.
 *
 * `qta` è INDIPENDENTE dalla quantità di porte: sei porte con quattro maniglie
 * è un caso reale (scorrevoli senza, doppie ante con due), e la maniglia resta
 * FUORI dal moltiplicatore della riga (vedi `calcRigaPorta`).
 */
export interface ManigliaPorta {
  qta: number
  /**
   * Prezzo a mano per singola maniglia, in €. **Assente o 0 ⇒ maniglia inclusa**
   * (regola di Antonio, 06/10): è la standard, non si somma e il testo lo dice.
   * Con un prezzo è un modello extra che si somma alla riga. Chiave opzionale
   * dentro una sezione esistente → nessun bump di versione (vedi `manigliaInclusa`).
   */
  prezzoUnitario?: number
  /** Testo libero, es. "Olivari Rio". */
  modello: string
  /** Testo libero, es. "cromo satinato". */
  finitura: string
}

export interface RigaPorta extends ConAliquotaIva {
  id: string
  /** Nome del modello nel listino. Resta: è l'etichetta stampata sul PDF. */
  modelloNome: string
  /**
   * Altezza in cm: seleziona la fascia (≤215 · (215,240] · >240). 0, negativa o
   * non finita (anche `null` da un blob) ⇒ riga da completare, fuori dal totale.
   */
  altezzaCm: number
  optionals: OptionalScelto[]
  /**
   * Prezzi congelati alla scelta (E3). Assente = riga creata prima dello
   * snapshot, oppure modello già sparito quando il backfill ha provato: in
   * entrambi i casi l'engine ripiega sul listino vivo, e se nemmeno lì trova il
   * modello dichiara la riga `irrisolvibile` invece di valorizzarla 0.
   *
   * Una riga snapshottata è una PROMESSA: nessun backfill la tocca più.
   */
  prezziModello?: PrezziModelloSnapshot
  /**
   * Descrizione commerciale stampata sotto il modello nel PDF (DOCX 25/07).
   *
   * TRI-STATO, stessa forma mentale di `prezziModello`:
   *  - `undefined` / `null` → nessuno l'ha scritta: si COMPONE dal `modelloNome`
   *    corrente via `descrizionePorteDefault`, e segue il modello se cambia;
   *  - stringa → l'ha scritta l'utente: è una PROMESSA, e cambiare modello NON
   *    la ricompone. Svuotare la casella riporta a `null` (torna automatica).
   *
   * È per RIGA e non per sezione perché modello e maniglia sono di riga (e il
   * preventivo 1147 stampa una descrizione per voce).
   */
  descrizione?: string | null
  /**
   * Quante porte identiche in questa riga. **Assente ⇒ 1.**
   *
   * Prima della PR B una riga era una porta, e ogni riga salvata non ha questa
   * chiave: leggerla come 1 è ciò che garantisce che nessun preventivo già
   * consegnato cambi prezzo. Chiave opzionale dentro una sezione esistente,
   * come `vasca` in gres → nessun bump di versione.
   *
   * È EDITABILE e non entra nella promessa di #22: quella è il prezzo unitario
   * congelato (`prezziModello`), non il conteggio. Cambiare quantità non
   * ri-congela niente, esattamente come cambiare `altezzaCm`.
   */
  quantita?: number
  /** Maniglia a mano della riga. Assente ⇒ nessuna maniglia (e il testo di
   *  default continua a promettere quella standard inclusa). */
  maniglia?: ManigliaPorta
}

/**
 * Battiscopa "a corpo": riga a sé della sezione porte, NON un optional.
 *
 * Nasce dalla richiesta di Antonio (DOCX 25/07: "non è corretto tra gli
 * optional"; call 31/07: "insieme al pulsante aggiungi porta") e da una ragione
 * di calcolo: come optional finiva dentro `optionalTotale`, che dalla PR B viene
 * moltiplicato per il numero di porte. Un battiscopa a corpo — i centimetri di
 * battiscopa di una stanza — moltiplicato per il numero di porte è sbagliato.
 * Qui vive fuori da quel moltiplicatore, per costruzione.
 *
 * **Semantica (specifica di Antonio, 06/10).** Il "1,2 €/cm" del listino è per
 * centimetro D'ALTEZZA del battiscopa:
 *   prezzoMl = altezzaCm × €/cm   (+20% se `extra`, solo sul prodotto)
 *   prodotto = prezzoMl × metriLineari
 *   posa     = prezzoPosaMl × metriLineari
 *   totale   = prodotto + posa
 * UNA riga = un modello + un'altezza + una lunghezza totale: altezze diverse
 * sono righe separate, niente liste di tratti dentro la riga.
 *
 * **Righe della #33.** Lì `quantitaCm` era la LUNGHEZZA in cm, moltiplicata per
 * il €/cm: 500 cm valevano 600 €, dove la lettura giusta (H 5 cm, 5 ml) dà 30 €.
 * Non sono convertibili perché manca l'altezza: l'engine le dichiara
 * `da-completare` (fuori dal totale, PDF parziale) finché qualcuno non scrive
 * altezza e metri lineari, e completarle toglie le chiavi vecchie.
 * Chiavi nuove opzionali dentro una sezione esistente → nessun bump.
 */
export interface RigaBattiscopa extends ConAliquotaIva {
  id: string
  /** Voce del listino da cui nasce. È l'etichetta stampata sul PDF. */
  nome: string
  /**
   * €/cm D'ALTEZZA, CONGELATO alla scelta (#22). Assente = riga pre-snapshot o
   * voce sparita: l'engine ripiega sul listino vivo e, se non trova nemmeno lì,
   * dichiara la riga irrisolvibile invece di valorizzarla 0.
   */
  prezzoUnitario?: number
  /** Altezza del battiscopa in cm: moltiplica il €/cm e dà il €/ml. */
  altezzaCm?: number
  /** Lunghezza totale della riga in metri lineari. */
  metriLineari?: number
  /** Posa in €/ml, scritta a mano. Assente o 0 ⇒ nessuna posa. Non prende il +20%. */
  prezzoPosaMl?: number
  /** Lavorazione extra del listino: +20% sul rate CONGELATO, solo sul prodotto. */
  extra?: boolean
  /** LEGACY #33: lunghezza in cm. Solo letta (riga da completare), mai scritta. */
  quantitaCm?: number
  /** LEGACY #33: vani identici. Solo letta, mai scritta: la forma nuova non la usa. */
  quantita?: number
  /** Descrizione tri-stato come `RigaPorta.descrizione`: null/assente ⇒ composta. */
  descrizione?: string | null
}

export interface SezionePorte extends ConAliquotaIva {
  righe: RigaPorta[]
  /**
   * Battiscopa a corpo. Lista SEPARATA e non un discriminante dentro `righe`:
   * un battiscopa non ha fascia d'altezza, optional né maniglia, e un union
   * nello stesso array renderebbe rappresentabili stati senza senso oltre a
   * costringere ogni `.map` a discriminare. Così `righe` non cambia di una
   * virgola e il presidio della PR B resta banalmente verde.
   *
   * Chiave opzionale su una sezione esistente ⇒ nessun bump di versione.
   */
  battiscopa?: RigaBattiscopa[]
  /** Sconto frazionario [0,1] applicato alla sola sezione (regola A.3). */
  sconto: number
}

/**
 * Sezione "Cucine" (SPEC_FASE2 §A.5 #1 / fase 8): configuratore pezzo-per-pezzo.
 * Le voci referenziano per id la struttura del codice (`@/data/cucina/strutturaCucina`);
 * prezzi/kind si risolvono a runtime in `calcCucina` dal catalogo composto col
 * listino cucine (mai congelati sulla scelta), come porte/gres risolvono dal listino.
 */
export interface VoceCucinaScelta {
  /** id di una voce del catalogo (kind 'qty' oppure 'toggleFisso'). */
  voceId: string
  /** Quantità (voci 'qty'); ignorata per 'toggleFisso' (presenza = selezionato). */
  quantita: number
}

/** A corpo: solo l'aliquota di sezione. */
export interface SezioneCucine extends ConAliquotaIva {
  /** Voci a quantità + toggle-fisso selezionate; l'engine dispatcha per `catalogo.kind`. */
  voci: VoceCucinaScelta[]
  /** Moltiplicatore casse +10% sul PRIMO TOTALE (E23). */
  casse: boolean
  /** Moltiplicatore ante +20% sul PRIMO TOTALE (E24), CUMULABILE con casse. */
  ante: boolean
  /**
   * Profondità oltre 65 cm (L25, Antonio 15/10): +20% del TOTALE CASSE+ANTE
   * (`PROFONDITA_OLTRE_65_PCT`). Non è l'adeguamento. Opzionale: un preventivo
   * salvato prima non ce l'ha e vale `false` in lettura (nessun bump, come
   * `aliquotaIva`); il blob non si riscrive, così l'impronta delle sue sezioni
   * e i prezzi congelati restano quelli (strada A).
   */
  profonditaOltre65?: boolean
  /** Giorni extra realizzazione (× 150 €/gg); FUORI da percentuali e sconto. */
  giorniExtra: number
  /** Extra manuale: casella unica descrizione + importo finito (nessun calcolo automatico). */
  extraManuale: { descrizione: string; importo: number } | null
  /** Adeguamento prezzi %, snapshot per-preventivo (default ADEG_DEFAULT = 0.20). */
  adeguamentoPct: number
  /** Descrizione "a corpo" mostrata nel PDF (le singole voci restano NASCOSTE). */
  descrizione: string
  /** Sconto frazionario [0,1] applicato SOLO al TOTALE CUCINA (beni), regola A.3. */
  sconto: number
}

/**
 * Stato del preventivo organizzato per-sezione. Tutte le sezioni sono opzionali:
 * `undefined` = sezione mai toccata dall'utente.
 *
 * I selettori devono leggere con un fallback module-level STABILE
 * (`FALLBACK_ARREDI` / `FALLBACK_GRES` da `@/store/quoteFallbacks`), MAI con un
 * literal inline (`?? {}` / `?? []`): un nuovo riferimento a ogni render
 * manderebbe Zustand in loop di re-render (useSyncExternalStore). Vedi
 * ARCHITECTURE.md §4.
 */
export interface SezioniState {
  arredi?: SezioneArredi
  gres?: SezioneGres
  cucine?: SezioneCucine
  porte?: SezionePorte
  progettoValore?: SezioneProgettoValore
}
