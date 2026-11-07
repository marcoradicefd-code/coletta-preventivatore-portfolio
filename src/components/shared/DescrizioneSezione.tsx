interface DescrizioneSezioneProps {
  id: string
  label: string
  hint: string
  value: string
  onChange: (t: string) => void
}

/**
 * Casella del testo descrittivo che va in testa a una sezione del PDF.
 *
 * Sta SOPRA le voci e non nel riepilogo laterale (richiesta DOCX 25/07): in
 * Cucina è l'unica cosa che il cliente legge di quella sezione, perché le voci
 * del configuratore nel PDF sono nascoste. Una casella da due righe in fondo
 * alla colonna di destra, per un testo di dieci righe, era il posto sbagliato.
 *
 * Il `value` che riceve è già passato dal selettore di default: chi apre la
 * pagina trova il testo standard e lo modifica, invece di guardare una casella
 * vuota e doverselo ricordare. Svuotarla riporta al default (vedi
 * `@/store/quoteSelectors`), quindi non c'è modo di restare senza testo per
 * sbaglio.
 */
export function DescrizioneSezione({ id, label, hint, value, onChange }: DescrizioneSezioneProps) {
  return (
    <div className="rounded-lg bg-surface-secondary border border-separator-opaque p-4 space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-ink-primary">
        {label}
      </label>
      <p className="text-xs text-ink-tertiary">{hint}</p>
      <textarea
        id={id}
        value={value}
        rows={10}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-sm border border-separator-opaque bg-surface-tertiary px-3 py-2 text-sm text-ink-primary leading-relaxed focus:border-accent focus:ring-2 focus:ring-accent-light focus:outline-none"
      />
    </div>
  )
}
