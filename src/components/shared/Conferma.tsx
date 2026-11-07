import { Finestra } from './Finestra'
import { STILE_PULSANTE } from '@/styles/pulsanti'

/** Un'azione della conferma: il valore che `chiedi` restituisce, e un verbo esplicito. */
export interface AzioneConferma {
  valore: string
  etichetta: string
  tipo: keyof typeof STILE_PULSANTE
}

export interface Domanda {
  titolo: string
  testo: string
  /** Nell'ordine a schermo da desktop: la prima è a sinistra e prende il focus. */
  azioni: AzioneConferma[]
}

interface ConfermaProps {
  domanda: Domanda | null
  /** Il valore dell'azione scelta; `null` con Esc. */
  onRisposta: (valore: string | null) => void
}

/**
 * La conferma del design system, al posto di `window.confirm` (L21-B, § 3.4):
 * `role="alertdialog"`, titolo e testo collegati, verbi espliciti sui pulsanti
 * («Annulla il preventivo» / «Torna indietro», mai «Annulla / OK»). Il focus
 * parte dalla prima azione, che è quella che non fa danni. Su mobile è un
 * pannello dal basso (`Finestra`).
 */
export function Conferma({ domanda, onRisposta }: Readonly<ConfermaProps>) {
  return (
    <Finestra
      aperta={domanda !== null}
      ruolo="alertdialog"
      titolo={domanda?.titolo}
      descrizione={domanda?.testo}
      onChiudi={() => onRisposta(null)}
      azioni={domanda?.azioni.map((a) => (
        <button key={a.valore} type="button" onClick={() => onRisposta(a.valore)} className={STILE_PULSANTE[a.tipo]}>
          {a.etichetta}
        </button>
      ))}
    />
  )
}
