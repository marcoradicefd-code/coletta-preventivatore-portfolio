import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CampoRicerca } from '@/components/shared/CampoRicerca'
import { SchedaCliente } from './SchedaCliente'
import {
  clienteDaArchivio,
  contaPreventiviCliente,
  elencaClienti,
  eliminaCliente,
  salvaCliente,
  type ClienteDb,
  type DatiCliente,
} from '@/lib/clientiDb'
import { corrispondeRicerca } from '@/utils/ricerca'
import { useAuthStore } from '@/store/authStore'
import { useQuoteStore } from '@/store/quoteStore'
import { useConferma } from '@/hooks/useConferma'
import { useRichiestaValida } from '@/hooks/useRichiestaValida'
import { nuovoUuid } from '@/utils/uuid'
import { STILE_PULSANTE } from '@/styles/pulsanti'

/** Righe mostrate al massimo: oltre, si affina la ricerca (l'elenco intero è in memoria). */
export const MAX_RIGHE_CLIENTI = 100

/** Il testo su cui cerca la lente: i campi che servono a ritrovare un cliente. */
function testoRicerca(c: ClienteDb): string {
  return [c.ragione_sociale, c.nome, c.cognome, c.localita, c.email, c.telefono, c.codice_gestionale, c.partita_iva]
    .filter(Boolean)
    .join(' ')
}

/**
 * Anagrafica clienti (L21): elenco con ricerca, scheda per creare e modificare,
 * «Usa nel preventivo». «Elimina» solo per l'admin e solo se il cliente non ha
 * preventivi (lo ripete il database: RLS e FK `on delete restrict`). Nessun log:
 * gli errori arrivano già senza dati personali (`erroriDb`). L'errore di
 * lettura dell'elenco sta col suo «Riprova» (revisione del 14/10, difetto 9).
 */
