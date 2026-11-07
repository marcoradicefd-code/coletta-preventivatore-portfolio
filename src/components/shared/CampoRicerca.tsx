import { Search, X } from 'lucide-react'

interface CampoRicercaProps {
  value: string
  onChange: (value: string) => void
  placeholder: string
  'aria-label': string
}

/**
 * Il campo di ricerca delle voci, uno solo per tutte le pagine: lente a
 * sinistra e, con del testo, il pulsante «Cancella ricerca». Non filtra niente
 * da sé: il confronto lo fa chi lo usa, con `corrispondeRicerca`
 * (`src/utils/ricerca.ts`).
 */
export function CampoRicerca({ value, onChange, placeholder, 'aria-label': ariaLabel }: Readonly<CampoRicercaProps>) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-tertiary pointer-events-none" strokeWidth={1.5} />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="min-h-11 w-full rounded-sm border border-separator-opaque bg-surface-tertiary pl-9 pr-11 py-2 text-sm md:min-h-0 md:pr-9 text-ink-primary placeholder:text-ink-tertiary
          transition-[border-color,box-shadow] duration-150 focus:border-accent focus:ring-2 focus:ring-accent-light focus:outline-none"
      />
      {value && (
        // U8, U17: leggibile (ink-tertiary, non disabled) e 44 px su mobile.
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Cancella ricerca"
          className="absolute right-0 top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-xs text-ink-tertiary hover:text-ink-primary transition-colors md:right-2 md:h-6 md:w-6"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      )}
    </div>
  )
}
