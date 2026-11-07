import { createRoot } from 'react-dom/client'
import { PreventivoPrint } from '@/components/print/PreventivoPrint'
import { useQuoteStore } from '@/store/quoteStore'
import { FALLBACK_PROGETTO_VALORE } from '@/store/quoteFallbacks'

/**
 * Il PDF del preventivo da solo, con dati FINTI e importi da 4 e 5 cifre, per
 * `e2e/impaginazione-pdf.spec.ts` (C4, C5, C6 della revisione L15-L21). Nessun
 * login, nessun database: lo store si riempie qui. La pagina la serve solo il
 * dev server di Vite; il build di produzione non la contiene.
 */
const s = useQuoteStore.getState()
s.resetAll()
s.setCliente({ nome: 'Cliente', cognome: 'Prova', email: 'prova@example.test', telefono: '000 0000000' })
const articolo = {
  origine: 'manuale' as const,
  larghezzaCm: null,
  altezzaCm: null,
  lunghezzaMl: null,
  profonditaOltre65: false,
  finituraInterna: '',
  finituraEsterna: '',
  codiceFinitura: '',
  note: '',
}
const arredo = s.addArredo('Parete attrezzata soggiorno e boiserie con tanti altri elementi')
s.addArticoloSuMisura({ ...articolo, descrizione: 'Armadio di prova', prezzoUnitario: 12500, um: 'PZ', quantita: 1, arredoId: arredo })
s.addArticoloSuMisura({ ...articolo, descrizione: 'Boiserie di prova', prezzoUnitario: 1234, um: 'MQ', larghezzaCm: 300, altezzaCm: 300, quantita: null, arredoId: arredo })
s.addArticoloSuMisura({ ...articolo, descrizione: 'Libreria di prova', prezzoUnitario: 3300, um: 'PZ', quantita: 3 })
useQuoteStore.setState((st) => ({
  sezioni: {
    ...st.sezioni,
    progettoValore: {
      ...FALLBACK_PROGETTO_VALORE,
      righe: [
        { id: 'v1', descrizione: 'Voce di prova a cinque cifre', prezzo: 99999 },
        { id: 'v2', descrizione: 'Voce di prova a quattro cifre', prezzo: 4549 },
      ],
    },
  },
}))

createRoot(document.getElementById('radice')!).render(<PreventivoPrint />)
