import { useMemo } from 'react'
import { useQuoteStore } from '@/store/quoteStore'
import { usePricelistStore } from '@/store/pricelistStore'
import { FALLBACK_GRES } from '@/store/quoteFallbacks'
import { calcMarmeria, type ResultMarmeria } from '@/engine/calcMarmeria'
import { TotalDisplay } from '@/components/layout/TotalDisplay'
import { IvaSezione } from '@/components/shared/SelettoreIva'
import { TipologiaSelector } from './TipologiaSelector'
import { formatEur, formatPercent } from '@/utils/format'
import { includiNotePagamentoDi, testoNotePagamentoDi } from '@/store/quoteSelectors'

export function MarmeriaRiepilogo() {
  const listino = usePricelistStore((s) => s.marmeria)
  const quote = useQuoteStore((s) => s.sezioni.gres ?? FALLBACK_GRES)
  const preventivo = useQuoteStore((s) => s.preventivo)
  const includiCondizioni = preventivo.includiCondizioni
  const arredi = useQuoteStore((s) => s.sezioni.arredi)
  // Document-level come le condizioni: da qui si governa l'intero documento,
  // anche in un preventivo che di arredi non ne ha.
  const includiNotePagamento = includiNotePagamentoDi(preventivo, arredi)
  const setIncludiNotePagamento = useQuoteStore((s) => s.setIncludiNotePagamento)
  const setNotePagamento = useQuoteStore((s) => s.setNotePagamento)
  const setSconto = useQuoteStore((s) => s.setSconto)
  const setIncludiRilMont = useQuoteStore((s) => s.setIncludiRilMont)
  const setIncludiCondizioni = useQuoteStore((s) => s.setIncludiCondizioni)

  const result: ResultMarmeria | null = useMemo(() => {
    if (!listino) return null
    return calcMarmeria(listino, quote)
  }, [listino, quote])


  if (!listino || !result) return null


  return (
    <div
      className="glass-panel xl:sticky-sotto-barra rounded-xl p-6 space-y-5"
    >
      <h3 className="text-sm font-semibold uppercase tracking-wider text-ink-tertiary">
        Riepilogo Gres
      </h3>

      {/* Tipologia selector */}
      {/* Tipologia — sincronizzato con il selettore nel contenuto principale */}
      <TipologiaSelector />

      {/* Subtotals */}
      <div className="space-y-2">
        <Row label="Materiali" value={result.totMateriali} />
        {result.integrazioneMinimo > 0 && (
          <Row label="Integrazione ordine minimo 2 mq" value={result.integrazioneMinimo} />
        )}
        <Row label="Alzatine" value={result.totAlzatine} />
        <Row label="Lavorazioni bordo" value={result.totLavorazioniBordo} />
        <Row label="Lavorazioni varie" value={result.totLavorazioniVarie} />
        {/* Voce opzionale → riga condizionale, come sconto e rilievo+montaggio qui
            sotto (i 4 subtotali sopra sono l'anatomia fissa del preventivo gres). */}
        {result.totVasca > 0 && <Row label="Vasca" value={result.totVasca} />}
      </div>

      <div className="h-px bg-separator-opaque" />

      <Row label="Totale lordo" value={result.totLordo} bold />

      {/* Sconto */}
      <div className="space-y-1">
        <label className="block text-xs font-medium uppercase tracking-wider text-ink-tertiary">
          Sconto
        </label>
        <select
          value={quote.sconto}
          onChange={(e) => {
            const v = parseFloat(e.target.value)
            setSconto(Number.isFinite(v) ? v : 0)
          }}
          className="w-full rounded-sm border border-separator-opaque bg-surface-tertiary px-3 py-2 text-sm text-ink-primary
            focus:border-accent focus:ring-2 focus:ring-accent-light focus:outline-none"
        >
          {listino.scontiDisponibili.map((s) => (
            <option key={s} value={s}>
              {formatPercent(s)}
            </option>
          ))}
        </select>
      </div>

      {result.sconto > 0 && (
        <Row label={`Sconto (${formatPercent(quote.sconto)})`} value={-result.sconto} />
      )}

      <Row label="Totale scontato" value={result.totScontato} bold />

      {/* Rilievo e montaggio */}
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={quote.includiRilMont}
          onChange={(e) => setIncludiRilMont(e.target.checked)}
          className="h-4 w-4 rounded border-separator-opaque text-brand-red accent-brand-red"
        />
        <span className="text-sm text-ink-secondary">Includi rilievo e montaggio</span>
      </label>

      {quote.includiRilMont && result.costoRilMont > 0 && (
        <Row label="Rilievo + montaggio" value={result.costoRilMont} />
      )}

      <div className="h-px bg-separator-opaque" />

      {/* Totale finale */}
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-ink-tertiary mb-1">
          Totale Gres
        </p>
        <TotalDisplay value={result.totaleFinale} />
        <p className="text-xs text-ink-tertiary mt-1">IVA esclusa</p>
      </div>

      {/* Aliquota di sezione e, con più aliquote, la quota di ognuna (L18). */}
      <IvaSezione sezione="gres" iva={{ totale: result.totaleFinale, aliquota: quote.aliquotaIva }} />

      <div className="h-px bg-separator-opaque" />

      {/* Opzioni PDF — il flag condizioni è document-level (condiviso con Su Misura) */}
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={includiCondizioni}
          onChange={(e) => setIncludiCondizioni(e.target.checked)}
          className="h-4 w-4 rounded border-separator-opaque text-brand-red accent-brand-red"
        />
        <span className="text-sm text-ink-secondary">Includi condizioni contrattuali</span>
      </label>

      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={includiNotePagamento}
          onChange={(e) => setIncludiNotePagamento(e.target.checked)}
          className="h-4 w-4 rounded border-separator-opaque text-brand-red accent-brand-red"
        />
        <span className="text-sm text-ink-secondary">Includi note pagamento</span>
      </label>
      {includiNotePagamento && (
        <textarea
          value={testoNotePagamentoDi(preventivo)}
          onChange={(e) => setNotePagamento(e.target.value)}
          rows={2}
          aria-label="Testo note pagamento"
          className="w-full rounded-sm border border-separator-opaque bg-surface-tertiary px-3 py-2 text-sm text-ink-primary focus:border-accent focus:ring-2 focus:ring-accent-light focus:outline-none resize-none"
        />
      )}

      {/* «Genera Preventivo» sta nella barra del preventivo, sempre in vista (L21-B): un solo primario per vista. */}
    </div>
  )
}

function Row({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  const isNegative = value < 0
  return (
    <div className="flex items-center justify-between">
      <span className={`text-sm ${bold ? 'font-semibold text-ink-primary' : 'text-ink-secondary'}`}>
        {label}
      </span>
      <span
        className={`font-mono text-sm tabular-nums ${
          bold ? 'font-semibold text-ink-primary' : isNegative ? 'text-brand-red' : 'text-ink-primary'
        }`}
      >
        {isNegative ? '- ' : ''}€ {formatEur(Math.abs(value))}
      </span>
    </div>
  )
}
