import { useMemo } from 'react'
import { useQuoteStore } from '@/store/quoteStore'
import { FALLBACK_ARREDI } from '@/store/quoteFallbacks'
import { calcSuMisuraArticoli } from '@/engine/calcSuMisura'
import { TotalDisplay } from '@/components/layout/TotalDisplay'
import { IvaSezione } from '@/components/shared/SelettoreIva'
import { sezioneIvaArredi } from '@/engine/iva'
import { useBloccoPdf } from '@/hooks/useBloccoPdf'
import { formatEur, formatPercent, percentualePerCampo } from '@/utils/format'
import { includiNotePagamentoDi, testoNotePagamentoDi } from '@/store/quoteSelectors'
import type { ArticoloSuMisura, Arredo } from '@/types/sumisura'
import { ElencoArticoli } from './ElencoArticoli'
import { CampoNumero } from '@/components/shared/CampoNumero'

/** Fallback stabile: un `?? []` inline sarebbe un array nuovo a ogni render. */
const NESSUN_ARREDO: readonly Arredo[] = Object.freeze([])

interface SuMisuraRiepilogoProps {
  onEdit: (articolo: ArticoloSuMisura) => void
  /** «Aggiungi elemento» di un arredo (L19): la pagina apre il listino con l'arredo scelto. */
  onAggiungiElemento: (arredoId: string) => void
}

