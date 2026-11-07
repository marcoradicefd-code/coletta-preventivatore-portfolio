import { useCallback, useEffect, useMemo, useState } from 'react'
import { CampoRicerca } from '@/components/shared/CampoRicerca'
import { quoteHaDati } from '@/components/layout/sections'
import { annullaPreventivo, apriPreventivo, elencaPreventivi, type RigaElencoPreventivi } from '@/lib/preventiviDb'
import { useQuoteStore } from '@/store/quoteStore'
import { dimenticaSalvataggio, inEsclusiva, revisioneAperto, salvaAperto, segnaAllineato, useOccupato } from '@/store/salvataggioStore'
import { useRichiestaValida } from '@/hooks/useRichiestaValida'
import { STATI_PREVENTIVO, type StatoPreventivo } from '@/types/archivio'
import { ETICHETTA_STATO, formatNumeroPreventivo } from '@/utils/numeroPreventivo'
import { formatEur } from '@/utils/format'
import { corrispondeRicerca } from '@/utils/ricerca'
import { useConferma } from '@/hooks/useConferma'
import { useAuthStore } from '@/store/authStore'

type StatoSalvabile = Exclude<StatoPreventivo, 'annullato'>
const STATI_SALVABILI = STATI_PREVENTIVO.filter((s): s is StatoSalvabile => s !== 'annullato')

/**
 * Gli stati che il select offre (0005, strada A): chi non è admin manda lo
 * stato solo avanti (bozza → qualunque, inviato → accettato; l'annullo ha il
 * suo pulsante), perché il database rifiuta il resto. L'admin tutti.
 */
function statiOfferti(attuale: StatoSalvabile, admin: boolean): StatoSalvabile[] {
  if (admin || attuale === 'bozza') return STATI_SALVABILI
  return attuale === 'inviato' ? ['inviato', 'accettato'] : ['accettato']
}

const BOTTONE =
  'min-h-11 rounded-sm border border-separator-opaque px-4 py-2.5 text-sm text-ink-primary hover:bg-surface-tertiary aria-disabled:opacity-60 aria-disabled:cursor-not-allowed md:min-h-10'

/**
 * U6 (revisione L15-L21): durante un gesto i pulsanti sono spenti con
 * `aria-disabled`, non `disabled`: restano focalizzabili, quindi il pulsante
 * che ha aperto una conferma riprende il focus alla chiusura. Il clic a vuoto
 * non fa niente: ogni gesto passa da `inEsclusiva`, che lo ignora.
 */
const spento = (occupato: boolean) => (occupato ? ({ 'aria-disabled': true } as const) : {})

/** La chiave del riquadro «Come funziona» già chiuso: solo l'id dell'utente, nessun dato personale. */
const chiaveAiuto = (utente: string) => `coletta-aiuto-preventivi-visto:${utente}`

/** Lettura protetta: un localStorage chiuso (privata, dati bloccati) non deve rompere la pagina. */
function aiutoGiaVisto(utente: string | undefined): boolean {
  if (!utente) return false
  try {
    return localStorage.getItem(chiaveAiuto(utente)) === '1'
  } catch {
    return false
  }
}

/**
 * «Come funziona» (L21-B, § 3.8): aiuto dove serve, non un tour. Tre righe; si
 * chiude con «Ho capito» e non torna più per quell'utente.
 */
