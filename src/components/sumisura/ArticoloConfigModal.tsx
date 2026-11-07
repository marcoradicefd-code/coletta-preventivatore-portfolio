import { useId, useState, type ReactNode } from 'react'
import { Plus, Check } from 'lucide-react'
import { Finestra } from '@/components/shared/Finestra'
import { STILE_PULSANTE } from '@/styles/pulsanti'
import { calcArticolo } from '@/engine/calcSuMisura'
import { formatEur, formatNum } from '@/utils/format'
import { FinituraCombobox } from './FinituraCombobox'
import { SelettoreAliquotaIva } from '@/components/shared/SelettoreIva'
import { useQuoteStore } from '@/store/quoteStore'
import { aliquotaIvaSezione } from '@/engine/iva'
import { descrizioneCombinazione, elementoDaMatrice } from '@/engine/matriceFiniture'
import { SceltaMatrice } from './SceltaMatrice'
import type { ArticoloSuMisura, CombinazioneMatrice, RigaMatrice, UnitaMisuraArticolo, VoceSuMisura } from '@/types/sumisura'
import { CampoNumero } from '@/components/shared/CampoNumero'

type Draft = Omit<ArticoloSuMisura, 'id'>

interface ArticoloConfigModalProps {
  iniziale: Draft
  modalita: 'nuovo' | 'modifica'
  /**
   * Gli elementi aggiunti insieme (L20): lavorazioni e accessori scelti per un
   * elemento nuovo da matrice, ognuno un elemento a sé nello stesso arredo.
   */
  onSalva: (a: Draft, extra: Draft[]) => void
  onClose: () => void
  /** La matrice FINITURE del listino in uso (L20); vuota o assente senza il foglio. */
  matrice?: readonly RigaMatrice[]
  /** Lavorazioni (foglio FINITURE) e accessori (foglio ACCESSORI) per un elemento nuovo da matrice. */
  extra?: readonly VoceSuMisura[]
}

/** Il prezzo che entra nel preventivo da una voce: quello cliente, se c'è (RETI LETTO). */
const prezzoVoce = (v: VoceSuMisura) => v.prezzoCliente ?? v.prezzoUnitario
const UM_DA_VOCE: Record<VoceSuMisura['unitaMisura'], UnitaMisuraArticolo> = { MQ: 'MQ', ML: 'ML', PEZZO: 'PZ', VALORE: 'PZ' }
const umVoce = (v: VoceSuMisura): UnitaMisuraArticolo => UM_DA_VOCE[v.unitaMisura]

type Dimensioni = Pick<Draft, 'larghezzaCm' | 'altezzaCm' | 'lunghezzaMl' | 'quantita'>

/** Le dimensioni pertinenti a `um`, le altre a null: niente valori stale. */
function dimensioniPer(um: UnitaMisuraArticolo, d: Dimensioni): Dimensioni {
  return {
    larghezzaCm: um === 'MQ' ? d.larghezzaCm : null,
    altezzaCm: um === 'MQ' ? d.altezzaCm : null,
    lunghezzaMl: um === 'ML' ? d.lunghezzaMl : null,
    quantita: um === 'PZ' ? d.quantita : null,
  }
}

/**
 * Elemento da matrice (L20): la scelta tipo → interno → esterno dà prezzo e
 * unità, fissati alla scelta (snapshot). Una combinazione incompleta vale 0.
 */
function conCombinazione(d: Draft, c: CombinazioneMatrice, matrice: readonly RigaMatrice[]): Draft {
  const el = elementoDaMatrice(matrice, c)
  if (el === null) return { ...d, combinazione: c, prezzoUnitario: 0 }
  return { ...d, ...el, ...dimensioniPer(el.um, d) }
}

