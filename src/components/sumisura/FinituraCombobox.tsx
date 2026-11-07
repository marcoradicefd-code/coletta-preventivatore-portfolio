import {
  Fragment,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Check, ChevronDown, Layers, Plus } from 'lucide-react'
import { cercaFiniture, type OpzioneFinitura } from '@/data/finiture'
import { useMotionConfig } from '@/hooks/useMotionConfig'

interface FinituraComboboxProps {
  label: string
  value: string
  onChange: (v: string) => void
  /** Se true accetta testo libero non in catalogo (campo "codice finitura"). */
  creatable?: boolean
  placeholder?: string
}

type Riga =
  | { kind: 'clear' }
  | { kind: 'crea'; value: string }
  | { kind: 'opzione'; opt: OpzioneFinitura }

// Cap di voci montate nel listbox: 357 colori + 51 laminati non possono
// finire tutti nel DOM. Oltre il cap mostriamo "+X altri — affina la ricerca".
const CAP = 50

/**
 * Combobox cercabile per le finiture (colori RAL/NCS/Sikkens + laminati ABET).
 * Hand-rolled, zero dipendenze (coerente con QtyInput). Scrive SEMPRE una
 * stringa ricca ("RAL 9010 — Bianco puro") nei campi `string` di ArticoloSuMisura:
 * il contratto verso store/print resta invariato. Lo swatch è solo nell'editor.
 */
