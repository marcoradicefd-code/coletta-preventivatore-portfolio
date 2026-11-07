import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { X, Trash2 } from 'lucide-react'
import { modalVariants } from '@/styles/variants'
import { useQuoteStore } from '@/store/quoteStore'
import { FALLBACK_PORTE } from '@/store/quoteFallbacks'
import { prezzoFascia, calcRigaPorta, costoOptional, manigliaInclusa, origineValorizzata, type FasciaAltezza } from '@/engine/calcPorte'
import { formatEur } from '@/utils/format'
import type { ListinoPorte } from '@/types/porte'
import type { OptionalScelto } from '@/types/quote'
import { descrizionePortaDi } from '@/store/quoteSelectors'
import { isVoceBattiscopa } from '@/data/battiscopa'
import { SelettoreAliquotaIva } from '@/components/shared/SelettoreIva'
import { aliquotaIvaSezione } from '@/engine/iva'
import { CampoNumero } from '@/components/shared/CampoNumero'

const FASCIA_DESC: Record<FasciaAltezza, string> = {
  base: 'Altezza ≤ 215 cm → prezzo base 2026',
  h215: 'Altezza 216–240 cm → colonna H>215',
  h240: 'Altezza > 240 cm → colonna H>240',
}

// Etichetta unità di quantità (per gli optional che la usano).
const QTY_LABEL: Partial<Record<OptionalScelto['unita'], string>> = {
  MQ: 'mq',
  PEZZO: 'pz',
  ML: 'cm',
}

interface PortaConfigModalProps {
  rigaId: string
  listino: ListinoPorte
  onClose: () => void
}

