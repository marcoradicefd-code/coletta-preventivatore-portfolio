import { useCallback, useRef, useState } from 'react'
import { SceltaCliente } from '@/components/clienti/SceltaCliente'
import { clienteDaArchivio, type ClienteDb } from '@/lib/clientiDb'
import { useQuoteStore } from '@/store/quoteStore'

/** Per cosa serve il cliente: dà il titolo della finestra. */
export type ScopoScelta = 'salvare' | 'generare'

const TITOLO: Record<ScopoScelta | 'scegliere', string> = {
  scegliere: 'Scegli il cliente',
  salvare: 'Scegli il cliente per salvare',
  generare: 'Scegli il cliente per generare il preventivo',
}

/**
 * `const { scegli, finestra } = useSceltaCliente()`: `scegli(scopo)` apre la
 * scelta del cliente e risolve `true` quando un cliente è collegato al
 * preventivo (scelto o creato), `false` se la finestra si chiude. Così «Salva»
 * e «Genera» senza cliente continuano nello stesso gesto (§ 3.2). `finestra` va
 * messa nel JSX del chiamante (una sola, in `AppShell`).
 */
export function useSceltaCliente() {
  const [scopo, setScopo] = useState<ScopoScelta | 'scegliere' | null>(null)
  const risolvi = useRef<((ok: boolean) => void) | null>(null)

  const chiudi = useCallback((ok: boolean) => {
    risolvi.current?.(ok)
    risolvi.current = null
    setScopo(null)
  }, [])

  const scegli = useCallback(
    (s?: ScopoScelta) =>
      new Promise<boolean>((resolve) => {
        risolvi.current?.(false)
        risolvi.current = resolve
        setScopo(s ?? 'scegliere')
      }),
    []
  )

  const scelto = useCallback(
    (c: ClienteDb) => {
      useQuoteStore.getState().collegaCliente(c.id, clienteDaArchivio(c))
      chiudi(true)
    },
    [chiudi]
  )

  return {
    scegli,
    finestra: <SceltaCliente aperta={scopo !== null} titolo={TITOLO[scopo ?? 'scegliere']} onScelto={scelto} onChiudi={() => chiudi(false)} />,
  }
}
