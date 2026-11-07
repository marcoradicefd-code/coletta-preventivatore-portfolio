import type { SezioniState } from '@/types/quote'
import type { ListinoMarmeria } from '@/types/marmeria'
import type { ListinoPorte } from '@/types/porte'
import type { CatalogoCucina } from '@/types/cucina'
import {
  FALLBACK_ARREDI,
  FALLBACK_CUCINE,
  FALLBACK_GRES,
  FALLBACK_PORTE,
  FALLBACK_PROGETTO_VALORE,
} from '@/store/quoteFallbacks'
import { calcSuMisuraArticoli } from '@/engine/calcSuMisura'
import { calcMarmeria } from '@/engine/calcMarmeria'
import { calcProgettoValore } from '@/engine/calcProgettoValore'
import { calcPorte } from '@/engine/calcPorte'
import { calcCucina } from '@/engine/calcCucina'
import { calcIva, sezioneIvaArredi, sezioneIvaPorte } from '@/engine/iva'

/** I listini che servono al calcolo: `null` = non caricato (la sezione resta da definire). */
export interface ListiniPreventivo {
  gres: ListinoMarmeria | null
  porte: ListinoPorte | null
  catalogoCucina: CatalogoCucina | null
}

/**
 * Il calcolo dell'intero preventivo, una funzione sola per il PDF e per il
 * salvataggio (L21: `preventivi.totale_imponibile`), così il totale salvato è
 * quello stampato allo stesso euro. Pura: riceve sezioni e listini.
 *
 * Senza listino gres o cucine quella sezione non si calcola (`null`) e vale 0
 * nel totale, come nel PDF, che la dichiara da definire.
 */
export function calcolaPreventivo(sezioni: SezioniState, listini: ListiniPreventivo) {
  const arredi = sezioni.arredi ?? FALLBACK_ARREDI
  const gres = sezioni.gres ?? FALLBACK_GRES
  const progettoValore = sezioni.progettoValore ?? FALLBACK_PROGETTO_VALORE
  const porte = sezioni.porte ?? FALLBACK_PORTE
  const cucine = sezioni.cucine ?? FALLBACK_CUCINE

  const resultSM = calcSuMisuraArticoli(arredi.articoli, arredi.quotaProgettazione, arredi.sconto)
  const resultMM = listini.gres ? calcMarmeria(listini.gres, gres) : null
  const resultPV = calcProgettoValore(progettoValore.righe, progettoValore.sconto)
  const resultPorte = calcPorte(porte, listini.porte)
  const resultCucine = listini.catalogoCucina ? calcCucina(cucine, listini.catalogoCucina) : null

  // IVA (L18). Il totale imponibile è la somma di sempre, commutativa: gli
  // addendi non seguono l'ordine del PDF. `calcIva` lo divide per aliquota.
  const iva = calcIva([
    { totale: resultCucine?.imponibile ?? 0, aliquota: cucine.aliquotaIva },
    sezioneIvaArredi(arredi, resultSM),
    sezioneIvaPorte(porte, resultPorte),
    { totale: resultPV.totale, aliquota: progettoValore.aliquotaIva },
    { totale: resultMM?.totaleFinale ?? 0, aliquota: gres.aliquotaIva },
  ])

  return { resultSM, resultMM, resultPV, resultPorte, resultCucine, iva }
}
