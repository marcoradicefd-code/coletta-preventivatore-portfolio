import { Plus, Trash2 } from 'lucide-react'
import { useQuoteStore } from '@/store/quoteStore'
import { FALLBACK_PROGETTO_VALORE } from '@/store/quoteFallbacks'
import { ProgettoValoreRiepilogo } from './ProgettoValoreRiepilogo'
import { CampoNumero } from '@/components/shared/CampoNumero'

// ── Sezione "Progetto a valore" (SPEC_FASE2 §B.5-bis / fase 6) ──
// Voci a testo libero + prezzo "a mano". NESSUN listino, NESSUN modal (a
// differenza di Su Misura): righe editabili inline. Nessuna progettazione,
// nessun montaggio (document-level). Layout a due colonne come SuMisuraPage.

export function ProgettoValorePage() {
  const righe = useQuoteStore((s) => (s.sezioni.progettoValore ?? FALLBACK_PROGETTO_VALORE).righe)
  const addRiga = useQuoteStore((s) => s.addRigaProgettoValore)
  const updateRiga = useQuoteStore((s) => s.updateRigaProgettoValore)
  const removeRiga = useQuoteStore((s) => s.removeRigaProgettoValore)

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-6 items-start">
      {/* Main */}
      <div className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-2xl text-ink-primary">Progetto a valore</h2>
          <button
            onClick={() => addRiga({ descrizione: '', prezzo: 0 })}
            className="inline-flex items-center gap-1.5 rounded-sm border border-separator-opaque px-3 py-2 text-sm font-medium text-ink-secondary hover:border-brand-red hover:text-brand-red transition-colors"
            style={{ minHeight: 40 }}
          >
            <Plus className="h-4 w-4" strokeWidth={1.5} />
            Aggiungi voce
          </button>
        </div>

        <p className="text-sm text-ink-tertiary">
          Voci a testo libero con prezzo a mano. Nessun calcolo automatico: il totale è la
          somma dei prezzi, meno lo sconto di sezione.
        </p>

        {righe.length === 0 ? (
          <div className="rounded-lg bg-surface-secondary border border-separator-opaque p-8 text-center">
            <p className="text-sm text-ink-tertiary">
              Nessuna voce. Aggiungi la prima con{' '}
              <span className="font-medium">Aggiungi voce</span>.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {righe.map((r) => (
              <li
                key={r.id}
                className="flex items-start gap-3 rounded-sm bg-surface-secondary border border-separator-opaque px-3 py-2.5 hover:bg-hover-voce transition-colors duration-100"
              >
                <textarea
                  value={r.descrizione}
                  onChange={(e) => updateRiga(r.id, { descrizione: e.target.value })}
                  rows={2}
                  placeholder="Descrizione della voce…"
                  className="flex-1 min-w-0 resize-none rounded-sm border border-separator-opaque bg-surface-tertiary px-3 py-2 text-sm text-ink-primary focus:border-accent focus:ring-2 focus:ring-accent-light focus:outline-none"
                />
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-sm text-ink-tertiary">€</span>
                  <CampoNumero
                    min={0}
                    step="any"
                    value={r.prezzo}
                    aria-label="Prezzo"
                    onChange={(e) => {
                      // Prezzo "a mano": negativi vietati (→ 0), non-finite → 0.
                      const v = parseFloat(e.target.value)
                      updateRiga(r.id, { prezzo: Number.isFinite(v) && v >= 0 ? v : 0 })
                    }}
                    className="w-28 rounded-sm border border-separator-opaque bg-surface-tertiary px-2 py-2 text-sm text-ink-primary tabular-nums text-right focus:border-accent focus:ring-2 focus:ring-accent-light focus:outline-none"
                  />
                  <button
                    onClick={() => removeRiga(r.id)}
                    aria-label="Rimuovi"
                    className="flex h-9 w-9 items-center justify-center rounded-xs text-ink-tertiary hover:text-error hover:bg-surface-tertiary transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Riepilogo */}
      <ProgettoValoreRiepilogo />
    </div>
  )
}
