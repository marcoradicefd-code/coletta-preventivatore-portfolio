import { useMemo } from 'react'
import { useQuoteStore } from '@/store/quoteStore'
import { FALLBACK_CUCINE } from '@/store/quoteFallbacks'
import { calcCucina } from '@/engine/calcCucina'
import { useCatalogoCucina } from '@/hooks/useCatalogoCucina'
import { PROG_PCT } from '@/types/cucina'
import { sezioneNonVuota } from '@/components/layout/sections'
import { TotalDisplay } from '@/components/layout/TotalDisplay'
import { IvaSezione } from '@/components/shared/SelettoreIva'
import { useBloccoPdf } from '@/hooks/useBloccoPdf'
import { formatEur, formatPercent, percentualePerCampo } from '@/utils/format'
import { CampoNumero } from '@/components/shared/CampoNumero'

// Riepilogo della sezione Cucine: la catena a fasi live (primo totale → casse+ante
// → profondità oltre 65 cm (L25) → +opzionali +open = totale cucina → prog/adeguamento → +giorni +extra = imponibile)
// più i parametri (sconto, adeguamento %, giorni, extra manuale, descrizione).
// Sorgente unica `calcCucina(sezione, catalogo)`, col catalogo composto dal
// listino cucine. Senza listino non si mostra: la pagina mostra lo stato del listino.

