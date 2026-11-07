import { useCallback, useId, useState, type ChangeEvent } from 'react'
import { Minus, Plus } from 'lucide-react'
import { CampoNumero } from './CampoNumero'

type Context = 'sumisura' | 'marmeria'

interface QtyInputProps {
  value: number
  onChange: (value: number) => void
  unitaMisura: string
  context?: Context
  min?: number
  className?: string
}

const LIMITS: Record<Context, Record<string, { max: number; step: number }>> = {
  sumisura: {
    MQ: { max: 200, step: 0.1 },
    ML: { max: 100, step: 0.1 },
    PEZZO: { max: 50, step: 1 },
    VALORE: { max: 50, step: 1 },
  },
  marmeria: {
    MQ: { max: 20, step: 0.1 },
    ML: { max: 50, step: 0.1 },
    PEZZO: { max: 50, step: 1 },
  },
}

export function QtyInput({ value, onChange, unitaMisura, context = 'sumisura', min = 0, className = '' }: QtyInputProps) {
  const config = LIMITS[context]?.[unitaMisura] ?? { max: 999, step: 1 }
  const { max, step } = config
  // Oltre il massimo il valore si limita (il tetto è per riga), e lo si DICE:
  // il messaggio resta finché il valore non torna nel limite. Il campo mostra
  // sempre il valore limitato, cioè quello su cui si calcola.
  const [oltreMassimo, setOltreMassimo] = useState(false)
  const msgId = useId()

  const clampAndSet = useCallback(
    (raw: number) => {
      const val = Math.round(Math.max(min, Math.min(max, raw)) * 100) / 100
      setOltreMassimo(raw > max)
      onChange(val)
    },
    [min, max, onChange]
  )

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const raw = parseFloat(e.target.value)
      clampAndSet(isNaN(raw) ? 0 : raw)
    },
    [clampAndSet]
  )

  const increment = useCallback(() => {
    clampAndSet(Math.round((value + 1) * 100) / 100)
  }, [value, clampAndSet])

  const decrement = useCallback(() => {
    clampAndSet(Math.round((value - 1) * 100) / 100)
  }, [value, clampAndSet])

  const atMax = value >= max
  const atMin = value <= min

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <div
        className={`qty-stepper inline-flex items-center rounded-sm overflow-hidden
          bg-surface-tertiary border
          ${oltreMassimo ? 'border-error' : 'border-separator-opaque'}
          transition-[border-color] duration-200 ${className}`}
        data-filled={value > 0 ? '' : undefined}
      >
        <button
          type="button"
          onClick={decrement}
          tabIndex={-1}
          aria-label="Decrementa"
          disabled={atMin}
          className={`qty-stepper-btn flex items-center justify-center w-8 h-9
            transition-all duration-200 active:scale-90
            ${atMin ? 'text-ink-disabled/30 cursor-default' : 'text-ink-disabled hover:text-brand-red hover:bg-brand-red/[0.08]'}`}
        >
          <Minus className="h-3 w-3" strokeWidth={2.5} />
        </button>

        <CampoNumero
          value={value}
          onChange={handleChange}
          min={min}
          max={max}
          step={step}
          aria-describedby={oltreMassimo ? msgId : undefined}
          className="qty-stepper-input w-10 h-9 bg-transparent text-center text-sm font-semibold tabular-nums text-ink-primary
            transition-colors duration-200 focus:outline-none
            [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />

        <button
          type="button"
          onClick={increment}
          tabIndex={-1}
          aria-label="Incrementa"
          disabled={atMax}
          className={`qty-stepper-btn flex items-center justify-center w-8 h-9
            transition-all duration-200 active:scale-90
            ${atMax ? 'text-ink-disabled/30 cursor-default' : 'text-ink-disabled hover:text-brand-red hover:bg-brand-red/[0.08]'}`}
        >
          <Plus className="h-3 w-3" strokeWidth={2.5} />
        </button>
      </div>
      {oltreMassimo && (
        // <output> ha già il ruolo status (Sonar S6819): niente role esplicito.
        <output id={msgId} className="block max-w-[12rem] text-right text-xs leading-tight text-error">
          Massimo {max} {UNITA_PER_RIGA[unitaMisura] ?? unitaMisura.toLowerCase()} per riga: aggiungi una riga per quantità maggiori
        </output>
      )}
    </div>
  )
}

/** Come si legge l'unità nel messaggio del massimo per riga. */
const UNITA_PER_RIGA: Record<string, string> = { MQ: 'mq', ML: 'ml', PEZZO: 'pezzi' }
