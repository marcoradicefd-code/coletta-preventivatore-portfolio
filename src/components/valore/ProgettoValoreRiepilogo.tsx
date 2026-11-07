import { useMemo } from 'react'
import { useQuoteStore } from '@/store/quoteStore'
import { FALLBACK_PROGETTO_VALORE } from '@/store/quoteFallbacks'
import { calcProgettoValore } from '@/engine/calcProgettoValore'
import { TotalDisplay } from '@/components/layout/TotalDisplay'
import { IvaSezione } from '@/components/shared/SelettoreIva'
import { useBloccoPdf } from '@/hooks/useBloccoPdf'
import { formatEur, formatPercent, percentualePerCampo } from '@/utils/format'
import { CampoNumero } from '@/components/shared/CampoNumero'

// Riepilogo della sezione "Progetto a valore": subtotale → sconto sezione →
// totale. Niente quota progettazione (solo arredi/cucine) né montaggio
// (document-level). Gate PDF identico alle altre sezioni (cliente + righe > 0).

export function ProgettoValoreRiepilogo() {
  const quote = useQuoteStore((s) => s.sezioni.progettoValore ?? FALLBACK_PROGETTO_VALORE)
  const setScontoSezione = useQuoteStore((s) => s.setScontoSezione)
  const blocco = useBloccoPdf()

  const result = useMemo(
    () => calcProgettoValore(quote.righe, quote.sconto),
    [quote.righe, quote.sconto]
  )

  return (
    <div className="glass-panel xl:sticky-sotto-barra rounded-xl p-6 space-y-5">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-ink-tertiary">
        Riepilogo Progetto a valore
      </h3>

      {quote.righe.length === 0 && (
        <p className="text-sm text-ink-tertiary py-4 text-center">
          Nessuna voce. Aggiungine una dalla colonna a sinistra.
        </p>
      )}

      <div className="space-y-2">
        <Row label="Subtotale" value={result.subtotale} />

        {/* Sconto sezione — input % libero, wired a setScontoSezione('progettoValore', …);
            lo store clampa la frazione [0,1]. */}
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="sconto-valore" className="text-sm text-ink-secondary">Sconto</label>
          <div className="flex items-center gap-1">
            <CampoNumero
              id="sconto-valore"
              min={0}
              max={100}
              step={1}
              value={percentualePerCampo(quote.sconto)}
              onChange={(e) => {
                const pct = parseFloat(e.target.value)
                setScontoSezione('progettoValore', Number.isFinite(pct) ? pct / 100 : 0)
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

      {/* Totale */}
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-ink-tertiary mb-1">
          Totale Progetto a valore
        </p>
        <TotalDisplay value={result.totale} />
        <p className="text-xs text-ink-tertiary mt-1">IVA esclusa</p>
      </div>

      {/* Aliquota di sezione e, con più aliquote, la quota di ognuna (L18). */}
      <IvaSezione sezione="progettoValore" iva={{ totale: result.totale, aliquota: quote.aliquotaIva }} />

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
