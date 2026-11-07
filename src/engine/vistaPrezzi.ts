import type { SezioniState } from '@/types/quote'
import { FALLBACK_GRES } from '@/store/quoteFallbacks'
import { calcolaPreventivo, type ListiniPreventivo } from '@/engine/calcPreventivo'
import { prezzoLavorazioneVaria, prezzoMlLavorazioneBordo } from '@/engine/calcMarmeria'

/**
 * Tutto ciò che il PDF prende dai listini, in un oggetto JSON (strada A, Marco
 * 14/10): il calcolo intero (righe, importi, subtotali, IVA per aliquota,
 * totali) e i pochi valori di riga che il PDF leggeva dal listino gres e dal
 * catalogo cucina. Al salvataggio finisce in `dati.prezzi` («prezzi
 * congelati»), e il PDF di un preventivo inviato, accettato o annullato si
 * costruisce da lì, non dal listino di adesso. Per la bozza si calcola dal
 * vivo, con la stessa funzione: il PDF non tocca i listini direttamente.
 *
 * Pura (rule `engine`): riceve sezioni e listini. Nessuna data qui dentro: due
 * calcoli uguali danno lo stesso oggetto, e la stessa impronta.
 */
export interface VistaPrezzi {
  calcolo: ReturnType<typeof calcolaPreventivo>
  /** Il listino gres c'era: senza, il blocco Gres esce «da definire». */
  listinoGres: boolean
  /** Il catalogo cucina c'era: senza, il blocco Cucina esce «da definire». */
  listinoCucine: boolean
  /** Tariffa dei giorni extra della cucina; `null` = il listino non la dà. */
  giornoRateCucina: number | null
  /** «Produttore — colore» per le chiavi dei materiali usati (top e alzatine). */
  nomiMateriali: Record<string, string>
  /** Per ogni lavorazione bordo usata: descrizione e €/ml (`null` = il listino non la sa prezzare). */
  lavorazioniBordo: Record<string, { descrizione: string | null; prezzoMl: number | null }>
  /** Per ogni lavorazione varia usata (per descrizione): il prezzo unitario, o `null`. */
  lavorazioniVarie: Record<string, number | null>
}

export function vistaPrezzi(sezioni: SezioniState, listini: ListiniPreventivo): VistaPrezzi {
  const gres = sezioni.gres ?? FALLBACK_GRES
  const l = listini.gres
  const nomiMateriali: VistaPrezzi['nomiMateriali'] = {}
  for (const r of [...gres.righeMateriali, ...gres.righeAlzatine]) {
    const m = l?.materiali.find((x) => x.coloreFinituraCompleto === r.materialeKey)
    if (m) nomiMateriali[r.materialeKey] = `${m.produttore} — ${m.colore}`
  }
  const lavorazioniBordo: VistaPrezzi['lavorazioniBordo'] = {}
  for (const r of gres.righeLavorazioniBordo) {
    lavorazioniBordo[String(r.lavorazioneId)] = {
      descrizione: l?.lavorazioniBordo.find((x) => x.id === r.lavorazioneId)?.descrizione ?? null,
      prezzoMl: l ? prezzoMlLavorazioneBordo(l, r.lavorazioneId, gres.tipologiaMateriale) : null,
    }
  }
  const lavorazioniVarie: VistaPrezzi['lavorazioniVarie'] = {}
  for (const r of gres.righeVarie) {
    lavorazioniVarie[r.descrizione] = l ? prezzoLavorazioneVaria(l, r.descrizione, gres.tipologiaMateriale) : null
  }
  return {
    calcolo: calcolaPreventivo(sezioni, listini),
    listinoGres: l !== null,
    listinoCucine: listini.catalogoCucina !== null,
    giornoRateCucina: listini.catalogoCucina?.giornoRate ?? null,
    nomiMateriali,
    lavorazioniBordo,
    lavorazioniVarie,
  }
}
