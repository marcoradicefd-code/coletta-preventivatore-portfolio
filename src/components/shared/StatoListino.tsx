import type { ReactNode } from 'react'
import { AlertCircle, ChefHat, DoorOpen, FileSpreadsheet, Loader2, type LucideIcon } from 'lucide-react'
import { usePricelistStore, ETICHETTA } from '@/store/pricelistStore'

/**
 * Chiavi degli errori nello store — NON le `Categoria` del parser (`sumisura`).
 * Le due sono separate perché lo store è camelCase e il parser no; l'etichetta
 * utente però è una sola, e viene da lì.
 */
export type CategoriaListino = 'suMisura' | 'marmeria' | 'porte' | 'cucine'

const CONFIG: Record<CategoriaListino, { etichetta: string; Icona: LucideIcon }> = {
  suMisura: { etichetta: ETICHETTA.sumisura, Icona: FileSpreadsheet },
  marmeria: { etichetta: ETICHETTA.marmeria, Icona: FileSpreadsheet },
  porte: { etichetta: ETICHETTA.porte, Icona: DoorOpen },
  cucine: { etichetta: ETICHETTA.cucine, Icona: ChefHat },
}

/**
 * Cosa vedere al posto della pagina quando il listino non c'è.
 *
 * Uno solo per tutte e tre le sezioni, e non per brevità: erano tre copie della
 * stessa idea, ed è così che due copie divergono (le righe e il totale della
 * #18). Qui la divergenza sarebbe peggio — un errore mostrato su una sezione e
 * taciuto sulle altre.
 *
 * Tre stati, dove prima ce n'era uno: "non caricato" copriva anche il
 * caricamento in corso (bugia per un secondo) e il caricamento FALLITO — e chi
 * rompeva un listino leggeva "non caricato", ricaricava lo stesso file rotto, e
 * ricominciava.
 */
export function StatoListino({ categoria }: { categoria: CategoriaListino }) {
  const errore = usePricelistStore((s) => s.errors[categoria])
  const inCaricamento = usePricelistStore((s) => s.loadingDefaults)
  const { etichetta, Icona } = CONFIG[categoria]

  // L'errore vince sul caricamento: un retry in corso non nasconde il guasto che
  // l'ha reso necessario.
  if (errore) {
    return (
      <Cornice Icona={AlertCircle} tono="errore">
        <p className="text-base font-semibold text-error">Caricamento listino {etichetta} fallito</p>
        <p className="text-sm text-ink-secondary max-w-md">{errore}</p>
        <p className="text-sm text-ink-tertiary max-w-xs">
          Correggi il file e ricaricalo dalla sezione <span className="font-medium">Listini</span>{' '}
          nella sidebar.
        </p>
      </Cornice>
    )
  }

  if (inCaricamento) {
    return (
      <Cornice Icona={Loader2} tono="neutro" ruota>
        <p className="text-base font-semibold text-ink-primary">Caricamento in corso…</p>
        <p className="text-sm text-ink-tertiary max-w-xs">Sto leggendo il listino {etichetta}.</p>
      </Cornice>
    )
  }

  return (
    <Cornice Icona={Icona} tono="neutro">
      <p className="text-base font-semibold text-ink-primary">Listino {etichetta} non caricato</p>
      <p className="text-sm text-ink-tertiary max-w-xs">
        Carica il file Excel dalla sezione <span className="font-medium">Listini</span> nella sidebar
        per iniziare.
      </p>
    </Cornice>
  )
}

function Cornice({
  Icona,
  tono,
  ruota = false,
  children,
}: {
  Icona: LucideIcon
  tono: 'neutro' | 'errore'
  ruota?: boolean
  children: ReactNode
}) {
  const isErrore = tono === 'errore'
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-5">
      <div
        className={`flex h-16 w-16 items-center justify-center rounded-xl ${
          isErrore ? 'bg-error/5' : 'bg-brand-navy/5'
        }`}
      >
        <Icona
          className={`h-8 w-8 ${isErrore ? 'text-error/60' : 'text-brand-navy/30'} ${
            ruota ? 'animate-spin' : ''
          }`}
          strokeWidth={1.5}
        />
      </div>
      <div className="text-center space-y-1.5">{children}</div>
    </div>
  )
}
