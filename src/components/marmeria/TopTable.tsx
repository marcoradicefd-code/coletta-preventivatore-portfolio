import { useCallback } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Trash2 } from 'lucide-react'
import { useQuoteStore } from '@/store/quoteStore'
import { usePricelistStore } from '@/store/pricelistStore'
import { FALLBACK_GRES } from '@/store/quoteFallbacks'
import { CurrencyCell } from '@/components/shared/CurrencyCell'
import { importoRiga } from '@/engine/calcMarmeria'
import { QtyInput } from '@/components/shared/QtyInput'

const EMPTY_ARR: never[] = []
import { listItemVariants } from '@/styles/variants'
import type { RigaMateriale } from '@/types/marmeria'

export function TopTable() {
  const righe = useQuoteStore((s) => (s.sezioni.gres ?? FALLBACK_GRES).righeMateriali)
  const updateRiga = useQuoteStore((s) => s.updateRigaMateriale)
  const removeRiga = useQuoteStore((s) => s.removeRigaMateriale)
  const materialiRaw = usePricelistStore((s) => s.marmeria?.materiali)
  const materiali = materialiRaw ?? EMPTY_ARR

  const handleQtyChange = useCallback(
    (id: string, qtaMq: number) => {
      const riga = righe.find((r) => r.id === id)
      if (!riga) return
      updateRiga(id, { qtaMq, totale: qtaMq * riga.prezzoMq })
    },
    [righe, updateRiga]
  )

  if (righe.length === 0) return null

  return (
    <div className="rounded-lg bg-surface-secondary border border-separator-opaque shadow-apple-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-separator-opaque bg-brand-navy/[0.03]">
        <h4 className="text-sm font-semibold text-ink-primary">
          Sezione 1: Top — Schienali — Fianchi
        </h4>
        <p className="text-xs text-ink-tertiary mt-0.5">Solo materiali, lavorazioni escluse — Quotazioni al MQ</p>
      </div>

      <div className="overflow-x-auto"><table className="w-full min-w-[680px]">
        <thead>
          <tr className="bg-brand-navy text-white">
            <th className="text-left px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.04em]">Materiale</th>
            <th className="text-center px-3 py-3 text-[12px] font-semibold uppercase tracking-[0.04em] w-16">mm</th>
            <th className="text-center px-3 py-3 text-[12px] font-semibold uppercase tracking-[0.04em] w-20">Fascia</th>
            <th className="text-right px-3 py-3 text-[12px] font-semibold uppercase tracking-[0.04em] w-24">€/mq</th>
            <th className="text-right px-3 py-3 text-[12px] font-semibold uppercase tracking-[0.04em] w-24">Qtà mq</th>
            <th className="text-right px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.04em] w-28">Totale</th>
            <th className="w-10" />
          </tr>
        </thead>
        <tbody>
          <AnimatePresence>
            {righe.map((riga) => {
              const mat = materiali.find((m) => m.coloreFinituraCompleto === riga.materialeKey)

              return (
                <RigaRow
                  key={riga.id}
                  riga={riga}
                  materialeLabel={mat ? `${mat.produttore} — ${mat.colore}` : riga.materialeKey}
                  onQtyChange={handleQtyChange}
                  onRemove={removeRiga}
                />
              )
            })}
          </AnimatePresence>
        </tbody>
      </table></div>
    </div>
  )
}

const FASCIA_SHORT: Record<string, string> = {
  fino62: '≤62',
  '63a70': '63–70',
  oltre70: '>70',
}

function RigaRow({
  riga,
  materialeLabel,
  onQtyChange,
  onRemove,
}: {
  riga: RigaMateriale
  materialeLabel: string
  onQtyChange: (id: string, qty: number) => void
  onRemove: (id: string) => void
}) {
  // L'importo dell'engine (euro intero, D4), non `riga.totale` persistito.
  const importo = importoRiga(riga.qtaMq, riga.prezzoMq)
  return (
    <motion.tr
      variants={listItemVariants}
      initial="hidden"
      animate="visible"
      exit={{ opacity: 0, x: 20, transition: { duration: 0.15 } }}
      layout
      className={`border-b border-separator-opaque transition-colors duration-100 ${riga.qtaMq > 0 ? 'bg-voce-selezionata' : 'hover:bg-hover-voce'}`}
      style={{ minHeight: 52 }}
    >
      <td className="px-4 py-3">
        <p className="text-sm text-ink-primary">{materialeLabel}</p>
        <p className="text-xs text-ink-tertiary">{riga.materialeKey}</p>
      </td>
      <td className="px-3 py-3 text-center text-sm text-ink-secondary">{riga.spessore}</td>
      <td className="px-3 py-3 text-center">
        <span className="inline-flex rounded-full bg-brand-navy/8 px-2.5 py-1 text-xs font-semibold text-brand-navy">
          {FASCIA_SHORT[riga.fascia] ?? riga.fascia}
        </span>
      </td>
      <td className="px-3 py-3 text-right">
        <CurrencyCell value={riga.prezzoMq} showZero className="text-sm text-ink-secondary" />
      </td>
      <td className="px-3 py-3 text-right">
        <QtyInput context="marmeria"
          value={riga.qtaMq}
          onChange={(v) => onQtyChange(riga.id, v)}
          unitaMisura="MQ"
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
          onClick={() => onRemove(riga.id)}
          className="flex h-9 w-9 items-center justify-center rounded-xs text-ink-disabled hover:text-error hover:bg-error-bg transition-colors duration-150"
          aria-label="Rimuovi riga"
        >
          <Trash2 className="h-4 w-4" strokeWidth={1.5} />
        </button>
      </td>
    </motion.tr>
  )
}
