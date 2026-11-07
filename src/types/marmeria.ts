export type FasciaProfondita = 'fino62' | '63a70' | 'oltre70'
export type SpessoreType = 13 | 20 | 30
export type TipologiaMateriale = 'QUARZO' | 'LAPITEC' | 'GRES'

export interface PrezzoPerFascia {
  fino62: number | 'Non Disp.'
  da63a70: number | 'Non Disp.'
  oltre70: number | 'Non Disp.'
}

export interface MaterialeSpessore {
  spessore: SpessoreType
  disponibile: boolean
  prezziMq: PrezzoPerFascia
  /**
   * IMPORTO in € (non mq) del minimo d'ordine del fornitore, colonne GAMMA_COLORI
   * 54-56 «MINIMO 2 MQ SPESSORE n»: nel listino vale 2 × il prezzo «oltre 70».
   * L'engine NON lo usa: il minimo applicato è 2 × il prezzo della riga, con la
   * fascia (vedi `calcMarmeria`). Resta letto se Antonio sceglie questa lettura.
   */
  minimoFatturabile: number | 'Non Disp.'
}

export interface Materiale {
  produttore: string
  colore: string
  tipoSuperficie: string
  coloreFinituraCompleto: string
  collezione: string
  tipologia: TipologiaMateriale
  spessori: Partial<Record<SpessoreType, MaterialeSpessore>>
  alzatinaAltezza: number
  alzatinaEuroMl: number
  schienaleEuroMq: number
}

export interface LavorazioneBordo {
  id: number
  descrizione: string
  prezzoMlPerTipologia: Record<TipologiaMateriale, number | null>
}

export interface LavorazioneVaria {
  descrizione: string
  prezzoPerTipologia: Record<TipologiaMateriale, number | null>
  unitaMisura: string
}

export interface VascaIntegrata {
  descrizione: string
  prezzoQres: number | null
}

export interface RilMontScaglione {
  da: number
  a: number | null
  /**
   * Importo FISSO della fascia. Quando c'è `percentuale` questo resta il valore
   * in CACHE letto dal file — nel listino reale è 0, perché la cella è una
   * formula fotografata su un preventivo vuoto — e NON va usato come prezzo.
   */
  importo: number
  /**
   * Moltiplicatore letto dalla FORMULA della cella IMPORTO: `0.15` da
   * `CEILING(E2*0.15,1)`. Presente = la fascia si calcola sulla base imponibile,
   * non è un importo fisso.
   *
   * Sta nel dato e non nel codice perché è del listino: se De Bari passa al 18%,
   * l'app segue senza una riga di diff.
   */
  percentuale?: number
}

export interface ListinoMarmeria {
  materiali: Materiale[]
  lavorazioniBordo: LavorazioneBordo[]
  lavorazioniVarie: LavorazioneVaria[]
  vascheIntegrate: VascaIntegrata[]
  rilMontScaglioni: RilMontScaglione[]
  scontiDisponibili: number[]
  aggiornato: string
  /**
   * Avvisi non bloccanti del parsing, destinati al referto del listino. Servono
   * a non avere MAI un valore assunto in silenzio: se il file non dice una cosa
   * e l'app la decide al posto suo, qui c'è scritto quale e perché.
   */
  avvisi?: string[]
}

// Stato del preventivo marmeria
export interface RigaMateriale {
  id: string
  materialeKey: string
  spessore: SpessoreType
  fascia: FasciaProfondita
  profonditaCm: number
  qtaMq: number
  prezzoMq: number
  /** Scritto dallo store, non più letto da PDF e tabelle: usare `importoRiga` (calcMarmeria). */
  totale: number
}

export interface RigaAlzatina {
  id: string
  materialeKey: string
  qtaMl: number
  prezzoMl: number
  /** Scritto dallo store, non più letto da PDF e tabelle: usare `importoRiga` (calcMarmeria). */
  totale: number
}

export interface RigaLavorazioneBordo {
  lavorazioneId: number
  qtaMl: number
  prezzoMl: number
  /** Scritto dallo store, non più letto da PDF e tabelle: usare `importoRiga` (calcMarmeria). */
  totale: number
}

export interface RigaLavorazioneVaria {
  descrizione: string
  um: string
  qta: number
  prezzoUnit: number
  /** Scritto dallo store, non più letto da PDF e tabelle: usare `importoRiga` (calcMarmeria). */
  totale: number
}

/**
 * Vasca integrata in gres: voce singola della sezione Gres, NON una sezione.
 *
 * Da non confondere con `VascaIntegrata` (sopra), che modella le vasche del
 * listino De Bari: quelle sono Santa Margherita in quarzo resina e per il Gres
 * sono tutte "Non Disp.". Questa è una voce commerciale di Coletta, col prezzo
 * di default nel listino cucine — vedi `@/data/gres/vascaGres`.
 */
export interface VascaGres {
  inclusa: boolean
  /**
   * Prezzo snapshottato all'inclusione (default dal listino cucine), poi
   * editabile per-preventivo. Stesso principio di `RigaMateriale.prezzoMq`: un
   * preventivo salvato conserva il prezzo con cui è stato quotato, anche se il
   * default cambia in seguito.
   */
  prezzo: number
}

/** Una lavorazione tolta al cambio tipologia perché non disponibile (A2, opzione b). */
export interface LavorazioneTolta {
  descrizione: string
  quantita: number
  unita: 'ml' | 'pz'
}

export interface QuoteMarmeria {
  tipologiaMateriale: TipologiaMateriale
  righeMateriali: RigaMateriale[]
  righeAlzatine: RigaAlzatina[]
  righeLavorazioniBordo: RigaLavorazioneBordo[]
  righeVarie: RigaLavorazioneVaria[]
  sconto: number
  includiRilMont: boolean
  /** Chiave opzionale → forward-compat, nessun bump di `persist.version`. */
  vasca?: VascaGres
}
