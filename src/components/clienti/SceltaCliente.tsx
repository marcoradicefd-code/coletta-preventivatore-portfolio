import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Finestra } from '@/components/shared/Finestra'
import { useRichiestaValida } from '@/hooks/useRichiestaValida'
import { STILE_PULSANTE } from '@/styles/pulsanti'
import { elencaClientiPerScelta, leggiCliente, salvaCliente, type ClienteDb, type ClienteInScelta } from '@/lib/clientiDb'
import { corrispondeRicerca } from '@/utils/ricerca'
import { nuovoUuid } from '@/utils/uuid'

/** Quanti clienti propone la lista: è una scelta, non l'anagrafica. */
const MAX_PROPOSTI = 20

const CLASSE_INPUT =
  'w-full min-h-11 rounded-sm border border-separator-opaque bg-surface-tertiary px-3.5 py-2.5 text-base text-ink-primary focus:border-accent focus:ring-2 focus:ring-accent-light focus:outline-none'

interface SceltaClienteProps {
  aperta: boolean
  /** «Scegli il cliente», «… per salvare», «… per generare il preventivo». */
  titolo: string
  /** Il cliente scelto o creato, col record completo. */
  onScelto: (c: ClienteDb) => void
  onChiudi: () => void
}

type Opzione = { tipo: 'cliente'; c: ClienteInScelta } | { tipo: 'crea' }

/**
 * Token `autocomplete` NON riconosciuti dal browser, apposta (O35, rule `ui`):
 * un token standard farebbe proporre i dati di chi usa il PC. Come `SchedaCliente`.
 */
const TOKEN_CREA = { nome: 'cliente-nome', cognome: 'cliente-cognome', telefono: 'cliente-telefono' } as const

/** «Mario Rossi» → nome «Mario», cognome «Rossi»: un punto di partenza, si corregge nei campi. */
function nomeECognome(testo: string): { nome: string; cognome: string } {
  const [nome = '', ...resto] = testo.trim().split(/\s+/)
  return { nome, cognome: resto.join(' ') }
}

/**
 * La scelta del cliente del preventivo (L21-B, § 3.3): una finestra con un
 * compito solo (GOV.UK, «one thing per page»). Combobox del W3C APG con la
 * lista in fondo: frecce per muoversi, Invio per scegliere, Esc per svuotare
 * la ricerca (e, vuota, per chiudere); l'ultima opzione è «+ Crea "…"»
 * (pattern «Combobox with Add New»).
 *
 * La lista ha solo id, ragione sociale, nome, cognome e località (GDPR
 * art. 25); il record completo si legge quando si sceglie. «Crea» chiede solo
 * nome, cognome e telefono, con le etichette sopra i campi (Jarrett): il resto
 * si completa nella scheda dell'anagrafica.
 *
 * Revisione del 14/10 sulla #97: «Crea» solo a lista letta (4), con «Riprova»
 * se la lettura fallisce; una risposta conta solo se è dell'ultima richiesta e
 * la finestra è ancora aperta (`useRichiestaValida`, 6 e d); l'opzione attiva
 * resta in vista (8); i tre campi sono un `<form>` e «Torna alla ricerca»
 * rimette il focus sulla ricerca (14); il focus va su Nome solo all'entrata
 * nel mini-form, non a ogni tasto (1).
 */