/** Le due profondità si escludono: spuntarne una toglie l'altra. */
function conProfondita(d: Draft, quale: 'sotto40' | 'oltre65', v: boolean): Draft {
  return quale === 'sotto40'
    ? { ...d, profonditaSotto40: v, profonditaOltre65: d.profonditaOltre65 && !v }
    : { ...d, profonditaOltre65: v, profonditaSotto40: d.profonditaSotto40 && !v }
}

/**
 * Una lavorazione o un accessorio scelto con l'elemento (L20): un elemento a
 * sé nello stesso arredo e con la stessa IVA. A MQ prende la superficie
 * dell'elemento, a ML e PZ la quantità scritta.
 */
function elementoExtra(v: VoceSuMisura, qta: number | null, d: Draft): Draft {
  const um = umVoce(v)
  return {
    origine: 'listino',
    descrizione: v.descrizione,
    prezzoUnitario: prezzoVoce(v),
    um,
    ...dimensioniPer(um, { larghezzaCm: d.larghezzaCm, altezzaCm: d.altezzaCm, lunghezzaMl: qta, quantita: qta }),
    profonditaOltre65: false,
    finituraInterna: '',
    finituraEsterna: '',
    codiceFinitura: '',
    note: '',
    aliquotaIva: d.aliquotaIva,
    arredoId: d.arredoId,
  }
}

function titoloDialogo(modalita: 'nuovo' | 'modifica', daMatrice: boolean): string {
  if (modalita === 'modifica') return 'Modifica articolo'
  return daMatrice ? 'Nuovo elemento da matrice' : 'Configura articolo'
}

/** Cosa manca perché l'articolo si possa aggiungere (U4): lo dice il pulsante, invece di spegnersi. */
function mancanze(d: Draft, quantita: number, daMatrice: boolean, extraValidi: boolean): string[] {
  const m: string[] = []
  if (d.descrizione.trim() === '') m.push('la descrizione')
  if (d.prezzoUnitario <= 0) m.push(daMatrice ? 'tipo, interno ed esterno' : 'il prezzo')
  if (quantita <= 0) m.push({ MQ: 'le misure (larghezza e altezza)', ML: 'la lunghezza', PZ: 'la quantità' }[d.um])
  if (!extraValidi) m.push('la quantità delle lavorazioni scelte')
  return m
}

const UM_OPZIONI: { value: UnitaMisuraArticolo; label: string }[] = [
  { value: 'MQ', label: 'Metri quadri (MQ)' },
  { value: 'ML', label: 'Metri lineari (ML)' },
  { value: 'PZ', label: 'Pezzi (PZ)' },
]