function ComeFunziona() {
  const utente = useAuthStore((s) => s.user?.id)
  const [visto, setVisto] = useState(() => aiutoGiaVisto(utente))
  if (visto) return null
  return (
    <section aria-label="Come funziona" className="rounded-lg border border-separator-opaque bg-surface-tertiary p-4 text-sm text-ink-secondary">
      <h3 className="font-semibold text-ink-primary">Come funziona</h3>
      <ol className="mt-2 list-decimal space-y-1 pl-5">
        <li>Scegli il cliente («Scegli il cliente», nella barra del preventivo).</li>
        <li>Compila le sezioni: Cucine, Arredi, Porte, Progetto a valore, Gres.</li>
        <li>«Genera Preventivo»: salva e crea il PDF.</li>
      </ol>
      <button
        type="button"
        onClick={() => {
          setVisto(true)
          if (!utente) return
          try {
            localStorage.setItem(chiaveAiuto(utente), '1')
          } catch {
            // Storage chiuso: il riquadro tornerà alla prossima apertura, niente di peggio.
          }
        }}
        className="mt-3 min-h-11 rounded-sm border border-separator-opaque bg-surface-secondary px-4 text-sm font-medium text-ink-primary hover:bg-surface-primary md:min-h-9"
      >
        Ho capito
      </button>
    </section>
  )
}

/**
 * Preventivi salvati (L21). In alto il preventivo aperto: il suo stato,
 * «Nuova revisione», «Nuovo preventivo»; «Salva» e «Genera» stanno nella barra
 * del preventivo, sempre in vista (L21-B), che dice anche i conflitti. Sotto
 * l'elenco per anno e numero, con ricerca e filtro per stato: «Apri» lo carica
 * nell'app, «Annulla» lo segna annullato (il numero resta).
 *
 * Revisione del 14/10 sulla #97: ogni gesto passa dalla guardia unica del
 * salvataggio (`inEsclusiva`), che spegne anche il select dello stato (c);
 * l'errore di lettura dell'elenco sta col suo «Riprova», separato da quelli dei
 * gesti, e una rilettura riuscita lo toglie (difetto 9).
 */
