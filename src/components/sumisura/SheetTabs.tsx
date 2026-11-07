import { motion } from 'motion/react'
import { MOTION } from '@/styles/motion'
import type { FoglioSuMisura } from '@/types/sumisura'

interface SheetTabsProps {
  fogli: FoglioSuMisura[]
  activeFoglio: string
  onSelect: (nome: string) => void
}

export function SheetTabs({ fogli, activeFoglio, onSelect }: SheetTabsProps) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-separator-opaque">
      {fogli.map((foglio) => {
        const isActive = foglio.nome === activeFoglio
        return (
          <button
            key={foglio.nome}
            onClick={() => onSelect(foglio.nome)}
            className={`relative shrink-0 whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-all duration-150 rounded-t-sm ${
              isActive ? 'text-brand-red' : 'text-ink-tertiary hover:text-ink-secondary hover:bg-brand-navy/[0.03]'
            }`}
            style={{ minHeight: 44 }}
          >
            {foglio.nome}
            {isActive && (
              <motion.div
                layoutId="sheet-tab-indicator"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-red"
                transition={MOTION.springGentle}
              />
            )}
          </button>
        )
      })}
    </div>
  )
}
