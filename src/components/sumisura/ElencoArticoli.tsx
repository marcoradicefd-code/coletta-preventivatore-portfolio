import { useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useQuoteStore } from '@/store/quoteStore'
import { calcArticolo, raggruppaPerArredo } from '@/engine/calcSuMisura'
import { descrizioneCombinazione } from '@/engine/matriceFiniture'
import { formatEur } from '@/utils/format'
import { useConferma } from '@/hooks/useConferma'
import type { ArticoloSuMisura, Arredo } from '@/types/sumisura'

interface ElencoArticoliProps {
  articoli: ArticoloSuMisura[]
  /** Gli arredi della sezione (L19); vuoto ⇒ l'elenco piatto di sempre. */
  arredi: readonly Arredo[]
  onEdit: (articolo: ArticoloSuMisura) => void
  /** «Aggiungi elemento»: la pagina porta il listino con questo arredo già scelto. */
  onAggiungiElemento: (arredoId: string) => void
}

/** Valore della tendina «Sposta in» per «Altre voci» (un id vero non è mai vuoto). */
const ALTRE_VOCI = ''

/**
 * Gli articoli della sezione Arredi. Senza arredi è l'elenco di prima; con gli
 * arredi (L19) una card per arredo (nome rinominabile, elementi, «Aggiungi
 * elemento», subtotale, «Elimina arredo») e in fondo «Altre voci», se ce ne sono.
 * I gruppi e i subtotali vengono da `raggruppaPerArredo`, non si sommano qui.
 */
