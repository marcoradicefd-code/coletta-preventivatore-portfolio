import { usePricelistStore } from '@/store/pricelistStore'
import { StatoListino } from '@/components/shared/StatoListino'
import { MaterialSelector } from './MaterialSelector'
import { TipologiaSelector } from './TipologiaSelector'
import { TopTable } from './TopTable'
import { AlzatineTable } from './AlzatineTable'
import { LavorazioniBordoTable } from './LavorazioniBordoTable'
import { LavorazioniVarieTable } from './LavorazioniVarieTable'
import { VascaGres } from './VascaGres'
import { MarmeriaRiepilogo } from './MarmeriaRiepilogo'

export function MarmeriaPage() {
  const listino = usePricelistStore((s) => s.marmeria)

  if (!listino) return <StatoListino categoria="marmeria" />

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6 items-start">
      {/* Main content */}
      <div className="space-y-6">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-2xl text-ink-primary">Gres</h2>
          <p className="text-xs text-ink-tertiary">
            {listino.materiali.length} materiali disponibili
          </p>
        </div>

        {/* Material selector */}
        <MaterialSelector />

        {/* Top / Schienali / Fianchi */}
        <TopTable />

        {/* Tipologia lavorazioni */}
        <div className="rounded-lg bg-surface-secondary border border-separator-opaque shadow-apple-sm p-5">
          <TipologiaSelector />
        </div>

        {/* Alzatine */}
        <AlzatineTable />

        {/* Lavorazioni bordo */}
        <LavorazioniBordoTable />

        {/* Lavorazioni varie */}
        <LavorazioniVarieTable />

        {/* Vasca in gres — voce a corpo, indipendente dal listino */}
        <VascaGres />
      </div>

      {/* Sidebar riepilogo */}
      <MarmeriaRiepilogo />
    </div>
  )
}
