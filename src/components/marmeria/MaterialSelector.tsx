import { useState, useMemo, useCallback } from 'react'
import { Plus, AlertCircle } from 'lucide-react'
import { usePricelistStore } from '@/store/pricelistStore'
import { useQuoteStore } from '@/store/quoteStore'
import { fasciaFromProfondita, prezzoMqMateriale } from '@/engine/calcMarmeria'

const EMPTY_ARR: never[] = []
import { formatEur } from '@/utils/format'
import { DimensionInput } from './DimensionInput'
import type { SpessoreType, Materiale } from '@/types/marmeria'

export function MaterialSelector() {
  const materialiRaw = usePricelistStore((s) => s.marmeria?.materiali)
  const materiali = materialiRaw ?? EMPTY_ARR
  const addRigaMateriale = useQuoteStore((s) => s.addRigaMateriale)

  const [produttore, setProduttore] = useState('')
  const [coloreKey, setColoreKey] = useState('')
  const [spessore, setSpessore] = useState<SpessoreType | ''>('')
  const [profonditaCm, setProfonditaCm] = useState(0)

  // Cascading filters
  const produttori = useMemo(() => {
    const set = new Set(materiali.map((m) => m.produttore))
    return [...set].sort((a, b) => a.localeCompare(b, 'it'))
  }, [materiali])

  const coloriPerProduttore = useMemo(() => {
    if (!produttore) return []
    return materiali
      .filter((m) => m.produttore === produttore)
      .map((m) => ({ key: m.coloreFinituraCompleto, label: `${m.colore} — ${m.tipoSuperficie}` }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [materiali, produttore])

  const materialeSelezionato: Materiale | null = useMemo(() => {
    if (!coloreKey) return null
    return materiali.find((m) => m.coloreFinituraCompleto === coloreKey) ?? null
  }, [materiali, coloreKey])

  const spessoriDisponibili = useMemo(() => {
    if (!materialeSelezionato) return []
    const result: SpessoreType[] = []
    for (const sp of [13, 20, 30] as SpessoreType[]) {
      const ms = materialeSelezionato.spessori[sp]
      if (ms?.disponibile) result.push(sp)
    }
    return result
  }, [materialeSelezionato])

  // Compute prezzo
  const fascia = profonditaCm > 0 ? fasciaFromProfondita(profonditaCm) : null
  const prezzoMq =
    materialeSelezionato && spessore && fascia
      ? prezzoMqMateriale(materialeSelezionato, spessore as SpessoreType, fascia)
      : null

  const canAdd = materialeSelezionato && spessore && fascia && prezzoMq !== null

  const handleAdd = useCallback(() => {
    if (!materialeSelezionato || !spessore || !fascia || prezzoMq === null) return

    addRigaMateriale({
      materialeKey: materialeSelezionato.coloreFinituraCompleto,
      spessore: spessore as SpessoreType,
      fascia,
      profonditaCm,
      qtaMq: 0,
      prezzoMq,
      totale: 0,
    })

    // Reset after adding
    setProfonditaCm(0)
  }, [materialeSelezionato, spessore, fascia, prezzoMq, profonditaCm, addRigaMateriale])

  // Reset downstream on change
  const handleProduttoreChange = useCallback((val: string) => {
    setProduttore(val)
    setColoreKey('')
    setSpessore('')
    setProfonditaCm(0)
  }, [])

  const handleColoreChange = useCallback((val: string) => {
    setColoreKey(val)
    setSpessore('')
    setProfonditaCm(0)
  }, [])

  const handleSpessoreChange = useCallback((val: string) => {
    setSpessore(val === '' ? '' : (Number(val) as SpessoreType))
  }, [])

  return (
    <div className="rounded-lg bg-surface-secondary border border-separator-opaque shadow-apple-sm p-5 space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-ink-tertiary">
        Aggiungi materiale
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Produttore */}
        <SelectField
          label="Produttore"
          value={produttore}
          onChange={handleProduttoreChange}
          options={produttori.map((p) => ({ value: p, label: p }))}
          placeholder="Seleziona produttore..."
        />

        {/* Colore */}
        <SelectField
          label="Colore / Finitura"
          value={coloreKey}
          onChange={handleColoreChange}
          options={coloriPerProduttore.map((c) => ({ value: c.key, label: c.label }))}
          placeholder={produttore ? 'Seleziona colore...' : 'Prima scegli produttore'}
          disabled={!produttore}
        />

        {/* Spessore */}
        <SelectField
          label="Spessore (mm)"
          value={spessore === '' ? '' : String(spessore)}
          onChange={handleSpessoreChange}
          options={spessoriDisponibili.map((s) => ({ value: String(s), label: `${s} mm` }))}
          placeholder={coloreKey ? 'Seleziona spessore...' : 'Prima scegli colore'}
          disabled={!coloreKey}
        />

        {/* Profondità */}
        <DimensionInput value={profonditaCm} onChange={setProfonditaCm} />
      </div>

      {/* Price result + Add button */}
      <div className="flex items-center justify-between pt-2 border-t border-separator-opaque">
        <div className="space-y-1">
          {prezzoMq !== null && (
            <p className="text-lg font-semibold text-ink-primary font-mono tabular-nums">
              € {formatEur(prezzoMq)} <span className="text-xs font-normal text-ink-tertiary">/mq</span>
            </p>
          )}
          {prezzoMq === null && spessore && fascia && (
            <div className="flex items-center gap-2 text-sm text-error">
              <AlertCircle className="h-4 w-4" strokeWidth={1.5} />
              Non disponibile per questa combinazione
            </div>
          )}
        </div>

        <button
          onClick={handleAdd}
          disabled={!canAdd}
          className="flex items-center gap-2 rounded-sm bg-brand-red px-4 py-2.5 text-sm font-semibold text-white
            hover:bg-brand-red-dark active:scale-[0.98] transition-all duration-150
            disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
          style={{ minHeight: 44 }}
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
          Aggiungi riga
        </button>
      </div>
    </div>
  )
}

// Reusable select field
interface SelectFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
  placeholder?: string
  disabled?: boolean
}

function SelectField({ label, value, onChange, options, placeholder, disabled }: SelectFieldProps) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium uppercase tracking-wider text-ink-tertiary">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded-sm border border-separator-opaque bg-surface-tertiary px-3 py-2.5 text-sm text-ink-primary
          transition-[border-color,box-shadow] duration-150
          focus:border-accent focus:ring-2 focus:ring-accent-light focus:outline-none
          disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  )
}
