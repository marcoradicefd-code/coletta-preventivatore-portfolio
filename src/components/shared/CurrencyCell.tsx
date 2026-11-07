import { formatEur } from '@/utils/format'

interface CurrencyCellProps {
  value: number
  className?: string
  showZero?: boolean
}

export function CurrencyCell({ value, className = '', showZero = false }: CurrencyCellProps) {
  if (!showZero && value === 0) {
    return <span className={`font-mono tabular-nums text-ink-disabled ${className}`}>—</span>
  }

  return (
    <span className={`font-mono tabular-nums ${className}`}>
      € {formatEur(value)}
    </span>
  )
}
