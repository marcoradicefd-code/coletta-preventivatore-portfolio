import { Badge } from '@/components/shared/Badge'
import { fasciaFromProfondita } from '@/engine/calcMarmeria'
import type { FasciaProfondita } from '@/types/marmeria'
import { CampoNumero } from '@/components/shared/CampoNumero'

const FASCIA_LABELS: Record<FasciaProfondita, string> = {
  fino62: '≤ 62 cm',
  '63a70': '63–70 cm',
  oltre70: '> 70 cm',
}

interface DimensionInputProps {
  value: number
  onChange: (cm: number) => void
}

export function DimensionInput({ value, onChange }: DimensionInputProps) {
  const fascia = value > 0 ? fasciaFromProfondita(value) : null

  return (
    <div className="flex items-center gap-3">
      <div className="space-y-1">
        <label className="block text-xs font-medium uppercase tracking-wider text-ink-tertiary">
          Profondità top (cm)
        </label>
        <CampoNumero
          min={1}
          max={200}
          step={1}
          value={value}
          onChange={(e) => onChange(Math.max(0, parseInt(e.target.value) || 0))}
          placeholder="es. 60"
          className="w-28 rounded-sm border border-separator-opaque bg-surface-tertiary px-3 py-2 text-sm text-ink-primary
            transition-[border-color,box-shadow] duration-150
            focus:border-accent focus:ring-2 focus:ring-accent-light focus:outline-none
            [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
      </div>
      {fascia && (
        <div className="pt-5">
          <Badge um={FASCIA_LABELS[fascia]} />
        </div>
      )}
    </div>
  )
}
