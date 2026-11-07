import { useQuoteStore } from '@/store/quoteStore'
import { usePricelistStore } from '@/store/pricelistStore'
import { FALLBACK_GRES } from '@/store/quoteFallbacks'
import { VASCA_DESCRIZIONE } from '@/data/gres/vascaGres'
import { CampoNumero } from '@/components/shared/CampoNumero'

/**
 * Vasca integrata in gres: voce a corpo, singola, opzionale.
 *
 * Il prezzo è commerciale di Coletta, non di De Bari — vedi `@/data/gres/vascaGres`:
 * il default viene dal listino cucine, entra nella voce alla prima inclusione
 * (snapshot in `setVasca`) e da lì è editabile per questo preventivo. Senza quel
 * prezzo la casella è disattivata col motivo (opzione A, PR 10b-2); una vasca già
 * inclusa resta com'è, col suo prezzo.
 */
export function VascaGres() {
  const vasca = useQuoteStore((s) => (s.sezioni.gres ?? FALLBACK_GRES).vasca)
  const setVasca = useQuoteStore((s) => s.setVasca)
  const listinoCucine = usePricelistStore((s) => s.cucine)

  const inclusa = vasca?.inclusa ?? false
  // Prima inclusione senza un prezzo di default: non si può includere.
  let motivoDisattivata: string | null = null
  if (!vasca && !listinoCucine) motivoDisattivata = 'Listino Cucine non caricato: il prezzo della vasca viene da lì.'
  else if (!vasca && listinoCucine?.vascaGres == null) motivoDisattivata = 'Il listino cucine non ha il prezzo della vasca.'

  return (
    <div className="rounded-lg bg-surface-secondary border border-separator-opaque shadow-apple-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-separator-opaque bg-brand-navy/[0.03]">
        <h4 className="text-sm font-semibold text-ink-primary">Sezione 6: Vasca</h4>
        <p className="text-xs text-ink-tertiary mt-0.5">
          Voce a corpo — il prezzo è modificabile per questo preventivo
        </p>
      </div>

      <div className="p-5 flex flex-wrap items-center justify-between gap-4">
        <label className={`flex items-center gap-2 select-none ${motivoDisattivata ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
          <input
            type="checkbox"
            checked={inclusa}
            disabled={motivoDisattivata !== null}
            onChange={(e) => setVasca({ inclusa: e.target.checked })}
            className="h-4 w-4 rounded border-separator-opaque text-brand-red accent-brand-red"
          />
          <span className="text-sm text-ink-primary">{VASCA_DESCRIZIONE}</span>
        </label>

        {inclusa && (
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-ink-tertiary">€</span>
            <CampoNumero
              min={0}
              step="any"
              value={vasca?.prezzo}
              aria-label="Prezzo vasca"
              onChange={(e) => {
                const v = parseFloat(e.target.value)
                setVasca({ prezzo: Number.isFinite(v) && v >= 0 ? v : 0 })
              }}
              className="w-28 rounded-sm border border-separator-opaque bg-surface-tertiary px-2 py-1.5 text-sm text-ink-primary tabular-nums text-right
                focus:border-accent focus:ring-2 focus:ring-accent-light focus:outline-none"
            />
          </div>
        )}
      </div>
      {motivoDisattivata && <p className="px-5 pb-4 text-xs text-ink-tertiary">{motivoDisattivata}</p>}
    </div>
  )
}