export function FinituraCombobox({
  label,
  value,
  onChange,
  creatable = false,
  placeholder = 'Cerca o seleziona…',
}: FinituraComboboxProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const campoId = useId()
  const { transition, prefersReduced } = useMotionConfig()

  const { opzioni, totale } = useMemo(() => cercaFiniture(query, CAP), [query])

  const righe = useMemo<Riga[]>(() => {
    const r: Riga[] = [{ kind: 'clear' }]
    const qTrim = query.trim()
    if (creatable && qTrim !== '' && !opzioni.some((o) => o.value.toLowerCase() === qTrim.toLowerCase())) {
      r.push({ kind: 'crea', value: qTrim })
    }
    for (const opt of opzioni) r.push({ kind: 'opzione', opt })
    return r
  }, [opzioni, query, creatable])

  // L'indice letto è sempre in range anche quando la lista si accorcia: si
  // limita a ogni render, senza riscrivere lo stato in un effect.
  const indiceAttivo = Math.min(Math.max(activeIndex, 0), Math.max(0, righe.length - 1))

  // Chiusura su click fuori dal componente.
  useEffect(() => {
    if (!open) return
    const onDocDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', onDocDown)
    return () => document.removeEventListener('mousedown', onDocDown)
  }, [open])

  function apri() {
    if (!open) {
      setOpen(true)
      setQuery('')
      setActiveIndex(0)
    }
  }

  function scegli(r: Riga) {
    if (r.kind === 'clear') onChange('')
    else if (r.kind === 'crea') onChange(r.value)
    else onChange(r.opt.value)
    setOpen(false)
    setQuery('')
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) return apri()
      setActiveIndex(Math.min(indiceAttivo + 1, righe.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(Math.max(indiceAttivo - 1, 0))
    } else if (e.key === 'Enter') {
      if (open && righe[indiceAttivo]) {
        e.preventDefault()
        scegli(righe[indiceAttivo])
      } else if (creatable && query.trim() !== '') {
        e.preventDefault()
        scegli({ kind: 'crea', value: query.trim() })
      }
    } else if (e.key === 'Escape' && open) {
      e.preventDefault()
      setOpen(false)
      setQuery('')
    }
  }

  return (
    <div className="space-y-1" ref={containerRef}>
      {/* U5: l'etichetta è il nome del combobox (htmlFor/id da useId). */}
      <label htmlFor={campoId} className="block text-xs font-medium uppercase tracking-wider text-ink-tertiary">{label}</label>
      <div className="relative">
        <input
          id={campoId}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && righe[indiceAttivo] ? `${listId}-opt-${indiceAttivo}` : undefined}
          value={open ? query : value}
          placeholder={value === '' ? placeholder : undefined}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
            // 0 = "— Nessuna —"; la prima riga utile (crea/opzione) è la 1.
            setActiveIndex(1)
          }}
          onFocus={apri}
          onBlur={(e) => {
            // U5: col Tab il focus esce dal combobox e la lista si chiude (prima
            // restava aperta, e con la seconda finitura c'erano due popup).
            if (!containerRef.current?.contains(e.relatedTarget as Node | null)) {
              setOpen(false)
              setQuery('')
            }
          }}
          onKeyDown={onKeyDown}
          className="w-full rounded-sm border border-separator-opaque bg-surface-tertiary px-3 py-2 pr-9 text-sm text-ink-primary
            focus:border-accent focus:ring-2 focus:ring-accent-light focus:outline-none"
          style={{ minHeight: 44 }}
        />
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-tertiary" />

        <AnimatePresence>
          {open && (
            <motion.ul
              id={listId}
              role="listbox"
              tabIndex={-1}
              initial={prefersReduced ? { opacity: 0 } : { opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={prefersReduced ? { opacity: 0 } : { opacity: 0, y: -4 }}
              transition={transition}
              className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-auto rounded-sm border border-separator-opaque
                bg-surface-secondary py-1 shadow-apple-xl"
            >
              {righe.map((r, i) => {
                const active = i === indiceAttivo
                let header: ReactNode = null
                if (r.kind === 'opzione') {
                  const prev = righe[i - 1]
                  const prevGruppo = prev && prev.kind === 'opzione' ? prev.opt.gruppo : null
                  if (r.opt.gruppo !== prevGruppo) {
                    header = (
                      <li role="presentation" className="px-3 pt-2 pb-1 text-xs font-semibold uppercase tracking-wider text-ink-tertiary">
                        {r.opt.gruppo}
                      </li>
                    )
                  }
                }
                const key = r.kind === 'opzione' ? r.opt.value : r.kind === 'crea' ? `crea-${r.value}` : 'clear'
                return (
                  <Fragment key={key}>
                    {header}
                    <li
                      id={`${listId}-opt-${i}`}
                      role="option"
                      aria-selected={r.kind === 'opzione' ? r.opt.value === value : false}
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setActiveIndex(i)}
                      onClick={() => scegli(r)}
                      className={`flex cursor-pointer items-center gap-2.5 px-3 text-sm transition-colors
                        ${active ? 'bg-surface-tertiary' : ''}
                        ${r.kind === 'opzione' ? 'text-ink-primary' : 'text-ink-secondary'}`}
                      style={{ minHeight: 44 }}
                    >
                      {r.kind === 'clear' && <span className="text-ink-tertiary">— Nessuna —</span>}
                      {r.kind === 'crea' && (
                        <>
                          <Plus className="h-3.5 w-3.5 shrink-0 text-brand-red" />
                          <span>Usa «{r.value}»</span>
                        </>
                      )}
                      {r.kind === 'opzione' && (
                        <>
                          {r.opt.hex ? (
                            <span
                              className="h-4 w-4 shrink-0 rounded-xs border border-separator-opaque"
                              style={{ backgroundColor: r.opt.hex }}
                            />
                          ) : (
                            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-xs border border-separator-opaque bg-surface-tertiary text-ink-tertiary">
                              <Layers className="h-2.5 w-2.5" />
                            </span>
                          )}
                          <span className="truncate">{r.opt.value}</span>
                          {r.opt.value === value && <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-brand-red" />}
                        </>
                      )}
                    </li>
                  </Fragment>
                )
              })}
              {totale > opzioni.length && (
                <li role="presentation" className="px-3 py-2 text-[12px] text-ink-tertiary">
                  +{totale - opzioni.length} altri — affina la ricerca
                </li>
              )}
            </motion.ul>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