export function ElencoArticoli({ articoli, arredi, onEdit, onAggiungiElemento }: Readonly<ElencoArticoliProps>) {
  const rinominaArredo = useQuoteStore((s) => s.rinominaArredo)
  const removeArredo = useQuoteStore((s) => s.removeArredo)
  // U10: la conferma del design system (la seconda finestra, con «Annulla»
  // rosso e a destra, aveva la convenzione opposta).
  const { chiedi, finestra } = useConferma()
  const removeArticolo = useQuoteStore((s) => s.removeArticoloSuMisura)
  const reinserisci = useQuoteStore((s) => s.reinserisciArticoloSuMisura)
  // U18: «Rimuovi» senza conferma ma con «Ripristina» (l'ultimo rimosso, dov'era).
  const [rimosso, setRimosso] = useState<{ articolo: ArticoloSuMisura; indice: number } | null>(null)
  const rimuovi = (a: ArticoloSuMisura) => {
    setRimosso({ articolo: a, indice: articoli.findIndex((x) => x.id === a.id) })
    removeArticolo(a.id)
  }
  const ripristino = rimosso && (
    <output className="flex flex-wrap items-center gap-2 rounded-sm bg-surface-tertiary px-3 py-2 text-sm text-ink-secondary">
      «{rimosso.articolo.descrizione}» rimosso.
      <button
        type="button"
        onClick={() => {
          reinserisci(rimosso.articolo, rimosso.indice)
          setRimosso(null)
        }}
        aria-label={`Ripristina «${rimosso.articolo.descrizione}»`}
        className="min-h-11 rounded-sm px-2 font-medium text-brand-red underline underline-offset-2 md:min-h-8"
      >
        Ripristina
      </button>
    </output>
  )

  if (articoli.length === 0 && arredi.length === 0) {
    return (
      <div className="space-y-2">
        {ripristino}
        <p className="text-sm text-ink-tertiary py-4 text-center">
          Nessun articolo. Seleziona una voce dal listino o aggiungine una manuale.
        </p>
      </div>
    )
  }

  if (arredi.length === 0) {
    return (
      <div className="space-y-2">
        <ListaRighe articoli={articoli} arredi={arredi} onEdit={onEdit} onRimuovi={rimuovi} />
        {ripristino}
      </div>
    )
  }

  const eliminaArredo = async (arredo: Arredo, elementi: number) => {
    if (elementi === 0) {
      removeArredo(arredo.id, 'sposta')
      return
    }
    const uno = elementi === 1
    const scelta = await chiedi({
      titolo: `Eliminare l’arredo «${arredo.nome.trim() || 'Arredo senza nome'}»?`,
      testo: uno ? "Spostare l'elemento in Altre voci o eliminarlo?" : `Spostare i ${elementi} elementi in Altre voci o eliminarli?`,
      azioni: [
        { valore: 'indietro', etichetta: 'Torna indietro', tipo: 'secondario' },
        { valore: 'sposta', etichetta: 'Sposta in Altre voci', tipo: 'secondario' },
        { valore: 'elimina', etichetta: uno ? 'Elimina l’elemento' : 'Elimina gli elementi', tipo: 'pericolo' },
      ],
    })
    if (scelta === 'sposta' || scelta === 'elimina') removeArredo(arredo.id, scelta)
  }

  return (
    <div className="space-y-3">
      {raggruppaPerArredo(articoli, arredi).map(({ arredo, articoli: elementi, subtotale }) => (
        <section
          key={arredo?.id ?? 'altre-voci'}
          aria-label={arredo ? `Arredo ${arredo.nome}` : 'Altre voci'}
          className="rounded-md border border-separator-opaque bg-surface-secondary p-3 space-y-2"
        >
          {arredo ? (
            <div className="flex items-center gap-2">
              <input
                value={arredo.nome}
                onChange={(e) => rinominaArredo(arredo.id, e.target.value)}
                aria-label="Nome arredo"
                maxLength={60}
                placeholder="Nome dell'arredo"
                className="min-w-0 flex-1 rounded-sm border border-separator-opaque bg-surface-tertiary px-2 py-1 text-sm font-semibold text-ink-primary focus:border-accent focus:ring-2 focus:ring-accent-light focus:outline-none"
              />
              <button
                type="button"
                onClick={() => void eliminaArredo(arredo, elementi.length)}
                aria-label={`Elimina arredo ${arredo.nome}`}
                className="inline-flex min-h-11 shrink-0 items-center gap-1 whitespace-nowrap rounded-xs px-2 py-1 text-xs font-medium text-ink-tertiary hover:text-error hover:bg-surface-tertiary transition-colors md:min-h-8"
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                Elimina arredo
              </button>
            </div>
          ) : (
            <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-tertiary">Altre voci</h4>
          )}

          {elementi.length > 0 ? (
            <ListaRighe articoli={elementi} arredi={arredi} onEdit={onEdit} onRimuovi={rimuovi} />
          ) : (
            <p className="text-xs text-ink-tertiary">Nessun elemento.</p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            {arredo ? (
              <button
                type="button"
                onClick={() => onAggiungiElemento(arredo.id)}
                className="inline-flex min-h-11 shrink-0 items-center gap-1 whitespace-nowrap rounded-sm border border-separator-opaque px-2.5 py-1 text-xs font-medium text-ink-secondary hover:border-brand-red hover:text-brand-red transition-colors md:min-h-8"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
                Aggiungi elemento
              </button>
            ) : null}
            <span className="ml-auto whitespace-nowrap text-sm text-ink-secondary">
              Subtotale{' '}
              <span className="font-mono tabular-nums font-semibold text-ink-primary">€ {formatEur(subtotale)}</span>
            </span>
          </div>
        </section>
      ))}

      {ripristino}
      {finestra}
    </div>
  )
}

function ListaRighe({
  articoli,
  arredi,
  onEdit,
  onRimuovi,
}: Readonly<{
  articoli: ArticoloSuMisura[]
  arredi: readonly Arredo[]
  onEdit: (a: ArticoloSuMisura) => void
  onRimuovi: (a: ArticoloSuMisura) => void
}>) {
  return (
    <ul className="space-y-2">
      {articoli.map((a) => (
        <RigaArticolo key={a.id} articolo={a} arredi={arredi} onEdit={onEdit} onRimuovi={onRimuovi} />
      ))}
    </ul>
  )
}

/** La riga di un articolo, quella di prima; con gli arredi, la tendina «Sposta in». */
function RigaArticolo({
  articolo: a,
  arredi,
  onEdit,
  onRimuovi,
}: Readonly<{
  articolo: ArticoloSuMisura
  arredi: readonly Arredo[]
  onEdit: (a: ArticoloSuMisura) => void
  onRimuovi: (a: ArticoloSuMisura) => void
}>) {
  const updateArticolo = useQuoteStore((s) => s.updateArticoloSuMisura)
  const calc = calcArticolo(a)
  // Un id che non c'è più vale «Altre voci», come in `raggruppaPerArredo`.
  const arredoCorrente = a.arredoId && arredi.some((x) => x.id === a.arredoId) ? a.arredoId : ALTRE_VOCI

  return (
    <li className="rounded-sm bg-surface-tertiary px-3 py-2.5 transition-colors duration-100 hover:bg-hover-voce">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink-primary truncate">{a.descrizione}</p>
          <p className="text-xs text-ink-tertiary">
            {dimensioniLabel(a)}
            {calc.applica20 && ' · +20%'}
            {calc.applica15 && ' · +15%'}
            {calc.applica10 && ' · −10%'}
          </p>
          {a.combinazione && (
            <p className="text-xs text-ink-tertiary truncate">{descrizioneCombinazione(a.combinazione)}</p>
          )}
          {(a.finituraInterna || a.finituraEsterna || a.codiceFinitura) && (
            <p className="text-xs text-ink-tertiary truncate">
              {[a.finituraInterna, a.finituraEsterna, a.codiceFinitura].filter(Boolean).join(' / ')}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="font-mono text-sm tabular-nums font-semibold text-ink-primary mr-1">
            € {formatEur(calc.totale)}
          </span>
          <button
            type="button"
            onClick={() => onEdit(a)}
            aria-label={`Modifica ${a.descrizione}`}
            className="flex h-11 w-11 items-center justify-center rounded-xs text-ink-tertiary hover:text-accent hover:bg-surface-secondary transition-colors md:h-8 md:w-8"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onRimuovi(a)}
            aria-label={`Rimuovi ${a.descrizione}`}
            className="flex h-11 w-11 items-center justify-center rounded-xs text-ink-tertiary hover:text-error hover:bg-surface-secondary transition-colors md:h-8 md:w-8"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {arredi.length > 0 && (
        <select
          value={arredoCorrente}
          onChange={(e) => updateArticolo(a.id, { arredoId: e.target.value || undefined })}
          aria-label={`Sposta ${a.descrizione} in`}
          className="mt-1.5 min-h-11 w-full rounded-sm border border-separator-opaque bg-surface-secondary px-2 py-1 text-xs text-ink-secondary md:min-h-0 focus:border-accent focus:ring-2 focus:ring-accent-light focus:outline-none"
        >
          {arredi.map((x) => (
            <option key={x.id} value={x.id}>
              In: {x.nome.trim() || 'Arredo senza nome'}
            </option>
          ))}
          <option value={ALTRE_VOCI}>In: Altre voci</option>
        </select>
      )}
    </li>
  )
}

function dimensioniLabel(a: ArticoloSuMisura): string {
  switch (a.um) {
    case 'MQ':
      return `${a.larghezzaCm ?? 0}×${a.altezzaCm ?? 0} cm`
    case 'ML':
      return `${a.lunghezzaMl ?? 0} ml`
    case 'PZ':
      return `${a.quantita ?? 0} pz`
  }
}
