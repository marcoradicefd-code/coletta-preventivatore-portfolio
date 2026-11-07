import { useMemo } from 'react'
import { useQuoteStore } from '@/store/quoteStore'
import { usePricelistStore } from '@/store/pricelistStore'
import { sezioneNonVuota, vociGres } from '@/components/layout/sections'
import { congelatiValgono } from '@/hooks/usePrezziPreventivo'

export interface BloccoPdf {
  bloccato: boolean
  /** Perché "Genera" è spento, da mostrare accanto al pulsante. */
  motivo: string | null
}

/**
 * Cosa impedisce di generare il PDF, uguale per tutti i riepiloghi.
 *
 * Due casi, nell'ordine del PDF: cucina compilata e listino Cucine non caricato
 * (PR 10b-2: i prezzi della cucina vengono da lì); gres compilato e listino Gres
 * non caricato. Senza listino la sezione non si può prezzare, e il PDF la
 * stamperebbe «da definire» con il totale parziale. Il PDF si genera da
 * QUALUNQUE riepilogo, quindi il controllo sta qui e non nelle pagine (che
 * senza listino non mostrano il riepilogo).
 *
 * Coi prezzi congelati che valgono (`congelatiValgono`: inviato, accettato o
 * annullato, sezioni non cambiate) il PDF non usa i listini di adesso, quindi
 * non c'è niente da bloccare (N2, verdetto sulla #98).
 */
export function useBloccoPdf(): BloccoPdf {
  const sezioni = useQuoteStore((s) => s.sezioni)
  const stato = useQuoteStore((s) => s.archivio?.preventivo?.stato)
  const congelati = useQuoteStore((s) => s.archivio?.prezzi ?? null)
  const listinoGres = usePricelistStore((s) => s.marmeria)
  const listinoCucine = usePricelistStore((s) => s.cucine)
  const valgono = useMemo(() => congelatiValgono(stato, congelati, sezioni), [stato, congelati, sezioni])
  if (valgono) return LIBERO
  return bloccoPdf(vociGres(sezioni), sezioneNonVuota('cucine', sezioni), listinoGres !== null, listinoCucine !== null)
}

/** Lo stesso controllo, letto al momento: per «Genera» nella barra (L21-B). */
export function bloccoPdfAdesso(): BloccoPdf {
  const { sezioni, archivio } = useQuoteStore.getState()
  if (congelatiValgono(archivio?.preventivo?.stato, archivio?.prezzi ?? null, sezioni)) return LIBERO
  return bloccoListiniAdesso()
}

/**
 * Il solo controllo dei listini, senza i congelati: per le scritture che
 * ricalcolano coi listini di adesso (salvataggio, «Nuova revisione»,
 * «Correggi»), che senza listino scriverebbero un totale sbagliato (C1).
 */
export function bloccoListiniAdesso(): BloccoPdf {
  const { sezioni } = useQuoteStore.getState()
  const { marmeria, cucine } = usePricelistStore.getState()
  return bloccoPdf(vociGres(sezioni), sezioneNonVuota('cucine', sezioni), marmeria !== null, cucine !== null)
}

const LIBERO: BloccoPdf = { bloccato: false, motivo: null }

function bloccoPdf(voci: number, cucinaCompilata: boolean, listinoGres: boolean, listinoCucine: boolean): BloccoPdf {
  const motivi: string[] = []
  if (cucinaCompilata && !listinoCucine) {
    motivi.push(
      'Listino Cucine non caricato: la cucina resterebbe da definire nel PDF e fuori dal totale. Ricaricalo o svuota la sezione Cucine.'
    )
  }
  if (voci > 0 && !listinoGres) {
    motivi.push(
      `Listino Gres non caricato: il blocco Gres (${voci} ${voci === 1 ? 'riga' : 'righe'}) resterebbe fuori dal PDF e dal totale. Ricaricalo o svuota la sezione Gres.`
    )
  }
  return motivi.length === 0 ? LIBERO : { bloccato: true, motivo: motivi.join(' ') }
}
