import { useId } from 'react'
import { useQuoteStore } from '@/store/quoteStore'
import { ALIQUOTE_IVA, aliquotaIvaSezione, aliquotaIvaValida, calcIva, type AliquotaIva, type SezioneIva } from '@/engine/iva'
import { formatEur } from '@/utils/format'

// ── IVA nelle schermate (L18) ──
// Un selettore per l'aliquota (sezione o riga) e il riepilogo di sezione per
// aliquota. Le aliquote sono SOLO quelle di `ALIQUOTE_IVA`: niente testo libero.

type SezioneConIva = 'arredi' | 'gres' | 'progettoValore' | 'porte' | 'cucine'

/**
 * Selettore dell'aliquota. Con `sezione` è il selettore di una RIGA: la prima
 * voce è «come la sezione» (valore assente) e dice quanto vale oggi; senza è il
 * selettore di sezione, che non ha un'opzione vuota (assente vale 22).
 */
export function SelettoreAliquotaIva({
  label,
  value,
  onChange,
  sezione,
}: Readonly<{
  label: string
  value: unknown
  onChange: (aliquota: AliquotaIva | undefined) => void
  sezione?: AliquotaIva
}>) {
  const id = useId()
  const perRiga = sezione !== undefined
  const scelta = perRiga ? aliquotaIvaValida(value) : aliquotaIvaSezione(value)
  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className="text-sm text-ink-secondary">
        {label}
      </label>
      <select
        id={id}
        value={scelta ?? ''}
        onChange={(e) => onChange(aliquotaIvaValida(Number(e.target.value)))}
        className="min-h-11 rounded-sm border border-separator-opaque bg-surface-tertiary px-2 py-1 text-sm text-ink-primary tabular-nums focus:border-accent focus:ring-2 focus:ring-accent-light focus:outline-none md:min-h-9"
      >
        {perRiga && <option value="">Come la sezione ({sezione}%)</option>}
        {ALIQUOTE_IVA.map((a) => (
          <option key={a} value={a}>
            {a}%
          </option>
        ))}
      </select>
    </div>
  )
}

/**
 * Sotto il totale del riepilogo di sezione: il selettore dell'aliquota di
 * sezione e, solo se la sezione ne usa più di una, una riga «IVA x%» per
 * aliquota con la sua quota d'imponibile e l'imposta, come nel PDF.
 */
export function IvaSezione({ sezione, iva }: Readonly<{ sezione: SezioneConIva; iva: SezioneIva }>) {
  const setAliquotaIvaSezione = useQuoteStore((s) => s.setAliquotaIvaSezione)
  const { righe } = calcIva([iva])
  return (
    <div className="space-y-1">
      <SelettoreAliquotaIva
        label="IVA"
        value={iva.aliquota}
        onChange={(a) => {
          if (a !== undefined) setAliquotaIvaSezione(sezione, a)
        }}
      />
      {righe.length > 1 &&
        righe.map((r) => (
          <div key={r.aliquota} className="flex items-center justify-between text-xs text-ink-tertiary">
            <span className="tabular-nums">
              IVA {r.aliquota}% su € {formatEur(r.imponibile)}
            </span>
            <span className="font-mono tabular-nums">€ {formatEur(r.imposta)}</span>
          </div>
        ))}
    </div>
  )
}
