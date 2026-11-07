import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown, Printer, UserPlus } from 'lucide-react'
import { usePrintAction } from '@/hooks/usePrintAction'
import { useQuoteStore } from '@/store/quoteStore'
import {
  chiudiErroreSalvataggio,
  revisioneAperto,
  ricaricaAperto,
  salvaAperto,
  useOccupato,
  useSalvataggio,
  useStatoSalvataggio,
} from '@/store/salvataggioStore'
import { quoteHaDati } from './sections'
import { usePrezziPreventivo, type PrezziPreventivo } from '@/hooks/usePrezziPreventivo'
import { ETICHETTA_STATO, formatNumeroPreventivo } from '@/utils/numeroPreventivo'

interface BarraPreventivoProps {
  /** Apre la scelta del cliente; `scopo` dà il titolo («Scegli il cliente per salvare»). */
  onScegliCliente: (scopo?: 'salvare') => void | Promise<void>
  /**
   * «Salva» con un cliente e qualcosa da scrivere. In AppShell è il gesto di
   * `usePrint` (strada A: su un inviato chiede la nuova revisione); senza, il
   * salvataggio dello store.
   */
  onSalva?: () => void | Promise<void>
}

/** Cosa dice la barra del salvataggio adesso (nodo `aria-live`). */
function testoDelloStato(s: {
  statoSalvataggio: ReturnType<typeof useStatoSalvataggio>
  occupato: boolean
  nessunaModifica: boolean
  salvatoAlle: Date | null
  haDati: boolean
}): string {
  if (s.statoSalvataggio === 'inCorso') return 'Salvataggio…'
  if (s.occupato) return 'Operazione in corso…'
  if (s.statoSalvataggio === 'salvato') {
    if (s.nessunaModifica) return 'Nessuna modifica da salvare'
    return s.salvatoAlle ? `Salvato alle ${s.salvatoAlle.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}` : 'Salvato'
  }
  return s.statoSalvataggio === 'modificato' || s.haDati ? 'Modifiche non salvate' : ''
}

/** La nota sui prezzi di un preventivo inviato (strada A), o `null`. */
function notaDeiPrezzi(prezzi: PrezziPreventivo): string | null {
  if (prezzi.origine === 'congelati' && prezzi.listinoCambiato && prezzi.calcolatiIl) {
    return `Prezzi del ${dataItaliana(prezzi.calcolatiIl)}: per aggiornarli fai una nuova revisione.`
  }
  if (prezzi.origine === 'senzaCongelati') {
    return 'Prezzi attuali, non quelli dell’invio: questo preventivo è stato salvato prima che l’app li conservasse.'
  }
  return null
}

/** «01/10/2026», nell'ora italiana: la data dei prezzi congelati. */
function dataItaliana(iso: string): string {
  return new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Rome' })
}

// U6: spenti con `aria-disabled` (restano focalizzabili e riprendono il focus
// alla chiusura di una conferma), e il clic a vuoto non fa niente.
const PULSANTE =
  'inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-sm px-4 py-2 text-sm transition-colors md:min-h-10 md:flex-none aria-disabled:cursor-not-allowed aria-disabled:opacity-60'

/**
 * La barra del preventivo (L21-B, § 3.1): dove si è e cosa succede, sempre in
 * vista. Numero e stato del preventivo («Non ancora salvato» finché il database
 * non lo numera), il cliente (o «Scegli il cliente», che apre la scelta), lo
 * stato del salvataggio annunciato con `aria-live`, «Salva» (secondario) e
 * «Genera Preventivo» (il solo primario della vista).
 *
 * Desktop: in cima al contenuto, ferma allo scorrere. Mobile (< 768 px): fissa
 * in basso, numero e cliente su una riga e i due pulsanti sotto; sotto il
 * pannello di navigazione (z-index), e `main` ha lo spazio in fondo per non
 * coprire i campi. Un'unica struttura per i due casi, solo CSS: niente doppioni
 * per lo screen reader.
 *
 * La sua altezza, misurata, sta in `--altezza-barra` sulla radice: da desktop
 * la usano i riepiloghi (`xl:sticky-sotto-barra`) e lo scorrimento della
 * pagina (`scroll-padding-top`, `index.css`), così la barra ferma in cima non
 * copre la testata dei riepiloghi né il campo che prende il focus. Misurata e
 * non scritta a mano: cresce col pannello d'errore e quando va a capo
 * (revisione del 14/10 sulla #97, difetto 3).
 */
