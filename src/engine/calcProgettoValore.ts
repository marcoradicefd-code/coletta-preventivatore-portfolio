import { arrotondaEuro } from '@/engine/arrotondaEuro'
import type { RigaProgettoValore } from '@/types/quote'

// ── Engine "Progetto a valore" (SPEC_FASE2 §B.5-bis / fase 6) ──
// Aggregazione PURA: righe a prezzo "a mano", sommate, con sconto per-sezione.
// NESSUN calcolo automatico — niente listino, maggiorazioni o progettazione. I
// totali sono SEMPRE derivati, mai persistiti: si ricalcolano ad ogni render.
// Difensivo: prezzi/sconto non-finiti → 0 (via `arrotondaEuro` + clamp), come
// calcSuMisura/calcMarmeria. Importi all'euro intero (D4): il prezzo scritto a
// mano si arrotonda riga per riga, e subtotale e totale sono somme di interi.

export interface ResultProgettoValore {
  /** Somma dei prezzi delle righe (lordo). */
  subtotale: number
  /** Importo scontato sul subtotale. 0 se nessuno sconto. */
  sconto: number
  /** subtotale − sconto. */
  totale: number
}

/** L'importo di una riga, quello che il PDF stampa e che il subtotale somma. */
export function importoRigaValore(riga: Pick<RigaProgettoValore, 'prezzo'>): number {
  return arrotondaEuro(riga.prezzo)
}

/**
 * Aggrega le righe "a valore". `scontoFrac` opzionale [0,1] è clampato come in
 * calcSuMisura/calcMarmeria (NaN/∞ → 0). Un prezzo non-finito conta 0. I
 * negativi sono vietati a monte (input `min=0`), non filtrati qui.
 */
export function calcProgettoValore(
  righe: RigaProgettoValore[],
  scontoFrac = 0
): ResultProgettoValore {
  const subtotale = righe.reduce((s, r) => s + importoRigaValore(r), 0)
  const scontoClamp = Number.isFinite(scontoFrac) ? Math.max(0, Math.min(1, scontoFrac)) : 0
  const sconto = arrotondaEuro(subtotale * scontoClamp)
  const totale = subtotale - sconto
  return { subtotale, sconto, totale }
}
