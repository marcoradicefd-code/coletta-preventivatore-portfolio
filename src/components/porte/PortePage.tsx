import { useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { usePricelistStore } from '@/store/pricelistStore'
import { useQuoteStore } from '@/store/quoteStore'
import { FALLBACK_PORTE } from '@/store/quoteFallbacks'
import { calcRigaPorta, calcRigaBattiscopa, manigliaInclusa, origineValorizzata, type FasciaAltezza, type RigaPortaCalcolata, type RigaBattiscopaCalcolata } from '@/engine/calcPorte'
import { isVoceBattiscopa } from '@/data/battiscopa'
import { descrizioneBattiscopaDi } from '@/store/quoteSelectors'
import type { RigaBattiscopa } from '@/types/quote'

/** Riferimento stabile: `?? []` inline farebbe un array nuovo a ogni render. */
const EMPTY_BATTISCOPA: RigaBattiscopa[] = []
import { formatEur, formatQuantita } from '@/utils/format'
import { StatoListino } from '@/components/shared/StatoListino'
import { PortaConfigModal } from './PortaConfigModal'
import { PorteRiepilogo } from './PorteRiepilogo'
import { SelettoreAliquotaIva } from '@/components/shared/SelettoreIva'
import { aliquotaIvaSezione } from '@/engine/iva'
import { CampoNumero } from '@/components/shared/CampoNumero'

const FASCIA_LABEL: Record<FasciaAltezza, string> = {
  base: '≤215',
  h215: '>215',
  h240: '>240',
}

export function PortePage() {
  const listino = usePricelistStore((s) => s.porte)
  const righe = useQuoteStore((s) => (s.sezioni.porte ?? FALLBACK_PORTE).righe)
  const addRiga = useQuoteStore((s) => s.addRigaPorta)
  const removeRiga = useQuoteStore((s) => s.removeRigaPorta)
  const battiscopa = useQuoteStore((s) => (s.sezioni.porte ?? FALLBACK_PORTE).battiscopa ?? EMPTY_BATTISCOPA)
  const addBattiscopa = useQuoteStore((s) => s.addBattiscopa)
  const updateBattiscopa = useQuoteStore((s) => s.updateBattiscopa)
  const removeBattiscopa = useQuoteStore((s) => s.removeBattiscopa)
  const setDescrizioneBattiscopa = useQuoteStore((s) => s.setDescrizioneBattiscopa)
  // L'aliquota che il battiscopa eredita finché non ne sceglie una sua (L18).
  const ivaSezione = useQuoteStore((s) => aliquotaIvaSezione(s.sezioni.porte?.aliquotaIva))
  const [modalRigaId, setModalRigaId] = useState<string | null>(null)

  // Senza listino la pagina non ha niente da mostrare: il PERCHÉ lo dice
  // StatoListino (non caricato / in caricamento / caricamento fallito).
  if (!listino) return <StatoListino categoria="porte" />

  // Il battiscopa nasce dalla PRIMA voce battiscopa del listino: è quella base
  // ("BATTISCOPA MASSELLO"); la variante +20% è una spunta sulla riga, non una
  // voce da scegliere, così la maggiorazione segue il rate congelato.
  const voceBattiscopa = listino?.optional.find((o) => isVoceBattiscopa(o.nome))
  const handleAddBattiscopa = () => {
    if (voceBattiscopa) addBattiscopa(voceBattiscopa.nome)
  }

  // "Aggiungi porta" crea subito una riga valida (primo modello, altezza default)
  // e apre il modal per rifinirla. Il listino ha sempre ≥1 modello (Zod).
  const handleAdd = () => {
    addRiga({ modelloNome: listino.modelli[0]?.nome ?? '', altezzaCm: 210 })
    const righeNow = useQuoteStore.getState().sezioni.porte?.righe ?? []
    const ultima = righeNow[righeNow.length - 1]
    if (ultima) setModalRigaId(ultima.id)
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-6 items-start">
      {/* Main */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-2xl text-ink-primary">Porte</h2>
          {/* Due pulsanti ALLO STESSO LIVELLO: il battiscopa è a corpo, non un
              accessorio della porta, e sepolto negli optional non si trovava.
              `flex-wrap` perché a 375px i due pulsanti non ci stanno in riga
              col titolo. */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleAdd}
              className="inline-flex items-center gap-1.5 rounded-sm border border-separator-opaque px-3 py-2 text-sm font-medium text-ink-secondary hover:border-brand-red hover:text-brand-red transition-colors"
              style={{ minHeight: 44 }}
            >
              <Plus className="h-4 w-4" strokeWidth={1.5} />
              Aggiungi porta
            </button>
            <button
              onClick={handleAddBattiscopa}
              className="inline-flex items-center gap-1.5 rounded-sm border border-separator-opaque px-3 py-2 text-sm font-medium text-ink-secondary hover:border-brand-red hover:text-brand-red transition-colors"
              style={{ minHeight: 44 }}
            >
              <Plus className="h-4 w-4" strokeWidth={1.5} />
              Aggiungi battiscopa
            </button>
          </div>
        </div>

        {righe.length === 0 ? (
          <div className="rounded-lg bg-surface-secondary border border-separator-opaque p-8 text-center">
            <p className="text-sm text-ink-tertiary">
              Nessuna porta. Aggiungi la prima con <span className="font-medium">Aggiungi porta</span>.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {righe.map((r) => {
              const calc = calcRigaPorta(r, listino)
              const avviso = avvisoPorta(calc)
              return (
                <li key={r.id} className="rounded-sm bg-surface-secondary border border-separator-opaque px-3 py-2.5 hover:bg-hover-voce transition-colors duration-100">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink-primary truncate">
                        {r.modelloNome || '(nessun modello)'}
                        {calc.quantita > 1 && (
                          <span className="ml-1.5 text-ink-tertiary tabular-nums">× {calc.quantita}</span>
                        )}
                      </p>
                      <p className="text-xs text-ink-tertiary">
                        {calc.altezzaCm > 0 ? `h ${calc.altezzaCm} cm · fascia ${FASCIA_LABEL[calc.fascia]}` : 'altezza mancante'}
                        {r.optionals.length > 0 && ` · ${r.optionals.length} optional`}
                        {calc.totaleManiglia > 0 && ` · maniglia × ${r.maniglia?.qta}`}
                        {r.maniglia && manigliaInclusa(r.maniglia) && r.maniglia.modello.trim() !== '' && ' · maniglia inclusa'}
                      </p>
                      {avviso && (
                        // Antonio lo deve vedere PRIMA di stampare: sul PDF questa
                        // riga esce senza importo e resta fuori dal totale.
                        <p className="text-xs font-medium text-error mt-0.5">{avviso}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span data-testid="totale-porta" className="font-mono text-sm tabular-nums font-semibold text-ink-primary mr-1">
                        {origineValorizzata(calc.origine) ? `€ ${formatEur(calc.totale)}` : '—'}
                      </span>
                      <button
                        onClick={() => setModalRigaId(r.id)}
                        aria-label="Modifica"
                        className="flex h-8 w-8 items-center justify-center rounded-xs text-ink-tertiary hover:text-accent hover:bg-surface-tertiary transition-colors"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => removeRiga(r.id)}
                        aria-label="Rimuovi"
                        className="flex h-8 w-8 items-center justify-center rounded-xs text-ink-tertiary hover:text-error hover:bg-surface-tertiary transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {battiscopa.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-ink-primary">Battiscopa</h3>
            {battiscopa.map((b) => {
              const calc = calcRigaBattiscopa(b, listino)
              const avviso = avvisoBattiscopa(calc)
              return (
                <div key={b.id} className="rounded-sm bg-surface-secondary border border-separator-opaque p-3 space-y-3 hover:bg-hover-voce transition-colors duration-100">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink-primary truncate">{b.nome}</p>
                      {avviso && <p className="text-xs font-medium text-error mt-0.5">{avviso}</p>}
                    </div>
                    <button
                      onClick={() => removeBattiscopa(b.id)}
                      aria-label="Rimuovi battiscopa"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xs text-ink-tertiary hover:text-error hover:bg-surface-tertiary transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Una riga = un'altezza e una lunghezza totale (Antonio 06/10):
                      altezze diverse sono righe separate. Stessa griglia del
                      blocco maniglia: 1 colonna sotto sm, campi a 44px. */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <CampoBattiscopa
                      etichetta="Altezza (cm)"
                      ariaLabel="Altezza battiscopa (cm)"
                      valore={b.altezzaCm}
                      onValore={(v) => updateBattiscopa(b.id, { altezzaCm: v })}
                    />
                    <CampoBattiscopa
                      etichetta="Metri lineari"
                      ariaLabel="Metri lineari battiscopa"
                      valore={b.metriLineari}
                      onValore={(v) => updateBattiscopa(b.id, { metriLineari: v })}
                    />
                    <CampoBattiscopa
                      etichetta="Posa €/ml"
                      ariaLabel="Posa battiscopa (€/ml)"
                      valore={b.prezzoPosaMl}
                      placeholder="0,00"
                      onValore={(v) => updateBattiscopa(b.id, { prezzoPosaMl: v })}
                    />
                  </div>

                  {/* Descrizione tri-stato come quella delle porte: vuota (null)
                      ⇒ nel PDF l'etichetta composta, che si legge qui come
                      segnaposto; scritta ⇒ il testo libero al suo posto. Il
                      setter decide il tri-stato: svuotare torna automatica. */}
                  <label className="block space-y-1">
                    <span className="block text-xs text-ink-tertiary">Descrizione (essenza, colore…)</span>
                    <input
                      type="text"
                      value={b.descrizione ?? ''}
                      placeholder={descrizioneBattiscopaDi(b, calc)}
                      onChange={(e) => setDescrizioneBattiscopa(b.id, e.target.value)}
                      className="w-full rounded-sm border border-separator-opaque bg-surface-tertiary px-3 py-2 text-sm text-ink-primary focus:border-accent focus:outline-none"
                      style={{ minHeight: 44 }}
                    />
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer select-none" style={{ minHeight: 44 }}>
                    <input
                      type="checkbox"
                      checked={b.extra ?? false}
                      onChange={(e) => updateBattiscopa(b.id, { extra: e.target.checked })}
                      className="h-4 w-4 shrink-0 accent-brand-red"
                    />
                    <span className="text-sm text-ink-secondary">Lavorazione extra (+20%)</span>
                  </label>

                  <SelettoreAliquotaIva
                    label="IVA"
                    value={b.aliquotaIva}
                    sezione={ivaSezione}
                    onChange={(a) => updateBattiscopa(b.id, { aliquotaIva: a })}
                  />

                  <div className="flex items-end justify-between gap-2 border-t border-separator-opaque pt-2">
                    <div className="space-y-0.5 text-xs text-ink-tertiary tabular-nums">
                      {/* Il calcolo del €/ml appena l'altezza c'è, anche se mancano
                          i metri: `prezzoMl` è 0 senza prezzo o senza altezza. */}
                      {calc.prezzoMl > 0 && (
                        <p>
                          {formatEur(calc.rate)} €/cm{b.extra ? ' (+20%)' : ''} × {formatQuantita(calc.altezzaCm)} cm = {formatEur(calc.prezzoMl)} €/ml
                        </p>
                      )}
                      {origineValorizzata(calc.origine) && (
                        <p>
                          {formatEur(calc.prezzoMl)} €/ml × {formatQuantita(calc.metriLineari)} ml = {formatEur(calc.prodotto)} €
                        </p>
                      )}
                      {origineValorizzata(calc.origine) && calc.posa > 0 && (
                        <p>
                          posa {formatEur(calc.prezzoPosaMl)} €/ml × {formatQuantita(calc.metriLineari)} ml = {formatEur(calc.posa)} €
                        </p>
                      )}
                    </div>
                    <span data-testid="totale-battiscopa" className="font-mono text-sm tabular-nums font-semibold text-ink-primary">
                      {origineValorizzata(calc.origine) ? `€ ${formatEur(calc.totale)}` : '—'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Riepilogo */}
      <PorteRiepilogo />

      {/* Modal config porta */}
      <AnimatePresence>
        {modalRigaId && (
          <PortaConfigModal rigaId={modalRigaId} listino={listino} onClose={() => setModalRigaId(null)} />
        )}
      </AnimatePresence>
    </div>
  )
}

/**
 * Cosa dire sotto il nome della riga porta. Switch esaustivo: un'origine nuova
 * senza un messaggio qui non compila.
 */
function avvisoPorta(calc: RigaPortaCalcolata): string | null {
  switch (calc.origine) {
    case 'snapshot':
    case 'live':
      return null
    case 'irrisolvibile':
      return 'Prezzo non più nel listino — da definire, esclusa dal totale'
    case 'da-completare':
      return "Inserisci l'altezza: esclusa dal totale finché non è completa."
    default: {
      const esaustivo: never = calc.origine
      return esaustivo
    }
  }
}

/**
 * Cosa dire sotto il nome della riga battiscopa. Switch esaustivo: un'origine
 * nuova senza un messaggio qui non compila.
 */
function avvisoBattiscopa(calc: RigaBattiscopaCalcolata): string | null {
  switch (calc.origine) {
    case 'snapshot':
    case 'live':
      return null
    case 'irrisolvibile':
      return 'Prezzo non più nel listino — da definire, escluso dal totale'
    case 'da-completare':
      return calc.quantitaCmLegacy !== undefined
        ? `Riga del vecchio formato (${formatQuantita(calc.quantitaCmLegacy)} cm di lunghezza): inserisci altezza e metri lineari. Esclusa dal totale finché non è completa.`
        : 'Inserisci altezza e metri lineari: esclusa dal totale finché non è completa.'
    default: {
      const esaustivo: never = calc.origine
      return esaustivo
    }
  }
}

/** Campo numerico decimale del battiscopa: vuoto = valore assente, mai uno 0 inventato. */
function CampoBattiscopa({
  etichetta,
  ariaLabel,
  valore,
  placeholder,
  onValore,
}: Readonly<{
  etichetta: string
  ariaLabel: string
  valore: number | undefined
  placeholder?: string
  onValore: (v: number | undefined) => void
}>) {
  return (
    <div className="space-y-1">
      <label className="block text-xs text-ink-tertiary">{etichetta}</label>
      <CampoNumero
        min={0}
        step="any"
        inputMode="decimal"
        value={valore}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(e) => {
          if (e.target.value === '') return onValore(undefined)
          const n = parseFloat(e.target.value)
          onValore(Number.isFinite(n) && n >= 0 ? n : 0)
        }}
        className="w-full rounded-sm border border-separator-opaque bg-surface-tertiary px-3 py-2 text-sm text-ink-primary font-mono tabular-nums text-right focus:border-accent focus:outline-none"
        style={{ minHeight: 44 }}
      />
    </div>
  )
}
