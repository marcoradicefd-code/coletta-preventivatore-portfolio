import type { Preventivo } from '@/types/common'
import type { QuoteSuMisura } from '@/types/sumisura'
import type { QuoteMarmeria } from '@/types/marmeria'
import type { SezioniState } from '@/types/quote'
import { FALLBACK_ARREDI } from '@/store/quoteFallbacks'

// ── Migrazione PURA dello stato preventivo persistito ──
// Estratta da quoteStore così da poterla testare senza localStorage/zustand.
// Vedi src/store/__tests__/quoteMigrate.test.ts.

/**
 * Shape del blob persistito *prima* della v4. Tutti i campi sono opzionali: un
 * preventivo salvato con `ricordaPreventivo:false` persiste solo quel flag, e i
 * blob più vecchi potrebbero non avere alcuni campi. `sezioni` compare solo da v4
 * in avanti (serve a rendere il migrate idempotente su un re-run).
 */
export interface PersistedQuoteLegacy {
  /** `null` è possibile in un blob rovinato: per il migrate vale come assente. */
  preventivo?: Preventivo | null
  suMisura?: QuoteSuMisura
  marmeria?: QuoteMarmeria
  sezioni?: SezioniState
  ricordaPreventivo?: boolean
}

/**
 * Output del migrate: i soli campi-dato dello store. Le azioni le rifornisce il
 * creator di Zustand al merge post-migrate.
 */
export interface MigratedQuoteState {
  preventivo?: Preventivo
  sezioni: SezioniState
  ricordaPreventivo?: boolean
}

/**
 * Porta lo stato persistito alla shape v4 (per-sezione).
 *
 * NON muta l'input. È IDEMPOTENTE: parte da `state.sezioni ?? {}` e mappa il
 * vecchio `suMisura`/`marmeria` solo se la sezione di destinazione non esiste già
 * → un re-run su un blob già-v4 non azzera né rimappa nulla (punto fisso).
 *
 * Gradini (cumulativi, nell'ordine in cui sono stati introdotti):
 *  - `fromVersion < 2`: il vecchio "Su Misura" era una mappa-quantità non
 *    mappabile al modello ad articoli → `arredi` riparte vuoto (sconto 0).
 *  - v2/v3 → v4: `suMisura` → `sezioni.arredi` (+`sconto:0`, Su Misura non aveva
 *    sconto); `marmeria` → `sezioni.gres` (`sconto` e `includiRilMont` preservati
 *    così come sono).
 *  - backfill `preventivo.includiCondizioni = true` se assente (document-level,
 *    introdotto in v3).
 *  - copia `includiNotePagamento` da `arredi`/`suMisura` a `preventivo` se lì
 *    non c'è ancora (spostamento a livello documento; l'originale resta).
 */
export function migrateQuoteState(
  persisted: unknown,
  fromVersion: number
): MigratedQuoteState {
  const src = (persisted ?? {}) as PersistedQuoteLegacy

  // Idempotenza: un blob già v4 ha `sezioni` → si parte da una sua COPIA, non da
  // `{}` (che azzererebbe le sezioni esistenti su un re-run del migrate).
  const sezioni: SezioniState = { ...(src.sezioni ?? {}) }

  // marmeria → gres (solo se gres non è già presente).
  if (sezioni.gres === undefined && src.marmeria !== undefined) {
    sezioni.gres = { ...src.marmeria }
  }

  // suMisura → arredi (solo se arredi non è già presente).
  if (sezioni.arredi === undefined) {
    if (fromVersion < 2) {
      // v1: shape vecchia non mappabile → arredi vuoto (copia del fallback).
      sezioni.arredi = { ...FALLBACK_ARREDI }
    } else if (src.suMisura !== undefined) {
      sezioni.arredi = { ...src.suMisura, sconto: 0 }
    }
  }

  // `preventivo: null` è assente, come la chiave mancante. Si normalizza qui,
  // una volta, perché a leggerlo sono tre punti: il backfill qui sotto, la copia
  // di `includiNotePagamento` e l'uscita. Normalizzarne uno solo lascerebbe
  // lanciare il secondo, oppure metterebbe `preventivo: null` nell'output.
  //
  // backfill includiCondizioni (document-level dalla v3).
  let preventivo = src.preventivo ?? undefined
  if (preventivo !== undefined && preventivo.includiCondizioni === undefined) {
    preventivo = { ...preventivo, includiCondizioni: true }
  }

  // includiNotePagamento: da sezione a documento.
  //
  // Nasceva su `suMisura`/`arredi` (era un campo del Su Misura) ma il PDF lo
  // stampa a livello documento, e la spunta ora vive accanto a
  // `includiCondizioni`. Qui lo si COPIA, senza rimuovere l'originale: i blob
  // restano leggibili all'indietro, e la copia è idempotente perché scatta solo
  // se sul preventivo la chiave è ancora assente (un `false` esplicito vince).
  //
  // ATTENZIONE: questo gradino NON basta da solo. `persist` chiama `migrate`
  // solo quando la versione persistita ≠ quella corrente, e la versione resta 4
  // (chiavi opzionali, nessun bump): un blob GIÀ v4 col flag su `arredi` non
  // passa mai di qui. Il presidio che li copre è la lettura difensiva in
  // `includiNotePagamentoDi` (`@/store/quoteSelectors`). Questo gradino serve ai
  // blob che arrivano da v1/v2/v3 e a chi rilegge lo stato migrato.
  const flagLegacy = sezioni.arredi?.includiNotePagamento ?? src.suMisura?.includiNotePagamento
  if (preventivo !== undefined && preventivo.includiNotePagamento === undefined && flagLegacy !== undefined) {
    preventivo = { ...preventivo, includiNotePagamento: flagLegacy }
  }

  const out: MigratedQuoteState = { sezioni }
  if (preventivo !== undefined) out.preventivo = preventivo
  if (src.ricordaPreventivo !== undefined) out.ricordaPreventivo = src.ricordaPreventivo
  return out
}