export function CucineRiepilogo() {
  const catalogo = useCatalogoCucina()
  const cucine = useQuoteStore((s) => s.sezioni.cucine ?? FALLBACK_CUCINE)
  const setScontoSezione = useQuoteStore((s) => s.setScontoSezione)
  const setGiorni = useQuoteStore((s) => s.setGiorniExtra)
  const setExtra = useQuoteStore((s) => s.setExtraManuale)
  const setAdeguamento = useQuoteStore((s) => s.setAdeguamentoCucina)
  const blocco = useBloccoPdf()

  const r = useMemo(() => (catalogo ? calcCucina(cucine, catalogo) : null), [cucine, catalogo])
  const nonVuota = sezioneNonVuota('cucine', { cucine })

  // Extra manuale: patch di un campo, con collasso a null se desc vuota e importo 0.
  const extra = cucine.extraManuale
  const setExtraField = (patch: Partial<{ descrizione: string; importo: number }>) => {
    const next = { descrizione: extra?.descrizione ?? '', importo: extra?.importo ?? 0, ...patch }
    if (next.descrizione === '' && !(next.importo > 0)) setExtra(null)
    else setExtra(next)
  }

  if (!catalogo || !r) return null

  return (
    <div className="glass-panel xl:sticky-sotto-barra rounded-xl p-6 space-y-5">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-ink-tertiary">
        Riepilogo Cucina
      </h3>

      {!nonVuota && (
        <p className="text-sm text-ink-tertiary py-2 text-center">
          Nessuna voce. Configura la cucina dai blocchi a sinistra.
        </p>
      )}

      {/* Catena beni → totale cucina */}
      <div className="space-y-2">
        <Row label="Primo totale" value={r.primoTotale} />
        {/* Dall'engine, mai ricalcolati qui: interi (D4), e il totale cucina li somma. */}
        {cucine.casse && <Row label="Casse +10%" value={r.importoCasse} added />}
        {cucine.ante && <Row label="Ante +20%" value={r.importoAnte} added />}
        {cucine.profonditaOltre65 === true && (
          <Row label="Profondità oltre 65 cm" value={r.supplementoProfondita ?? 0} added />
        )}
        {r.opzionali > 0 && <Row label="Opzionali" value={r.opzionali} added />}
        {r.open > 0 && <Row label="Open" value={r.open} added />}
        <div className="h-px bg-separator-opaque" />
        <Row label={r.vociDaDefinire > 0 ? 'Totale parziale cucina' : 'Totale cucina'} value={r.totaleCucina} strong />
        {/* Voci fuori catalogo (O5): fuori dal totale, mai sommate come zero in silenzio. */}
        {r.vociDaDefinire > 0 && (
          <p className="text-xs text-ink-tertiary text-right">
            {r.vociDaDefinire} {r.vociDaDefinire === 1 ? 'voce da definire' : 'voci da definire'}
          </p>
        )}
      </div>

      {/* Sconto sezione — SOLO sui beni (regola A.3) */}
      <div className="space-y-2">
        <PctInputRow
          id="sconto-cucine"
          label="Sconto"
          pct={cucine.sconto}
          onPct={(f) => setScontoSezione('cucine', f)}
        />
        {r.sconto > 0 && <Row label={`Sconto (${formatPercent(cucine.sconto)})`} value={-r.sconto} />}
      </div>

      <div className="h-px bg-separator-opaque" />

      {/* Fasi fuori sconto: progettazione, adeguamento, giorni, extra */}
      <div className="space-y-2">
        <Row label={`Progettazione ${formatPercent(PROG_PCT)}`} value={r.progettazione} added />
        <PctInputRow
          id="adeguamento-cucine"
          label="Adeguamento"
          pct={cucine.adeguamentoPct}
          onPct={setAdeguamento}
        />
        {r.adeguamento > 0 && (
          <Row label={`Adeguamento (${formatPercent(cucine.adeguamentoPct)})`} value={r.adeguamento} added />
        )}

        {/* Giorni extra × tariffa del listino (assente: da definire) */}
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="giorni-cucine" className="text-sm text-ink-secondary">Giorni extra</label>
          <CampoNumero
            id="giorni-cucine"
            min={0}
            step={1}
            value={cucine.giorniExtra}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10)
              setGiorni(Number.isFinite(n) && n > 0 ? n : 0)
            }}
            className="w-16 rounded-sm border border-separator-opaque bg-surface-tertiary px-2 py-1 text-sm text-ink-primary tabular-nums text-right focus:border-accent focus:ring-2 focus:ring-accent-light focus:outline-none"
          />
        </div>
        {catalogo.giornoRate !== null && r.giorni > 0 && (
          <Row label={`Giorni (${cucine.giorniExtra} × ${formatEur(catalogo.giornoRate)} €)`} value={r.giorni} added />
        )}
        {catalogo.giornoRate === null && cucine.giorniExtra > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-ink-secondary">Giorni ({cucine.giorniExtra})</span>
            <span className="text-sm text-ink-tertiary">tariffa da definire</span>
          </div>
        )}
      </div>

      {/* Extra manuale — casella unica descrizione + importo finito */}
      <div className="space-y-1.5">
        <label className="text-sm text-ink-secondary">Extra manuale</label>
        <input
          type="text"
          value={extra?.descrizione ?? ''}
          aria-label="Descrizione extra manuale"
          placeholder="Descrizione (es. maniglie speciali)"
          onChange={(e) => setExtraField({ descrizione: e.target.value })}
          className="w-full rounded-sm border border-separator-opaque bg-surface-tertiary px-2 py-1.5 text-sm text-ink-primary focus:border-accent focus:ring-2 focus:ring-accent-light focus:outline-none"
        />
        <div className="flex items-center gap-1">
          <span className="text-sm text-ink-tertiary">€</span>
          <CampoNumero
            min={0}
            step="any"
            value={extra?.importo}
            aria-label="Importo extra manuale"
            onChange={(e) => {
              const v = parseFloat(e.target.value)
              setExtraField({ importo: Number.isFinite(v) && v >= 0 ? v : 0 })
            }}
            className="w-full rounded-sm border border-separator-opaque bg-surface-tertiary px-2 py-1.5 text-sm text-ink-primary tabular-nums text-right focus:border-accent focus:ring-2 focus:ring-accent-light focus:outline-none"
          />
        </div>
      </div>

      <div className="h-px bg-separator-opaque" />

      {/* Imponibile */}
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-ink-tertiary mb-1">Imponibile Cucina</p>
        <TotalDisplay value={r.imponibile} />
        <p className="text-xs text-ink-tertiary mt-1">IVA esclusa</p>
      </div>

      {/* Aliquota di sezione e, con più aliquote, la quota di ognuna (L18). */}
      <IvaSezione sezione="cucine" iva={{ totale: r.imponibile, aliquota: cucine.aliquotaIva }} />

      {/* La descrizione a corpo è salita in cima alla PAGINA (DescrizioneSezione
          in CucinePage): è il testo che il cliente legge, non un parametro. */}

      {blocco.motivo && (
        <p role="alert" className="text-[12px] text-error text-center">{blocco.motivo}</p>
      )}
      {/* «Genera Preventivo» sta nella barra del preventivo, sempre in vista (L21-B): un solo primario per vista. */}
    </div>
  )
}

function Row({ label, value, added, strong }: { label: string; value: number; added?: boolean; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-sm ${strong ? 'font-semibold text-ink-primary' : 'text-ink-secondary'}`}>{label}</span>
      <span className={`font-mono text-sm tabular-nums ${strong ? 'font-semibold text-ink-primary' : 'text-ink-primary'}`}>
        {added ? '+ ' : ''}€ {formatEur(value)}
      </span>
    </div>
  )
}

// Riga input percentuale (valore memorizzato come frazione [0..], mostrato in %).
function PctInputRow({ id, label, pct, onPct }: { id: string; label: string; pct: number; onPct: (frac: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className="text-sm text-ink-secondary">{label}</label>
      <div className="flex items-center gap-1">
        <CampoNumero
          id={id}
          min={0}
          step={1}
          value={percentualePerCampo(pct)}
          onChange={(e) => {
            const p = parseFloat(e.target.value)
            onPct(Number.isFinite(p) ? p / 100 : 0)
          }}
          className="w-16 rounded-sm border border-separator-opaque bg-surface-tertiary px-2 py-1 text-sm text-ink-primary tabular-nums text-right focus:border-accent focus:ring-2 focus:ring-accent-light focus:outline-none"
        />
        <span className="text-sm text-ink-tertiary">%</span>
      </div>
    </div>
  )
}
