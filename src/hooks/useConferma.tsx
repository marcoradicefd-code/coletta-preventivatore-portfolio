import { useCallback, useRef, useState } from 'react'
import { Conferma, type Domanda } from '@/components/shared/Conferma'

/**
 * `const { chiedi, finestra } = useConferma()`: `chiedi(domanda)` apre la
 * conferma e risolve col valore dell'azione scelta (`null` con Esc); `finestra`
 * va messa nel JSX del chiamante. È il sostituto di `window.confirm`, che non
 * permette verbi espliciti né il pannello dal basso su mobile.
 */
export function useConferma() {
  const [domanda, setDomanda] = useState<Domanda | null>(null)
  const risolvi = useRef<((valore: string | null) => void) | null>(null)

  const chiedi = useCallback(
    (d: Domanda) =>
      new Promise<string | null>((resolve) => {
        // Una domanda nuova chiude quella di prima senza risposta.
        risolvi.current?.(null)
        risolvi.current = resolve
        setDomanda(d)
      }),
    []
  )

  const rispondi = useCallback((valore: string | null) => {
    risolvi.current?.(valore)
    risolvi.current = null
    setDomanda(null)
  }, [])

  return { chiedi, finestra: <Conferma domanda={domanda} onRisposta={rispondi} /> }
}
