// ── Tipi del CATALOGO Cucina ──
// SPEC_FASE2 §A.5 #1 → configuratore pezzo-per-pezzo. La struttura (voci,
// blocchi, unità, kind, percentuali di casse e ante) e la catena di calcolo sono
// LOGICA e stanno nel codice (`@/data/cucina/strutturaCucina`); i prezzi, la
// tariffa dei giorni e la vasca sono SENSIBILI (D7) e vengono dal listino cucine,
// il foglio CUCINA nel bucket (PR 10b). Formule verificate sul foglio: E22 primo
// totale, E25 casse+ante, E48 opzionali, E68 open, E73 totale cucina, E85 imponibile.

/** Unità di quantità per le voci a moltiplicazione (kind 'qty'). */
export type UnitaCucina = 'PEZZO' | 'ML' | 'MQ' | 'ANTA' | 'COPPIA'

/** I tre blocchi con subtotale del foglio. */
export type BloccoCucina = 'base' | 'opzionali' | 'open'

/**
 * TRE comportamenti distinti di una voce (dalle formule del foglio):
 * - 'qty'            → prezzo × quantità              (es. BASE PENSILE, STRISCIA LED)  [E=Bn*Dn]
 * - 'toggleFisso'    → IF(selezionato, importo)       (es. ISOLA FUORIMISURA E61/E63)   [E=IF(Dn=1,importo)]
 * - 'moltiplicatore' → IF(selezionato, primoTotale×%) (casse E23 / ante E24)            [E=IF(Dn=1,E22*pct)]
 */
export type KindVoce = 'qty' | 'toggleFisso' | 'moltiplicatore'

interface VoceBase {
  /** Slug stabile: chiave di riferimento dalla scelta (VoceCucinaScelta.voceId). */
  id: string
  /** Etichetta come nel foglio (verbatim, typo/backslash inclusi: fonte di verità di Antonio). */
  nome: string
  blocco: BloccoCucina
}

/** Voce a quantità: costo = prezzo (€/unità) × quantità. */
export interface VoceQty extends VoceBase {
  kind: 'qty'
  prezzo: number
  unita: UnitaCucina
}

/** Voce toggle a importo fisso: costo = prezzo se selezionata, 0 altrimenti (quantità ignorata). */
export interface VoceToggleFisso extends VoceBase {
  kind: 'toggleFisso'
  prezzo: number
}

/** Moltiplicatore sul PRIMO TOTALE (E22): costo = primoTotale × percentuale se attivo. */
export interface VoceMoltiplicatore extends VoceBase {
  kind: 'moltiplicatore'
  /** Frazione [0,1]: casse 0.10 (E23), ante 0.20 (E24). Cumulabili. */
  percentuale: number
}

/** Unione discriminata su `kind`. */
export type VoceCatalogo = VoceQty | VoceToggleFisso | VoceMoltiplicatore

/** Una voce come sta nel codice: tutto tranne il prezzo, che porta il listino (D7). */
export type VoceSenzaPrezzo = Omit<VoceQty, 'prezzo'> | Omit<VoceToggleFisso, 'prezzo'> | VoceMoltiplicatore

/**
 * Il catalogo su cui l'engine risolve prezzi e kind: lo passa il chiamante, che
 * lo compone dalla struttura del codice e dal listino cucine caricato
 * (`componiCatalogoCucina`). Una voce senza prezzo nel listino non c'è.
 */
export interface CatalogoCucina {
  voci: readonly VoceCatalogo[]
  /** € al giorno extra; null se il listino non la porta (i giorni restano da definire). */
  giornoRate: number | null
}

/**
 * Una voce del catalogo SENZA prezzo: è tutto ciò che il parser del foglio CUCINA
 * riceve per abbinare i nomi alle voci. Nel worker non entra nessun prezzo (D7).
 */
export interface VoceStrutturaCucina {
  id: string
  /** Etichetta come nel foglio: si confronta dopo `normLabel`. */
  nome: string
  blocco: BloccoCucina
  kind: KindVoce
  /** Unità attesa in colonna C per le voci 'qty'; null per toggle e moltiplicatori («1VERO 0FALSO»). */
  unita: UnitaCucina | null
}

/**
 * Il listino cucine letto dal foglio CUCINA (PR 10b-1). Dalla 10b-2 è la fonte
 * dei prezzi della cucina, della tariffa dei giorni e della vasca in gres.
 */
export interface ListinoCucina {
  /** Prezzi delle voci a quantità e toggle, per id della struttura. */
  prezzi: { id: string; prezzo: number }[]
  /**
   * Percentuali lette dal file. L'app usa le SUE (decisione della 10b): queste
   * servono solo a dire nel referto quando il file ne porta una diversa.
   */
  percentuali: {
    casse: number | null
    ante: number | null
    progettazione: number | null
    adeguamento: number | null
  }
  /** «GIORNI EXTRA REALIZZAZIONE», € al giorno; null se il file non la porta. */
  giornoRate: number | null
  /** «VASCA INTEGRATA IN GRES», prezzo di default; null se il file non la porta. */
  vascaGres: number | null
  /** id della struttura che il file non ha: senza prezzo, quindi «da definire». */
  vociMancanti: string[]
  /** Nomi di righe con un valore in B che l'app non conosce. */
  righeSconosciute: string[]
  aggiornato: string
}

// ── Costanti di calcolo (SPEC §A.3 + decisioni Antonio) ──
// La tariffa dei giorni extra (E72) non è qui: la porta il listino cucine (D7).
/** Progettazione: 10% SEMPRE su TOTALE CUCINA (costante, E74). */
export const PROG_PCT = 0.1
/**
 * Profondità oltre 65 cm (L25, Antonio 15/10: «come abbiamo già fatto per gli
 * armadi»): +20% del TOTALE CASSE+ANTE (E25), dentro il totale cucina. È una
 * percentuale di struttura, non un prezzo di vendita (D7 non c'entra).
 */
export const PROFONDITA_OLTRE_65_PCT = 0.2
/** Adeguamento prezzi: default 20%, MODIFICABILE per-preventivo (snapshot, E75). */
export const ADEG_DEFAULT = 0.2