export function ArticoloConfigModal({
  iniziale,
  modalita,
  onSalva,
  onClose,
  matrice = [],
  extra = [],
}: Readonly<ArticoloConfigModalProps>) {
  const [draft, setDraft] = useState<Draft>(iniziale)
  // Lavorazioni e accessori spuntati (indice in `extra` → quantità; MQ: la superficie dell'elemento).
  const [scelteExtra, setScelteExtra] = useState<Record<number, number | null>>({})
  // L'aliquota che la riga eredita finché non ne sceglie una sua (L18).
  const ivaSezione = useQuoteStore((s) => aliquotaIvaSezione(s.sezioni.arredi?.aliquotaIva))

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  // Cambiando UM azzero le dimensioni non pertinenti, per evitare valori stale.
  const setUm = (um: UnitaMisuraArticolo) =>
    setDraft((d) => ({
      ...d,
      um,
      larghezzaCm: um === 'MQ' ? d.larghezzaCm : null,
      altezzaCm: um === 'MQ' ? d.altezzaCm : null,
      lunghezzaMl: um === 'ML' ? d.lunghezzaMl : null,
      quantita: um === 'PZ' ? d.quantita : null,
    }))

  const daMatrice = draft.combinazione !== undefined
  // «Voce manuale»: l'unico modo di scrivere un prezzo a mano, come per le voci del listino.
  const passaAManuale = () =>
    setDraft((d) => ({ ...d, origine: 'manuale', combinazione: undefined, profonditaSotto40: undefined }))

  const calc = calcArticolo({ ...draft, id: 'preview' })
  const isManuale = draft.origine === 'manuale'

  const elementiExtra = Object.entries(scelteExtra).map(([i, qta]) => elementoExtra(extra[Number(i)], qta, draft))
  const extraValidi = elementiExtra.every((e) => calcArticolo({ ...e, id: 'extra' }).quantitaCalcolata > 0)

  const manca = mancanze(draft, calc.quantitaCalcolata, daMatrice, extraValidi)
  const valido = manca.length === 0
  const mancaId = useId()
  const titolo = titoloDialogo(modalita, daMatrice)
  // Elemento da matrice con la combinazione ancora da scegliere: il prezzo non c'è.
  const prezzoDaScegliere = daMatrice && draft.prezzoUnitario <= 0

  // U4 (revisione L15-L21): una `Finestra` del design system, come le
  // conferme: ruolo dialog col titolo come nome, focus dentro, Esc, Tab che
  // resta dentro e ritorno del focus li dà il <dialog> del browser. Su mobile
  // pannello dal basso con le azioni fisse in fondo.
  return (
    <Finestra
      aperta
      larga
      titolo={titolo}
      onChiudi={onClose}
      azioni={
        <>
          <button type="button" onClick={onClose} className={STILE_PULSANTE.secondario}>
            Chiudi senza salvare
          </button>
          <button
            type="button"
            onClick={() => valido && onSalva(draft, elementiExtra)}
            aria-describedby={valido ? undefined : mancaId}
            className={`${STILE_PULSANTE.primario} inline-flex items-center justify-center gap-2`}
          >
            {modalita === 'nuovo' ? <Plus className="h-4 w-4" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
            {modalita === 'nuovo' ? 'Aggiungi al preventivo' : 'Salva modifiche'}
          </button>
        </>
      }
    >
      <div className="space-y-5 pt-2">
        {/* Elemento da matrice (L20): tipo → interno → esterno. Senza la matrice
            nel listino in uso la combinazione salvata si legge e basta. */}
        {draft.combinazione && (
          <BloccoMatrice
            matrice={matrice}
            combinazione={draft.combinazione}
            onScegli={(c) => setDraft((d) => conCombinazione(d, c, matrice))}
            onManuale={passaAManuale}
          />
        )}

        {/* Descrizione */}
        <Field label="Descrizione">
          {(id) => (
          <input
            id={id}
            type="text"
            value={draft.descrizione}
            onChange={(e) => set('descrizione', e.target.value)}
            readOnly={!isManuale}
            placeholder={isManuale ? 'Es. Mensola su misura' : undefined}
            className={`w-full rounded-sm border border-separator-opaque px-3 py-2 text-sm text-ink-primary focus:border-accent focus:ring-2 focus:ring-accent-light focus:outline-none ${
              isManuale ? 'bg-surface-tertiary' : 'bg-surface-primary text-ink-secondary'
            }`}
            style={{ minHeight: 44 }}
          />
          )}
        </Field>

        {/* Unità di misura: per un elemento da matrice la dà la combinazione. */}
        {!daMatrice && (
        <fieldset className="space-y-1">
          <legend className="mb-1 block text-xs font-medium uppercase tracking-wider text-ink-tertiary">Unità di misura</legend>
          <div className="grid grid-cols-3 gap-2">
            {UM_OPZIONI.map((o) => (
              <button
                key={o.value}
                type="button"
                aria-pressed={draft.um === o.value}
                onClick={() => setUm(o.value)}
                className={`rounded-sm border px-3 py-2 text-xs font-medium transition-colors ${
                  draft.um === o.value
                    ? 'border-brand-red bg-brand-red/[0.08] text-brand-red'
                    : 'border-separator-opaque text-ink-secondary hover:bg-surface-tertiary'
                }`}
                style={{ minHeight: 44 }}
              >
                {o.label}
              </button>
            ))}
          </div>
        </fieldset>
        )}

        {/* Dimensioni dinamiche */}
        {draft.um === 'MQ' && (
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Larghezza (cm)" value={draft.larghezzaCm} onChange={(v) => set('larghezzaCm', v)} />
            <NumberField label="Altezza (cm)" value={draft.altezzaCm} onChange={(v) => set('altezzaCm', v)} />
          </div>
        )}
        {draft.um === 'ML' && (
          <NumberField label="Lunghezza (ml)" value={draft.lunghezzaMl} onChange={(v) => set('lunghezzaMl', v)} />
        )}
        {draft.um === 'PZ' && (
          <NumberField label="Quantità" value={draft.quantita} onChange={(v) => set('quantita', v)} />
        )}

        {/* Profondità + badge <3mq. «Sotto 40 cm» (L20) c'è per gli elementi da
            matrice, la regola del listino FINITURE; le due spunte si escludono. */}
        <div className="flex flex-wrap items-center gap-3">
          {(daMatrice || draft.profonditaSotto40) && (
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={draft.profonditaSotto40 === true}
                onChange={(e) => setDraft((d) => conProfondita(d, 'sotto40', e.target.checked))}
                className="h-4 w-4 rounded border-separator-opaque text-brand-red accent-brand-red"
              />
              <span className="text-sm text-ink-secondary">Profondità minore di 40cm (−10%)</span>
            </label>
          )}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={draft.profonditaOltre65}
              onChange={(e) => setDraft((d) => conProfondita(d, 'oltre65', e.target.checked))}
              className="h-4 w-4 rounded border-separator-opaque text-brand-red accent-brand-red"
            />
            <span className="text-sm text-ink-secondary">Profondità maggiore di 65cm (+15%)</span>
          </label>
          {calc.applica20 && (
            <span className="inline-flex rounded-full bg-warning-bg px-2.5 py-0.5 text-[12px] font-semibold text-warning">
              &lt; 3mq → +20%
            </span>
          )}
        </div>

        {/* Lavorazioni e accessori (L20): per un elemento nuovo da matrice, ognuno
            entra come elemento a sé nello stesso arredo, col prezzo del listino. */}
        {modalita === 'nuovo' && daMatrice && extra.length > 0 && (
          <LavorazioniEAccessori
            extra={extra}
            scelte={scelteExtra}
            superficieMq={draft.um === 'MQ' ? calc.quantitaCalcolata : 0}
            onChange={setScelteExtra}
          />
        )}

        {/* Finiture */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FinituraCombobox label="Finitura interna" value={draft.finituraInterna} onChange={(v) => set('finituraInterna', v)} />
          <FinituraCombobox label="Finitura esterna" value={draft.finituraEsterna} onChange={(v) => set('finituraEsterna', v)} />
        </div>
        <FinituraCombobox
          label="Codice finitura (manuale, alternativo)"
          value={draft.codiceFinitura}
          onChange={(v) => set('codiceFinitura', v)}
          creatable
          placeholder="Cerca un codice o digita libero (es. RAL 9010)"
        />

        {/* Note */}
        <Field label="Note">
          {(id) => (
          <textarea
            id={id}
            value={draft.note}
            onChange={(e) => set('note', e.target.value)}
            rows={2}
            placeholder="Note specifiche per questa voce…"
            className="w-full rounded-sm border border-separator-opaque bg-surface-tertiary px-3 py-2 text-sm text-ink-primary focus:border-accent focus:ring-2 focus:ring-accent-light focus:outline-none resize-none"
          />
          )}
        </Field>

        {/* Aliquota IVA della riga (L18): «come la sezione» finché non se ne sceglie una. */}
        <SelettoreAliquotaIva
          label="IVA"
          value={draft.aliquotaIva}
          sezione={ivaSezione}
          onChange={(a) => set('aliquotaIva', a)}
        />

        {/* Prezzo (manuale: editabile; listino e matrice: prezzo fisso) */}
        {prezzoDaScegliere && (
          <p className="text-sm text-ink-tertiary">Scegli tipo, interno ed esterno: il prezzo si mostra da solo.</p>
        )}
        {!prezzoDaScegliere && (isManuale ? (
          <NumberField
            label="Prezzo unitario (€)"
            value={draft.prezzoUnitario || null}
            onChange={(v) => set('prezzoUnitario', v ?? 0)}
          />
        ) : (
          <div className="flex items-center justify-between text-sm">
            <span className="text-ink-tertiary">{daMatrice ? 'Prezzo (matrice finiture)' : 'Prezzo unitario (listino)'}</span>
            <span className="font-mono tabular-nums text-ink-secondary">
              € {formatEur(draft.prezzoUnitario)} / {draft.um}
            </span>
          </div>
        ))}

        {/* Riepilogo prezzo live */}
        <div className="rounded-sm bg-surface-tertiary p-3 space-y-1 text-sm">
          <PriceRow label={`Base (${formatNumQta(calc.quantitaCalcolata)} ${draft.um} × € ${formatEur(draft.prezzoUnitario)})`} value={calc.base} />
          {calc.applica20 && <PriceRow label="Maggiorazione < 3mq (+20%)" value={calc.maggiorazione20} />}
          {calc.applica15 && <PriceRow label="Maggiorazione profondità (+15%)" value={calc.maggiorazione15} />}
          {calc.applica10 && <PriceRow label="Riduzione profondità < 40cm (−10%)" value={-calc.riduzione10} />}
          <div className="h-px bg-separator-opaque my-1" />
          <PriceRow label="Totale articolo" value={calc.totale} bold />
        </div>

        {/* Nessun pulsante spento senza motivo: cosa manca, collegato al pulsante. */}
        {!valido && (
          <p id={mancaId} className="text-sm text-ink-secondary">
            Manca: {manca.join(', ')}.
          </p>
        )}
      </div>
    </Finestra>
  )
}

/** Un campo con l'etichetta associata (U4): `children` riceve l'id da dare al controllo. */
function Field({ label, children }: Readonly<{ label: string; children: (id: string) => ReactNode }>) {
  const id = useId()
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-xs font-medium uppercase tracking-wider text-ink-tertiary">{label}</label>
      {children(id)}
    </div>
  )
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number | null
  onChange: (v: number | null) => void
}) {
  return (
    <Field label={label}>
      {(id) => (
      <CampoNumero
        id={id}
        inputMode="decimal"
        min={0}
        value={value}
        onChange={(e) => {
          const raw = e.target.value
          if (raw === '') return onChange(null)
          const n = parseFloat(raw)
          onChange(Number.isFinite(n) && n >= 0 ? n : null)
        }}
        className="w-full rounded-sm border border-separator-opaque bg-surface-tertiary px-3 py-2 text-sm text-ink-primary font-mono tabular-nums focus:border-accent focus:ring-2 focus:ring-accent-light focus:outline-none"
        style={{ minHeight: 44 }}
      />
      )}
    </Field>
  )
}

