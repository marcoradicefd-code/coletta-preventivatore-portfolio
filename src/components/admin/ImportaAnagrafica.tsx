import { useCallback, useEffect, useId, useRef, useState, type RefObject } from 'react'
import { parseExcelInWorker } from '@/lib/excelWorker'
import type { LetturaAnagrafica, RigaScartata } from '@/lib/anagraficaCsv'
import {
  ETICHETTA_MOTIVO,
  controllaScelte,
  pianificaImport,
  riassuntoScelte,
  type Candidato,
  type Piano,
  type Scelta,
  type VocePiano,
} from '@/lib/confrontoAnagrafica'
import { eseguiImport, leggiPerConfronto, type EsitoImport } from '@/lib/importAnagrafica'
import { useAuthStore } from '@/store/authStore'
import { useConferma } from '@/hooks/useConferma'
import { useRichiestaValida } from '@/hooks/useRichiestaValida'
import { STILE_PULSANTE } from '@/styles/pulsanti'

/** Il file pulito ha circa 540 righe (qualche centinaio di kB): oltre 5 MB non è lui. */
export const MAX_BYTE_ANAGRAFICA = 5 * 1024 * 1024
/** A schermo solo le prime righe del file e delle segnalazioni. */
export const RIGHE_ANTEPRIMA = 5

type Doppione = Extract<VocePiano, { tipo: 'doppione' }>

const SEZIONE = 'space-y-5 rounded-lg border border-separator-opaque bg-surface-secondary p-6 shadow-apple-sm'
const ERRORE = 'rounded-sm bg-error-bg px-4 py-3 text-sm text-error'

const valoreScelta = (s: Scelta | undefined): string => {
  if (!s) return ''
  return s.tipo === 'collega' ? `collega:${s.clienteId}` : s.tipo
}

const sceltaDa = (valore: string): Scelta => {
  if (valore.startsWith('collega:')) return { tipo: 'collega', clienteId: valore.slice('collega:'.length) }
  return valore === 'nuovo' ? { tipo: 'nuovo' } : { tipo: 'salta' }
}

const recapiti = (email: string | null, telefono: string | null) => [email, telefono].filter(Boolean).join(' · ')
const conPiva = (piva: string | null) => (piva ? `P.IVA ${piva}` : null)
/** Località, recapiti e partita IVA (F3 del verdetto del 15/10): due omonimi senza contatti si distinguono. */
const dettagli = (d: { localita: string | null; email: string | null; telefono: string | null; partita_iva: string | null }) =>
  [d.localita, recapiti(d.email, d.telefono), conPiva(d.partita_iva)].filter(Boolean).join(' · ')
const elencoRighe = (righe: readonly number[]) => righe.map((r) => `riga ${r}`).join(', ')

function etichettaCandidato(c: Candidato): string {
  const motivi = c.motivi.map((m) => ETICHETTA_MOTIVO[m]).join(', ')
  const nellApp = dettagli(c.cliente)
  const dettaglio = nellApp ? `; nell’app: ${nellApp}` : ''
  return `Collega a «${c.cliente.ragione_sociale}» (${motivi}${dettaglio})`
}

/** Il messaggio delle scelte che mancano o non vanno; null se vanno tutte. */
function problemaScelte(piano: Piano, scelte: ReadonlyMap<number, Scelta>): { testo: string; riga: number } | null {
  const { mancanti, collegatiDueVolte, fuoriElenco } = controllaScelte(piano, scelte)
  if (mancanti.length > 0) {
    const quanti = mancanti.length === 1 ? 'possibile doppione' : 'possibili doppioni'
    return {
      testo: `Manca la scelta per ${mancanti.length} ${quanti} (${elencoRighe(mancanti)}): l’import non parte. Per ognuno scegli «Collega», «Crea nuovo» o «Salta».`,
      riga: mancanti[0],
    }
  }
  const altre = [...collegatiDueVolte, ...fuoriElenco]
  if (altre.length === 0) return null
  return { testo: `Un cliente dell’app si collega a una riga sola: cambia la scelta alla ${elencoRighe(altre)}.`, riga: altre[0] }
}