export function ClientiPage() {
  const isAdmin = useAuthStore((s) => s.isAdmin)
  const collegaCliente = useQuoteStore((s) => s.collegaCliente)
  const { chiedi, finestra } = useConferma()
  const lettura = useRichiestaValida()
  const [clienti, setClienti] = useState<ClienteDb[] | null>(null)
  const [erroreElenco, setErroreElenco] = useState<string | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [avviso, setAvviso] = useState<string | null>(null)
  const [ricerca, setRicerca] = useState('')
  const [scheda, setScheda] = useState<ClienteDb | 'nuovo' | null>(null)
  const [ragioneNuovo, setRagioneNuovo] = useState('')
  const [inCorso, setInCorso] = useState(false)
  const [esitoScheda, setEsitoScheda] = useState<{ testo: string; errore: boolean } | null>(null)
  // Guardia sincrona contro il doppio clic: `inCorso` arriva al render dopo, un
  // secondo clic nello stesso giro creerebbe due clienti (verdetto sulla #96).
  const salvataggioInCorso = useRef(false)
  // S8: l'id del cliente nuovo, generato alla prima pressione di «Crea» e
  // tenuto fino a quando la creazione riesce: un «Riprova» dopo una risposta
  // persa riusa lo stesso id, e il database non fa nascere un doppione.
  const idNuovo = useRef<string | null>(null)
  // U14: la scheda aperta ha modifiche non salvate? Lo dice SchedaCliente.
  const schedaModificata = useRef(false)
  // L'apertura della scheda: la chiave di SchedaCliente. Non cambia alla
  // creazione, così la scheda non si rimonta e il suo esito («Cliente creato
  // alle…») è annunciato dal nodo che c'era già (U14).
  const [apertura, setApertura] = useState(0)
  const sezioneScheda = useRef<HTMLElement>(null)
  const ricercaRef = useRef<HTMLDivElement>(null)

  /** Legge l'elenco; vale l'ultima lettura partita (`useRichiestaValida`). */
  const carica = useCallback(() => {
    const valida = lettura.nuova()
    return elencaClienti().then((esito) => {
      if (!valida()) return
      if (esito.ok) {
        setClienti(esito.dato)
        setErroreElenco(null)
      } else {
        setErroreElenco(esito.errore)
      }
    })
  }, [lettura])

  useEffect(() => {
    void carica()
  }, [carica])

  const trovati = useMemo(
    () => (clienti ?? []).filter((c) => corrispondeRicerca(testoRicerca(c), ricerca)),
    [clienti, ricerca]
  )

  const salva = async (dati: DatiCliente) => {
    if (salvataggioInCorso.current || scheda === null) return
    setErrore(null)
    salvataggioInCorso.current = true
    setInCorso(true)
    if (scheda === 'nuovo') idNuovo.current ??= nuovoUuid()
    const esito =
      scheda === 'nuovo'
        ? await salvaCliente(null, dati, idNuovo.current ?? undefined)
        : await salvaCliente({ id: scheda.id, updatedAt: scheda.updated_at }, dati)
    salvataggioInCorso.current = false
    setInCorso(false)
    if (!esito.ok) {
      setEsitoScheda({ testo: esito.errore, errore: true })
      return
    }
    idNuovo.current = null
    schedaModificata.current = false
    const ora = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
    setEsitoScheda({ testo: `${scheda === 'nuovo' ? 'Cliente creato' : 'Modifiche salvate'} alle ${ora}.`, errore: false })
    setScheda(esito.dato)
    await carica()
  }

  const elimina = async (c: ClienteDb) => {
    setAvviso(null)
    setErrore(null)
    const conta = await contaPreventiviCliente(c.id)
    if (!conta.ok) {
      setErrore(conta.errore)
      return
    }
    if (conta.dato > 0) {
      setErrore(
        `Il cliente ha ${conta.dato} ${conta.dato === 1 ? 'preventivo' : 'preventivi'}: non si può eliminare. Un preventivo si annulla dalla pagina Preventivi.`
      )
      return
    }
    const risposta = await chiedi({
      titolo: `Eliminare ${c.ragione_sociale} dall’anagrafica?`,
      testo: 'Il cliente sparisce per tutti e non si può recuperare. Nel registro delle eliminazioni resta solo chi l’ha eliminato e quando.',
      azioni: [
        { valore: 'no', etichetta: 'Torna indietro', tipo: 'secondario' },
        { valore: 'si', etichetta: 'Elimina il cliente', tipo: 'pericolo' },
      ],
    })
    if (risposta !== 'si') return
    const esito = await eliminaCliente(c.id)
    if (!esito.ok) {
      setErrore(esito.errore)
      return
    }
    setErrore(null)
    setAvviso('Cliente eliminato.')
    schedaModificata.current = false
    setScheda(null)
    // U14: la scheda sparisce; il focus va alla ricerca, non al body.
    ricercaRef.current?.querySelector('input')?.focus()
    await carica()
  }

  /**
   * U14: le modifiche non salvate della scheda aperta non si perdono in
   * silenzio: aprire un'altra scheda o chiuderla chiede prima.
   */
  const lasciaLaScheda = async (): Promise<boolean> => {
    const scelta = await chiedi({
      titolo: 'Lasciare le modifiche non salvate?',
      testo: 'Nella scheda aperta ci sono modifiche non salvate: se la lasci, si perdono.',
      azioni: [
        { valore: 'resta', etichetta: 'Torna alla scheda', tipo: 'secondario' },
        { valore: 'lascia', etichetta: 'Lascia le modifiche', tipo: 'pericolo' },
      ],
    })
    return scelta === 'lascia'
  }

  /** Esegue `passo` subito, o dopo la conferma se la scheda aperta ha modifiche non salvate (U14). */
  const dopoLaScheda = (passo: () => void) => {
    if (scheda === null || !schedaModificata.current) passo()
    else
      void lasciaLaScheda().then((lascia) => {
        if (lascia) passo()
      })
  }

  /** Apre una scheda (un cliente, o «nuovo»): in vista e col focus sul primo campo (U2). */
  const apriScheda = (destinazione: ClienteDb | 'nuovo', ragione = '') =>
    dopoLaScheda(() => {
      setAvviso(null)
      setErrore(null)
      setEsitoScheda(null)
      setRagioneNuovo(ragione)
      idNuovo.current = null
      schedaModificata.current = false
      setApertura((n) => n + 1)
      setScheda(destinazione)
    })

  const chiudiScheda = () =>
    dopoLaScheda(() => {
      schedaModificata.current = false
      setScheda(null)
    })

  // U2: aperta una scheda, la si porta in vista (sotto la barra, che ha il suo
  // scroll-padding) e il focus va sul primo campo; prima si apriva fuori vista.
  useEffect(() => {
    if (apertura === 0) return
    const sezione = sezioneScheda.current
    sezione?.scrollIntoView?.({ block: 'start' })
    sezione?.querySelector('input')?.focus()
  }, [apertura])

  /** «Nuovo cliente», o «Crea "…"» dalla ricerca senza risultati con la ragione sociale già scritta. */
  const apriNuovo = (ragione = '') => apriScheda('nuovo', ragione)

  let statoLista = ''
  if (clienti === null && !erroreElenco) statoLista = 'Caricamento dei clienti…'
  else if (clienti?.length === 0) statoLista = 'Nessun cliente ancora.'
  else if (clienti !== null && clienti.length > 0 && trovati.length === 0) statoLista = `Nessun cliente trovato per "${ricerca.trim()}".`

  const esiti = (
    <>
      {errore && (
        <p role="alert" className="rounded-sm bg-error-bg px-4 py-3 text-sm text-error">
          {errore}
        </p>
      )}
      {avviso && (
        // <output> ha già il ruolo status (Sonar S6819): niente role esplicito.
        <output className="block rounded-sm bg-success-bg px-4 py-3 text-sm text-success">{avviso}</output>
      )}
    </>
  )

  const usa = (c: ClienteDb) => {
    collegaCliente(c.id, clienteDaArchivio(c))
    setAvviso('Cliente collegato al preventivo aperto: i suoi dati sono in «Dati preventivo».')
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl text-ink-primary">Anagrafica clienti</h2>
        <button type="button" onClick={() => apriNuovo()} className={`${STILE_PULSANTE.primario} md:min-h-9`}>
          Nuovo cliente
        </button>
      </div>

      {/* U2: con la scheda aperta gli esiti stanno accanto ai suoi pulsanti, non qui in cima. */}
      {scheda === null && esiti}

      {scheda !== null && (
        <section
          ref={sezioneScheda}
          aria-label={scheda === 'nuovo' ? 'Nuovo cliente' : 'Scheda cliente'}
          className="rounded-lg bg-surface-secondary border border-separator-opaque shadow-apple-sm p-6 space-y-5"
        >
          <h3 className="text-sm font-semibold uppercase tracking-wider text-ink-tertiary">
            {scheda === 'nuovo' ? 'Nuovo cliente' : 'Scheda cliente'}
          </h3>
          <SchedaCliente
            key={apertura}
            cliente={scheda === 'nuovo' ? null : scheda}
            ragioneSocialeIniziale={ragioneNuovo}
            inCorso={inCorso}
            esito={esitoScheda}
            onSalva={salva}
            onChiudi={chiudiScheda}
            onModificata={(m) => {
              schedaModificata.current = m
            }}
          />
          {scheda !== 'nuovo' && (
            <div className="flex flex-wrap gap-3 border-t border-separator-opaque pt-4">
              <button type="button" onClick={() => usa(scheda)} className={`${STILE_PULSANTE.secondario} md:min-h-9`}>
                Usa nel preventivo
              </button>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => void elimina(scheda)}
                  className="min-h-11 rounded-sm border border-error px-4 py-2.5 text-sm text-error hover:bg-error-bg md:min-h-9"
                >
                  Elimina
                </button>
              )}
            </div>
          )}
          {esiti}
        </section>
      )}

      <section className="rounded-lg bg-surface-secondary border border-separator-opaque shadow-apple-sm p-6 space-y-4">
        <div ref={ricercaRef}>
        <CampoRicerca
          value={ricerca}
          onChange={setRicerca}
          placeholder="Cerca per nome, località, telefono, email…"
          aria-label="Cerca nei clienti"
        />
        </div>
        {erroreElenco && (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-sm bg-error-bg px-4 py-3 text-sm text-error">
            <p>{erroreElenco}</p>
            <button type="button" onClick={() => void carica()} className="min-h-11 rounded-sm border border-error px-3 md:min-h-9">
              Riprova
            </button>
          </div>
        )}
        {/* U19: l'esito della lista in un nodo sempre presente, annunciato quando cambia. */}
        <output className="block text-sm text-ink-tertiary empty:hidden">{statoLista}</output>
        {/* Stati vuoti col passo dopo (NN/g). */}
        {clienti?.length === 0 && (
          <div className="space-y-3">
            <button type="button" onClick={() => apriNuovo()} className="min-h-11 rounded-sm border border-separator-opaque px-4 text-sm text-ink-primary hover:bg-surface-tertiary md:min-h-9">
              Nuovo cliente
            </button>
          </div>
        )}
        {clienti !== null && clienti.length > 0 && trovati.length === 0 && (
          <div className="space-y-3">
            <button type="button" onClick={() => apriNuovo(ricerca.trim())} className="min-h-11 rounded-sm border border-separator-opaque px-4 text-sm font-semibold text-brand-red hover:bg-brand-red-light md:min-h-9">
              Crea "{ricerca.trim()}"
            </button>
          </div>
        )}
        {trovati.length > 0 && (
          // U1: `relative` tiene dentro lo span sr-only dell'intestazione (prima
          // allargava la pagina), e su mobile ogni riga è una scheda.
          <div className="relative overflow-x-auto">
            <table className="w-full text-sm md:min-w-[560px]">
              <thead className="max-md:sr-only">
                <tr className="text-left text-xs uppercase tracking-wider text-ink-tertiary">
                  <th scope="col" className="py-2 pr-3 font-medium">Cliente</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Località</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Telefono</th>
                  <th scope="col" className="py-2 font-medium"><span className="sr-only">Azioni</span></th>
                </tr>
              </thead>
              <tbody>
                {trovati.slice(0, MAX_RIGHE_CLIENTI).map((c) => (
                  <tr key={c.id} className="border-t border-separator-opaque hover:bg-hover-voce max-md:flex max-md:flex-wrap max-md:items-center max-md:gap-x-3 max-md:py-2">
                    <td className="py-2 pr-3 text-ink-primary max-md:w-full max-md:py-0 max-md:font-medium">{c.ragione_sociale}</td>
                    <td className="py-2 pr-3 text-ink-secondary max-md:py-0 max-md:empty:hidden">{c.localita ?? ''}</td>
                    <td className="py-2 pr-3 text-ink-secondary tabular-nums max-md:py-0 max-md:empty:hidden">{c.telefono ?? ''}</td>
                    <td className="py-2 text-right max-md:ml-auto max-md:py-0">
                      <button
                        type="button"
                        onClick={() => apriScheda(c)}
                        aria-label={`Apri la scheda di ${c.ragione_sociale}`}
                        className="min-h-11 rounded-sm px-3 py-1.5 text-sm text-brand-red hover:bg-brand-red-light md:min-h-9"
                      >
                        Scheda
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {trovati.length > MAX_RIGHE_CLIENTI && (
              <p className="mt-3 text-xs text-ink-tertiary">
                Mostrati i primi {MAX_RIGHE_CLIENTI} di {trovati.length}: affina la ricerca.
              </p>
            )}
          </div>
        )}
      </section>
      {finestra}
    </div>
  )
}