function PriceRow({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={bold ? 'font-semibold text-ink-primary' : 'text-ink-tertiary'}>{label}</span>
      <span className={`font-mono tabular-nums ${bold ? 'font-semibold text-ink-primary' : 'text-ink-secondary'}`}>
        € {formatEur(value)}
      </span>
    </div>
  )
}

// Interi senza decimali ("3 PZ"), il resto via formatNum: `toFixed` emetteva il
// punto inglese ("2.50 MQ") accanto a un formatEur con la virgola, nella stessa riga.
function formatNumQta(n: number): string {
  return Number.isInteger(n) ? String(n) : formatNum(n, 2)
}

/** La scelta della combinazione (L20); senza la matrice nel listino in uso si legge e basta. */
function BloccoMatrice({
  matrice,
  combinazione,
  onScegli,
  onManuale,
}: Readonly<{
  matrice: readonly RigaMatrice[]
  combinazione: CombinazioneMatrice
  onScegli: (c: CombinazioneMatrice) => void
  onManuale: () => void
}>) {
  return (
    <div className="space-y-2">
      {matrice.length > 0 ? (
        <SceltaMatrice matrice={matrice} value={combinazione} onChange={onScegli} />
      ) : (
        <p className="text-sm text-ink-secondary">{descrizioneCombinazione(combinazione)}</p>
      )}
      <button
        type="button"
        onClick={onManuale}
        className="text-xs font-medium text-ink-tertiary underline underline-offset-2 hover:text-brand-red"
      >
        Passa a voce manuale (prezzo a mano)
      </button>
    </div>
  )
}

