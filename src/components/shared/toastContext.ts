import { createContext, useContext } from 'react'

export type ToastType = 'success' | 'error'

export interface ContenutoNotifica {
  message: string
  type: ToastType
}

export interface ToastContextValue {
  /** Notizia di un istante (successo, validazione di un click): scade da sola. */
  showToast: (message: string, type?: ToastType) => void
  /**
   * Notifica DERIVATA da uno stato: vive finché la condizione è vera, `null` la
   * spegne. Idempotente sulla chiave — richiamarla con lo stesso contenuto non
   * duplica e non resuscita una notifica chiusa a mano.
   */
  setNotifica: (chiave: string, contenuto: ContenutoNotifica | null) => void
}

export const ToastContext = createContext<ToastContextValue>({
  showToast: () => {},
  setNotifica: () => {},
})

export const useToast = () => useContext(ToastContext)
