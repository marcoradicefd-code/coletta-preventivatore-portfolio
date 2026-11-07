import { useEffect, useMemo, useRef } from 'react'

/**
 * «Questa risposta è ancora quella che aspetto?» (revisione del 14/10 sulla
 * #97, difetti 6 e d). `nuova()` apre una richiesta e restituisce `valida()`,
 * vera finché non parte un'altra richiesta dello stesso tipo, non si chiama
 * `annulla()` (la finestra si chiude) o il componente si smonta. Una risposta
 * non più valida si ignora: niente stato scritto, niente cliente collegato.
 *
 * Vince l'ultima richiesta partita, non l'ultima che risponde. La richiesta
 * non si interrompe (una scrittura partita può arrivare lo stesso): si ignora
 * la sua risposta. Uno per tipo di richiesta (la lettura di una lista, la
 * scelta di un cliente), perché l'una non invalidi l'altra.
 */
export function useRichiestaValida() {
  const corrente = useRef(0)
  useEffect(
    () => () => {
      corrente.current++
    },
    []
  )
  return useMemo(
    () => ({
      nuova: () => {
        const id = ++corrente.current
        return () => id === corrente.current
      },
      annulla: () => {
        corrente.current++
      },
    }),
    []
  )
}
