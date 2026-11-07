import { useEffect, useId, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { FolderPlus, Grid3x3, Plus } from 'lucide-react'
import { usePricelistStore } from '@/store/pricelistStore'
import { StatoListino } from '@/components/shared/StatoListino'
import { useQuoteStore } from '@/store/quoteStore'
import { SheetTabs } from './SheetTabs'
import { VociPicker } from './VociPicker'
import { SuMisuraRiepilogo } from './SuMisuraRiepilogo'
import { ArticoloConfigModal } from './ArticoloConfigModal'
import type { ArticoloSuMisura, VoceSuMisura } from '@/types/sumisura'
import { DescrizioneSezione } from '@/components/shared/DescrizioneSezione'
import { FALLBACK_ARREDI } from '@/store/quoteFallbacks'
import { descrizioneArrediDi } from '@/store/quoteSelectors'
import { righeMatrice } from '@/engine/matriceFiniture'

type Draft = Omit<ArticoloSuMisura, 'id'>

type ModalState =
  | null
  | { modalita: 'nuovo'; iniziale: Draft }
  | { modalita: 'modifica'; id: string; iniziale: Draft }

const draftVuoto: Draft = {
  origine: 'manuale',
  descrizione: '',
  prezzoUnitario: 0,
  um: 'MQ',
  larghezzaCm: null,
  altezzaCm: null,
  lunghezzaMl: null,
  quantita: null,
  profonditaOltre65: false,
  finituraInterna: '',
  finituraEsterna: '',
  codiceFinitura: '',
  note: '',
}

function draftDaVoce(voce: VoceSuMisura): Draft {
  return {
    ...draftVuoto,
    origine: 'listino',
    descrizione: voce.descrizione,
    prezzoUnitario: voce.prezzoCliente ?? voce.prezzoUnitario,
    um: voce.unitaMisura === 'MQ' ? 'MQ' : voce.unitaMisura === 'ML' ? 'ML' : 'PZ',
  }
}

export function SuMisuraPage() {
  const listino = usePricelistStore((s) => s.suMisura)
  const addArticolo = useQuoteStore((s) => s.addArticoloSuMisura)
  const updateArticolo = useQuoteStore((s) => s.updateArticoloSuMisura)
  const arredi = useQuoteStore((s) => s.sezioni.arredi ?? FALLBACK_ARREDI)
  const setDescrizione = useQuoteStore((s) => s.setDescrizioneArredi)
  const addArredo = useQuoteStore((s) => s.addArredo)

  const fogli = listino?.fogli ?? []
  // L20: la matrice FINITURE e, per un elemento nuovo da matrice, le lavorazioni
  // del foglio FINITURE e gli accessori del foglio ACCESSORI (senza la quota a VALORE).
  const matrice = righeMatrice(fogli)
  const extraMatrice = fogli
    .filter((f) => f.matrice || f.nome.trim().toUpperCase() === 'ACCESSORI')
    .flatMap((f) => f.voci)
    .filter((v) => v.unitaMisura !== 'VALORE')
  const [activeFoglio, setActiveFoglio] = useState<string>('')
  const [modal, setModal] = useState<ModalState>(null)
  // L19: dove vanno le voci scelte dal listino o manuali. Un arredo tolto nel
  // frattempo vale «Altre voci», come in `raggruppaPerArredo`.
  const [destinazione, setDestinazione] = useState<string | undefined>(undefined)
  const [nuovoArredo, setNuovoArredo] = useState<string | null>(null)
  const pickerRef = useRef<HTMLDivElement>(null)
  const nomeArredoRef = useRef<HTMLInputElement>(null)
  const destinazioneId = useId()
  const formArredoAperto = nuovoArredo !== null
  useEffect(() => {
    if (formArredoAperto) nomeArredoRef.current?.focus()
  }, [formArredoAperto])
  const arrediElenco = arredi.arredi ?? []
  const arredoId = arrediElenco.some((x) => x.id === destinazione) ? destinazione : undefined

  const creaArredo = () => {
    const nome = (nuovoArredo ?? '').trim()
    if (nome === '') return
    // Il nuovo arredo diventa la destinazione: il passo dopo è riempirlo.
    setDestinazione(addArredo(nome))
    setNuovoArredo(null)
  }

  // «Aggiungi elemento» di un arredo: il listino, con quell'arredo già scelto.
  const aggiungiElemento = (id: string) => {
    setDestinazione(id)
    pickerRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
    pickerRef.current?.querySelector('input')?.focus({ preventScroll: true })
  }

  const currentFoglioName = activeFoglio || fogli[0]?.nome || ''
  const currentFoglio = fogli.find((f) => f.nome === currentFoglioName)

  const handleSalva = (draft: Draft, extra: Draft[]) => {
    if (modal?.modalita === 'modifica') {
      updateArticolo(modal.id, draft)
    } else {
      addArticolo(draft)
      for (const e of extra) addArticolo(e)
    }
    setModal(null)
  }

  if (!listino) return <StatoListino categoria="suMisura" />

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-6 items-start">
      {/* Main */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-2xl text-ink-primary">Arredi</h2>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setNuovoArredo('')}
              className="inline-flex items-center gap-1.5 rounded-sm border border-separator-opaque px-3 py-2 text-sm font-medium text-ink-secondary hover:border-brand-red hover:text-brand-red transition-colors"
              style={{ minHeight: 40 }}
            >
              <FolderPlus className="h-4 w-4" strokeWidth={1.5} />
              Nuovo arredo
            </button>
            {matrice.length > 0 && (
              <button
                onClick={() =>
                  setModal({
                    modalita: 'nuovo',
                    iniziale: { ...draftVuoto, origine: 'listino', combinazione: { tipo: '', interno: '', esterno: '' }, arredoId },
                  })
                }
                className="inline-flex items-center gap-1.5 rounded-sm border border-separator-opaque px-3 py-2 text-sm font-medium text-ink-secondary hover:border-brand-red hover:text-brand-red transition-colors"
                style={{ minHeight: 40 }}
              >
                <Grid3x3 className="h-4 w-4" strokeWidth={1.5} />
                Nuovo elemento da matrice
              </button>
            )}
            <button
              onClick={() => setModal({ modalita: 'nuovo', iniziale: { ...draftVuoto, arredoId } })}
              className="inline-flex items-center gap-1.5 rounded-sm border border-separator-opaque px-3 py-2 text-sm font-medium text-ink-secondary hover:border-brand-red hover:text-brand-red transition-colors"
              style={{ minHeight: 40 }}
            >
              <Plus className="h-4 w-4" strokeWidth={1.5} />
              Aggiungi voce manuale
            </button>
          </div>
        </div>

        {/* «Nuovo arredo» chiede il nome (L19). Invio crea, Esc annulla. */}
        {formArredoAperto && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              creaArredo()
            }}
            className="flex flex-wrap items-center gap-2 rounded-md border border-separator-opaque bg-surface-secondary p-3"
          >
            <input
              ref={nomeArredoRef}
              value={nuovoArredo}
              onChange={(e) => setNuovoArredo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setNuovoArredo(null)
              }}
              aria-label="Nome del nuovo arredo"
              maxLength={60}
              placeholder="Es. Ingresso, Matrimoniale"
              className="min-w-0 flex-1 rounded-sm border border-separator-opaque bg-surface-tertiary px-3 py-2 text-sm text-ink-primary focus:border-accent focus:ring-2 focus:ring-accent-light focus:outline-none"
            />
            <button
              type="submit"
              disabled={nuovoArredo.trim() === ''}
              className="rounded-sm bg-brand-red px-3 py-2 text-sm font-semibold text-white hover:bg-brand-red-dark transition-colors disabled:opacity-40 disabled:pointer-events-none"
              style={{ minHeight: 40 }}
            >
              Crea arredo
            </button>
            <button
              type="button"
              onClick={() => setNuovoArredo(null)}
              className="rounded-sm border border-separator-opaque px-3 py-2 text-sm font-medium text-ink-secondary hover:bg-surface-tertiary transition-colors"
              style={{ minHeight: 40 }}
            >
              Annulla
            </button>
          </form>
        )}

        {/* Caratteristiche generali: SOPRA le voci (richiesta DOCX 25/07).
            Vanno in testa alla sezione Arredi del PDF. */}
        <DescrizioneSezione
          id="descrizione-arredi"
          label="Descrizione in preventivo"
          hint="Compare in testa alla sezione Falegnameria Su Misura del PDF, sopra le voci."
          value={descrizioneArrediDi(arredi)}
          onChange={setDescrizione}
        />

        <SheetTabs fogli={fogli} activeFoglio={currentFoglioName} onSelect={setActiveFoglio} />

        {arrediElenco.length > 0 && (
          <div className="flex min-w-0 items-center gap-2">
            <label htmlFor={destinazioneId} className="shrink-0 text-sm text-ink-secondary">
              Aggiungi in
            </label>
            <select
              id={destinazioneId}
              value={arredoId ?? ''}
              onChange={(e) => setDestinazione(e.target.value || undefined)}
              className="min-h-11 min-w-0 max-w-full flex-1 truncate rounded-sm border border-separator-opaque bg-surface-secondary px-2 py-1.5 text-sm font-medium text-ink-primary md:min-h-9 md:flex-none focus:border-accent focus:ring-2 focus:ring-accent-light focus:outline-none"
            >
              {arrediElenco.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nome.trim() || 'Arredo senza nome'}
                </option>
              ))}
              <option value="">Altre voci</option>
            </select>
          </div>
        )}

        <AnimatePresence mode="wait">
          {currentFoglio && (
            <motion.div
              key={currentFoglioName}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="rounded-lg bg-surface-secondary border border-separator-opaque shadow-apple-sm overflow-hidden"
            >
              <div ref={pickerRef} className="scroll-mt-8">
                <VociPicker
                  foglio={currentFoglio}
                  onPick={(voce) => setModal({ modalita: 'nuovo', iniziale: { ...draftDaVoce(voce), arredoId } })}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Riepilogo */}
      <SuMisuraRiepilogo
        onEdit={(a) => {
          const { id, ...iniziale } = a
          setModal({ modalita: 'modifica', id, iniziale })
        }}
        onAggiungiElemento={aggiungiElemento}
      />

      {/* Modal config */}
      <AnimatePresence>
        {modal && (
          <ArticoloConfigModal
            iniziale={modal.iniziale}
            modalita={modal.modalita}
            onSalva={handleSalva}
            onClose={() => setModal(null)}
            matrice={matrice}
            extra={extraMatrice}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
