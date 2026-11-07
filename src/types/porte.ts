// ── Tipi del LISTINO Porte (reference data, pricelistStore, ephemeral) ──
// SPEC_FASE2 §B.4. Parsato dal file "LISTINO PORTE COLETTA EBANISTERIA"
// (2 fogli: `modello_porta`, `optional`). Formato-agnostico: il parser riceve un
// workbook già letto (xlsx o ods). PREZZO 1 (2024) è SCARTATO al parse, mai a
// runtime — serviva solo ad Antonio per calcolare le maggiorazioni.

/**
 * Unità di misura di un optional porta (foglio `optional`, col "UNITA' DI MISURA").
 * `MANUALE` = prezzo a mano (voce "campo vuoto da inserire manualmente").
 */
export type UnitaOptionalPorta = 'PORTA' | 'MQ' | 'PEZZO' | 'ML' | 'MANUALE'

/**
 * Un modello di porta. I tre prezzi altezza sono PREZZI PIENI ALTERNATIVI
 * (decisione Antonio), NON additivi: si applica UNA fascia in base all'altezza.
 */
export interface ModelloPorta {
  nome: string
  /** Prezzo base 2026 — fascia altezza ≤ 215. (PREZZO 1/2024 scartato.) */
  prezzo2026: number
  /** Prezzo pieno alternativo per altezza in (215, 240]. */
  h215: number
  /** Prezzo pieno alternativo per altezza > 240. */
  h240: number
}

/**
 * Un optional (foglio `optional`), additivo sul prezzo base della porta.
 * `prezzo` è per-unità: €/porta (PORTA), €/mq (MQ), €/pezzo (PEZZO), €/cm (ML —
 * es. battiscopa 1,2). `null` per MANUALE (prezzo a mano) o quando non
 * determinabile dal listino.
 */
export interface OptionalPorta {
  nome: string
  unita: UnitaOptionalPorta
  prezzo: number | null
  /** Nota del listino (ultima colonna), se presente. */
  note?: string
}

export interface ListinoPorte {
  modelli: ModelloPorta[]
  optional: OptionalPorta[]
  /** Provenienza (ISO o filename). Sovrascritto dal pricelistStore col nome file. */
  aggiornato: string
  /**
   * Avvisi non bloccanti del parsing, destinati al referto del listino (come
   * `ListinoMarmeria.avvisi`): i modelli senza prezzo nella colonna dell'anno,
   * che non entrano nel listino. Assente se non ce ne sono.
   */
  avvisi?: string[]
}
