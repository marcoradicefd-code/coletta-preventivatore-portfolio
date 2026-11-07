import { useSyncExternalStore } from 'react'
import { useQuoteStore, haIdratazioneFallita } from '@/store/quoteStore'

// ponytail: nessun listener per `haIdratazioneFallita`. Lo storage è sincrono,
// quindi l'idratazione (e il suo errore) finisce durante l'import del modulo,
// prima del primo render, e `useSyncExternalStore` legge il flag al montaggio.
// Con uno storage asincrono servirebbe un evento a cui iscriversi.
const iscriviti = (avvisa: () => void) => useQuoteStore.persist.onFinishHydration(avvisa)
const idratato = () => useQuoteStore.persist.hasHydrated() || haIdratazioneFallita()

/**
 * Ritorna `true` quando l'idratazione del preventivo è finita: Zustand persist
 * ha letto localStorage e ripristinato lo stato, OPPURE è finita in errore e
 * l'app riparte da vuoto (`haIdratazioneFallita`). Nel ramo di errore zustand
 * non segna mai l'idratazione finita: senza il flag questo hook resterebbe
 * `false` e l'app a pittogramma pulsante per sempre.
 * Usarlo per bloccare il render dell'app finché non è pronto.
 *
 * `useSyncExternalStore` legge lo stato al render e si iscrive alla fine
 * dell'idratazione: nessun setState in un effect e nessuna finestra fra il
 * controllo e l'iscrizione in cui l'evento andrebbe perso.
 */
export function useStoreHydration(): boolean {
  return useSyncExternalStore(iscriviti, idratato)
}
