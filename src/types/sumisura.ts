import type { AliquotaIva } from '@/engine/iva'

export interface VoceSuMisura {
  descrizione: string
  prezzoUnitario: number
  unitaMisura: 'MQ' | 'ML' | 'PEZZO' | 'VALORE'
  isProgrammazione?: boolean
  prezzoCliente?: number
}

/**
 * Una riga della matrice FINITURE (L20): il prezzo di un tipo di arredo con un
 * interno e un esterno. `interno` vuoto vale «qualsiasi interno» (telaio,
 * mensole, boiserie). Il confronto fra grafie passa da `chiaveMatrice`.
 */
export interface RigaMatrice {
  tipo: string
  interno: string
  esterno: string
  /** NaN se la cella non è un numero: lo dice Zod, con la cella. */
  prezzo: number
  unita: 'MQ' | 'ML' | 'PEZZO'
  /** La cella del tipo, col foglio (`FINITURE!A12`): per i messaggi. */
  cella: string
}

export interface FoglioSuMisura {
  nome: string
  nota: string
  voci: VoceSuMisura[]
  /** Solo il foglio FINITURE (L20): le combinazioni lette. Assente negli altri fogli. */
  matrice?: RigaMatrice[]
}

export interface ListinoSuMisura {
  fogli: FoglioSuMisura[]
  aggiornato: string
  /**
   * Fogli non letti perché l'intestazione non si trova (O7), come
   * `ListinoMarmeria.avvisi`: presente solo se non vuoto. Non blocca: finisce
   * nel referto.
   */
  avvisi?: string[]
}

// ── Nuovo modello "per singolo articolo" (refactor 2026) ──
// Ogni articolo è configurato individualmente: unità di misura, dimensioni,
// finiture e maggiorazioni per-voce. Sostituirà QuoteSuMisura (vedi quoteStore).

export type UnitaMisuraArticolo = 'MQ' | 'ML' | 'PZ'

export interface ArticoloSuMisura {
  id: string
  origine: 'listino' | 'manuale'
  descrizione: string
  /** Prezzo per unità: €/MQ, €/ML o €/PZ a seconda di `um`. */
  prezzoUnitario: number
  um: UnitaMisuraArticolo
  // Dimensioni: solo quelle pertinenti alla `um` sono valorizzate.
  larghezzaCm: number | null   // MQ
  altezzaCm: number | null     // MQ
  lunghezzaMl: number | null   // ML
  quantita: number | null      // PZ
  /** Profondità > 65cm → maggiorazione +15% sulla voce. */
  profonditaOltre65: boolean
  /**
   * Profondità < 40cm → riduzione −10% sulla voce (L20, Antonio 12/10).
   * Esclusiva con `profonditaOltre65`: la UI non le lascia entrambe, e con
   * entrambe l'engine applica solo il +15%. Assente ⇒ false, nessun bump.
   */
  profonditaSotto40?: boolean
  finituraInterna: string
  finituraEsterna: string
  codiceFinitura: string
  note: string
  /**
   * Aliquota IVA della riga (L18). Assente ⇒ quella della sezione Arredi.
   * Chiave opzionale dentro una sezione esistente → nessun bump di versione.
   */
  aliquotaIva?: AliquotaIva
  /**
   * Arredo a cui appartiene (L19). Assente, o con un id che non c'è più fra
   * `SezioneArredi.arredi`, ⇒ l'articolo sta in «Altre voci». Chiave
   * opzionale dentro una sezione esistente → nessun bump di versione.
   */
  arredoId?: string
  /**
   * L'elemento nato dalla matrice FINITURE (L20): la combinazione scelta, con
   * le grafie del listino. Il prezzo è in `prezzoUnitario`, fissato alla
   * scelta: un listino ricaricato non cambia un preventivo già compilato.
   * Assente ⇒ voce del foglio SU MISURA o manuale, come prima. Chiave
   * opzionale, nessun bump.
   */
  combinazione?: CombinazioneMatrice
}

/** La scelta tipo → interno → esterno di un elemento da matrice (L20). `interno` vuoto: qualsiasi. */
export interface CombinazioneMatrice {
  tipo: string
  interno: string
  esterno: string
}

/**
 * Un «arredo» della sezione Arredi (L19, Antonio 12/10: «la voce "arredo
 * ingresso" si può comporre di più elementi»): un nome che raggruppa articoli.
 * Non ha importi propri: il suo subtotale è la somma dei suoi articoli.
 */
export interface Arredo {
  id: string
  nome: string
}

export interface QuoteSuMisura {
  articoli: ArticoloSuMisura[]
  /** Quota progettazione +8% sul subtotale (flag globale). */
  quotaProgettazione: boolean
  noteGenerali: string
  /**
   * @deprecated Spostato a livello documento su `Preventivo.includiNotePagamento`.
   * Resta qui, opzionale, per i blob salvati prima dello spostamento: viene
   * ancora LETTO come fallback, mai più scritto. Non rimuoverlo finché esistono
   * preventivi v4 salvati con questa chiave.
   */
  includiNotePagamento?: boolean
  /** Se false, i mq calcolati non compaiono nel PDF (servono solo al calcolo). */
  mostraMqInPdf: boolean
}