export function PreventiviPage() {
  const preventivo = useQuoteStore((s) => s.preventivo)
  const sezioni = useQuoteStore((s) => s.sezioni)
  const salvato = useQuoteStore((s) => s.archivio?.preventivo ?? null)
  const impostaSalvato = useQuoteStore((s) => s.impostaSalvato)
  const apriDaArchivio = useQuoteStore((s) => s.apriDaArchivio)
  const nuovoPreventivo = useQuoteStore((s) => s.nuovoPreventivo)
  const occupato = useOccupato()
  const isAdmin = useAuthStore((s) => s.isAdmin)
  const { chiedi, finestra } = useConferma()
  const lettura = useRichiestaValida()

  const [elenco, setElenco] = useState<RigaElencoPreventivi[] | null>(null)
  const [erroreElenco, setErroreElenco] = useState<string | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [avviso, setAvviso] = useState<string | null>(null)
  const [ricerca, setRicerca] = useState('')
  const [filtroStato, setFiltroStato] = useState<StatoPreventivo | 'tutti'>('tutti')

  /** Legge l'elenco; vale l'ultima lettura partita (`useRichiestaValida`). */
  const ricarica = useCallback(() => {
    const valida = lettura.nuova()
    return elencaPreventivi().then((esito) => {
      if (!valida()) return
      if (esito.ok) {
        setElenco(esito.dato)
        setErroreElenco(null)
      } else {
        setErroreElenco(esito.errore)
      }
    })
  }, [lettura])

  // L'elenco si legge all'apertura e si rilegge quando il preventivo aperto
  // cambia nel database (un salvataggio dalla barra, da «Genera», un annullo).
  const versioneSalvata = salvato ? `${salvato.id}-${salvato.updatedAt}` : null
  useEffect(() => {
    void ricarica()
  }, [versioneSalvata, ricarica])

  const visibili = useMemo(
    () =>
      (elenco ?? []).filter(
        (r) =>
          (filtroStato === 'tutti' || r.stato === filtroStato) &&
          corrispondeRicerca(`${formatNumeroPreventivo(r)} ${r.clienti?.ragione_sociale ?? ''}`, ricerca)
      ),
    [elenco, filtroStato, ricerca]
  )

  /** Un gesto alla volta sul preventivo aperto, con la guardia del salvataggio. */
  const conAttesa = (azione: () => Promise<void>) =>
    inEsclusiva(async () => {
      setAvviso(null)
      await azione()
    })

  /** Lo stato si cambia salvando: la riga nel database prende lo stato scelto. */
  const cambiaStato = (stato: StatoSalvabile) =>
    conAttesa(async () => {
      const esito = await salvaAperto(stato)
      if (esito.ok) {
        setErrore(null)
        setAvviso(`Preventivo N. ${formatNumeroPreventivo(esito.dato)} salvato come «${ETICHETTA_STATO[esito.dato.stato]}».`)
      }
    })

  const revisione = () =>
    conAttesa(async () => {
      const esito = await revisioneAperto()
      if (esito.ok) {
        setErrore(null)
        setAvviso(`Salvata la revisione N. ${formatNumeroPreventivo(esito.dato)}.`)
      }
    })

  const apri = (id: string) =>
    conAttesa(async () => {
      if (
        quoteHaDati(preventivo, sezioni) &&
        (await chiedi({
          titolo: 'Aprire questo preventivo?',
          testo: 'Prende il posto di quello aperto adesso: le modifiche non salvate si perdono.',
          azioni: [
            { valore: 'no', etichetta: 'Resta su questo', tipo: 'secondario' },
            { valore: 'si', etichetta: 'Apri e sostituisci', tipo: 'primario' },
          ],
        })) !== 'si'
      )
        return
      const esito = await apriPreventivo(id)
      if (!esito.ok) {
        setErrore(esito.errore)
        return
      }
      apriDaArchivio(esito.dato.preventivo, esito.dato.sezioni, esito.dato.archivio)
      segnaAllineato()
      const aperto = esito.dato.archivio.preventivo
      setErrore(null)
      setAvviso(aperto ? `Aperto il preventivo N. ${formatNumeroPreventivo(aperto)}.` : null)
    })

  const annulla = (r: RigaElencoPreventivi) =>
    conAttesa(async () => {
      const risposta = await chiedi({
        titolo: `Annullare il preventivo N. ${formatNumeroPreventivo(r)}?`,
        testo: 'Il numero resta, ma il preventivo non si modifica più: per cambiarlo si fa una nuova revisione.',
        azioni: [
          { valore: 'no', etichetta: 'Torna indietro', tipo: 'secondario' },
          { valore: 'si', etichetta: 'Annulla il preventivo', tipo: 'pericolo' },
        ],
      })
      if (risposta !== 'si') return
      const esito = await annullaPreventivo({ id: r.id, updatedAt: r.updated_at })
      if (!esito.ok) {
        setErrore(esito.conflitto ? 'Il preventivo è cambiato dopo che l’elenco è stato letto: elenco riletto, riprova.' : esito.errore)
        await ricarica()
        return
      }
      if (salvato?.id === r.id) impostaSalvato(esito.dato)
      setErrore(null)
      setAvviso(`Preventivo N. ${formatNumeroPreventivo(esito.dato)} annullato.`)
      await ricarica()
    })

  const nuovo = () =>
    conAttesa(async () => {
      if (
        (salvato || quoteHaDati(preventivo, sezioni)) &&
        (await chiedi({
          titolo: 'Iniziare un preventivo nuovo?',
          testo: 'Quello aperto si chiude: le modifiche non salvate si perdono.',
          azioni: [
            { valore: 'no', etichetta: 'Resta su questo', tipo: 'secondario' },
            { valore: 'si', etichetta: 'Inizia un preventivo nuovo', tipo: 'primario' },
          ],
        })) !== 'si'
      )
        return
      nuovoPreventivo()
      dimenticaSalvataggio()
      setErrore(null)
      setAvviso('Nuovo preventivo: il numero arriva al primo salvataggio.')
    })

  const annullato = salvato?.stato === 'annullato'
  // U15: un preventivo aperto, non salvato, con del lavoro dentro.
  const inCorso = !salvato && quoteHaDati(preventivo, sezioni)
  let statoLista = ''
  if (elenco === null && !erroreElenco) statoLista = 'Caricamento dei preventivi…'
  else if (elenco?.length === 0) statoLista = 'Nessun preventivo salvato.'
  else if (elenco !== null && elenco.length > 0 && visibili.length === 0) statoLista = 'Nessun preventivo trovato.'

  return (
    <div className="max-w-5xl space-y-6">
      <h2 className="font-display text-2xl text-ink-primary">Preventivi</h2>
      <ComeFunziona />

      <section
        aria-label="Preventivo aperto"
        className="rounded-lg bg-surface-secondary border border-separator-opaque shadow-apple-sm p-6 space-y-4"
      >
        <h3 className="text-sm font-semibold uppercase tracking-wider text-ink-tertiary">Preventivo aperto</h3>
        <p className="text-ink-primary">
          {salvato
            ? `N. ${formatNumeroPreventivo(salvato)} · ${ETICHETTA_STATO[salvato.stato]}`
            : 'Non ancora salvato: il numero arriva al primo salvataggio.'}
        </p>
        <div className="flex flex-wrap items-end gap-3">
          {salvato && !annullato && (
            <label className="space-y-1 text-xs font-medium uppercase tracking-wider text-ink-tertiary">
              <span className="block">Stato</span>
              <select
                value={salvato.stato}
                onChange={(e) => void cambiaStato(e.target.value as StatoSalvabile)}
                disabled={occupato}
                className="block min-h-11 rounded-sm border border-separator-opaque bg-surface-tertiary px-3 py-2.5 text-sm normal-case tracking-normal text-ink-primary disabled:cursor-not-allowed disabled:opacity-60 md:min-h-10"
              >
                {statiOfferti(salvato.stato as StatoSalvabile, isAdmin).map((s) => (
                  <option key={s} value={s}>
                    {ETICHETTA_STATO[s]}
                  </option>
                ))}
              </select>
            </label>
          )}
          {salvato && (
            <button type="button" onClick={() => void revisione()} {...spento(occupato)} className={BOTTONE}>
              Nuova revisione
            </button>
          )}
          <button type="button" onClick={() => void nuovo()} {...spento(occupato)} className={BOTTONE}>
            Nuovo preventivo
          </button>
          {occupato && <span className="text-sm text-ink-tertiary">Operazione in corso…</span>}
        </div>
        {annullato && <p className="text-sm text-ink-tertiary">Questo preventivo è annullato: si può solo farne una nuova revisione.</p>}
      </section>

      {errore && (
        <p role="alert" className="rounded-sm bg-error-bg px-4 py-3 text-sm text-error">
          {errore}
        </p>
      )}
      {avviso && (
        // <output> ha già il ruolo status (Sonar S6819): niente role esplicito.
        <output className="block rounded-sm bg-success-bg px-4 py-3 text-sm text-success">{avviso}</output>
      )}

      <section className="rounded-lg bg-surface-secondary border border-separator-opaque shadow-apple-sm p-6 space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <CampoRicerca value={ricerca} onChange={setRicerca} placeholder="Cerca per numero o cliente…" aria-label="Cerca nei preventivi" />
          <select
            value={filtroStato}
            onChange={(e) => setFiltroStato(e.target.value as StatoPreventivo | 'tutti')}
            aria-label="Filtra per stato"
            className="min-h-11 rounded-sm border border-separator-opaque bg-surface-tertiary px-3 py-2 text-sm text-ink-primary md:min-h-9"
          >
            <option value="tutti">Tutti gli stati</option>
            {STATI_PREVENTIVO.map((s) => (
              <option key={s} value={s}>
                {ETICHETTA_STATO[s]}
              </option>
            ))}
          </select>
        </div>
        {erroreElenco && (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-sm bg-error-bg px-4 py-3 text-sm text-error">
            <p>{erroreElenco}</p>
            <button type="button" onClick={() => void ricarica()} className="min-h-11 rounded-sm border border-error px-3 md:min-h-9">
              Riprova
            </button>
          </div>
        )}
        {/* U19: l'esito della lista in un nodo sempre presente, annunciato quando cambia. */}
        <output className="block text-sm text-ink-tertiary empty:hidden">{statoLista}</output>
        {elenco !== null && elenco.length === 0 && (
          // Stato vuoto col passo dopo (NN/g). U15: con un preventivo in corso
          // il passo dopo è salvarlo, non iniziarne uno nuovo (che lo butterebbe).
          <div className="space-y-3">
            {inCorso ? (
              <p className="text-sm text-ink-secondary">Il preventivo aperto non è ancora salvato: salvalo con «Salva», nella barra del preventivo.</p>
            ) : (
              <button type="button" onClick={() => void nuovo()} {...spento(occupato)} className={BOTTONE}>
                Nuovo preventivo
              </button>
            )}
          </div>
        )}
        {elenco !== null && elenco.length > 0 && visibili.length === 0 && (
          <button
            type="button"
            onClick={() => {
              setRicerca('')
              setFiltroStato('tutti')
            }}
            className={BOTTONE}
          >
            Azzera filtri
          </button>
        )}
        {visibili.length > 0 && (
          // U1: `relative` tiene dentro lo span sr-only dell'intestazione (prima
          // allargava la pagina), e su mobile ogni riga è una scheda.
          <div className="relative overflow-x-auto">
            <table className="w-full text-sm md:min-w-[640px]">
              <thead className="max-md:sr-only">
                <tr className="text-left text-xs uppercase tracking-wider text-ink-tertiary">
                  <th scope="col" className="py-2 pr-3 font-medium">Numero</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Cliente</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Stato</th>
                  <th scope="col" className="py-2 pr-3 font-medium text-right">Imponibile</th>
                  <th scope="col" className="py-2 font-medium"><span className="sr-only">Azioni</span></th>
                </tr>
              </thead>
              <tbody>
                {visibili.map((r) => {
                  const numero = formatNumeroPreventivo(r)
                  return (
                    <tr key={r.id} className="border-t border-separator-opaque hover:bg-hover-voce max-md:flex max-md:flex-wrap max-md:items-center max-md:gap-x-3 max-md:py-2">
                      <td className="py-2 pr-3 tabular-nums text-ink-primary max-md:py-0 max-md:font-medium">
                        {numero}
                        {salvato?.id === r.id && <span className="ml-2 text-xs text-ink-tertiary">(aperto)</span>}
                      </td>
                      <td className="py-2 pr-3 text-ink-secondary max-md:w-full max-md:py-0 max-md:order-first">{r.clienti?.ragione_sociale ?? '—'}</td>
                      <td className="py-2 pr-3 text-ink-secondary max-md:py-0">{ETICHETTA_STATO[r.stato]}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-ink-primary max-md:py-0">
                        {r.totale_imponibile === null ? '—' : `€ ${formatEur(Number(r.totale_imponibile))}`}
                      </td>
                      <td className="py-2 text-right whitespace-nowrap max-md:flex max-md:w-full max-md:gap-3 max-md:py-0">
                        <button
                          type="button"
                          onClick={() => void apri(r.id)}
                          {...spento(occupato)}
                          aria-label={`Apri il preventivo ${numero}`}
                          className="min-h-11 rounded-sm px-3 py-1.5 text-sm text-brand-red hover:bg-brand-red-light md:min-h-9"
                        >
                          Apri
                        </button>
                        {r.stato !== 'annullato' && (
                          <button
                            type="button"
                            onClick={() => void annulla(r)}
                            {...spento(occupato)}
                            aria-label={`Annulla il preventivo ${numero}`}
                            className="ml-2 min-h-11 rounded-sm px-3 py-1.5 text-sm text-ink-tertiary max-md:ml-0 hover:bg-surface-tertiary md:min-h-9"
                          >
                            Annulla preventivo
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {finestra}
    </div>
  )
}