export function BarraPreventivo({ onScegliCliente, onSalva }: Readonly<BarraPreventivoProps>) {
  const salvato = useQuoteStore((s) => s.archivio?.preventivo ?? null)
  const clienteId = useQuoteStore((s) => s.archivio?.clienteId ?? null)
  const cliente = useQuoteStore((s) => s.preventivo.cliente)
  const haDati = useQuoteStore((s) => quoteHaDati(s.preventivo, s.sezioni))
  const statoSalvataggio = useStatoSalvataggio()
  const salvatoAlle = useSalvataggio((s) => s.salvatoAlle)
  const errore = useSalvataggio((s) => s.errore)
  const ultimo = useSalvataggio((s) => s.ultimo)
  const occupato = useOccupato()
  const genera = usePrintAction()
  const notaPrezzi = notaDeiPrezzi(usePrezziPreventivo())
  const statoId = useId()
  const barraRef = useRef<HTMLElement>(null)
  // «Salva» senza modifiche: la fotografia per cui l'ha detto. Un salvataggio,
  // un'apertura o una modifica la cambiano, e la nota sparisce da sola.
  const [nessunaModificaPer, setNessunaModificaPer] = useState<object | null>(null)

  useEffect(() => {
    const barra = barraRef.current
    // jsdom e i browser molto vecchi non hanno ResizeObserver: la variabile resta
    // assente e i riepiloghi ripiegano sul margine fisso (`0px` nel `var`).
    if (!barra || typeof ResizeObserver === 'undefined') return
    const radice = document.documentElement
    const misura = () => radice.style.setProperty('--altezza-barra', `${barra.offsetHeight}px`)
    misura()
    const osservatore = new ResizeObserver(misura)
    osservatore.observe(barra)
    return () => {
      osservatore.disconnect()
      radice.style.removeProperty('--altezza-barra')
    }
  }, [])

  const inCorso = statoSalvataggio === 'inCorso'
  const spenti = inCorso || occupato
  const nomeCliente = `${cliente.nome} ${cliente.cognome}`.trim() || 'scelto dall’anagrafica'

  const salva = () => {
    if (spenti) return
    if (!clienteId) void onScegliCliente('salvare')
    // Niente da scrivere: lo dice, e nessun UPDATE (difetto 12).
    else if (statoSalvataggio === 'salvato') setNessunaModificaPer(ultimo)
    else void (onSalva ?? salvaAperto)()
  }

  const testoStato = testoDelloStato({
    statoSalvataggio,
    occupato,
    nessunaModifica: nessunaModificaPer !== null && nessunaModificaPer === ultimo,
    salvatoAlle,
    haDati,
  })

  return (
    <section
      ref={barraRef}
      aria-label="Barra del preventivo"
      className="fixed inset-x-0 bottom-0 z-10 border-t border-separator-opaque bg-surface-secondary px-4 py-3 shadow-apple-md md:sticky md:top-0 md:bottom-auto md:-mx-6 md:-mt-6 md:mb-6 md:border-t-0 md:border-b md:px-6 md:shadow-none lg:-mx-8 lg:-mt-8 lg:px-8"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {/* U3: su mobile numero e stato su una riga loro, il cliente sotto; da desktop una riga sola. */}
        <div className="flex min-w-0 flex-1 items-center gap-3 max-md:w-full max-md:flex-col max-md:items-stretch max-md:gap-2 md:flex-none">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink-primary tabular-nums md:truncate">
              {salvato ? `N. ${formatNumeroPreventivo(salvato)} · ${ETICHETTA_STATO[salvato.stato]}` : 'Non ancora salvato'}
            </p>
            {!salvato && <p className="text-xs text-ink-tertiary max-md:hidden">Il numero arriva al primo salvataggio</p>}
          </div>
          <button
            type="button"
            onClick={() => void onScegliCliente()}
            className={`inline-flex min-h-11 min-w-0 items-center gap-1.5 rounded-sm px-3 text-sm md:min-h-10 ${
              clienteId
                ? 'border border-separator-opaque text-ink-primary hover:bg-surface-tertiary'
                : 'border border-dashed border-brand-red font-semibold text-brand-red hover:bg-brand-red-light'
            }`}
          >
            {clienteId ? (
              <>
                <span className="truncate">Cliente: {nomeCliente}</span>
                <ChevronDown className="h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
              </>
            ) : (
              <>
                <UserPlus className="h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
                Scegli il cliente
              </>
            )}
          </button>
        </div>

        {/* Sempre nel DOM: `aria-live` annuncia solo i cambi di un nodo già presente. */}
        <p id={statoId} aria-live="polite" className="flex items-center gap-1.5 text-xs text-ink-secondary max-md:w-full md:text-sm">
          {testoStato === 'Modifiche non salvate' && <span aria-hidden="true" className="h-2 w-2 rounded-full bg-warning" />}
          {testoStato}
        </p>

        <div className="flex w-full gap-3 md:ml-auto md:w-auto">
          <button
            type="button"
            onClick={salva}
            aria-disabled={spenti || undefined}
            aria-describedby={statoId}
            className={`${PULSANTE} border border-separator-opaque bg-surface-secondary font-medium text-ink-primary hover:bg-surface-tertiary`}
          >
            Salva
          </button>
          <button
            type="button"
            onClick={() => {
              if (!spenti) genera?.()
            }}
            aria-disabled={spenti || undefined}
            aria-describedby={statoId}
            className={`${PULSANTE} bg-brand-red font-semibold text-white shadow-red hover:bg-brand-red-dark`}
          >
            <Printer className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
            Genera Preventivo
          </button>
        </div>
      </div>

      {notaPrezzi && <p className="mt-2 text-xs text-ink-secondary md:text-sm">{notaPrezzi}</p>}

      {errore && (
        // U3: col pannello d'errore la barra non copre più di metà schermo (scorre dentro).
        <div role="alert" className="mt-3 max-h-[40dvh] space-y-2 overflow-y-auto rounded-sm bg-error-bg px-3 py-2 text-sm text-error">
          <p>{errore.errore}</p>
          <div className="flex flex-wrap gap-2">
            {errore.conflitto ? (
              <>
                <button type="button" onClick={() => void ricaricaAperto()} className="min-h-11 rounded-sm border border-error px-3 md:min-h-9">
                  Ricarica la versione salvata
                </button>
                <button type="button" onClick={() => void revisioneAperto()} className="min-h-11 rounded-sm border border-error px-3 md:min-h-9">
                  Salva le mie modifiche come nuova revisione
                </button>
              </>
            ) : (
              <button type="button" onClick={errore.riprova} className="min-h-11 rounded-sm border border-error px-3 md:min-h-9">
                Riprova
              </button>
            )}
            <button type="button" onClick={chiudiErroreSalvataggio} className="min-h-11 rounded-sm px-3 underline md:min-h-9">
              Lascia così
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
