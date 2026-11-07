import { useQuoteStore } from '@/store/quoteStore'
import { FALLBACK_GRES } from '@/store/quoteFallbacks'
import { useToast } from '@/components/shared/toastContext'
import { formatQuantita } from '@/utils/format'
import type { LavorazioneTolta, TipologiaMateriale } from '@/types/marmeria'

const ETICHETTA: Record<TipologiaMateriale, string> = {
  QUARZO: 'Quarzo / Resina',
  LAPITEC: 'Lapitec / Dekton',
  GRES: 'Gres',
}

/** Una chiave per ogni cambio: chiudere un avviso non deve zittire il prossimo uguale. */
let cambi = 0

function messaggioLavorazioniTolte(tipologia: TipologiaMateriale, tolte: LavorazioneTolta[]): string {
  const elenco = tolte.map((t) => `${t.descrizione} (${formatQuantita(t.quantita)} ${t.unita})`).join(', ')
  // Il participio si accorda: «tolta 1 lavorazione», «tolte 2 lavorazioni».
  const quante =
    tolte.length === 1 ? 'tolta 1 lavorazione non disponibile' : `tolte ${tolte.length} lavorazioni non disponibili`
  return `Tipologia ${ETICHETTA[tipologia]}: ${quante} — ${elenco}`
}

export function TipologiaSelector() {
  const tipologia = useQuoteStore((s) => (s.sezioni.gres ?? FALLBACK_GRES).tipologiaMateriale)
  const setTipologia = useQuoteStore((s) => s.setTipologiaMateriale)
  const { setNotifica } = useToast()

  const cambia = (v: TipologiaMateriale) => {
    const tolte = setTipologia(v)
    // Avviso persistente (resta finché l'operatore lo chiude), non persistito: al
    // reload le righe restano tolte, si perde solo il promemoria (A2, opzione b).
    if (tolte.length > 0) {
      cambi += 1
      setNotifica(`gres:lavorazioni-tolte:${cambi}`, { message: messaggioLavorazioniTolte(v, tolte), type: 'error' })
    }
  }

  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium uppercase tracking-wider text-ink-tertiary">
        Tipologia lavorazioni
      </label>
      <select
        value={tipologia}
        onChange={(e) => cambia(e.target.value as TipologiaMateriale)}
        className="w-full rounded-sm border border-separator-opaque bg-surface-tertiary px-3 py-2 text-sm text-ink-primary
          focus:border-accent focus:ring-2 focus:ring-accent-light focus:outline-none"
      >
        {(Object.keys(ETICHETTA) as TipologiaMateriale[]).map((t) => (
          <option key={t} value={t}>{ETICHETTA[t]}</option>
        ))}
      </select>
    </div>
  )
}