export function PortaConfigModal({ rigaId, listino, onClose }: PortaConfigModalProps) {
  const riga = useQuoteStore((s) => (s.sezioni.porte ?? FALLBACK_PORTE).righe.find((r) => r.id === rigaId))
  const updateRiga = useQuoteStore((s) => s.updateRigaPorta)
  // L'aliquota che la riga eredita finché non ne sceglie una sua (L18).
  const ivaSezione = useQuoteStore((s) => aliquotaIvaSezione(s.sezioni.porte?.aliquotaIva))
  const setDescrizione = useQuoteStore((s) => s.setDescrizionePorta)
  const setManiglia = useQuoteStore((s) => s.setManigliaPorta)
  const addOpt = useQuoteStore((s) => s.addOptionalPorta)
  const updateOpt = useQuoteStore((s) => s.updateOptionalPorta)
  const removeOpt = useQuoteStore((s) => s.removeOptionalPorta)
  // Modello della maniglia da aggiungere: senza, "Aggiungi" resta spento (una
  // maniglia senza nome scriveva "maniglia ." nel testo del PDF).
  const [modelloNuovaManiglia, setModelloNuovaManiglia] = useState('')

  // Se la riga sparisce (rimossa altrove) chiudo il modal.
  useEffect(() => {
    if (!riga) onClose()
  }, [riga, onClose])
  if (!riga) return null

  const modello = listino.modelli.find((m) => m.nome === riga.modelloNome)
  const fascia = modello ? prezzoFascia(modello, riga.altezzaCm) : null
  const calc = calcRigaPorta(riga, listino)
  const maniglia = riga.maniglia

  const aggiungiOptional = (nome: string) => {
    const opt = listino.optional.find((o) => o.nome === nome)
    if (!opt) return
    addOpt(rigaId, { nome: opt.nome, unita: opt.unita, quantita: 1, prezzoManuale: null })
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        variants={modalVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        className="fixed inset-0 z-50 flex sm:items-center sm:justify-center sm:p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex w-full flex-col bg-surface-secondary shadow-apple-xl h-[100svh] sm:h-auto sm:max-h-[90vh] sm:max-w-lg sm:rounded-lg sm:border sm:border-separator-opaque">
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-separator-opaque px-6 py-4">
            <h3 className="font-display text-xl text-ink-primary">Configura porta</h3>
            <button
              onClick={onClose}
              aria-label="Chiudi"
              className="flex h-9 w-9 items-center justify-center rounded-xs text-ink-tertiary hover:text-ink-primary hover:bg-surface-tertiary transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Corpo scrollabile */}
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {/* Modello */}
            <Field label="Modello">
              <select
                value={riga.modelloNome}
                onChange={(e) => updateRiga(rigaId, { modelloNome: e.target.value })}
                className="w-full rounded-sm border border-separator-opaque bg-surface-tertiary px-3 py-2 text-sm text-ink-primary focus:border-accent focus:ring-2 focus:ring-accent-light focus:outline-none"
                style={{ minHeight: 44 }}
              >
                {listino.modelli.map((m) => (
                  <option key={m.nome} value={m.nome}>{m.nome}</option>
                ))}
              </select>
            </Field>

            {/* Quantità: quante porte identiche in questa riga. Sta accanto al
                modello perché è una proprietà della SCELTA, non un extra. */}
            <Field label="Quantità (n. porte)">
              <CampoNumero
                inputMode="numeric"
                min={1}
                step={1}
                aria-label="Quantità porte"
                value={riga.quantita ?? 1}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10)
                  updateRiga(rigaId, { quantita: Number.isFinite(n) && n >= 1 ? n : 1 })
                }}
                className="w-full rounded-sm border border-separator-opaque bg-surface-tertiary px-3 py-2 text-sm text-ink-primary font-mono tabular-nums focus:border-accent focus:ring-2 focus:ring-accent-light focus:outline-none"
                style={{ minHeight: 44 }}
              />
              <p className="mt-1 text-xs text-ink-tertiary">
                Moltiplica prezzo porta e optional (gli stipiti sono per ogni porta). La maniglia no: ha la sua quantità.
              </p>
            </Field>

            {/* Aliquota IVA della riga (L18): «come la sezione» finché non se ne sceglie una. */}
            <SelettoreAliquotaIva
              label="IVA"
              value={riga.aliquotaIva}
              sezione={ivaSezione}
              onChange={(a) => updateRiga(rigaId, { aliquotaIva: a })}
            />

            {/* Descrizione della riga (DOCX 25/07).
                Tri-stato: finché nessuno scrive, la casella mostra il testo
                composto sul modello e SEGUE il modello se cambia. Appena si
                scrive, diventa una promessa e il cambio modello non la tocca
                più; cancellare tutto la riporta automatica. */}
            <Field label="Descrizione in preventivo">
              <textarea
                value={descrizionePortaDi(riga)}
                onChange={(e) => setDescrizione(rigaId, e.target.value)}
                rows={4}
                className="w-full rounded-sm border border-separator-opaque bg-surface-tertiary px-3 py-2 text-sm text-ink-primary leading-relaxed focus:border-accent focus:ring-2 focus:ring-accent-light focus:outline-none"
              />
              <p className="mt-1 text-xs text-ink-tertiary">
                {riga.descrizione == null
                  ? 'Automatica: segue il modello scelto.'
                  : 'Personalizzata: non cambia più con il modello. Svuota per tornare automatica.'}
              </p>
            </Field>

            {/* Altezza + fascia attiva */}
            <Field label="Altezza (cm)">
              <CampoNumero
                inputMode="numeric"
                min={0}
                aria-label="Altezza porta (cm)"
                value={riga.altezzaCm}
                onChange={(e) => {
                  const n = parseFloat(e.target.value)
                  updateRiga(rigaId, { altezzaCm: Number.isFinite(n) && n >= 0 ? n : 0 })
                }}
                className="w-full rounded-sm border border-separator-opaque bg-surface-tertiary px-3 py-2 text-sm text-ink-primary font-mono tabular-nums focus:border-accent focus:ring-2 focus:ring-accent-light focus:outline-none"
                style={{ minHeight: 44 }}
              />
              {/* Qui l'altezza si svuota: è qui che va detto cosa succede. */}
              {calc.altezzaCm <= 0 && (
                <p className="mt-1 text-xs font-medium text-error">
                  Inserisci l'altezza: la porta resta fuori dal totale finché manca.
                </p>
              )}
            </Field>

            <div className="rounded-sm bg-surface-tertiary p-3 space-y-1 text-sm">
              {fascia ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-ink-tertiary">{FASCIA_DESC[fascia.fascia]}</span>
                  </div>
                  <PriceRow label="Prezzo base porta" value={fascia.prezzo} bold />
                </>
              ) : (
                <p className="text-warning">Modello non trovato nel listino corrente.</p>
              )}
            </div>

            {/* Optional */}
            <Field label="Optional">
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) aggiungiOptional(e.target.value)
                }}
                className="w-full rounded-sm border border-separator-opaque bg-surface-primary px-3 py-2 text-sm text-ink-secondary focus:border-accent focus:ring-2 focus:ring-accent-light focus:outline-none"
                style={{ minHeight: 44 }}
              >
                <option value="">+ Aggiungi optional…</option>
                {/* Le voci battiscopa NON sono più scegliibili da qui: hanno il
                    loro pulsante nella pagina, perché sono a corpo e non
                    devono finire nel moltiplicatore delle porte. Filtro solo in
                    LETTURA: le righe già salvate col battiscopa fra gli optional
                    restano leggibili e prezzate esattamente come prima. */}
                {listino.optional
                  .filter((o) => !isVoceBattiscopa(o.nome))
                  .map((o) => (
                    <option key={o.nome} value={o.nome}>{o.nome}</option>
                  ))}
              </select>
            </Field>

            {riga.optionals.length > 0 && (
              <ul className="space-y-2">
                {riga.optionals.map((opt) => (
                  <OptionalRow
                    key={opt.id}
                    opt={opt}
                    costo={costoOptional(opt, listino)}
                    onQty={(v) => updateOpt(rigaId, opt.id, { quantita: v })}
                    onPrezzoManuale={(v) => updateOpt(rigaId, opt.id, { prezzoManuale: v })}
                    onRemove={() => removeOpt(rigaId, opt.id)}
                  />
                ))}
              </ul>
            )}

            {/* Maniglia — blocco PROPRIO, fuori dagli Optional.
                Gli Optional sono alimentati dal listino: una maniglia lì dentro
                sembrerebbe una voce di listino, e nel listino porte le maniglie
                non ci sono (ci sono stipiti, mostrine e battiscopa, punto). */}
            <Field label="Maniglia (prezzo a mano)">
              {maniglia ? (
                <div className="space-y-3 rounded-sm bg-surface-tertiary p-3">
                  {/* Due campi per riga da sm in su, uno solo su mobile: è la
                      griglia già usata da ArticoloConfigModal e ClientForm.
                      Affiancati a 375px, modello e finitura si troncavano
                      entrambi ("Olivari Rio Cromo s" / "cromo satinato spa"). */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="block text-xs text-ink-tertiary">Modello</label>
                      <input
                        value={maniglia.modello}
                        onChange={(e) => setManiglia(rigaId, { ...maniglia, modello: e.target.value })}
                        placeholder="es. Olivari Rio"
                        aria-label="Modello maniglia"
                        className="w-full min-w-0 rounded-sm border border-separator-opaque bg-surface-secondary px-3 py-2 text-sm text-ink-primary focus:border-accent focus:outline-none"
                        style={{ minHeight: 44 }}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs text-ink-tertiary">Finitura</label>
                      <input
                        value={maniglia.finitura}
                        onChange={(e) => setManiglia(rigaId, { ...maniglia, finitura: e.target.value })}
                        placeholder="es. cromo satinato"
                        aria-label="Finitura maniglia"
                        className="w-full min-w-0 rounded-sm border border-separator-opaque bg-surface-secondary px-3 py-2 text-sm text-ink-primary focus:border-accent focus:outline-none"
                        style={{ minHeight: 44 }}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="block text-xs text-ink-tertiary">Quantità</label>
                      <CampoNumero
                        min={0}
                        step={1}
                        value={maniglia.qta}
                        aria-label="Quantità maniglie"
                        onChange={(e) => {
                          const n = parseInt(e.target.value, 10)
                          setManiglia(rigaId, { ...maniglia, qta: Number.isFinite(n) && n >= 0 ? n : 0 })
                        }}
                        className="w-full rounded-sm border border-separator-opaque bg-surface-secondary px-3 py-2 text-sm text-ink-primary font-mono tabular-nums text-right focus:border-accent focus:outline-none"
                        style={{ minHeight: 44 }}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs text-ink-tertiary">Prezzo unitario (€)</label>
                      <CampoNumero
                        min={0}
                        step="any"
                        value={maniglia.prezzoUnitario}
                        placeholder="inclusa"
                        aria-label="Prezzo unitario maniglia"
                        onChange={(e) => {
                          // Casella vuota = maniglia inclusa: la chiave sparisce,
                          // non resta uno 0 che sembra un prezzo.
                          const senzaPrezzo = { qta: maniglia.qta, modello: maniglia.modello, finitura: maniglia.finitura }
                          const n = parseFloat(e.target.value)
                          setManiglia(
                            rigaId,
                            e.target.value === '' ? senzaPrezzo : { ...maniglia, prezzoUnitario: Number.isFinite(n) && n >= 0 ? n : 0 }
                          )
                        }}
                        className="w-full rounded-sm border border-separator-opaque bg-surface-secondary px-3 py-2 text-sm text-ink-primary font-mono tabular-nums text-right focus:border-accent focus:outline-none"
                        style={{ minHeight: 44 }}
                      />
                    </div>
                  </div>
                  {/* Totale su riga propria: prima "€ =" e l'importo finivano in
                      coda ai due input e andavano a capo spezzati. */}
                  <div className="flex items-center justify-between gap-2 border-t border-separator-opaque pt-2">
                    <span className="text-sm text-ink-tertiary">Totale maniglia</span>
                    <span data-testid="totale-maniglia" className="font-mono text-sm tabular-nums text-ink-primary">
                      {manigliaInclusa(maniglia) ? 'inclusa' : `€ ${formatEur(calc.totaleManiglia)}`}
                    </span>
                    <button
                      onClick={() => setManiglia(rigaId, null)}
                      aria-label="Rimuovi maniglia"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xs text-ink-tertiary hover:text-error"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <p className="text-xs text-ink-tertiary">
                    Prezzo vuoto = maniglia inclusa nel prezzo della porta; con un prezzo è un modello extra e si somma alla riga. Quantità indipendente dalle porte (6 porte / 4 maniglie è ammesso). Modello e finitura entrano nel testo del preventivo.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    value={modelloNuovaManiglia}
                    onChange={(e) => setModelloNuovaManiglia(e.target.value)}
                    placeholder="Modello, es. Olivari Rio"
                    aria-label="Modello maniglia"
                    className="w-full min-w-0 flex-1 rounded-sm border border-separator-opaque bg-surface-secondary px-3 py-2 text-sm text-ink-primary focus:border-accent focus:outline-none"
                    style={{ minHeight: 44 }}
                  />
                  <button
                    disabled={modelloNuovaManiglia.trim() === ''}
                    onClick={() => {
                      // Nasce SENZA prezzo, cioè inclusa: il prezzo si scrive
                      // solo se è un modello extra.
                      setManiglia(rigaId, { qta: riga.quantita ?? 1, modello: modelloNuovaManiglia.trim(), finitura: '' })
                      setModelloNuovaManiglia('')
                    }}
                    className="shrink-0 rounded-sm border border-dashed border-separator-opaque px-3 py-2.5 text-sm text-ink-secondary hover:border-brand-red hover:text-brand-red transition-colors disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-separator-opaque disabled:hover:text-ink-secondary"
                    style={{ minHeight: 44 }}
                  >
                    + Aggiungi maniglia
                  </button>
                </div>
              )}
            </Field>

            {/* Riepilogo prezzo live */}
            <div className="rounded-sm bg-surface-tertiary p-3 space-y-1 text-sm">
              <PriceRow label="Base" value={calc.prezzoBase} />
              <PriceRow label="Optional" value={calc.optionalTotale} />
              {/* L'importo delle porte dell'engine (intero, D4): totale riga meno maniglia,
                  così le righe qui sotto sommano al totale. */}
              <PriceRow label={`Prezzo unitario × ${calc.quantita}`} value={calc.totale - calc.totaleManiglia} />
              {calc.totaleManiglia > 0 && <PriceRow label="Maniglia" value={calc.totaleManiglia} />}
              <div className="h-px bg-separator-opaque my-1" />
              {/* Una riga fuori dal subtotale non mostra un totale pieno che
                  nessun totale del preventivo contiene. */}
              {origineValorizzata(calc.origine) ? (
                <PriceRow label="Totale riga" value={calc.totale} bold />
              ) : (
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-ink-primary">Totale riga</span>
                  <span data-testid="totale-riga-porta" className="text-error">esclusa dal totale</span>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex shrink-0 items-center justify-end gap-3 border-t border-separator-opaque px-6 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-4">
            <button
              onClick={onClose}
              className="flex items-center gap-2 rounded-sm bg-brand-red px-4 py-2.5 text-sm font-semibold text-white shadow-red
                hover:bg-brand-red-dark active:scale-[0.98] transition-all"
              style={{ minHeight: 44 }}
            >
              Fatto
            </button>
          </div>
        </div>
      </motion.div>
    </>
  )
}

function OptionalRow({
  opt,
  costo,
  onQty,
  onPrezzoManuale,
  onRemove,
}: {
  opt: OptionalScelto
  costo: number
  onQty: (v: number) => void
  onPrezzoManuale: (v: number | null) => void
  onRemove: () => void
}) {
  return (
    <li className="rounded-sm bg-surface-tertiary px-3 py-2.5 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-ink-primary min-w-0 truncate">{opt.nome}</p>
        <div className="flex items-center gap-2 shrink-0">
          <span className="font-mono text-sm tabular-nums text-ink-primary">€ {formatEur(costo)}</span>
          <button
            onClick={onRemove}
            aria-label="Rimuovi optional"
            className="flex h-7 w-7 items-center justify-center rounded-xs text-ink-tertiary hover:text-error hover:bg-surface-secondary transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {opt.unita === 'PORTA' && (
        <p className="text-xs text-ink-tertiary">Fisso, per porta.</p>
      )}

      {(opt.unita === 'MQ' || opt.unita === 'PEZZO' || opt.unita === 'ML') && (
        <div className="flex items-center gap-2">
          <label className="text-xs text-ink-tertiary">
            {opt.unita === 'ML' && /battiscopa/i.test(opt.nome)
              ? 'altezza battiscopa (cm)'
              : `Quantità (${QTY_LABEL[opt.unita]})`}
          </label>
          <CampoNumero
            inputMode="decimal"
            min={0}
            value={opt.quantita}
            onChange={(e) => {
              const n = parseFloat(e.target.value)
              onQty(Number.isFinite(n) && n >= 0 ? n : 0)
            }}
            className="w-24 rounded-sm border border-separator-opaque bg-surface-secondary px-2 py-1 text-sm text-ink-primary font-mono tabular-nums text-right focus:border-accent focus:ring-2 focus:ring-accent-light focus:outline-none"
          />
        </div>
      )}

      {opt.unita === 'MANUALE' && (
        <div className="flex items-center gap-2">
          <label className="text-xs text-ink-tertiary">Prezzo a mano (€)</label>
          <CampoNumero
            inputMode="decimal"
            min={0}
            value={opt.prezzoManuale}
            onChange={(e) => {
              const raw = e.target.value
              if (raw === '') return onPrezzoManuale(null)
              const n = parseFloat(raw)
              onPrezzoManuale(Number.isFinite(n) && n >= 0 ? n : 0)
            }}
            className="w-28 rounded-sm border border-separator-opaque bg-surface-secondary px-2 py-1 text-sm text-ink-primary font-mono tabular-nums text-right focus:border-accent focus:ring-2 focus:ring-accent-light focus:outline-none"
          />
        </div>
      )}
    </li>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium uppercase tracking-wider text-ink-tertiary">{label}</label>
      {children}
    </div>
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
