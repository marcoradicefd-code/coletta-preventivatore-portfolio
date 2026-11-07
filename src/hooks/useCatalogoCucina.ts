import { useMemo } from 'react'
import { usePricelistStore } from '@/store/pricelistStore'
import { componiCatalogoCucina } from '@/data/cucina/strutturaCucina'
import type { CatalogoCucina } from '@/types/cucina'

/**
 * Il catalogo cucina dal listino caricato, o null se il listino cucine non c'è.
 * Uno per pagina, riepilogo e PDF: si compone qui e non in un selettore dello
 * store, che restituendo un oggetto nuovo a ogni lettura farebbe ri-renderizzare
 * in loop. Il listino nello store cambia solo a un nuovo caricamento.
 */
export function useCatalogoCucina(): CatalogoCucina | null {
  const listino = usePricelistStore((s) => s.cucine)
  return useMemo(() => (listino ? componiCatalogoCucina(listino) : null), [listino])
}
