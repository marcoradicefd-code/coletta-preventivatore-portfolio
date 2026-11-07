import { useCallback, useRef, useState, type DragEvent } from 'react'
import { motion } from 'motion/react'
import { FileSpreadsheet, Loader2, CheckCircle2, AlertCircle, X, Upload } from 'lucide-react'
import { useExcelLoader } from '@/hooks/useExcelLoader'
import { usePricelistStore, ETICHETTA } from '@/store/pricelistStore'
import { modalVariants } from '@/styles/variants'

interface FileUploadCardProps {
  type: 'sumisura' | 'marmeria'
  onClose: () => void
}

export function FileUploadCard({ type, onClose }: FileUploadCardProps) {
  const { load, state, error } = useExcelLoader(type)
  const referto = usePricelistStore((s) => (type === 'sumisura' ? s.referti.suMisura : s.referti.marmeria))
  const [isDragOver, setIsDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const title = `Listino ${ETICHETTA[type]}`

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      const file = e.dataTransfer.files[0]
      // `load` non rigetta: ogni errore (lettura, parse, validazione) diventa
      // lo stato 'error' della modale, che lo mostra. Un .catch qui non si
      // raggiungerebbe mai.
      if (file) void load(file)
    },
    [load]
  )

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      // `load` non rigetta: ogni errore (lettura, parse, validazione) diventa
      // lo stato 'error' della modale, che lo mostra. Un .catch qui non si
      // raggiungerebbe mai.
      if (file) void load(file)
    },
    [load]
  )

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false)
  }, [])

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <motion.div
        variants={modalVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-full max-w-md rounded-lg bg-surface-secondary shadow-apple-xl border border-separator-opaque p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="h-5 w-5 text-brand-red" strokeWidth={1.5} />
              <h3 className="font-semibold text-ink-primary">Aggiorna {title}</h3>
            </div>
            <button
              onClick={onClose}
              aria-label="Chiudi"
              className="flex h-9 w-9 items-center justify-center rounded-xs text-ink-tertiary hover:text-ink-primary hover:bg-surface-tertiary transition-colors duration-150"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Drop zone: un <button> nativo, così Invio e Spazio li gestisce il
              browser. Dentro solo l'invito: lo screen reader legge l'etichetta
              del bottone e non il contenuto, e un bottone non ne contiene altri.
              Per questo errore e successo stanno sotto, fuori dal bottone. */}
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileSelect}
            className="hidden"
          />
          <button
            type="button"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => inputRef.current?.click()}
            aria-label="Scegli un file Excel da caricare"
            className={`
              relative flex w-full flex-col items-center justify-center gap-3 rounded-md border-2 border-dashed p-8 cursor-pointer
              transition-colors duration-150
              ${isDragOver
                ? 'border-brand-red bg-brand-red-light'
                : 'border-separator-opaque hover:border-ink-disabled hover:bg-surface-tertiary/50'
              }
            `}
          >
            {state === 'loading' && (
              <>
                <Loader2 className="h-8 w-8 animate-spin text-brand-red" strokeWidth={1.5} />
                <span className="block text-sm text-ink-secondary">Analisi del listino in corso...</span>
              </>
            )}

            {state === 'error' && (
              <>
                <AlertCircle className="h-8 w-8 text-error" strokeWidth={1.5} />
                <span className="block text-xs text-ink-tertiary">Trascina un altro file o clicca per riprovare</span>
              </>
            )}

            {(state === 'idle' || state === 'success') && (
              <>
                <Upload className="h-8 w-8 text-ink-disabled" strokeWidth={1.5} />
                <span className="block text-center">
                  <span className="block text-sm text-ink-secondary">
                    Trascina il file Excel qui
                  </span>
                  <span className="block text-xs text-ink-tertiary mt-1">
                    oppure clicca per selezionarlo (.xlsx, .xls, max 10MB)
                  </span>
                </span>
              </>
            )}
          </button>

          {state === 'error' && (
            <p role="alert" className="mt-3 text-sm text-error text-center">
              {error}
            </p>
          )}

          {state === 'success' && (
            <div className="mt-3 flex flex-col items-center gap-2 text-center">
              {/* <output>: ruolo implicito "status", letto dallo screen reader. */}
              <output className="flex flex-col items-center gap-2">
                <CheckCircle2 className="h-6 w-6 text-success" strokeWidth={1.5} />
                <span className="block text-sm text-ink-secondary">Listino aggiornato con successo!</span>
                {/* Referto: cosa è entrato davvero. "Caricato" senza numeri non
                    dice niente — 3 voci invece di 51 sono un successo identico. */}
                {referto && (
                  <span className="block text-[12px] text-ink-tertiary">
                    {referto.caricati.map((c) => `${c.nome}: ${c.voci}`).join(' · ')}
                    {referto.esclusi.length > 0 &&
                      ` — esclusi: ${referto.esclusi.map((e) => e.nome).join(', ')}`}
                  </span>
                )}
              </output>
              <button
                type="button"
                onClick={onClose}
                className="mt-1 rounded-sm bg-brand-red px-4 py-2 text-sm font-semibold text-white hover:bg-brand-red-dark transition-colors duration-150"
                style={{ minHeight: 44 }}
              >
                Chiudi
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </>
  )
}
