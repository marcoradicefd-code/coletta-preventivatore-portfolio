import { useCallback } from 'react'
import { useQuoteStore } from '@/store/quoteStore'
import { usePricelistStore } from '@/store/pricelistStore'
import { FALLBACK_GRES } from '@/store/quoteFallbacks'
import { CurrencyCell } from '@/components/shared/CurrencyCell'
import { importoRiga } from '@/engine/calcMarmeria'
import { QtyInput } from '@/components/shared/QtyInput'
import { formatQuantita } from '@/utils/format'

const EMPTY_ARR: never[] = []

export function LavorazioniVarieTable() {
  const lavorazioniRaw = usePricelistStore((s) => s.marmeria?.lavorazioniVarie)
  const lavorazioni = lavorazioniRaw ?? EMPTY_ARR
  const tipologia = useQuoteStore((s) => (s.sezioni.gres ?? FALLBACK_GRES).tipologiaMateriale)
  const righeVarie = useQuoteStore((s) => (s.sezioni.gres ?? FALLBACK_GRES).righeVarie)
  const addRiga = useQuoteStore((s) => s.addRigaVaria)
  const updateRiga = useQuoteStore((s) => s.updateRigaVaria)
  const removeRiga = useQuoteStore((s) => s.removeRigaVaria)

  const handleQtyChange = useCallback(
    (descrizione: string, prezzoUnit: number, um: string, qta: number) => {
      const idx = righeVarie.findIndex((r) => r.descrizione === descrizione)
      if (idx >= 0) {
        if (qta <= 0) {
          removeRiga(idx)
        } else {
          updateRiga(idx, { qta, totale: qta * prezzoUnit })
        }
      } else if (qta > 0) {
        addRiga({ descrizione, um, qta, prezzoUnit, totale: qta * prezzoUnit })
      }
    },
    [righeVarie, addRiga, updateRiga, removeRiga]
  )

  // Come nel bordo: righe che il listino non conosce più, elencate in coda (A2).
  const orfane = righeVarie
    .map((r, idx) => ({ r, idx }))
    .filter(({ r }) => !lavorazioni.some((l) => l.descrizione === r.descrizione))

  if (lavorazioni.length === 0 && orfane.length === 0) return null

  return (
    <div className="rounded-lg bg-surface-secondary border border-separator-opaque shadow-apple-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-separator-opaque bg-brand-navy/[0.03]">
        <h4 className="text-sm font-semibold text-ink-primary">Sezione 5: Lavorazioni varie</h4>
        <p className="text-xs text-ink-tertiary mt-0.5">Fori, lavelli, fresature e altre lavorazioni</p>
      </div>

      <div className="overflow-x-auto"><table className="w-full min-w-[520px]">
        <thead>
          <tr className="bg-brand-navy text-white">
            <th className="text-left px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.04em]">Lavorazione</th>
            <th className="text-right px-3 py-3 text-[12px] font-semibold uppercase tracking-[0.04em] w-24">€/pz</th>
            <th className="text-right px-3 py-3 text-[12px] font-semibold uppercase tracking-[0.04em] w-24">Qtà</th>
            <th className="text-right px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.04em] w-28">Totale</th>
          </tr>
        </thead>
        <tbody>
          {lavorazioni.map((lav, i) => {
            const prezzoUnit = lav.prezzoPerTipologia[tipologia]
            const isDisabled = prezzoUnit === null || prezzoUnit === 0
            const rigaStore = righeVarie.find((r) => r.descrizione === lav.descrizione)
            const qta = rigaStore?.qta ?? 0
            // Come nel bordo: totale dal prezzo LIVE, non da `rigaStore.totale`
            // (che l'engine ignora — A4 + NEW-001), con la funzione dell'engine (D4).
            const totale = importoRiga(qta, prezzoUnit ?? 0)
            // La riga scelta tiene il suo fondo anche sotto il mouse: l'hover è per le altre.
            const sfondo = i % 2 === 0 ? 'bg-surface-secondary' : 'bg-surface-tertiary/50'
            const hover = isDisabled || qta > 0 ? '' : 'hover:bg-hover-voce'

            return (
              <tr
                key={lav.descrizione}
                className={`border-b border-separator-opaque transition-colors duration-100
                  ${isDisabled ? 'opacity-40' : ''} ${hover}
                  ${qta > 0 ? 'bg-voce-selezionata' : sfondo}`}
              >
                <td className="px-4 py-3 text-sm text-ink-primary">{lav.descrizione}</td>
                <td className="px-3 py-3 text-right">
                  {isDisabled ? (
                    <span className="text-xs text-ink-disabled">N/D</span>
                  ) : (
                    <CurrencyCell value={prezzoUnit!} showZero className="text-sm text-ink-secondary" />
                  )}
                </td>
                <td className="px-3 py-3 text-right">
                  {!isDisabled && (
                    <QtyInput context="marmeria"
                      value={qta}
                      onChange={(v) => handleQtyChange(lav.descrizione, prezzoUnit!, lav.unitaMisura, v)}
                      unitaMisura="PEZZO"
                    />
                  )}
                  {isDisabled && qta > 0 && (
                    <button
                      type="button"
                      onClick={() => removeRiga(righeVarie.findIndex((r) => r.descrizione === lav.descrizione))}
                      aria-label={`Togli ${lav.descrizione}`}
                      className="text-xs font-medium text-brand-red hover:underline"
                    >
                      Togli
                    </button>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {isDisabled && qta > 0 ? (
                    <span className="text-xs text-ink-tertiary">{formatQuantita(qta)} pz · da definire</span>
                  ) : (
                    <CurrencyCell
                      value={totale}
                      className={`text-sm ${totale > 0 ? 'font-semibold text-brand-red' : 'text-ink-disabled'}`}
                    />
                  )}
                </td>
              </tr>
            )
          })}
          {orfane.map(({ r, idx }) => (
            <tr key={`orfana-${idx}`} className="border-b border-separator-opaque">
              <td className="px-4 py-3 text-sm text-ink-primary">
                {r.descrizione}
                <span className="block text-xs text-ink-tertiary">non più nel listino — da definire</span>
              </td>
              <td className="px-3 py-3 text-right text-xs text-ink-disabled">—</td>
              <td className="px-3 py-3 text-right">
                <button
                  type="button"
                  onClick={() => removeRiga(idx)}
                  aria-label={`Togli ${r.descrizione}`}
                  className="text-xs font-medium text-brand-red hover:underline"
                >
                  Togli
                </button>
              </td>
              <td className="px-4 py-3 text-right text-xs text-ink-tertiary">{formatQuantita(r.qta)} pz · da definire</td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  )
}
