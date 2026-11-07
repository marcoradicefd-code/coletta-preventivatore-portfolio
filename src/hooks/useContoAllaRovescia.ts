import { useEffect, useState } from 'react'

/** Dopo un invio che manda un'email, il pulsante resta spento per questi secondi: niente raffiche (L26, L29). */
export const ATTESA_INVIO_S = 60

/**
 * Il conto alla rovescia dei pulsanti che mandano un'email: «Invia il link»
 * (L26) e «Registrati» (L29). `avvia(secondi)` lo fa partire; l'intervallo
 * vive finché l'attesa è in corso, non a ogni secondo.
 */
export function useContoAllaRovescia() {
  const [attesa, setAttesa] = useState(0)
  const inAttesa = attesa > 0
  useEffect(() => {
    if (!inAttesa) return
    const t = window.setInterval(() => setAttesa((a) => Math.max(0, a - 1)), 1000)
    return () => window.clearInterval(t)
  }, [inAttesa])
  return { attesa, inAttesa, avvia: setAttesa }
}