export function SuMisuraRiepilogo({ onEdit, onAggiungiElemento }: Readonly<SuMisuraRiepilogoProps>) {
  const quote = useQuoteStore((s) => s.sezioni.arredi ?? FALLBACK_ARREDI)
  const preventivo = useQuoteStore((s) => s.preventivo)
  const includiCondizioni = preventivo.includiCondizioni
  const arredi = useQuoteStore((s) => s.sezioni.arredi)
  // Flag document-level, letto col fallback sul vecchio campo di sezione: i
  // preventivi salvati prima dello spostamento non passano dal migrate.
  const includiNotePagamento = includiNotePagamentoDi(preventivo, arredi)
  const setQuotaProgettazione = useQuoteStore((s) => s.setQuotaProgettazione)
  const setScontoSezione = useQuoteStore((s) => s.setScontoSezione)
  const setNoteGenerali = useQuoteStore((s) => s.setNoteGeneraliSuMisura)
  const setIncludiCondizioni = useQuoteStore((s) => s.setIncludiCondizioni)
  const setIncludiNotePagamento = useQuoteStore((s) => s.setIncludiNotePagamento)
  const setNotePagamento = useQuoteStore((s) => s.setNotePagamento)
  const setMostraMq = useQuoteStore((s) => s.setMostraMqInPdf)
  const blocco = useBloccoPdf()

  const result = useMemo(
    () => calcSuMisuraArticoli(quote.articoli, quote.quotaProgettazione, quote.sconto),
    [quote.articoli, quote.quotaProgettazione, quote.sconto]
  )

  return (
    // U12: da xl il pannello fermo non supera lo schermo (scorre dentro) e il
    // Totale resta in vista in fondo, anche con molti arredi nell'elenco.
    <div className="glass-panel xl:sticky-sotto-barra rounded-xl p-6 space-y-5 xl:max-h-[calc(100dvh-var(--altezza-barra,0px)-2rem)] xl:overflow-y-auto">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-ink-tertiary">
        Riepilogo Arredi
      </h3>

      {/* Articoli: elenco piatto, o per arredo se ce ne sono (L19). */}
      <ElencoArticoli
        articoli={quote.articoli}
        arredi={quote.arredi ?? NESSUN_ARREDO}
        onEdit={onEdit}
        onAggiungiElemento={onAggiungiElemento}
      />

      <div className="h-px bg-separator-opaque" />

      {/* Subtotale + sconto sezione + quota progettazione */}
      <div className="space-y-2">
        <Row label="Subtotale" value={result.subtotale} />

        {/* Sconto sezione arredi — input % libero (no listino, a differenza del gres).
            Wired a setScontoSezione('arredi', …); lo store clampa la frazione [0,1]. */}
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="sconto-arredi" className="text-sm text-ink-secondary">Sconto</label>
          <div className="flex items-center gap-1">
            <CampoNumero
              id="sconto-arredi"
              min={0}
              max={100}
              step={1}
              value={percentualePerCampo(quote.sconto)}
              onChange={(e) => {
                const pct = parseFloat(e.target.value)
                setScontoSezione('arredi', Number.isFinite(pct) ? pct / 100 : 0)
              }}
              className="w-16 rounded-sm border border-separator-opaque bg-surface-tertiary px-2 py-1 text-sm text-ink-primary tabular-nums text-right focus:border-accent focus:ring-2 focus:ring-accent-light focus:outline-none"
            />
            <span className="text-sm text-ink-tertiary">%</span>
          </div>
        </div>
        {result.sconto > 0 && (
          <Row label={`Sconto (${formatPercent(quote.sconto)})`} value={-result.sconto} />
        )}

        <label className="flex items-center justify-between gap-3 cursor-pointer select-none">
          <span className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={quote.quotaProgettazione}
              onChange={(e) => setQuotaProgettazione(e.target.checked)}
              className="h-4 w-4 rounded border-separator-opaque text-brand-red accent-brand-red"
            />
            <span className="text-sm text-ink-secondary">Quota progettazione 8%</span>
          </span>
          {result.quotaProgettazione > 0 && (
            <span className="font-mono text-sm tabular-nums text-ink-tertiary">
              + € {formatEur(result.quotaProgettazione)}
            </span>
          )}
        </label>
      </div>

      <div className="h-px bg-separator-opaque" />

      {/* Totale */}
      <div className="xl:sticky xl:bottom-0 xl:z-10 xl:-mx-6 xl:-mb-2 xl:bg-surface-secondary xl:px-6 xl:py-2">
        <p className="text-xs font-medium uppercase tracking-wider text-ink-tertiary mb-1">
          Totale Arredi
        </p>
        <TotalDisplay value={result.totale} />
        <p className="text-xs text-ink-tertiary mt-1">IVA esclusa</p>
      </div>

      {/* Aliquota di sezione e, con più aliquote, la quota di ognuna (L18). */}
      <IvaSezione sezione="arredi" iva={sezioneIvaArredi(quote, result)} />

      {/* Note generali */}
      <div className="space-y-1">
        <label className="block text-xs font-medium uppercase tracking-wider text-ink-tertiary">
          Note generali
        </label>
        <textarea
          value={quote.noteGenerali}
          onChange={(e) => setNoteGenerali(e.target.value)}
          rows={2}
          placeholder="Note generali del preventivo…"
          className="w-full rounded-sm border border-separator-opaque bg-surface-tertiary px-3 py-2 text-sm text-ink-primary focus:border-accent focus:ring-2 focus:ring-accent-light focus:outline-none resize-none"
        />
      </div>

      {/* Flag PDF */}
      <div className="space-y-2">
        <FlagRow label="Includi condizioni contrattuali" checked={includiCondizioni} onChange={setIncludiCondizioni} />
        <FlagRow label="Includi note pagamento" checked={includiNotePagamento} onChange={setIncludiNotePagamento} />
        {/* Il testo è modificabile per preventivo. Mostrato solo se la clausola
            è inclusa: una casella che non finisce da nessuna parte confonde.
            `testoNotePagamentoDi` fa vedere il default, così Antonio edita
            partendo dal testo vero invece che da una casella vuota. */}
        {includiNotePagamento && (
          <textarea
            value={testoNotePagamentoDi(preventivo)}
            onChange={(e) => setNotePagamento(e.target.value)}
            rows={2}
            aria-label="Testo note pagamento"
            className="w-full rounded-sm border border-separator-opaque bg-surface-tertiary px-3 py-2 text-sm text-ink-primary focus:border-accent focus:ring-2 focus:ring-accent-light focus:outline-none resize-none"
          />
        )}
        <FlagRow label="Mostra mq nel PDF" checked={quote.mostraMqInPdf} onChange={setMostraMq} />
      </div>

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

function FlagRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-separator-opaque text-brand-red accent-brand-red"
      />
      <span className="text-sm text-ink-secondary">{label}</span>
    </label>
  )
}
