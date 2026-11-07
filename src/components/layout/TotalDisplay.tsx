import { useEffect } from 'react'
import { useMotionValue, useSpring, useTransform, useReducedMotion, motion } from 'motion/react'
import { formatEur } from '@/utils/format'

interface TotalDisplayProps {
  value: number
  className?: string
}

export function TotalDisplay({ value, className = '' }: TotalDisplayProps) {
  const prefersReduced = useReducedMotion()
  const isSafe = Number.isFinite(value) && value <= 9_999_999
  const safeValue = isSafe ? value : 0

  const motionValue = useMotionValue(0)
  const spring = useSpring(motionValue, prefersReduced ? { stiffness: 1000, damping: 100 } : { stiffness: 100, damping: 20 })
  // `formatEur`, non `toLocaleString` a mano: senza `useGrouping: true` il CLDR
  // italiano non raggruppa sotto 10.000 → "1300,00" invece di "1.300,00", proprio
  // sul totale più in vista della sidebar (e il ramo `prefersReduced` qui sotto,
  // che già usava formatEur, mostrava un formato diverso a parità di importo).
  const display = useTransform(spring, (v) => formatEur(v))

  useEffect(() => {
    motionValue.set(safeValue)
  }, [safeValue, motionValue])

  if (!isSafe) {
    return (
      <div aria-live="polite" className={`font-display text-3xl text-ink-disabled ${className}`}>
        € —
      </div>
    )
  }

  if (prefersReduced) {
    return (
      <div aria-live="polite" className={`font-display text-3xl text-brand-red ${className}`}>
        € {formatEur(value)}
      </div>
    )
  }

  return (
    <div aria-live="polite" className={`font-display text-3xl text-brand-red ${className}`}>
      € <motion.span>{display}</motion.span>
    </div>
  )
}