/** Una lista di righe col loro testo (segnalazioni, scartate, doppioni nel file). Niente se vuota. */
function ElencoRighe({ titolo, voci }: Readonly<{ titolo: string; voci: { chiave: string; testo: string }[] }>) {
  if (voci.length === 0) return null
  return (
    <div className="space-y-1 text-sm">
      <h4 className="font-medium text-ink-primary">{titolo}</h4>
      <ul className="list-disc pl-5 text-ink-secondary">
        {voci.map((v) => (
          <li key={v.chiave}>{v.testo}</li>
        ))}
      </ul>
    </div>
  )
}

const vociScartate = (scartate: readonly RigaScartata[]) =>
  scartate.map((s) => ({ chiave: `${s.riga}-${s.motivo}`, testo: `Riga ${s.riga}: ${s.motivo}` }))

/** Un possibile doppione: «Collega» a uno dei candidati, «Crea nuovo» o «Salta». Di default nessuna scelta. */
function SceltaDoppione({
  voce,
  scelta,
  onScelta,
}: Readonly<{ voce: Doppione; scelta: Scelta | undefined; onScelta: (riga: number, s: Scelta) => void }>) {
  const { riga } = voce
  const nelFile = dettagli(riga)
  const opzioni = [
    ...voce.candidati.map((c) => ({ valore: `collega:${c.cliente.id}`, testo: etichettaCandidato(c) })),
    { valore: 'nuovo', testo: 'Crea nuovo: un cliente in più, col codice del file' },
    { valore: 'salta', testo: 'Salta: questa riga non si importa' },
  ]
  return (
    <fieldset data-riga={riga.riga} className="space-y-2 rounded-md border border-separator-opaque p-4">
      <legend className="px-1 text-sm font-medium text-ink-primary">
        Riga {riga.riga}: {riga.ragione_sociale}
      </legend>
      <p className="text-xs text-ink-tertiary">
        Nel file: codice {riga.codice_gestionale}
        {nelFile && ` · ${nelFile}`}
      </p>
      {opzioni.map((o) => (
        <label key={o.valore} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-ink-primary md:min-h-9">
          <input
            type="radio"
            name={`scelta-${riga.riga}`}
            value={o.valore}
            checked={valoreScelta(scelta) === o.valore}
            onChange={() => onScelta(riga.riga, sceltaDa(o.valore))}
            className="h-4 w-4 accent-brand-red"
          />
          {o.testo}
        </label>
      ))}
    </fieldset>
  )
}

interface AnteprimaProps {
  lettura: LetturaAnagrafica
  piano: Piano
  scelte: ReadonlyMap<number, Scelta>
  onScelta: (riga: number, s: Scelta) => void
  erroreScelte: string | null
  occupato: boolean
  onImporta: () => void
  refDoppioni: RefObject<HTMLDivElement | null>
}

