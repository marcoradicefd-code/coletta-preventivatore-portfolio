import { useMemo } from 'react'
import { useQuoteStore } from '@/store/quoteStore'
import { usePricelistStore } from '@/store/pricelistStore'
import { FALLBACK_PORTE } from '@/store/quoteFallbacks'
import { calcPorte } from '@/engine/calcPorte'
import { TotalDisplay } from '@/components/layout/TotalDisplay'
import { IvaSezione } from '@/components/shared/SelettoreIva'
import { sezioneIvaPorte } from '@/engine/iva'
import { useBloccoPdf } from '@/hooks/useBloccoPdf'
import { formatEur, formatPercent, percentualePerCampo } from '@/utils/format'
import { CampoNumero } from '@/components/shared/CampoNumero'

// Riepilogo della sezione Porte: subtotale → sconto sezione → totale. Prezzi
// risolti da `calcPorte(sezione, listino)` (il listino da pricelistStore, come il
// gres). Gate PDF identico alle altre sezioni (cliente + righe > 0).

export function PorteRiepilogo() {
  const quote = useQuoteStore((s) => s.sezioni.porte ?? FALLBACK_PORTE)
  const listino = usePricelistStore((s) => s.porte)
  const setScontoSezione = useQuoteStore((s) => s.setScontoSezione)
  const blocco = useBloccoPdf()

  const result = useMemo(() => calcPorte(quote, listino), [quote, listino])

  return (
    <div className="glass-panel xl:sticky-sotto-barra rounded-xl p-6 space-y-5">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-ink-tertiary">
        Riepilogo Porte
      </h3>

      {quote.righe.length === 0 && (
        <p className="text-sm text-ink-tertiary py-4 text-center">
          Nessuna porta. Aggiungine una dalla colonna a sinistra.
        </p>
      )}

      <div className="space-y-2">
        <Row label="Subtotale" value={result.subtotale} />

        {/* Sconto sezione — input % libero, wired a setScontoSezione('porte', …);
            lo store clampa la frazione [0,1]. */}
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="sconto-porte" className="text-sm text-ink-secondary">Sconto</label>
          <div className="flex items-center gap-1">
            <CampoNumero
              id="sconto-porte"
              min={0}
              max={100}
              step={1}
              value={percentualePerCampo(quote.sconto)}
              onChange={(e) => {
                const pct = parseFloat(e.target.value)
                setScontoSezione('porte', Number.isFinite(pct) ? pct / 100 : 0)
              }}
              className="w-16 rounded-sm border border-separator-opaque bg-surface-tertiary px-2 py-1 text-sm text-ink-primary tabular-nums text-right focus:border-accent focus:ring-2 focus:ring-accent-light focus:outline-none"
            />
            <span className="text-sm text-ink-tertiary">%</span>
          </div>
        </div>
        {result.sconto > 0 && (
          <Row label={`Sconto (${formatPercent(quote.sconto)})`} value={-result.sconto} />
        )}
      </div>

      <div className="h-px bg-separator-opaque" />

      {/* Totale: con righe fuori dal subtotale si dice parziale, come nel PDF. */}
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-ink-tertiary mb-1">
          {result.daDefinire > 0 ? 'Totale parziale Porte' : 'Totale Porte'}
        </p>
        <TotalDisplay value={result.totale} />
        <p className="text-xs text-ink-tertiary mt-1">IVA esclusa</p>
      </div>

      {/* Aliquota di sezione e, con più aliquote, la quota di ognuna (L18). */}
      <IvaSezione sezione="porte" iva={sezioneIvaPorte(quote, result)} />

      {blocco.motivo && (
        <p role="alert" className="text-[12px] text-error text-center">{blocco.motivo}</p>
      )}
      {/* «Genera Preventivo» sta nella barra del preventivo, sempre in vista (L21-B): un solo primario per vista. */}
    </div>
  )
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-ink-secondary">{label}</span>
      <span className="font-mono text-sm tabular-nums text-ink-primary">€ {formatEur(value)}</span>
    </div>
  )
}
