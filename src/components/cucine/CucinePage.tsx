import { useMemo, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { useQuoteStore } from '@/store/quoteStore'
import { FALLBACK_CUCINE } from '@/store/quoteFallbacks'
import { strutturaCucina } from '@/data/cucina/strutturaCucina'
import { calcCucina, costoVoce, vociFuoriCatalogo } from '@/engine/calcCucina'
import { useCatalogoCucina } from '@/hooks/useCatalogoCucina'
import { formatEur, formatQuantita } from '@/utils/format'
import type { VoceQty, VoceToggleFisso } from '@/types/cucina'
import type { VoceCucinaScelta } from '@/types/quote'
import { CucineRiepilogo } from './CucineRiepilogo'
import { CampoRicerca } from '@/components/shared/CampoRicerca'
import { DescrizioneSezione } from '@/components/shared/DescrizioneSezione'
import { StatoListino } from '@/components/shared/StatoListino'
import { descrizioneCucinaDi } from '@/store/quoteSelectors'
import { corrispondeRicerca, normalizzaRicerca } from '@/utils/ricerca'
import { CampoNumero } from '@/components/shared/CampoNumero'

// ── Sezione "Cucine" (SPEC_FASE2 §A.5 #1 / fase 8) ──
// Configuratore pezzo-per-pezzo sul catalogo composto dal listino cucine (PR
// 10b-2): senza listino la pagina mostra lo stato del listino, come il Gres.
// Voci raggruppate in accordion per blocco; i parametri (sconto, adeguamento,
// giorni, extra) vivono nel Riepilogo.

export function CucinePage() {
  const catalogo = useCatalogoCucina()
  const cucine = useQuoteStore((s) => s.sezioni.cucine ?? FALLBACK_CUCINE)
  const setVoceQuantita = useQuoteStore((s) => s.setVoceQuantita)
  const toggleMoltiplicatore = useQuoteStore((s) => s.toggleMoltiplicatore)
  const setProfondita = useQuoteStore((s) => s.setProfonditaOltre65)
  const setDescrizione = useQuoteStore((s) => s.setDescrizioneCucina)

  const qtyById = useMemo(() => {
    const m = new Map<string, number>()
    for (const v of cucine.voci) m.set(v.voceId, v.quantita)
    return m
  }, [cucine.voci])
  // Serve solo l'anteprima dei moltiplicatori: gli importi interi dell'engine (D4).
  const risultato = useMemo(() => (catalogo ? calcCucina(cucine, catalogo) : null), [cucine, catalogo])
  // Gruppi del catalogo: una voce che il listino non prezza non c'è, quindi non si offre.
  const gruppi = useMemo(() => {
    const voci = catalogo?.voci ?? []
    return {
      base: voci.filter((v): v is VoceQty => v.blocco === 'base' && v.kind === 'qty'),
      opzionali: voci.filter((v): v is VoceQty => v.blocco === 'opzionali' && v.kind === 'qty'),
      openQty: voci.filter((v): v is VoceQty => v.blocco === 'open' && v.kind === 'qty'),
      openToggle: voci.filter((v): v is VoceToggleFisso => v.blocco === 'open' && v.kind === 'toggleFisso'),
    }
  }, [catalogo])
  // Voci salvate che il catalogo non sa prezzare (O5): gli accordion non le
  // mostrerebbero, quindi hanno un pannello loro, diviso per causa.
  const daDefinire = useMemo(() => {
    const fuori = catalogo ? vociFuoriCatalogo(cucine.voci, catalogo) : []
    const conNome = fuori.map((v) => ({ scelta: v, voce: strutturaCucina.find((x) => x.id === v.voceId) }))
    return {
      // L'app conosce la voce ma il listino caricato non ne porta il prezzo.
      senzaPrezzo: conNome.filter((x) => x.voce !== undefined && x.voce.kind !== 'moltiplicatore'),
      // La voce non esiste più nel codice (o non è una voce): resta l'id.
      nonPiuACatalogo: conNome.filter((x) => x.voce === undefined || x.voce.kind === 'moltiplicatore'),
    }
  }, [cucine.voci, catalogo])

  const [aperti, setAperti] = useState<Record<string, boolean>>({ base: true })
  // Ricerca sulle voci: filtra solo cosa si vede, lo store non cambia (nessuna
  // voce si deseleziona). Con del testo gli accordion con risultati sono aperti,
  // e chi ne chiude uno lo segna in `chiusiInRicerca`, mai in `aperti`: così a
  // ricerca vuota tornano gli accordion che l'utente aveva aperto prima.
  const [ricerca, setRicerca] = useState('')
  const [chiusiInRicerca, setChiusiInRicerca] = useState<Record<string, boolean>>({})

  if (!catalogo || !risultato) return <StatoListino categoria="cucine" />

  const inRicerca = normalizzaRicerca(ricerca) !== ''
  const cambiaRicerca = (testo: string) => {
    setRicerca(testo)
    setChiusiInRicerca({})
  }
  const trova = <T extends { nome: string }>(voci: T[]) => voci.filter((v) => corrispondeRicerca(v.nome, ricerca))
  const base = trova(gruppi.base)
  const opzionali = trova(gruppi.opzionali)
  const openQty = trova(gruppi.openQty)
  const openToggle = trova(gruppi.openToggle)
  const molt = trova([
    { quale: 'casse' as const, nome: 'Casse +10%', sub: 'laminato ABET / Lamicolor — +10% sul primo totale', attivo: cucine.casse, importo: risultato.importoCasse },
    { quale: 'ante' as const, nome: 'Ante +20%', sub: 'laminato Smart / metallo — +20% sul primo totale (cumulabile)', attivo: cucine.ante, importo: risultato.importoAnte },
    // L25: dopo casse e ante, sul loro totale. Non è l'adeguamento.
    { quale: 'profondita' as const, nome: 'Profondità oltre 65 cm (+20%)', sub: 'basi e colonne — +20% sul totale casse e ante', attivo: cucine.profonditaOltre65 === true, importo: risultato.supplementoProfondita ?? 0 },
  ])
  const risultati = base.length + molt.length + opzionali.length + openQty.length + openToggle.length

  const aperto = (id: string) => (inRicerca ? !chiusiInRicerca[id] : !!aperti[id])
  const toggleAperto = (id: string) =>
    inRicerca
      ? setChiusiInRicerca((c) => ({ ...c, [id]: !c[id] }))
      : setAperti((a) => ({ ...a, [id]: !a[id] }))
  // Senza ricerca il badge conta le voci scelte; con la ricerca, i risultati.
  const contaSelez = (items: { id: string }[]) =>
    inRicerca ? items.length : items.filter((i) => (qtyById.get(i.id) ?? 0) > 0).length
  const moltScelti = [cucine.casse, cucine.ante, cucine.profonditaOltre65 === true].filter(Boolean).length
  const moltCount = inRicerca ? molt.length : moltScelti
  // Con la ricerca un accordion senza risultati non si mostra.
  const mostra = (n: number) => !inRicerca || n > 0
  const rigaQty = (v: VoceQty) => {
    const quantita = qtyById.get(v.id) ?? 0
    return (
      <VoceQtyRow
        key={v.id}
        voce={v}
        quantita={quantita}
        // Lo stesso costo che l'engine somma, all'euro intero (D4).
        costo={costoVoce(catalogo, v.id, quantita)?.costo ?? 0}
        onQty={(q) => setVoceQuantita(v.id, q)}
      />
    )
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-6 items-start">
      {/* Configuratore */}
      <div className="space-y-3">
        <div>
          <h2 className="font-display text-2xl text-ink-primary">Cucine</h2>
          <p className="text-sm text-ink-tertiary mt-1">
            Configuratore pezzo-per-pezzo: seleziona le voci per blocco. Percentuali, giorni ed
            extra sono nel riepilogo a destra.
          </p>
        </div>

        {/* Descrizione a corpo: SOPRA le voci e grande (richiesta DOCX 25/07).
            È l'unica cosa che il cliente legge di questa sezione — le ~60 voci
            del configuratore restano nascoste nel PDF — quindi sta in cima, non
            in fondo al riepilogo. Parte dal testo di default: si edita, non si
            scrive da zero. */}
        <DescrizioneSezione
          id="descrizione-cucine"
          label="Descrizione in preventivo"
          hint="Compare in testa alla sezione Cucina del PDF. Le singole voci restano nascoste."
          value={descrizioneCucinaDi(cucine)}
          onChange={setDescrizione}
        />

        <VociDaDefinire
          titolo="Voci senza prezzo nel listino caricato"
          voci={daDefinire.senzaPrezzo.map((x) => ({ scelta: x.scelta, etichetta: x.voce?.nome ?? x.scelta.voceId }))}
          onTogli={(id) => setVoceQuantita(id, 0)}
        />
        <VociDaDefinire
          titolo="Voci non più a catalogo"
          voci={daDefinire.nonPiuACatalogo.map((x) => ({ scelta: x.scelta, etichetta: x.voce?.nome ?? x.scelta.voceId }))}
          onTogli={(id) => setVoceQuantita(id, 0)}
        />

        <CampoRicerca
          value={ricerca}
          onChange={cambiaRicerca}
          placeholder="Cerca voce cucina…"
          aria-label="Cerca voce cucina"
        />

        {/* U19: l'esito della ricerca in un nodo sempre presente, annunciato quando cambia. */}
        <output className="block text-center text-sm text-ink-tertiary empty:hidden">
          {inRicerca && risultati === 0 ? 'Nessuna voce trovata' : ''}
        </output>
        {inRicerca && risultati === 0 && (
          <div className="rounded-lg bg-surface-secondary border border-separator-opaque px-4 py-6 text-center space-y-2">
            {/* Un verbo solo per la ricerca, come la X del campo (U10). */}
            <button
              type="button"
              onClick={() => cambiaRicerca('')}
              className="min-h-11 text-sm font-medium text-brand-red hover:underline md:min-h-9"
            >
              Cancella ricerca
            </button>
          </div>
        )}

        {mostra(base.length) && (
          <Accordion titolo="Basi, colonne e ante" count={contaSelez(base)} aperto={aperto('base')} onToggle={() => toggleAperto('base')}>
            {base.map(rigaQty)}
          </Accordion>
        )}

        {mostra(molt.length) && (
          <Accordion titolo="Casse & Ante" count={moltCount} aperto={aperto('molt')} onToggle={() => toggleAperto('molt')}>
            {molt.map((m) => (
              <MoltiplicatoreRow
                key={m.quale}
                label={m.nome}
                sub={m.sub}
                attivo={m.attivo}
                importo={m.importo}
                onToggle={() => {
                  if (m.quale === 'profondita') setProfondita(!m.attivo)
                  else toggleMoltiplicatore(m.quale)
                }}
              />
            ))}
          </Accordion>
        )}

        {mostra(opzionali.length) && (
          <Accordion titolo="Opzionali" count={contaSelez(opzionali)} aperto={aperto('opzionali')} onToggle={() => toggleAperto('opzionali')}>
            {opzionali.map(rigaQty)}
          </Accordion>
        )}

        {mostra(openQty.length + openToggle.length) && (
          <Accordion titolo="Open — isole, strutture, cappa" count={contaSelez([...openQty, ...openToggle])} aperto={aperto('open')} onToggle={() => toggleAperto('open')}>
            {openQty.map(rigaQty)}
            {openToggle.map((v) => (
              <ToggleFissoRow key={v.id} voce={v} selezionato={(qtyById.get(v.id) ?? 0) > 0} onToggle={(sel) => setVoceQuantita(v.id, sel ? 1 : 0)} />
            ))}
          </Accordion>
        )}
      </div>

      {/* Riepilogo (catena live + parametri) */}
      <CucineRiepilogo />
    </div>
  )
}

/**
 * Voci salvate «da definire» con la loro causa nel titolo: non entrano nel
 * totale, che nel PDF si dichiara parziale. Si possono togliere da qui.
 */
function VociDaDefinire({
  titolo,
  voci,
  onTogli,
}: Readonly<{
  titolo: string
  voci: { scelta: VoceCucinaScelta; etichetta: string }[]
  onTogli: (voceId: string) => void
}>) {
  if (voci.length === 0) return null
  return (
    <div className="rounded-lg bg-surface-secondary border border-separator-opaque overflow-hidden">
      <div className="px-4 py-3">
        <p className="text-sm font-semibold text-ink-primary">{titolo}</p>
        <p className="text-xs text-ink-tertiary mt-0.5">
          Da definire: non entrano nel totale, che nel PDF si dichiara parziale.
        </p>
      </div>
      <div className="divide-y divide-separator-opaque border-t border-separator-opaque">
        {voci.map(({ scelta, etichetta }) => (
          <div key={scelta.voceId} className="flex items-center gap-3 px-4 py-2">
            <p className="min-w-0 flex-1 text-sm text-ink-primary truncate">{etichetta}</p>
            <span className="text-xs text-ink-tertiary tabular-nums">
              {formatQuantita(scelta.quantita)} · da definire
            </span>
            <button
              type="button"
              onClick={() => onTogli(scelta.voceId)}
              aria-label={`Togli ${etichetta}`}
              className="text-xs font-medium text-brand-red hover:underline"
            >
              Togli
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function Accordion({
  titolo,
  count,
  aperto,
  onToggle,
  children,
}: {
  titolo: string
  count: number
  aperto: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <div className="rounded-lg bg-surface-secondary border border-separator-opaque overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={aperto}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-surface-tertiary/50 transition-colors"
        style={{ minHeight: 44 }}
      >
        <span className="flex items-center gap-2">
          <span className="text-sm font-semibold text-ink-primary">{titolo}</span>
          {count > 0 && (
            <span className="rounded-full bg-brand-red/10 text-brand-red text-xs font-medium px-2 py-0.5 tabular-nums">
              {count}
            </span>
          )}
        </span>
        <ChevronDown className={`h-4 w-4 text-ink-tertiary transition-transform duration-200 ${aperto ? 'rotate-180' : ''}`} strokeWidth={1.5} />
      </button>
      {aperto && <div className="divide-y divide-separator-opaque border-t border-separator-opaque">{children}</div>}
    </div>
  )
}

function VoceQtyRow({
  voce,
  quantita,
  costo,
  onQty,
}: Readonly<{ voce: VoceQty; quantita: number; costo: number; onQty: (q: number) => void }>) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 hover:bg-hover-voce transition-colors duration-100">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-ink-primary truncate">{voce.nome}</p>
        <p className="text-xs text-ink-tertiary tabular-nums">{formatEur(voce.prezzo)} €/{voce.unita.toLowerCase()}</p>
      </div>
      <CampoNumero
        min={0}
        step="any"
        value={quantita}
        aria-label={`Quantità ${voce.nome}`}
        onChange={(e) => {
          const n = parseFloat(e.target.value)
          onQty(Number.isFinite(n) && n > 0 ? n : 0)
        }}
        className="w-16 rounded-sm border border-separator-opaque bg-surface-tertiary px-2 py-1.5 text-sm text-ink-primary tabular-nums text-right focus:border-accent focus:ring-2 focus:ring-accent-light focus:outline-none"
      />
      <span className="w-24 shrink-0 text-right font-mono text-sm tabular-nums text-ink-primary">€ {formatEur(costo)}</span>
    </div>
  )
}

function ToggleFissoRow({ voce, selezionato, onToggle }: { voce: VoceToggleFisso; selezionato: boolean; onToggle: (sel: boolean) => void }) {
  return (
    <label className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-hover-voce transition-colors duration-100">
      <input
        type="checkbox"
        checked={selezionato}
        aria-label={voce.nome}
        onChange={(e) => onToggle(e.target.checked)}
        className="h-4 w-4 shrink-0 accent-brand-red"
      />
      <span className="min-w-0 flex-1 text-sm text-ink-primary truncate">{voce.nome}</span>
      <span className="font-mono text-sm tabular-nums text-ink-tertiary">+ € {formatEur(voce.prezzo)}</span>
    </label>
  )
}

function MoltiplicatoreRow({ label, sub, attivo, importo, onToggle }: { label: string; sub: string; attivo: boolean; importo: number; onToggle: () => void }) {
  return (
    <label className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-hover-voce transition-colors duration-100">
      <input type="checkbox" checked={attivo} aria-label={label} onChange={onToggle} className="h-4 w-4 shrink-0 accent-brand-red" />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-ink-primary">{label}</p>
        <p className="text-xs text-ink-tertiary truncate">{sub}</p>
      </div>
      <span className="font-mono text-sm tabular-nums text-ink-tertiary">
        {attivo && importo > 0 ? `+ € ${formatEur(importo)}` : '—'}
      </span>
    </label>
  )
}
