import { useCallback, useEffect, useRef, useState } from 'react'
import { usePricelistStore } from '@/store/pricelistStore'
import { AVVISO_CARICAMENTO_LOCALE } from '@/lib/selezioneFogli'

type LoadState = 'idle' | 'loading' | 'success' | 'error'

/**
 * Upload manuale di un listino dalla modale (FileUploadCard).
 *
 * Fa i controlli sul FILE (dimensione, estensione) e poi passa il buffer a
 * `pricelistStore.ingestListino`, che è l'unica porta: parsa nel worker, valida
 * e scrive. Questo hook non tocca più lo store né il worker.
 *
 * Prima aveva un `new Worker` tutto suo e chiamava `usePricelistStore.setState`
 * diretto, saltando Zod: un file marmeria con struttura invalida entrava purché
 * avesse almeno un materiale (E2 dell'audit). Il testo dell'errore era anche più
 * povero di quello del percorso bucket, perché non c'era una validazione da
 * raccontare.
 */
export function useExcelLoader(type: 'sumisura' | 'marmeria') {
  const [state, setState] = useState<LoadState>('idle')
  const [error, setError] = useState<string | null>(null)
  // La modale può chiudersi a ingestione in corso: non scrivere sullo stato di
  // un componente smontato (il worker lo termina già `parseExcelInWorker`).
  const vivo = useRef(true)
  useEffect(() => {
    vivo.current = true
    return () => {
      vivo.current = false
    }
  }, [])

  const load = useCallback(
    async (file: File) => {
      if (file.size > 10 * 1024 * 1024) {
        setError('File troppo grande. Massimo 10MB.')
        setState('error')
        return
      }
      if (!file.name.match(/\.(xlsx|xls)$/i)) {
        setError('Formato non supportato. Usare .xlsx o .xls')
        setState('error')
        return
      }

      setState('loading')
      setError(null)

      let buffer: ArrayBuffer
      try {
        buffer = await file.arrayBuffer()
      } catch {
        if (!vivo.current) return
        setError('Impossibile leggere il file. Riprova.')
        setState('error')
        return
      }

      // Caricato a mano non c'è nessuna scelta dei fogli: su misura entrano tutti, e
      // se sono più d'uno il referto lo dice (O9, modo 5). Nessuna nota: non fa
      // rumore sui file con un foglio solo.
      const opzioni = type === 'sumisura' ? { avviso: AVVISO_CARICAMENTO_LOCALE } : undefined
      const errore = await usePricelistStore.getState().ingestListino(type, buffer, file.name, opzioni)
      if (!vivo.current) return
      if (errore) {
        setError(errore)
        setState('error')
        return
      }
      setState('success')
    },
    [type]
  )

  return { load, state, error, isLoading: state === 'loading' }
}
