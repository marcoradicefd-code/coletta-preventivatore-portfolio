export interface Cliente {
  nome: string
  cognome: string
  indirizzo: string
  citta: string
  telefono: string
  email: string
}

export interface Preventivo {
  numero: string        // es. "2026-042"
  data: string          // ISO date
  validitaGiorni: number
  cliente: Cliente
  oggettoPreventivo: string
  note: string
  /**
   * Includi le condizioni contrattuali (CONDIZIONI_CONTRATTUALI) nel PDF.
   * Document-level: vale per l'intero preventivo (Su Misura e/o Marmeria).
   * Default true — le condizioni vanno sempre nel documento scritto; la
   * spunta nei riepiloghi permette di escluderle caso per caso.
   */
  includiCondizioni: boolean
  /**
   * Includi le note pagamento (`notePagamento`) nel PDF. Document-level come
   * `includiCondizioni`: la clausola vale per l'intero preventivo, non per una
   * sezione.
   *
   * OPZIONALE di proposito: nasceva su `QuoteSuMisura.includiNotePagamento`, e
   * un blob salvato prima dello spostamento non ha questa chiave. `undefined`
   * significa "non ancora deciso qui" → si legge il campo vecchio come fallback
   * (`includiNotePagamentoDi` in `@/store/quoteSelectors`). Nuovo default: true.
   */
  includiNotePagamento?: boolean
  /**
   * Testo delle note pagamento. `undefined` (o mai scritto) ⇒ si stampa
   * `NOTE_PAGAMENTO_DEFAULT`. Non si inizializza col default: se il testo
   * standard entrasse nello stato salvato, cambiarlo in futuro non cambierebbe
   * i preventivi già salvati.
   */
  notePagamento?: string
}
