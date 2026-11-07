import { Hammer } from 'lucide-react'

/**
 * Placeholder per le sezioni non ancora implementate (cucine/porte/progettoValore,
 * fasi 6-8). Navigabile, ma comunica che la sezione arriverà e NON entra nel PDF
 * (le sezioni vuote sono escluse dalla stampa — vedi `sezioneNonVuota`).
 */
export function SezioneInArrivo({ nome }: { nome: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-5">
      <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-brand-navy/5">
        <Hammer className="h-8 w-8 text-brand-navy/30" strokeWidth={1.5} />
      </div>
      <div className="text-center space-y-1.5">
        <p className="text-base font-semibold text-ink-primary">{nome} — in arrivo</p>
        <p className="text-sm text-ink-tertiary max-w-xs">
          Questa sezione sarà disponibile in una fase successiva. Finché è vuota
          resta navigabile ma non compare nel preventivo PDF.
        </p>
      </div>
    </div>
  )
}