/** L'anteprima, prima di scrivere: conteggi, prime righe, segnalazioni, scartate, doppioni e scelte. */
function Anteprima({ lettura, piano, scelte, onScelta, erroreScelte, occupato, onImporta, refDoppioni }: Readonly<AnteprimaProps>) {
  const quante = (tipo: VocePiano['tipo']) => piano.voci.filter((v) => v.tipo === tipo).length
  const doppioni = piano.voci.filter((v): v is Doppione => v.tipo === 'doppione')
  const segnalate = lettura.righe.filter((r) => r.segnalazioni)
  const conteggi: [string, number][] = [
    ['Righe lette', lettura.righe.length + lettura.scartate.length],
    ['Clienti nuovi', quante('nuovo')],
    ['Già nell’app col codice (si riempiono solo i campi vuoti)', quante('esistente')],
    ['Possibili doppioni con clienti già nell’app', doppioni.length],
    ['Righe con segnalazioni (la segnalazione non si importa)', segnalate.length],
    ['Righe scartate', lettura.scartate.length],
  ]
  return (
    <section aria-label="Anteprima dell’import" className={SEZIONE}>
      <h3 className="text-sm font-semibold uppercase tracking-wider text-ink-tertiary">Anteprima: niente è ancora scritto</h3>
      <Conteggi righe={conteggi} />

      {lettura.righe.length > 0 && (
        <div className="relative overflow-x-auto">
          <table className="w-full text-sm md:min-w-[560px]">
            <caption className="pb-2 text-left text-xs text-ink-tertiary">
              Le prime {Math.min(RIGHE_ANTEPRIMA, lettura.righe.length)} righe del file
            </caption>
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-ink-tertiary">
                <th scope="col" className="py-2 pr-3 font-medium">Riga</th>
                <th scope="col" className="py-2 pr-3 font-medium">Codice</th>
                <th scope="col" className="py-2 pr-3 font-medium">Ragione sociale</th>
                <th scope="col" className="py-2 font-medium">Località</th>
              </tr>
            </thead>
            <tbody>
              {lettura.righe.slice(0, RIGHE_ANTEPRIMA).map((r) => (
                <tr key={r.riga} className="border-t border-separator-opaque">
                  <td className="py-2 pr-3 tabular-nums text-ink-tertiary">{r.riga}</td>
                  <td className="py-2 pr-3 tabular-nums text-ink-secondary">{r.codice_gestionale}</td>
                  <td className="py-2 pr-3 text-ink-primary">{r.ragione_sociale}</td>
                  <td className="py-2 text-ink-secondary">{r.localita ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ElencoRighe
        titolo={`Segnalazioni (le prime ${Math.min(RIGHE_ANTEPRIMA, segnalate.length)})`}
        voci={segnalate.slice(0, RIGHE_ANTEPRIMA).map((r) => ({ chiave: String(r.riga), testo: `Riga ${r.riga}: ${r.segnalazioni}` }))}
      />
      <ElencoRighe titolo="Righe scartate, col motivo" voci={vociScartate(lettura.scartate)} />
      <ElencoRighe
        titolo="Possibili doppioni dentro il file (si importano tutti, non si fondono)"
        voci={piano.doppioniNelFile.map((d) => ({
          chiave: `${d.motivo}-${d.righe.join('-')}`,
          testo: `Righe ${d.righe.join(', ')}: ${ETICHETTA_MOTIVO[d.motivo]}`,
        }))}
      />

      {doppioni.length > 0 && (
        <div ref={refDoppioni} className="space-y-4">
          <h4 className="text-sm font-medium text-ink-primary">
            Possibili doppioni con clienti già nell’app: per ognuno una scelta, niente si fonde da solo
          </h4>
          {doppioni.map((d) => (
            <SceltaDoppione key={d.riga.riga} voce={d} scelta={scelte.get(d.riga.riga)} onScelta={onScelta} />
          ))}
        </div>
      )}

      {erroreScelte && (
        <p role="alert" className={ERRORE}>
          {erroreScelte}
        </p>
      )}

      <button
        type="button"
        onClick={onImporta}
        aria-disabled={occupato}
        className={`${STILE_PULSANTE.primario} aria-disabled:opacity-50 md:min-h-9`}
      >
        Importa
      </button>
    </section>
  )
}

function Conteggi({ righe }: Readonly<{ righe: [string, number][] }>) {
  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
      {righe.map(([etichetta, n]) => (
        <div key={etichetta} className="contents">
          <dt className="text-ink-secondary">{etichetta}</dt>
          <dd className="text-right tabular-nums text-ink-primary">{n}</dd>
        </div>
      ))}
    </dl>
  )
}

/** F7 (verdetto del 15/10): la riga che l'`<output>` annuncia a fine import, invece di svuotarsi. */
function rigaFinale(e: EsitoImport, scartateFile: number): string {
  const conti = `${e.importati} importati, ${e.aggiornati} aggiornati, ${e.invariati} già presenti, ${e.collegati} collegati, ${e.saltati} saltati, ${e.scartate.length + scartateFile} scartati`
  return e.fermato ? `Import fermato: ${conti}, ${e.fermato.righe.length} non scritte.` : `Import finito: ${conti}.`
}

/** Il report finale: i conteggi e le righe scartate col motivo (del file e della scrittura). */
function EsitoDellImport({
  esito,
  scartateFile,
  refTitolo,
}: Readonly<{ esito: EsitoImport; scartateFile: readonly RigaScartata[]; refTitolo: RefObject<HTMLHeadingElement | null> }>) {
  const scartate = [...scartateFile, ...esito.scartate].sort((a, b) => a.riga - b.riga)
  return (
    <section aria-label="Esito dell’import" className={SEZIONE}>
      {/* F7: a fine import il focus viene qui (tabIndex -1), non resta sul body. */}
      <h3 ref={refTitolo} tabIndex={-1} className="text-sm font-semibold uppercase tracking-wider text-ink-tertiary focus:outline-none">
        Import finito
      </h3>
      {/* DB-2: un errore che vale per tutti ha fermato l'import; il motivo dice cosa fare. */}
      {esito.fermato && (
        <p role="alert" className={ERRORE}>
          {esito.fermato.motivo}
        </p>
      )}
      <Conteggi
        righe={[
          ['Importati (clienti nuovi)', esito.importati],
          ['Aggiornati (campi vuoti riempiti)', esito.aggiornati],
          ['Già presenti, nessuna modifica', esito.invariati],
          ['Collegati a un cliente già nell’app', esito.collegati],
          ['Saltati', esito.saltati],
          ['Scartati', scartate.length],
          ...(esito.fermato ? [['Non scritte (import fermato)', esito.fermato.righe.length] as [string, number]] : []),
        ]}
      />
      <ElencoRighe titolo="Righe scartate, col motivo" voci={vociScartate(scartate)} />
      {esito.fermato && (
        <p className="text-sm text-ink-secondary">Non scritte, o dall’esito sconosciuto, le righe {esito.fermato.righe.join(', ')}.</p>
      )}
    </section>
  )
}

/**
 * «Importa anagrafica» (L21, PR C), solo per l'admin: lo ripete il database
 * (0006, il codice gestionale lo scrive solo l'admin). Il file si sceglie nel
 * browser, si legge nel worker come i listini e va solo verso Supabase. Prima di
 * scrivere, l'anteprima: conteggi, prime righe, segnalazioni (non si importano),
 * scartate col motivo, doppioni nel file e possibili doppioni con i clienti già
 * nell'app, MAI fusi: per ognuno l'admin sceglie «Collega», «Crea nuovo» o
 * «Salta», e senza una scelta per ognuno l'import non parte. Nessun log: gli
 * errori arrivano già senza dati personali.
 */
export function ImportaAnagrafica() {
  const isAdmin = useAuthStore((s) => s.isAdmin)
  const { chiedi, finestra } = useConferma()
  const richiesta = useRichiestaValida()
  const idFile = useId()
  const [nomeFile, setNomeFile] = useState<string | null>(null)
  const [lettura, setLettura] = useState<LetturaAnagrafica | null>(null)
  const [piano, setPiano] = useState<Piano | null>(null)
  const [scelte, setScelte] = useState<ReadonlyMap<number, Scelta>>(new Map())
  const [erroreFile, setErroreFile] = useState<string | null>(null)
  const [erroreDb, setErroreDb] = useState<string | null>(null)
  const [erroreScelte, setErroreScelte] = useState<string | null>(null)
  const [inCorso, setInCorso] = useState<'lettura' | 'import' | null>(null)
  const [avanzamento, setAvanzamento] = useState<{ fatte: number; totale: number } | null>(null)
  const [esito, setEsito] = useState<EsitoImport | null>(null)
  // Guardia sincrona contro il doppio clic su «Importa» (lo stato arriva al render dopo).
  const importInCorso = useRef(false)
  const refDoppioni = useRef<HTMLDivElement>(null)
  const refTitoloEsito = useRef<HTMLHeadingElement>(null)

  // F7 (verdetto del 15/10): a fine import il focus va sul titolo dell'esito.
  useEffect(() => {
    if (esito) refTitoloEsito.current?.focus()
  }, [esito])

  /** Clienti dell'app per il confronto, poi il piano. «Riprova» rifà solo questo passo. */
  const confronta = useCallback(
    async (letta: LetturaAnagrafica) => {
      const valida = richiesta.nuova()
      setErroreDb(null)
      setInCorso('lettura')
      const clienti = await leggiPerConfronto()
      if (!valida()) return
      setInCorso(null)
      if (clienti.ok) setPiano(pianificaImport(letta.righe, clienti.dato.senzaCodice, clienti.dato.conCodice))
      else setErroreDb(clienti.errore)
    },
    [richiesta]
  )

  const scegliFile = async (file: File) => {
    const valida = richiesta.nuova()
    setNomeFile(file.name)
    setLettura(null)
    setPiano(null)
    setScelte(new Map())
    setEsito(null)
    setErroreFile(null)
    setErroreDb(null)
    setErroreScelte(null)
    if (file.size > MAX_BYTE_ANAGRAFICA) {
      setErroreFile('File rifiutato: supera i 5 MB, non è l’anagrafica pulita.')
      return
    }
    setInCorso('lettura')
    let letta: LetturaAnagrafica
    try {
      letta = await parseExcelInWorker('anagrafica', await file.arrayBuffer(), file.name)
    } catch (e) {
      if (!valida()) return
      setInCorso(null)
      // Il motivo arriva dal parser: numeri di riga e nomi di colonna, mai un valore del file.
      setErroreFile(`File rifiutato: ${e instanceof Error ? e.message : 'non si legge'}.`)
      return
    }
    if (!valida()) return
    setLettura(letta)
    await confronta(letta)
  }

  const scegli = useCallback((riga: number, s: Scelta) => {
    setErroreScelte(null)
    setScelte((prima) => new Map(prima).set(riga, s))
  }, [])

  const importa = async () => {
    if (!piano || importInCorso.current) return
    const problema = problemaScelte(piano, scelte)
    if (problema) {
      setErroreScelte(problema.testo)
      refDoppioni.current?.querySelector<HTMLInputElement>(`fieldset[data-riga="${problema.riga}"] input`)?.focus()
      return
    }
    setErroreScelte(null)
    const conti = riassuntoScelte(piano, scelte)
    const daScrivere = conti.nuovi + conti.collegati + conti.daRiempire
    const risposta = await chiedi({
      titolo: `Importare ${daScrivere} ${daScrivere === 1 ? 'riga' : 'righe'} nell’anagrafica?`,
      // F6 (verdetto del 15/10): i conteggi, e che un «Collega» non si disfa.
      testo: [
        `Clienti nuovi: ${conti.nuovi}.`,
        `Collegati a un cliente già nell’app: ${conti.collegati}, e il codice gestionale poi non si cambia più.`,
        `Già nell’app col codice, solo i campi vuoti: ${conti.daRiempire}.`,
        `Saltati: ${conti.saltati}.`,
        'Niente si sovrascrive, e un rilancio non crea doppioni. Prima dell’import sulla produzione, il backup del database.',
      ].join(' '),
      azioni: [
        { valore: 'no', etichetta: 'Torna indietro', tipo: 'secondario' },
        { valore: 'si', etichetta: 'Importa l’anagrafica', tipo: 'primario' },
      ],
    })
    if (risposta !== 'si') return
    importInCorso.current = true
    setInCorso('import')
    setAvanzamento(null)
    try {
      setEsito(await eseguiImport(piano, scelte, (fatte, totale) => setAvanzamento({ fatte, totale })))
      setPiano(null)
    } catch (e) {
      // Lancia solo la guardia delle scelte, già controllata qui sopra: se succede, si dice.
      setErroreScelte(e instanceof Error ? e.message : 'Import non riuscito.')
    } finally {
      importInCorso.current = false
      setInCorso(null)
    }
  }

  if (!isAdmin) {
    return (
      <div className="max-w-4xl space-y-4">
        <h2 className="font-display text-2xl text-ink-primary">Importa anagrafica</h2>
        <p role="alert" className={ERRORE}>
          L’import dell’anagrafica è solo per l’amministratore.
        </p>
      </div>
    )
  }

  let statoLavoro = ''
  if (inCorso === 'lettura') statoLavoro = 'Lettura del file e confronto con l’anagrafica…'
  else if (inCorso === 'import') statoLavoro = avanzamento ? `Importazione… ${avanzamento.fatte} di ${avanzamento.totale}` : 'Importazione…'
  else if (esito) statoLavoro = rigaFinale(esito, lettura?.scartate.length ?? 0)

  return (
    <div className="max-w-5xl space-y-6">
      <div className="space-y-2">
        <h2 className="font-display text-2xl text-ink-primary">Importa anagrafica</h2>
        <p className="text-sm text-ink-secondary">
          Si accetta solo l’anagrafica pulita: CSV UTF-8, separatore «;», intestazioni{' '}
          <code className="text-xs">codice_gestionale;ragione_sociale;…;note;segnalazioni</code>. Il file si legge su
          questo dispositivo e va solo verso il database. La colonna «segnalazioni» si mostra qui e non si importa.
        </p>
      </div>

      <section className={SEZIONE}>
        <label htmlFor={idFile} className="block text-sm font-medium text-ink-primary">
          File dell’anagrafica (.csv)
        </label>
        <input
          id={idFile}
          type="file"
          accept=".csv,text/csv"
          aria-disabled={inCorso !== null}
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file && inCorso === null) void scegliFile(file)
          }}
          className="block w-full text-sm text-ink-secondary file:mr-3 file:min-h-11 file:rounded-sm file:border file:border-separator-opaque file:bg-surface-secondary file:px-4 file:text-sm file:text-ink-primary md:file:min-h-9"
        />
        {nomeFile && <p className="text-xs text-ink-tertiary">File scelto: {nomeFile}</p>}
        {erroreFile && (
          <p role="alert" className={ERRORE}>
            {erroreFile}
          </p>
        )}
        {erroreDb && lettura && (
          <div role="alert" className={`flex flex-wrap items-center gap-3 ${ERRORE}`}>
            <p>{erroreDb}</p>
            <button type="button" onClick={() => void confronta(lettura)} className="min-h-11 rounded-sm border border-error px-3 md:min-h-9">
              Riprova
            </button>
          </div>
        )}
        {/* U19: l'esito del lavoro in un nodo sempre presente, annunciato quando cambia. */}
        <output className="block text-sm text-ink-tertiary empty:hidden">{statoLavoro}</output>
      </section>

      {piano && lettura && (
        <Anteprima
          lettura={lettura}
          piano={piano}
          scelte={scelte}
          onScelta={scegli}
          erroreScelte={erroreScelte}
          occupato={inCorso !== null}
          onImporta={() => void importa()}
          refDoppioni={refDoppioni}
        />
      )}

      {esito && <EsitoDellImport esito={esito} scartateFile={lettura?.scartate ?? []} refTitolo={refTitoloEsito} />}
      {finestra}
    </div>
  )
}