export function SceltaCliente({ aperta, titolo, onScelto, onChiudi }: Readonly<SceltaClienteProps>) {
  const base = useId()
  const listaId = `${base}-lista`
  const formId = `${base}-crea`
  const inputRef = useRef<HTMLInputElement>(null)
  const nomeRef = useRef<HTMLInputElement>(null)
  // Guardia sincrona: un doppio clic su «Crea e usa» creerebbe due clienti.
  const inCorsoRef = useRef(false)
  // S8: l'id del cliente da creare, tenuto fra un «Crea e usa» fallito e il successivo.
  const idNuovo = useRef<string | null>(null)
  // La lettura della lista, e la scelta o creazione del cliente: due tipi di
  // richiesta, ognuno vale solo se è l'ultimo partito e a finestra aperta.
  const lettura = useRichiestaValida()
  const collegamento = useRichiestaValida()

  const [clienti, setClienti] = useState<ClienteInScelta[] | null>(null)
  const [erroreLista, setErroreLista] = useState<string | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [testo, setTesto] = useState('')
  const [attivo, setAttivo] = useState(0)
  const [crea, setCrea] = useState<{ nome: string; cognome: string; telefono: string } | null>(null)
  const [inCorso, setInCorso] = useState(false)

  const leggiLista = useCallback(() => {
    const valida = lettura.nuova()
    return elencaClientiPerScelta().then((esito) => {
      if (!valida()) return
      if (esito.ok) setClienti(esito.dato)
      else setErroreLista(esito.errore)
    })
  }, [lettura])

  // L'anagrafica si legge quando la finestra si apre, non prima; chiusa, si
  // riparte da capo la prossima volta, e le risposte in volo non contano più.
  useEffect(() => {
    if (!aperta) return
    void leggiLista()
    return () => {
      lettura.annulla()
      collegamento.annulla()
      setClienti(null)
      setErroreLista(null)
      setErrore(null)
      setTesto('')
      setAttivo(0)
      setCrea(null)
      setInCorso(false)
    }
  }, [aperta, leggiLista, lettura, collegamento])

  // Il focus segue il passo, non i tasti: dipende da un booleano, non
  // dall'oggetto `crea` che cambia a ogni carattere (difetto 1). All'entrata nel
  // mini-form va su Nome; tornando alla ricerca, sulla ricerca (difetto 14).
  const inCreazione = crea !== null
  useEffect(() => {
    if (!aperta) return
    if (inCreazione) nomeRef.current?.focus()
    else inputRef.current?.focus()
  }, [aperta, inCreazione])

  const trovati = useMemo(
    () =>
      (clienti ?? [])
        .filter((c) => corrispondeRicerca(`${c.ragione_sociale} ${c.nome ?? ''} ${c.cognome ?? ''} ${c.localita ?? ''}`, testo))
        .slice(0, MAX_PROPOSTI),
    [clienti, testo]
  )
  // «Crea» solo a lista letta: prima non si sa se il cliente c'è già, e si
  // creerebbe un doppione (difetto 4).
  const offriCrea = clienti !== null && testo.trim() !== ''
  const opzioni: Opzione[] = [...trovati.map((c) => ({ tipo: 'cliente' as const, c })), ...(offriCrea ? [{ tipo: 'crea' as const }] : [])]
  const indiceAttivo = Math.min(attivo, Math.max(opzioni.length - 1, 0))
  let esitoRicerca = ''
  if (clienti === null && !erroreLista) esitoRicerca = 'Caricamento dei clienti…'
  else if (clienti !== null && trovati.length === 0) {
    esitoRicerca = testo.trim() ? `Nessun cliente trovato per "${testo.trim()}".` : 'Nessun cliente ancora: scrivi il nome per crearlo.'
  }

  // Con le frecce l'opzione attiva resta in vista (difetto 8).
  useEffect(() => {
    document.getElementById(`${listaId}-${indiceAttivo}`)?.scrollIntoView?.({ block: 'nearest' })
  }, [listaId, indiceAttivo])

  const scegli = async (o: Opzione) => {
    if (o.tipo === 'crea') {
      idNuovo.current = null
      setErrore(null)
      setCrea({ ...nomeECognome(testo), telefono: '' })
      return
    }
    const valida = collegamento.nuova()
    setInCorso(true)
    const esito = await leggiCliente(o.c.id)
    // Finestra chiusa, o un altro cliente toccato dopo: questa risposta non conta.
    if (!valida()) return
    setInCorso(false)
    if (esito.ok) onScelto(esito.dato)
    else setErrore(esito.errore)
  }

  const creaEUsa = async () => {
    if (!crea || inCorsoRef.current) return
    const ragione = `${crea.nome} ${crea.cognome}`.trim()
    if (!ragione) {
      // Si valida all'invio (Silver), e il campo che manca prende il focus.
      setErrore('Scrivi almeno il nome o il cognome del cliente.')
      nomeRef.current?.focus()
      return
    }
    const valida = collegamento.nuova()
    inCorsoRef.current = true
    setInCorso(true)
    idNuovo.current ??= nuovoUuid()
    const esito = await salvaCliente(null, {
      ragione_sociale: ragione,
      nome: crea.nome,
      cognome: crea.cognome,
      telefono: crea.telefono,
      email: null,
      indirizzo: null,
      cap: null,
      localita: null,
      provincia: null,
      partita_iva: null,
      note: null,
    }, idNuovo.current)
    inCorsoRef.current = false
    if (esito.ok) idNuovo.current = null
    // Chiusa la finestra durante la creazione il cliente nasce lo stesso nel
    // database (la scrittura era partita), ma non si collega al preventivo.
    if (!valida()) return
    setInCorso(false)
    if (esito.ok) onScelto(esito.dato)
    else setErrore(esito.errore)
  }

  const tasto = (e: KeyboardEvent<HTMLInputElement>) => {
    const n = opzioni.length
    if (e.key === 'ArrowDown' && n > 0) {
      e.preventDefault()
      setAttivo((indiceAttivo + 1) % n)
    } else if (e.key === 'ArrowUp' && n > 0) {
      e.preventDefault()
      setAttivo((indiceAttivo - 1 + n) % n)
    } else if (e.key === 'Enter' && n > 0) {
      e.preventDefault()
      void scegli(opzioni[indiceAttivo])
    } else if (e.key === 'Escape' && testo) {
      // APG: Esc svuota la ricerca. Non chiude la finestra: lo farà il prossimo Esc.
      e.preventDefault()
      e.stopPropagation()
      setTesto('')
      setAttivo(0)
    }
  }

  const campoCrea = (chiave: 'nome' | 'cognome' | 'telefono', etichetta: string) => (
    <div className="space-y-1">
      <label htmlFor={`${base}-${chiave}`} className="block text-xs font-medium uppercase tracking-wider text-ink-tertiary">
        {etichetta}
      </label>
      <input
        id={`${base}-${chiave}`}
        ref={chiave === 'nome' ? nomeRef : undefined}
        type={chiave === 'telefono' ? 'tel' : 'text'}
        autoComplete={TOKEN_CREA[chiave]}
        value={crea?.[chiave] ?? ''}
        onChange={(e) => setCrea((c) => (c ? { ...c, [chiave]: e.target.value } : c))}
        className={CLASSE_INPUT}
      />
    </div>
  )

  return (
    <Finestra
      aperta={aperta}
      titolo={titolo}
      onChiudi={onChiudi}
      focusIniziale={inputRef}
      azioni={
        crea ? (
          <>
            <button type="button" onClick={() => setCrea(null)} className={STILE_PULSANTE.secondario}>
              Torna alla ricerca
            </button>
            {/* Fuori dal form (le azioni stanno in fondo alla finestra), ma suo: `form`. */}
            <button type="submit" form={formId} disabled={inCorso} className={STILE_PULSANTE.primario}>
              Crea e usa questo cliente
            </button>
          </>
        ) : (
          <button type="button" onClick={onChiudi} className={STILE_PULSANTE.secondario}>
            Chiudi
          </button>
        )
      }
    >
      {errore && (
        <p role="alert" className="rounded-sm bg-error-bg px-3 py-2 text-sm text-error">
          {errore}
        </p>
      )}
      {crea ? (
        // Un form vero: Invio in un campo, o «Vai» sulla tastiera del telefono, crea (difetto 14).
        <form
          id={formId}
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            void creaEUsa()
          }}
        >
          <p className="text-sm">Il resto (email, indirizzo, partita IVA) si aggiunge dopo, dalla scheda in Anagrafica clienti.</p>
          {campoCrea('nome', 'Nome')}
          {campoCrea('cognome', 'Cognome')}
          {campoCrea('telefono', 'Telefono')}
          {inCorso && <p className="text-sm text-ink-tertiary">Creazione in corso…</p>}
        </form>
      ) : (
        <div className="space-y-2">
          <label htmlFor={`${base}-cerca`} className="block text-xs font-medium uppercase tracking-wider text-ink-tertiary">
            Cerca per nome, cognome, ragione sociale o località
          </label>
          <input
            id={`${base}-cerca`}
            ref={inputRef}
            type="text"
            role="combobox"
            // U19: aperta solo se ci sono opzioni da scorrere.
            aria-expanded={opzioni.length > 0}
            aria-controls={listaId}
            aria-autocomplete="list"
            aria-activedescendant={opzioni.length > 0 ? `${listaId}-${indiceAttivo}` : undefined}
            autoComplete="off"
            value={testo}
            onChange={(e) => {
              setTesto(e.target.value)
              setAttivo(0)
            }}
            onKeyDown={tasto}
            className={CLASSE_INPUT}
          />
          {erroreLista && (
            <div role="alert" className="flex flex-wrap items-center gap-3 rounded-sm bg-error-bg px-3 py-2 text-sm text-error">
              <p>{erroreLista}</p>
              <button
                type="button"
                onClick={() => {
                  setErroreLista(null)
                  void leggiLista()
                }}
                className="min-h-11 rounded-sm border border-error px-3 md:min-h-9"
              >
                Riprova
              </button>
            </div>
          )}
          {/* U19: l'esito della ricerca in un nodo sempre presente, annunciato quando cambia. */}
          <output className="block text-sm text-ink-tertiary empty:hidden">{esitoRicerca}</output>
          <ul id={listaId} role="listbox" aria-label="Clienti" tabIndex={-1} className="max-h-72 divide-y divide-separator-opaque overflow-y-auto">
            {opzioni.map((o, i) => (
              // Le opzioni si scelgono col mouse, o con la tastiera dal campo (APG): il focus resta lì.
              <li
                key={o.tipo === 'cliente' ? o.c.id : 'crea'}
                id={`${listaId}-${i}`}
                role="option"
                aria-selected={i === indiceAttivo}
                // Il clic non toglie il focus al campo (come `FinituraCombobox`).
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void scegli(o)}
                // La tastiera passa dal campo (APG); questo serve solo se un'opzione riceve un tasto.
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    void scegli(o)
                  }
                }}
                onMouseMove={() => setAttivo(i)}
                className={`flex min-h-11 cursor-pointer items-center px-3 py-2 text-sm ${
                  i === indiceAttivo ? 'bg-voce-selezionata' : ''
                } ${o.tipo === 'crea' ? 'font-semibold text-brand-red' : 'text-ink-primary'}`}
              >
                {o.tipo === 'cliente' ? (
                  <span>
                    {o.c.ragione_sociale}
                    {o.c.localita && <span className="text-ink-tertiary"> · {o.c.localita}</span>}
                  </span>
                ) : (
                  `+ Crea "${testo.trim()}"`
                )}
              </li>
            ))}
          </ul>
          {inCorso && <p className="text-sm text-ink-tertiary">Lettura del cliente…</p>}
        </div>
      )}
    </Finestra>
  )
}
