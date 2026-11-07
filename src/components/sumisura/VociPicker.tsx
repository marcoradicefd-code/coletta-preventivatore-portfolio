import { useMemo, useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { Badge } from '@/components/shared/Badge'
import { CampoRicerca } from '@/components/shared/CampoRicerca'
import { CurrencyCell } from '@/components/shared/CurrencyCell'
import { corrispondeRicerca } from '@/utils/ricerca'
import type { FoglioSuMisura, VoceSuMisura } from '@/types/sumisura'

interface VociPickerProps {
  foglio: FoglioSuMisura
  onPick: (voce: VoceSuMisura) => void
}

export function VociPicker({ foglio, onPick }: VociPickerProps) {
  const [search, setSearch] = useState('')

  const voci = useMemo(() => {
    return foglio.voci
      .filter((v) => !v.isProgrammazione)
      .filter((v) => corrispondeRicerca(v.descrizione, search))
  }, [foglio.voci, search])

  return (
    <div>
      {/* Search */}
      <div className="px-4 py-3 border-b border-separator-opaque">
        <CampoRicerca
          value={search}
          onChange={setSearch}
          placeholder="Cerca voce di listino…"
          aria-label="Cerca voce di listino"
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-brand-navy text-white">
              <th className="text-left px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.04em]">Descrizione</th>
              <th className="text-center px-3 py-3 text-[12px] font-semibold uppercase tracking-[0.04em] w-20">U.M.</th>
              <th className="text-right px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.04em] w-28">Prezzo</th>
              <th className="text-right px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.04em] w-32">Azione</th>
            </tr>
          </thead>
          <tbody>
            {voci.map((voce, i) => {
              const prezzo = voce.prezzoCliente ?? voce.prezzoUnitario
              return (
                <tr
                  key={`${voce.descrizione}-${i}`}
                  className={`border-b border-separator-opaque transition-colors duration-100 hover:bg-hover-voce ${
                    i % 2 === 0 ? 'bg-surface-secondary' : 'bg-surface-tertiary/50'
                  }`}
                >
                  <td className="px-4 py-3 text-[15px] text-ink-primary">{voce.descrizione}</td>
                  <td className="px-3 py-3 text-center">
                    <Badge um={voce.unitaMisura} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <CurrencyCell value={prezzo} showZero className="text-sm text-ink-secondary" />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => onPick(voce)}
                      aria-label={`Configura ${voce.descrizione}`}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-sm border border-separator-opaque px-3 py-1.5 text-xs font-medium text-ink-secondary hover:border-brand-red hover:text-brand-red transition-colors md:min-h-9"
                    >
                      <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={1.5} />
                      Configura
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {/* U19: annunciato quando cambia (nodo sempre presente). */}
        <output className="flex items-center justify-center py-10 text-sm text-ink-tertiary empty:hidden">
          {voci.length === 0 ? 'Nessuna voce trovata' : ''}
        </output>
      </div>
    </div>
  )
}
