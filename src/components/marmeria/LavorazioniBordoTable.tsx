import { useCallback } from 'react'
import { useQuoteStore } from '@/store/quoteStore'
import { usePricelistStore } from '@/store/pricelistStore'
import { FALLBACK_GRES } from '@/store/quoteFallbacks'
import { CurrencyCell } from '@/components/shared/CurrencyCell'
import { importoRiga } from '@/engine/calcMarmeria'
import { QtyInput } from '@/components/shared/QtyInput'
import { formatQuantita } from '@/utils/format'
import type { TipologiaMateriale } from '@/types/marmeria'

const EMPTY_ARR: never[] = []

export function LavorazioniBordoTable() {
  const lavorazioniRaw = usePricelistStore((s) => s.marmeria?.lavorazioniBordo)
  const lavorazioni = lavorazioniRaw ?? EMPTY_ARR
  const tipologia = useQuoteStore((s) => (s.sezioni.gres ?? FALLBACK_GRES).tipologiaMateriale)
  const righeLav = useQuoteStore((s) => (s.sezioni.gres ?? FALLBACK_GRES).righeLavorazioniBordo)
  const addRiga = useQuoteStore((s) => s.addRigaLavorazioneBordo)
  const updateRiga = useQuoteStore((s) => s.updateRigaLavorazioneBordo)
  const removeRiga = useQuoteStore((s) => s.removeRigaLavorazioneBordo)

  const handleQtyChange = useCallback(
    (lavorazioneId: number, prezzoMl: number, qtaMl: number) => {
      const existing = righeLav.find((r) => r.lavorazioneId === lavorazioneId)
      if (existing) {
        if (qtaMl <= 0) {
          removeRiga(lavorazioneId)
        } else {
          updateRiga(lavorazioneId, { qtaMl, totale: qtaMl * prezzoMl })
        }
      } else if (qtaMl > 0) {
        addRiga({ lavorazioneId, qtaMl, prezzoMl, totale: qtaMl * prezzoMl })
      }
    },
    [righeLav, addRiga, updateRiga, removeRiga]
  )

  // Righe che il listino non conosce più (id spostato, listino nuovo): non hanno
  // una riga del listino in cui comparire, quindi le elenco in coda (A2).
  const orfane = righeLav.filter((r) => !lavorazioni.some((l) => l.id === r.lavorazioneId))

  if (lavorazioni.length === 0 && orfane.length === 0) return null

  return (
    <div className="rounded-lg bg-surface-secondary border border-separator-opaque shadow-apple-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-separator-opaque bg-brand-navy/[0.03]">
        <h4 className="text-sm font-semibold text-ink-primary">Sezione 4: Lavorazioni bordo</h4>
        <p className="text-xs text-ink-tertiary mt-0.5">
          Prezzi per tipologia: <TipologiaBadge tipologia={tipologia} />
        </p>
      </div>

      <div className="overflow-x-auto"><table className="w-full min-w-[520px]">
        <thead>
          <tr className="bg-brand-navy text-white">
            <th className="text-left px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.04em]">Lavorazione</th>
            <th className="text-right px-3 py-3 text-[12px] font-semibold uppercase tracking-[0.04em] w-24">€/ml</th>
            <th className="text-right px-3 py-3 text-[12px] font-semibold uppercase tracking-[0.04em] w-24">Qtà ml</th>
            <th className="text-right px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.04em] w-28">Totale</th>
          </tr>
        </thead>
        <tbody>
          {lavorazioni.map((lav, i) => {
            const prezzoMl = lav.prezzoMlPerTipologia[tipologia]
            const isDisabled = prezzoMl === null || prezzoMl === 0
            const rigaStore = righeLav.find((r) => r.lavorazioneId === lav.id)
            const qtaMl = rigaStore?.qtaMl ?? 0
            // Totale ricalcolato dal prezzo LIVE qui sopra, non da `rigaStore.totale`:
            // calcMarmeria ri-legge il prezzo dal listino (A4 + NEW-001), quindi un
            // totale memorizzato divergerebbe dal totale di sezione appena il listino
            // cambia. Stessa funzione dell'engine (euro intero, D4), stessa fonte del prezzo.
            const totale = importoRiga(qtaMl, prezzoMl ?? 0)
            // La riga scelta tiene il suo fondo anche sotto il mouse: l'hover è per le altre.
            const sfondo = i % 2 === 0 ? 'bg-surface-secondary' : 'bg-surface-tertiary/50'
            const hover = isDisabled || qtaMl > 0 ? '' : 'hover:bg-hover-voce'

            return (
              <tr
                key={lav.id}
                className={`border-b border-separator-opaque transition-colors duration-100
                  ${isDisabled ? 'opacity-40' : ''} ${hover}
                  ${qtaMl > 0 ? 'bg-voce-selezionata' : sfondo}`}
              >
                <td className="px-4 py-3 text-sm text-ink-primary">{lav.descrizione}</td>
                <td className="px-3 py-3 text-right">
                  {isDisabled ? (
                    <span className="text-xs text-ink-disabled">N/D</span>
                  ) : (
                    <CurrencyCell value={prezzoMl!} showZero className="text-sm text-ink-secondary" />
                  )}
                </td>
                <td className="px-3 py-3 text-right">
                  {!isDisabled && (
                    <QtyInput context="marmeria"
                      value={qtaMl}
                      onChange={(v) => handleQtyChange(lav.id, prezzoMl!, v)}
                      unitaMisura="ML"
                    />
                  )}
                  {/* N/D ma con quantità (listino arrivato dopo il cambio tipologia):
                      «da definire» nel PDF, e qui si può togliere (A2). */}
                  {isDisabled && qtaMl > 0 && (
                    <button
                      type="button"
                      onClick={() => removeRiga(lav.id)}
                      aria-label={`Togli ${lav.descrizione}`}
                      className="text-xs font-medium text-brand-red hover:underline"
                    >
                      Togli
                    </button>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {isDisabled && qtaMl > 0 ? (
                    <span className="text-xs text-ink-tertiary">{formatQuantita(qtaMl)} ml · da definire</span>
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
          {orfane.map((r) => (
            <tr key={`orfana-${r.lavorazioneId}`} className="border-b border-separator-opaque">
              <td className="px-4 py-3 text-sm text-ink-primary">
                Lavorazione #{r.lavorazioneId}
                <span className="block text-xs text-ink-tertiary">non più nel listino — da definire</span>
              </td>
              <td className="px-3 py-3 text-right text-xs text-ink-disabled">—</td>
              <td className="px-3 py-3 text-right">
                <button
                  type="button"
                  onClick={() => removeRiga(r.lavorazioneId)}
                  aria-label={`Togli Lavorazione #${r.lavorazioneId}`}
                  className="text-xs font-medium text-brand-red hover:underline"
                >
                  Togli
                </button>
              </td>
              <td className="px-4 py-3 text-right text-xs text-ink-tertiary">{formatQuantita(r.qtaMl)} ml · da definire</td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  )
}

function TipologiaBadge({ tipologia }: { tipologia: TipologiaMateriale }) {
  const colors: Record<TipologiaMateriale, string> = {
    QUARZO: 'bg-brand-red-light text-brand-red',
    LAPITEC: 'bg-brand-navy/10 text-brand-navy',
    GRES: 'bg-brand-navy/10 text-brand-navy',
  }
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${colors[tipologia]}`}>
      {tipologia}
    </span>
  )
}
