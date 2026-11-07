import { useMemo } from 'react'
import { useQuoteStore } from '@/store/quoteStore'
import { usePricelistStore } from '@/store/pricelistStore'
import { useCatalogoCucina } from '@/hooks/useCatalogoCucina'
import { vistaPrezzi, type VistaPrezzi } from '@/engine/vistaPrezzi'
import { impronta } from '@/utils/impronta'
import type { PrezziCongelati, StatoPreventivo } from '@/types/archivio'
import type { SezioniState } from '@/types/quote'

/**
 * Da dove vengono i prezzi del preventivo aperto (strada A, Marco 14/10):
 *  - `vivo`: bozza, o un preventivo cambiato dopo il salvataggio: listini di adesso;
 *  - `congelati`: inviato, accettato o annullato coi prezzi del salvataggio
 *    (`archivio.prezzi`), calcolati da queste stesse sezioni: il PDF esce
 *    identico a quello mandato al cliente;
 *  - `senzaCongelati`: inviato, accettato o annullato salvato prima che l'app
 *    li conservasse: dal vivo, e la barra lo dice.
 * `listinoCambiato`: coi congelati, il calcolo di adesso darebbe altro.
 */
export type OriginePrezzi = 'vivo' | 'congelati' | 'senzaCongelati'

export interface PrezziPreventivo {
  vista: VistaPrezzi
  origine: OriginePrezzi
  listinoCambiato: boolean
  /** Quando sono stati calcolati i prezzi congelati (ISO), se valgono. */
  calcolatiIl: string | null
}

/** Inviato, accettato o annullato: gli stati dei prezzi congelati. */
export function fuoriBozza(stato: StatoPreventivo | undefined): boolean {
  return stato === 'inviato' || stato === 'accettato' || stato === 'annullato'
}

/**
 * I prezzi congelati valgono (origine `congelati`): preventivo fuori bozza, coi
 * congelati salvati, e sezioni uguali a quelle da cui sono stati calcolati.
 * La sola fonte della condizione: la usano questo hook e il blocco del PDF
 * (`useBloccoPdf`, N2 del verdetto sulla #98), che coi congelati non chiede
 * il listino perché il PDF non lo usa.
 */
export function congelatiValgono(
  stato: StatoPreventivo | undefined,
  congelati: PrezziCongelati | null,
  sezioni: SezioniState
): congelati is PrezziCongelati {
  return fuoriBozza(stato) && congelati !== null && congelati.sezioni === impronta(sezioni)
}

export function usePrezziPreventivo(): PrezziPreventivo {
  const sezioni = useQuoteStore((s) => s.sezioni)
  const stato = useQuoteStore((s) => s.archivio?.preventivo?.stato)
  const congelati = useQuoteStore((s) => s.archivio?.prezzi ?? null)
  const gres = usePricelistStore((s) => s.marmeria)
  const porte = usePricelistStore((s) => s.porte)
  const catalogoCucina = useCatalogoCucina()
  const vivo = useMemo(() => vistaPrezzi(sezioni, { gres, porte, catalogoCucina }), [sezioni, gres, porte, catalogoCucina])
  const valgono = useMemo(() => congelatiValgono(stato, congelati, sezioni), [stato, congelati, sezioni])
  const improntaViva = useMemo(() => impronta(vivo), [vivo])
  if (!valgono || !congelati) {
    const origine = fuoriBozza(stato) && !congelati ? 'senzaCongelati' : 'vivo'
    return { vista: vivo, origine, listinoCambiato: false, calcolatiIl: null }
  }
  return {
    vista: congelati.vista,
    origine: 'congelati',
    listinoCambiato: congelati.impronta !== improntaViva,
    calcolatiIl: congelati.calcolatiIl,
  }
}