/** Le lavorazioni e gli accessori spuntabili per un elemento nuovo da matrice (L20). */
function LavorazioniEAccessori({
  extra,
  scelte,
  superficieMq,
  onChange,
}: Readonly<{
  extra: readonly VoceSuMisura[]
  /** Indice in `extra` → quantità (null finché non scritta; a MQ non serve). */
  scelte: Readonly<Record<number, number | null>>
  superficieMq: number
  onChange: (scelte: Record<number, number | null>) => void
}>) {
  const cambia = (i: number, scelta: boolean, qta: number | null) => {
    const resto = Object.fromEntries(Object.entries(scelte).filter(([k]) => Number(k) !== i))
    onChange(scelta ? { ...resto, [i]: qta } : resto)
  }
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 block text-xs font-medium uppercase tracking-wider text-ink-tertiary">
        Lavorazioni e accessori
      </legend>
      {extra.map((v, i) => (
        <RigaExtra
          key={`${i}-${v.descrizione}`}
          voce={v}
          um={umVoce(v)}
          scelta={i in scelte}
          quantita={scelte[i] ?? null}
          superficieMq={superficieMq}
          onChange={(scelta, qta) => cambia(i, scelta, qta)}
        />
      ))}
    </fieldset>
  )
}

/** Una lavorazione o un accessorio da aggiungere con l'elemento (L20). */
function RigaExtra({
  voce,
  um,
  scelta,
  quantita,
  superficieMq,
  onChange,
}: Readonly<{
  voce: VoceSuMisura
  um: UnitaMisuraArticolo
  scelta: boolean
  quantita: number | null
  superficieMq: number
  onChange: (scelta: boolean, quantita: number | null) => void
}>) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex min-w-0 flex-1 items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={scelta}
          onChange={(e) => onChange(e.target.checked, um === 'MQ' ? null : quantita)}
          className="h-4 w-4 shrink-0 rounded border-separator-opaque text-brand-red accent-brand-red"
        />
        <span className="text-sm text-ink-secondary">{voce.descrizione}</span>
        <span className="shrink-0 font-mono text-xs tabular-nums text-ink-tertiary">
          € {formatEur(prezzoVoce(voce))} / {um}
        </span>
      </label>
      {scelta &&
        (um === 'MQ' ? (
          <span className="text-xs text-ink-tertiary">
            {superficieMq > 0 ? `sulla superficie dell'elemento, ${formatNumQta(superficieMq)} MQ` : "servono le misure dell'elemento in MQ"}
          </span>
        ) : (
          <CampoNumero
            inputMode="decimal"
            min={0}
            aria-label={`Quantità ${voce.descrizione} (${um})`}
            value={quantita}
            onChange={(e) => {
              const n = Number.parseFloat(e.target.value)
              onChange(true, Number.isFinite(n) && n >= 0 ? n : null)
            }}
            className="w-24 rounded-sm border border-separator-opaque bg-surface-tertiary px-2 py-1 text-sm font-mono tabular-nums text-ink-primary focus:border-accent focus:ring-2 focus:ring-accent-light focus:outline-none"
          />
        ))}
    </div>
  )
}
