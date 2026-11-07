import { useEffect, useId, useState } from 'react'
import { STILE_PULSANTE } from '@/styles/pulsanti'
import { stessiDati, type ClienteDb, type DatiCliente } from '@/lib/clientiDb'

/** I campi della scheda, nell'ordine a schermo. Il token `cliente-*` non è riconosciuto dal browser (O35, rule `ui`). */
const CAMPI: { chiave: keyof DatiCliente; etichetta: string; token: string; tipo?: string; largo?: boolean }[] = [
  { chiave: 'ragione_sociale', token: 'cliente-ragionesociale', etichetta: 'Ragione sociale o nome completo', largo: true },
  { chiave: 'nome', token: 'cliente-nome', etichetta: 'Nome' },
  { chiave: 'cognome', token: 'cliente-cognome', etichetta: 'Cognome' },
  { chiave: 'telefono', token: 'cliente-telefono', etichetta: 'Telefono', tipo: 'tel' },
  { chiave: 'email', token: 'cliente-email', etichetta: 'Email', tipo: 'email' },
  { chiave: 'indirizzo', token: 'cliente-indirizzo', etichetta: 'Indirizzo', largo: true },
  { chiave: 'cap', token: 'cliente-cap', etichetta: 'CAP' },
  { chiave: 'localita', token: 'cliente-localita', etichetta: 'Località' },
  { chiave: 'provincia', token: 'cliente-provincia', etichetta: 'Provincia' },
  { chiave: 'partita_iva', token: 'cliente-partitaiva', etichetta: 'Partita IVA' },
]

const VUOTO: DatiCliente = {
  ragione_sociale: '',
  nome: null,
  cognome: null,
  telefono: null,
  email: null,
  indirizzo: null,
  cap: null,
  localita: null,
  provincia: null,
  partita_iva: null,
  note: null,
}

/** Nota art. 9 GDPR: i campi liberi non sono il posto per le categorie particolari. */
export const NOTA_DATI_PARTICOLARI =
  'Solo ciò che serve al preventivo. Non scrivere qui dati sensibili (salute, convinzioni religiose o politiche, origine, vita sessuale): non servono e non vanno raccolti.'

const CLASSE_INPUT =
  'w-full rounded-sm border border-separator-opaque bg-surface-tertiary px-3.5 py-2.5 text-[17px] text-ink-primary placeholder:text-ink-tertiary transition-[border-color,box-shadow] duration-150 focus:border-accent focus:ring-2 focus:ring-accent-light focus:outline-none'

interface SchedaClienteProps {
  /** Il cliente da modificare; `null` = cliente nuovo. */
  cliente: ClienteDb | null
  /** Per un cliente nuovo: la ragione sociale già scritta (da «Crea "…"» della ricerca). */
  ragioneSocialeIniziale?: string
  inCorso: boolean
  /** L'esito dell'ultimo salvataggio, mostrato accanto ai pulsanti (non in cima alla pagina). */
  esito?: { testo: string; errore: boolean } | null
  onSalva: (dati: DatiCliente) => void
  onChiudi: () => void
  /** U14: la scheda ha modifiche non salvate (rispetto al cliente, o al modulo vuoto). */
  onModificata?: (modificata: boolean) => void
}

/**
 * La scheda di un cliente: tutti i campi dell'anagrafica, niente codice fiscale.
 *
 * L21-B, anomalia del 13/10 (5 PATCH in 5 secondi): la conferma stava in cima
 * alla pagina, fuori vista, e «Salva modifiche» (o Invio in un campo) scriveva
 * anche senza cambiamenti. Ora l'esito è qui accanto, annunciato, e senza
 * modifiche non parte nessuna scrittura.
 *
 * L'esito parla dell'ultimo invio: una modifica dopo lo toglie, o «Modifiche
 * salvate alle…» resterebbe accanto a modifiche che non lo sono (revisione del
 * 14/10, difetto 5). Torna al prossimo invio.
 */
export function SchedaCliente({ cliente, ragioneSocialeIniziale, inCorso, esito, onSalva, onChiudi, onModificata }: Readonly<SchedaClienteProps>) {
  const base = useId()
  const [iniziali] = useState<DatiCliente>(() => ({ ...VUOTO, ragione_sociale: ragioneSocialeIniziale ?? '' }))
  const [dati, setDati] = useState<DatiCliente>(() => (cliente ? { ...VUOTO, ...soloDati(cliente) } : iniziali))
  const modificata = !stessiDati(dati, cliente ? soloDati(cliente) : iniziali)
  useEffect(() => {
    onModificata?.(modificata)
  }, [modificata, onModificata])
  const [nessunaModifica, setNessunaModifica] = useState(false)
  const [esitoVisibile, setEsitoVisibile] = useState(true)
  const imposta = (chiave: keyof DatiCliente, valore: string) => {
    setNessunaModifica(false)
    setEsitoVisibile(false)
    setDati((d) => ({ ...d, [chiave]: valore }))
  }
  let messaggio: SchedaClienteProps['esito'] = null
  if (nessunaModifica) messaggio = { testo: 'Nessuna modifica da salvare.', errore: false }
  else if (esitoVisibile) messaggio = esito

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault()
        setEsitoVisibile(true)
        if (cliente && stessiDati(dati, soloDati(cliente))) {
          setNessunaModifica(true)
          return
        }
        setNessunaModifica(false)
        onSalva(dati)
      }}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {CAMPI.map((c) => (
          <div key={c.chiave} className={`space-y-1 ${c.largo ? 'sm:col-span-2' : ''}`}>
            <label htmlFor={`${base}-${c.chiave}`} className="block text-xs font-medium uppercase tracking-wider text-ink-tertiary">
              {c.etichetta}
              {c.chiave === 'ragione_sociale' && <span className="text-brand-red" aria-hidden="true"> *</span>}
            </label>
            <input
              id={`${base}-${c.chiave}`}
              type={c.tipo ?? 'text'}
              autoComplete={c.token}
              required={c.chiave === 'ragione_sociale'}
              value={dati[c.chiave] ?? ''}
              onChange={(e) => imposta(c.chiave, e.target.value)}
              className={CLASSE_INPUT}
            />
          </div>
        ))}
      </div>
      <div className="space-y-1">
        <label htmlFor={`${base}-note`} className="block text-xs font-medium uppercase tracking-wider text-ink-tertiary">
          Note
        </label>
        <textarea
          id={`${base}-note`}
          rows={3}
          value={dati.note ?? ''}
          onChange={(e) => imposta('note', e.target.value)}
          aria-describedby={`${base}-nota-art9`}
          className={`${CLASSE_INPUT} resize-y`}
        />
        <p id={`${base}-nota-art9`} className="text-xs text-ink-tertiary">
          {NOTA_DATI_PARTICOLARI}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={inCorso} className={`${STILE_PULSANTE.primario} disabled:opacity-60 md:min-h-9`}>
          {cliente ? 'Salva modifiche' : 'Crea cliente'}
        </button>
        <button type="button" onClick={onChiudi} className={`${STILE_PULSANTE.secondario} md:min-h-9`}>
          Chiudi
        </button>
        {/* Sempre nel DOM: `aria-live` annuncia solo i cambi di un nodo già presente. */}
        <output aria-live="polite" className={`text-sm ${messaggio?.errore ? 'text-error' : 'text-ink-secondary'}`}>
          {inCorso ? 'Salvataggio…' : (messaggio?.testo ?? '')}
        </output>
      </div>
    </form>
  )
}

function soloDati(c: ClienteDb): DatiCliente {
  const { id: _id, codice_gestionale: _codice, updated_at: _agg, ...dati } = c
  return dati
}
