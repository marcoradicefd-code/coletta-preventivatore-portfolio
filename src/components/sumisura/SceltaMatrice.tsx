import { useId } from 'react'
import { chiaveMatrice, esterniMatrice, interniMatrice, tipiMatrice } from '@/engine/matriceFiniture'
import type { CombinazioneMatrice, RigaMatrice } from '@/types/sumisura'

/**
 * La scelta a cascata di un elemento da matrice (L20): Tipo → Interno → Esterno.
 * Ogni tendina offre solo quello che esiste nella matrice dopo le scelte di
 * sopra; un tipo senza interni («qualsiasi interno») salta l'Interno. Cambiare
 * una scelta azzera quelle sotto. Il prezzo lo calcola chi la usa.
 */
export function SceltaMatrice({
  matrice,
  value,
  onChange,
}: Readonly<{
  matrice: readonly RigaMatrice[]
  value: CombinazioneMatrice
  onChange: (c: CombinazioneMatrice) => void
}>) {
  const id = useId()
  const tipi = tipiMatrice(matrice)
  const tipo = trova(tipi, value.tipo)
  const interni = tipo ? interniMatrice(matrice, tipo) : []
  const qualsiasiInterno = tipo !== '' && interni.length === 0
  const interno = trova(interni, value.interno)
  // C7: un elemento salvato prima della correzione, su un tipo misto, ha
  // l'interno vuoto e l'esterno della riga generica: si riapre con l'esterno.
  const generico = value.interno === '' && value.esterno !== ''
  const esterni = tipo && (interno || qualsiasiInterno || generico) ? esterniMatrice(matrice, tipo, interno) : []
  const esterno = trova(esterni, value.esterno)

  return (
    <div className="grid grid-cols-1 gap-3">
      <Tendina
        id={`${id}-tipo`}
        label="Tipo"
        value={tipo}
        opzioni={tipi}
        onChange={(t) => onChange({ tipo: t, interno: '', esterno: '' })}
      />
      {qualsiasiInterno ? (
        <div className="space-y-1">
          <span className="block text-xs font-medium uppercase tracking-wider text-ink-tertiary">Interno</span>
          <p className="flex items-center px-1 text-sm text-ink-secondary" style={{ minHeight: 44 }}>
            Qualsiasi
          </p>
        </div>
      ) : (
        <Tendina
          id={`${id}-interno`}
          label="Interno"
          value={interno}
          opzioni={interni}
          disabled={tipo === ''}
          onChange={(i) => onChange({ tipo, interno: i, esterno: '' })}
        />
      )}
      <Tendina
        id={`${id}-esterno`}
        label="Esterno"
        value={esterno}
        opzioni={esterni}
        disabled={esterni.length === 0}
        onChange={(e) => onChange({ tipo, interno, esterno: e })}
      />
    </div>
  )
}

/** L'opzione con la stessa chiave del valore salvato, o '' se non c'è (un listino cambiato). */
function trova(opzioni: readonly string[], valore: string): string {
  if (valore === '') return ''
  return opzioni.find((o) => chiaveMatrice(o) === chiaveMatrice(valore)) ?? ''
}

function Tendina({
  id,
  label,
  value,
  opzioni,
  disabled,
  onChange,
}: Readonly<{
  id: string
  label: string
  value: string
  opzioni: readonly string[]
  disabled?: boolean
  onChange: (v: string) => void
}>) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-xs font-medium uppercase tracking-wider text-ink-tertiary">
        {label}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-sm border border-separator-opaque bg-surface-tertiary px-3 py-2 text-sm text-ink-primary focus:border-accent focus:ring-2 focus:ring-accent-light focus:outline-none disabled:opacity-50"
        style={{ minHeight: 44 }}
      >
        <option value="">Scegli…</option>
        {opzioni.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  )
}
