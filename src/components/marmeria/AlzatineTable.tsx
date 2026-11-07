import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Trash2, Plus, Search } from 'lucide-react'
import { useQuoteStore } from '@/store/quoteStore'
import { usePricelistStore } from '@/store/pricelistStore'
import { FALLBACK_GRES } from '@/store/quoteFallbacks'

const EMPTY_ARR: never[] = []
import { CurrencyCell } from '@/components/shared/CurrencyCell'
import { importoRiga } from '@/engine/calcMarmeria'
import { QtyInput } from '@/components/shared/QtyInput'
import { listItemVariants } from '@/styles/variants'

export function AlzatineTable() {
  const righe = useQuoteStore((s) => (s.sezioni.gres ?? FALLBACK_GRES).righeAlzatine)
  const addRiga = useQuoteStore((s) => s.addRigaAlzatina)
  const updateRiga = useQuoteStore((s) => s.updateRigaAlzatina)
  const removeRiga = useQuoteStore((s) => s.removeRigaAlzatina)
  const materialiRaw = usePricelistStore((s) => s.marmeria?.materiali)
  const materiali = materialiRaw ?? EMPTY_ARR

  const [selectedKey, setSelectedKey] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)

  // Only show materials that have alzatina price > 0
  const materialiConAlzatina = useMemo(
    () => materiali.filter((m) => m.alzatinaEuroMl > 0),
    [materiali]
  )

  // Filter by search query
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return []
    const q = searchQuery.toLowerCase()
    return materialiConAlzatina
      .filter((m) => {
        const label = `${m.produttore} ${m.colore} ${m.tipoSuperficie}`.toLowerCase()
        return label.includes(q)
      })
      .slice(0, 10)
  }, [searchQuery, materialiConAlzatina])

  // Close dropdown on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleSelectFromSearch = useCallback((key: string) => {
    setSelectedKey(key)
    setSearchQuery('')
    setSearchOpen(false)
  }, [])

  const handleAdd = useCallback(() => {
    if (!selectedKey) return
    const mat = materiali.find((m) => m.coloreFinituraCompleto === selectedKey)
    if (!mat) return
    addRiga({
      materialeKey: selectedKey,
      qtaMl: 0,
      prezzoMl: mat.alzatinaEuroMl,
      totale: 0,
    })
  }, [selectedKey, materiali, addRiga])

  const handleQtyChange = useCallback(
    (id: string, qtaMl: number) => {
      const riga = righe.find((r) => r.id === id)
      if (!riga) return
      updateRiga(id, { qtaMl, totale: qtaMl * riga.prezzoMl })
    },
    [righe, updateRiga]
  )

  const selectedMat = selectedKey
    ? materiali.find((m) => m.coloreFinituraCompleto === selectedKey)
    : null

  return (
    <div className="rounded-lg bg-surface-secondary border border-separator-opaque shadow-apple-sm">
      <div className="px-5 py-3 border-b border-separator-opaque bg-brand-navy/[0.03] flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold text-ink-primary">Sezione 2: Alzatine</h4>
          <p className="text-xs text-ink-tertiary mt-0.5">Quotazioni al ML</p>
        </div>
      </div>

      {/* Add row */}
      <div className="flex items-end gap-3 px-5 py-3 border-b border-separator-opaque bg-surface-tertiary/30">
        <div className="flex-1 space-y-3">
          {/* Dropdown */}
          <div className="space-y-1">
            <label className="block text-xs font-medium uppercase tracking-wider text-ink-tertiary">
              Materiale alzatina
            </label>
            <select
              value={selectedKey}
              onChange={(e) => setSelectedKey(e.target.value)}
              className="w-full rounded-sm border border-separator-opaque bg-surface-tertiary px-3 py-2 text-sm text-ink-primary
                focus:border-accent focus:ring-2 focus:ring-accent-light focus:outline-none"
            >
              <option value="">Seleziona materiale...</option>
              {materialiConAlzatina.map((m) => (
                <option key={m.coloreFinituraCompleto} value={m.coloreFinituraCompleto}>
                  {m.produttore} — {m.colore} (€ {m.alzatinaEuroMl}/ml)
                </option>
              ))}
            </select>
          </div>

          {/* Search bar */}
          <div ref={searchRef} className="relative">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-disabled pointer-events-none" strokeWidth={1.5} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setSearchOpen(true)
                }}
                onFocus={() => { if (searchQuery.trim()) setSearchOpen(true) }}
                placeholder="Cerca per nome materiale..."
                className="w-full rounded-sm border border-separator-opaque bg-surface-tertiary pl-9 pr-3 py-2 text-sm text-ink-primary placeholder:text-ink-tertiary
                  transition-[border-color,box-shadow] duration-150
                  focus:border-accent focus:ring-2 focus:ring-accent-light focus:outline-none"
              />
            </div>

            {/* Search results dropdown */}
            <AnimatePresence>
              {searchOpen && searchResults.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.12 }}
                  className="absolute z-20 left-0 right-0 mt-1 rounded-sm border border-separator-opaque bg-surface-secondary shadow-apple-lg overflow-hidden"
                >
                  <ul className="max-h-[280px] overflow-y-auto py-1">
                    {searchResults.map((m) => (
                      <li key={m.coloreFinituraCompleto}>
                        <button
                          onClick={() => handleSelectFromSearch(m.coloreFinituraCompleto)}
                          className="w-full text-left px-3 py-2.5 text-sm hover:bg-hover-voce transition-colors duration-100 flex items-center justify-between gap-3"
                        >
                          <span className="text-ink-primary truncate">
                            <span className="font-medium">{m.produttore}</span>
                            <span className="text-ink-tertiary"> — {m.colore}</span>
                          </span>
                          <span className="shrink-0 text-xs font-mono tabular-nums text-ink-tertiary">
                            € {m.alzatinaEuroMl}/ml
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </motion.div>
              )}
            </AnimatePresence>

            {searchOpen && searchQuery.trim() && searchResults.length === 0 && (
              <div className="absolute z-20 left-0 right-0 mt-1 rounded-sm border border-separator-opaque bg-surface-secondary shadow-apple-md px-3 py-3 text-sm text-ink-tertiary">
                Nessun materiale trovato
              </div>
            )}
          </div>

          {/* Selected preview */}
          {selectedMat && (
            <p className="text-xs text-ink-secondary">
              Selezionato: <span className="font-medium">{selectedMat.produttore} — {selectedMat.colore}</span> — € {selectedMat.alzatinaEuroMl}/ml
            </p>
          )}
        </div>

        <button
          onClick={handleAdd}
          disabled={!selectedKey}
          className="flex items-center gap-1.5 rounded-sm bg-brand-red px-3 py-2 text-sm font-semibold text-white
            hover:bg-brand-red-dark active:scale-[0.98] transition-all duration-150
            disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ minHeight: 44 }}
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
          Aggiungi
        </button>
      </div>

      {righe.length > 0 && (
        <div className="overflow-x-auto rounded-b-lg"><table className="w-full min-w-[560px]">
          <thead>
            <tr className="bg-brand-navy text-white">
              <th className="text-left px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.04em]">Materiale</th>
              <th className="text-right px-3 py-3 text-[12px] font-semibold uppercase tracking-[0.04em] w-24">€/ml</th>
              <th className="text-right px-3 py-3 text-[12px] font-semibold uppercase tracking-[0.04em] w-24">Qtà ml</th>
              <th className="text-right px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.04em] w-28">Totale</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            <AnimatePresence>
              {righe.map((riga) => {
                const mat = materiali.find((m) => m.coloreFinituraCompleto === riga.materialeKey)
                // L'importo dell'engine (euro intero, D4), non `riga.totale` persistito.
                const importo = importoRiga(riga.qtaMl, riga.prezzoMl)
                return (
                  <motion.tr
                    key={riga.id}
                    variants={listItemVariants}
                    initial="hidden"
                    animate="visible"
                    exit={{ opacity: 0, x: 20, transition: { duration: 0.15 } }}
                    layout
                    className={`border-b border-separator-opaque transition-colors duration-100 ${riga.qtaMl > 0 ? 'bg-voce-selezionata' : 'hover:bg-hover-voce'}`}
                  >
                    <td className="px-4 py-3 text-sm text-ink-primary">
                      {mat ? `${mat.produttore} — ${mat.colore}` : riga.materialeKey}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <CurrencyCell value={riga.prezzoMl} showZero className="text-sm text-ink-secondary" />
                    </td>
                    <td className="px-3 py-3 text-right">
                      <QtyInput context="marmeria"
                        value={riga.qtaMl}
                        onChange={(v) => handleQtyChange(riga.id, v)}
                        unitaMisura="ML"
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <CurrencyCell
                        value={importo}
                        className={`text-sm ${importo > 0 ? 'font-semibold text-brand-red' : 'text-ink-disabled'}`}
                      />
                    </td>
                    <td className="px-2 py-3">
                      <button
                        onClick={() => removeRiga(riga.id)}
                        aria-label="Rimuovi riga"
                        className="flex h-9 w-9 items-center justify-center rounded-xs text-ink-disabled hover:text-error hover:bg-error-bg transition-colors duration-150"
                      >
                        <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                      </button>
                    </td>
                  </motion.tr>
                )
              })}
            </AnimatePresence>
          </tbody>
        </table></div>
      )}
    </div>
  )
}
