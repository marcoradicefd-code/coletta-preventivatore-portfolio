import type { VistaPrezzi } from '@/engine/vistaPrezzi'

/** Gli stati di un preventivo salvato (check della migration 0003). */
export const STATI_PREVENTIVO = ['bozza', 'inviato', 'accettato', 'annullato'] as const
export type StatoPreventivo = (typeof STATI_PREVENTIVO)[number]

/**
 * Il preventivo aperto, così com'è nel database. `updatedAt` è quello letto
 * all'apertura o all'ultimo salvataggio: il prossimo salvataggio lo confronta
 * (optimistic lock) e, se è cambiato, non sovrascrive.
 */
export interface PreventivoSalvato {
  id: string
  anno: number
  numero: number
  revisione: number
  stato: StatoPreventivo
  updatedAt: string
}

/**
 * L'id di una riga non ancora salvata, generato nel client, con anno e numero
 * (L21-B). Per il primo salvataggio è il numero chiesto al database; per una
 * nuova revisione (revisione del 14/10, plausibile b) anno e numero sono quelli
 * del preventivo aperto. Si tiene finché la riga non è salvata: un nuovo
 * tentativo dopo una risposta persa riusa id e numero, quindi niente secondo
 * numero e niente riga doppia.
 */
export interface NumeroRiservato {
  id: string
  anno: number
  numero: number
}

/**
 * I prezzi congelati al salvataggio (strada A, Marco 14/10): stanno in
 * `preventivi.dati.prezzi`. Il PDF di un preventivo inviato, accettato o
 * annullato si costruisce da `vista`, non dal listino di adesso, quindi esce
 * identico a quello mandato al cliente. La bozza resta dal vivo.
 */
export interface PrezziCongelati {
  /** Quando sono stati calcolati (ISO): la barra dice «Prezzi del …». */
  calcolatiIl: string
  /** I listini usati (il nome del file, `aggiornato`); `null` = non caricato. */
  listini: { gres: string | null; porte: string | null; cucine: string | null }
  /** L'impronta di `vista`: diversa da quella dal vivo = il listino è cambiato da allora. */
  impronta: string
  /** L'impronta delle sezioni da cui `vista` è stata calcolata: diverse = i prezzi non valgono più. */
  sezioni: string
  vista: VistaPrezzi
}

/**
 * Il legame fra il preventivo aperto nell'app e il database (L21). Sta in
 * `quoteStore` accanto a `preventivo` e `sezioni`, e come loro si persiste solo
 * con «ricorda preventivo» e si toglie al logout (`resetAll`).
 */
export interface CollegamentoArchivio {
  /** Il cliente dell'anagrafica scelto per questo preventivo; null = nessuno. */
  clienteId: string | null
  /** Il preventivo nel database; null = bozza mai salvata (nessun numero). */
  preventivo: PreventivoSalvato | null
  /** L'id (e il numero) di una riga non ancora salvata: il primo salvataggio, o una revisione. */
  riservato?: NumeroRiservato | null
  /** I prezzi dell'ultimo salvataggio (strada A); assenti in un preventivo salvato prima. */
  prezzi?: PrezziCongelati | null
  /**
   * L'impronta canonica (`impronta` di documento, sezioni e cliente) all'ultimo
   * salvataggio o apertura. Va e viene col preventivo ricordato: dopo un
   * riavvio, quando la fotografia in memoria non c'è, dice se ci sono
   * modifiche senza dipendere dall'identità degli oggetti né dall'ordine delle
   * chiavi.
   */
  impronta?: string | null
}
