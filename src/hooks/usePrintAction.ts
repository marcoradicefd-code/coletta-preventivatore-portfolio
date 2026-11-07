import { createContext, useContext } from 'react'

/** Il gestore di stampa di AppShell, condiviso con i riepiloghi che hanno "Genera". */
export const PrintContext = createContext<(() => void) | null>(null)
export const usePrintAction = () => useContext(PrintContext)
