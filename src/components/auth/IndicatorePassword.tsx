import { useEffect, useId, useRef, useState } from 'react'
import { CheckCircle2, Circle } from 'lucide-react'
import type { LivelloPassword, ValutazionePassword, Voce } from '@/lib/regolaPassword'

/** La pausa dopo l'ultimo tasto prima di annunciare un livello nuovo. */
export const RITARDO_ANNUNCIO_MS = 800

/** Colore dei segmenti pieni e dell'etichetta, dal rosso al verde (token `*-su-navy`, contrasti in `index.css`). */
const COLORE: Readonly<Record<LivelloPassword, { fondo: string; testo: string }>> = {
  0: { fondo: 'bg-error-su-navy', testo: 'text-error-su-navy' },
  1: { fondo: 'bg-error-su-navy', testo: 'text-error-su-navy' },
  2: { fondo: 'bg-warning-su-navy', testo: 'text-warning-su-navy' },
  3: { fondo: 'bg-giallo-verde-su-navy', testo: 'text-giallo-verde-su-navy' },
  4: { fondo: 'bg-success-su-navy', testo: 'text-success-su-navy' },
}
const SEGMENTI = [1, 2, 3, 4] as const
const STILE_TITOLO = 'text-[12px] font-medium uppercase tracking-widest text-white/55'

function Elenco<Id extends string>({ titolo, voci }: Readonly<{ titolo: string; voci: Voce<Id>[] }>) {
  const id = useId()
  return (
    <div>
      <p id={id} className={STILE_TITOLO}>
        {titolo}
      </p>
      <ul aria-labelledby={id} className="mt-1.5 flex flex-col gap-1">
        {voci.map((v) => (
          <li key={v.id} className="flex items-start gap-2 text-[13px] text-white/80">
            {v.ok ? (
              <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-success-su-navy" strokeWidth={1.5} />
            ) : (
              <Circle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-white/50" strokeWidth={1.5} />
            )}
            <span className="sr-only">{v.ok ? 'fatto' : 'da fare'}: </span>
            <span>{v.testo}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * La robustezza della password mentre si scrive (L29), in «Registrati» e in
 * «Imposta una nuova password». La barra è un `role="meter"` (l'`id` va
 * nell'`aria-describedby` del campo) con l'etichetta scritta accanto: il colore
 * non è l'unico segnale. Il cambio di livello si annuncia in una regione live
 * dopo `RITARDO_ANNUNCIO_MS` dall'ultimo tasto, non a ogni tasto. Sotto, gli
 * obbligatori («Richiesto») e i suggerimenti («Consigliato»). I segmenti
 * cambiano solo colore, senza animare la larghezza, e niente transizione con
 * `prefers-reduced-motion`. `valutazione` arriva già fatta (useMemo del
 * genitore, che la usa anche per il pulsante): cambia solo quando cambia la
 * password, e questo fa ripartire la pausa.
 */
export function IndicatorePassword({
  id,
  password,
  valutazione,
}: Readonly<{ id: string; password: string; valutazione: ValutazionePassword }>) {
  const { livello, etichetta } = valutazione
  const [annuncio, setAnnuncio] = useState('')
  const annunciato = useRef(livello)

  useEffect(() => {
    if (livello === annunciato.current) return
    const t = window.setTimeout(() => {
      annunciato.current = livello
      setAnnuncio(`Robustezza della password: ${etichetta}`)
    }, RITARDO_ANNUNCIO_MS)
    return () => window.clearTimeout(t)
  }, [valutazione, livello, etichetta])

  // Una password non vuota accende almeno il primo segmento, rosso.
  const pieni = password ? Math.max(1, livello) : 0
  const colore = COLORE[livello]

  return (
    <div className="flex flex-col gap-3">
      <div
        id={id}
        role="meter"
        aria-label="Robustezza della password"
        aria-valuemin={0}
        aria-valuemax={4}
        aria-valuenow={livello}
        aria-valuetext={etichetta}
        className="flex items-center gap-3"
      >
        <div aria-hidden="true" className="flex flex-1 gap-1">
          {SEGMENTI.map((n) => (
            <span
              key={n}
              data-pieno={n <= pieni}
              className={`h-1.5 flex-1 rounded-full transition-colors duration-200 motion-reduce:transition-none ${
                n <= pieni ? colore.fondo : 'bg-white/15'
              }`}
            />
          ))}
        </div>
        <span className={`min-w-[6.5rem] text-right text-[12px] font-medium ${colore.testo}`}>{etichetta}</span>
      </div>
      <p aria-live="polite" aria-atomic="true" className="sr-only">
        {annuncio}
      </p>
      <Elenco titolo="Richiesto" voci={valutazione.obbligatori} />
      <Elenco titolo="Consigliato" voci={valutazione.suggerimenti} />
    </div>
  )
}
