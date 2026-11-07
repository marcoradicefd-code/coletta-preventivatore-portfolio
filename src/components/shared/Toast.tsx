import {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CheckCircle2, AlertCircle, X } from 'lucide-react'
import { toastVariants } from '@/styles/variants'
import { ToastContext, type ContenutoNotifica, type ToastType } from './toastContext'

/**
 * Quanto vive un EVENTO di successo. Le notifiche derivate e gli errori non
 * hanno scadenza: non è un numero più grande, è l'assenza del timer (vedi
 * `setNotifica` e `showToast`).
 */
export const AUTO_DISMISS_MS = 3500

/**
 * Quanti errori a schermo, al massimo (N1, verdetto sulla #98). Gli errori non
 * scadono (U11): senza tetto, cinque «Genera» col listino mancante ne lasciavano
 * cinque, che su mobile coprivano il contenuto.
 */
const MAX_ERRORI = 3

interface Notifica extends ContenutoNotifica {
  id: string
  /** `null` = derivata da uno stato: la spegne chi l'ha accesa, non un timer. */
  durataMs: number | null
  /** Solo sulle derivate: identifica la CONDIZIONE, non il messaggio. */
  chiave?: string
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [notifiche, setNotifiche] = useState<Notifica[]>([])
  /**
   * Chiave → messaggio chiuso a mano. Chiudere vale per QUEL messaggio: se la
   * condizione cambia testo è una notizia nuova e riappare. In un ref e non
   * nello stato perché non decide cosa disegnare: filtra cosa accendere.
   */
  const chiuse = useRef(new Map<string, string>())
  const seq = useRef(0)

  const rimuovi = useCallback((id: string) => {
    setNotifiche((prec) => prec.filter((n) => n.id !== id))
  }, [])

  const chiudiAMano = useCallback((n: Notifica) => {
    if (n.chiave) chiuse.current.set(n.chiave, n.message)
    setNotifiche((prec) => prec.filter((x) => x.id !== n.id))
  }, [])

  const showToast = useCallback((message: string, type: ToastType = 'success') => {
    seq.current += 1
    const id = `evento:${seq.current}`
    // U11 (revisione L15-L21): un errore dice cosa fare, e in 3,5 s non si
    // legge. Resta finché non lo si chiude; i successi sono notizie di un istante.
    if (type !== 'error') {
      setNotifiche((prec) => [...prec, { id, message, type, durataMs: AUTO_DISMISS_MS }])
      return
    }
    // N1: un errore già a schermo con lo stesso testo non si ripete.
    setNotifiche((prec) =>
      prec.some((n) => n.type === 'error' && n.message === message)
        ? prec
        : [...senzaErroriInEccesso(prec), { id, message, type, durataMs: null }]
    )
  }, [])

  const setNotifica = useCallback((chiave: string, contenuto: ContenutoNotifica | null) => {
    if (!contenuto) {
      // La condizione è finita. Si dimentica anche la chiusura a mano: se il
      // guasto tornasse, sarebbe un fatto nuovo e non "quello già letto".
      chiuse.current.delete(chiave)
      setNotifiche((prec) =>
        prec.some((n) => n.chiave === chiave) ? prec.filter((n) => n.chiave !== chiave) : prec
      )
      return
    }
    if (chiuse.current.get(chiave) === contenuto.message) return
    chiuse.current.delete(chiave)
    setNotifiche((prec) => {
      const esistente = prec.find((n) => n.chiave === chiave)
      // Stessa identità se non cambia nulla: il mirror ri-esegue a ogni cambio
      // di `errors` e StrictMode esegue gli effetti due volte.
      if (esistente && esistente.message === contenuto.message && esistente.type === contenuto.type) {
        return prec
      }
      const voce: Notifica = { id: `chiave:${chiave}`, chiave, durataMs: null, ...contenuto }
      return esistente ? prec.map((n) => (n.chiave === chiave ? voce : n)) : [...prec, voce]
    })
  }, [])

  const valore = useMemo(() => ({ showToast, setNotifica }), [showToast, setNotifica])

  return (
    <ToastContext.Provider value={valore}>
      {children}
      {/* Su mobile sopra la barra del preventivo, fissa in basso: la sua altezza misurata (U3). */}
      <div className="fixed bottom-6 right-6 z-[100] flex flex-col items-end gap-2 max-md:bottom-[calc(var(--altezza-barra,10rem)+0.5rem)] max-md:left-4 max-md:right-4">
        <AnimatePresence initial={false}>
          {notifiche.map((n) => (
            <VoceNotifica key={n.id} notifica={n} onScade={rimuovi} onChiudi={chiudiAMano} />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}

/**
 * Fa posto a un errore nuovo: se ce ne sono già `MAX_ERRORI`, escono gli errori
 * EVENTO più vecchi. Le notifiche derivate restano: le spegne chi le ha accese,
 * quando la condizione finisce, e toglierle nasconderebbe un guasto ancora vero.
 * Il nuovo errore entra sempre: è quello che l'utente ha appena provocato.
 */
function senzaErroriInEccesso(prec: Notifica[]): Notifica[] {
  let daTogliere = prec.filter((n) => n.type === 'error').length - (MAX_ERRORI - 1)
  if (daTogliere <= 0) return prec
  return prec.filter((n) => {
    if (daTogliere > 0 && n.type === 'error' && n.chiave === undefined) {
      daTogliere -= 1
      return false
    }
    return true
  })
}

function VoceNotifica({
  notifica,
  onScade,
  onChiudi,
}: {
  notifica: Notifica
  onScade: (id: string) => void
  onChiudi: (n: Notifica) => void
}) {
  const { id, durataMs } = notifica

  useEffect(() => {
    // Una derivata non arma nessun timer: non c'è niente da far scadere.
    if (durataMs === null) return
    const timer = setTimeout(() => onScade(id), durataMs)
    return () => clearTimeout(timer)
  }, [id, durataMs, onScade])

  const isErrore = notifica.type === 'error'

  return (
    <motion.div
      // Un errore merita di interrompere lo screen reader; un "file caricato" no.
      role={isErrore ? 'alert' : 'status'}
      aria-live={isErrore ? 'assertive' : 'polite'}
      aria-atomic="true"
      variants={toastVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className={`flex max-w-md items-start gap-3 rounded-lg px-4 py-3 shadow-apple-lg
        ${isErrore ? 'bg-error text-white' : 'bg-success text-white'}`}
    >
      {isErrore ? (
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" strokeWidth={1.5} />
      ) : (
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" strokeWidth={1.5} />
      )}
      <span className="text-sm font-medium">{notifica.message}</span>
      <button
        type="button"
        onClick={() => onChiudi(notifica)}
        aria-label="Chiudi notifica"
        className="ml-2 flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded hover:bg-white/20 transition-colors md:min-h-7 md:min-w-7"
      >
        <X className="h-4 w-4" />
      </button>
    </motion.div>
  )
}
