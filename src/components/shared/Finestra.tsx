import { useEffect, useId, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react'

interface FinestraProps {
  aperta: boolean
  /** `alertdialog` per una conferma (una domanda e i suoi verbi), `dialog` per un compito. */
  ruolo?: 'dialog' | 'alertdialog'
  titolo: ReactNode
  /** Il testo che spiega: collegato con `aria-describedby`. */
  descrizione?: ReactNode
  /** Esc, o il gesto di chiusura del sistema. */
  onChiudi: () => void
  /** Chi prende il focus all'apertura; altrimenti il primo pulsante delle azioni. */
  focusIniziale?: RefObject<HTMLElement | null>
  children?: ReactNode
  /** I pulsanti: in fondo, fissi su mobile. */
  azioni: ReactNode
  /** Una finestra di compito con un modulo lungo (il configuratore degli articoli): più larga da desktop. */
  larga?: boolean
}

/**
 * La finestra del design system (L21-B): `<dialog>` nativo, come la vecchia
 * `ConfermaGenera`. Blocco del Tab, Esc e ritorno del focus a chi l'ha aperta li
 * dà il browser con `showModal()` e `close()`; jsdom no (stub in
 * `src/test-utils/setup.ts`), quindi i test coprono i collegamenti.
 *
 * Desktop: carta centrata. Mobile (< 768 px): pannello dal basso a tutta
 * larghezza, con le azioni fisse in fondo, come `ArticoloConfigModal`.
 *
 * Il `<dialog>` resta sempre nel DOM e si chiude con `close()`: è ciò che
 * restituisce il focus. Il contenuto si monta solo da aperta.
 */
export function Finestra({
  aperta,
  ruolo = 'dialog',
  titolo,
  descrizione,
  onChiudi,
  focusIniziale,
  children,
  azioni,
  larga = false,
}: Readonly<FinestraProps>) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const azioniRef = useRef<HTMLDivElement>(null)
  const titoloId = useId()
  const testoId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (aperta) {
      // Protetto da `open`: StrictMode esegue l'effetto due volte, e `showModal()`
      // su un dialogo già aperto lancia InvalidStateError.
      if (!dialog.open) dialog.showModal()
      const primo = focusIniziale?.current ?? azioniRef.current?.querySelector('button')
      primo?.focus()
    } else if (dialog.open) {
      dialog.close()
    }
  }, [aperta, focusIniziale])

  // Smontata da aperta (la finestra di un compito che il genitore toglie): si
  // chiude PRIMA che il nodo esca dal DOM, così il browser restituisce il focus
  // a chi l'aveva aperta (U4, revisione L15-L21). Layout effect: la sua pulizia
  // gira prima della rimozione del <dialog>.
  useLayoutEffect(() => {
    const dialog = dialogRef.current
    return () => {
      if (dialog?.open) dialog.close()
    }
  }, [])

  return (
    <dialog
      ref={dialogRef}
      role={ruolo}
      aria-labelledby={titoloId}
      aria-describedby={descrizione ? testoId : undefined}
      onCancel={(e) => {
        // Esc: decide lo stato di React, non il browser (che chiuderebbe da sé).
        e.preventDefault()
        onChiudi()
      }}
      className={`m-auto w-[calc(100%-2rem)] ${larga ? 'max-w-lg' : 'max-w-md'} rounded-lg border border-separator-opaque bg-surface-secondary p-0 text-ink-secondary shadow-apple-xl backdrop:bg-black/40 max-md:mb-0 max-md:w-full max-md:max-w-none max-md:rounded-b-none`}
    >
      {aperta && (
        <div className="flex max-h-[85dvh] flex-col">
          <div className="space-y-3 overflow-y-auto p-6">
            <h2 id={titoloId} className="font-display text-xl text-ink-primary">
              {titolo}
            </h2>
            {descrizione && (
              <p id={testoId} className="text-sm leading-relaxed">
                {descrizione}
              </p>
            )}
            {children}
          </div>
          <div
            ref={azioniRef}
            className="flex flex-col-reverse gap-3 border-t border-separator-opaque bg-surface-secondary p-4 md:flex-row md:justify-end md:border-0 md:px-6 md:pt-0 md:pb-6"
          >
            {azioni}
          </div>
        </div>
      )}
    </dialog>
  )
}
