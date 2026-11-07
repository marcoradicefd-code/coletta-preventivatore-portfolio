import { useEffect, useId } from 'react'
import { useForm } from 'react-hook-form'
import { initialPreventivo, useQuoteStore } from '@/store/quoteStore'
import type { Cliente, Preventivo } from '@/types/common'
import { formatNumeroPreventivo } from '@/utils/numeroPreventivo'
import { CampoNumero } from '@/components/shared/CampoNumero'

interface FormData {
  numero: string
  data: string
  validitaGiorni: number
  oggettoPreventivo: string
  note: string
  nome: string
  cognome: string
  indirizzo: string
  citta: string
  telefono: string
  email: string
}

// La validità non resta mai vuota: vuoto, 0 o negativo torna al default del
// foglio (PREVENTIVO!G9, 30 giorni), e il campo lo MOSTRA al blur. Prima il campo
// restava vuoto mentre lo store e il PDF dicevano 30 (review 07/10, O34).
const VALIDITA_DEFAULT = initialPreventivo.validitaGiorni
const validitaOppureDefault = (n: number): number => (n > 0 ? n : VALIDITA_DEFAULT)

/** I campi del cliente nel form, gli stessi di `Cliente`. */
const CAMPI_CLIENTE = ['nome', 'cognome', 'indirizzo', 'citta', 'telefono', 'email'] as const

interface ClientFormProps {
  /** Apre la scelta del cliente (la finestra sta in `AppShell`, condivisa con la barra). */
  onScegliCliente?: () => void
}

export function ClientForm({ onScegliCliente }: Readonly<ClientFormProps> = {}) {
  const preventivo = useQuoteStore((s) => s.preventivo)
  const setCliente = useQuoteStore((s) => s.setCliente)
  const setPreventivo = useQuoteStore((s) => s.setPreventivo)
  const clienteId = useQuoteStore((s) => s.archivio?.clienteId ?? null)
  const clienteNelloStore = useQuoteStore((s) => s.preventivo.cliente)
  const salvato = useQuoteStore((s) => s.archivio?.preventivo ?? null)
  const idNote = useId()

  const { register, watch, getValues, setValue } = useForm<FormData>({
    defaultValues: {
      numero: preventivo.numero,
      data: preventivo.data,
      validitaGiorni: preventivo.validitaGiorni,
      oggettoPreventivo: preventivo.oggettoPreventivo,
      note: preventivo.note,
      nome: preventivo.cliente.nome,
      cognome: preventivo.cliente.cognome,
      indirizzo: preventivo.cliente.indirizzo,
      citta: preventivo.cliente.citta,
      telefono: preventivo.cliente.telefono,
      email: preventivo.cliente.email,
    },
  })

  // Sync form changes to store
  useEffect(() => {
    const subscription = watch((values) => {
      const clienteFields: readonly (keyof Cliente)[] = CAMPI_CLIENTE
      // Flag e testi document-level (`includiCondizioni`, `includiNotePagamento`,
      // `notePagamento`) hanno i loro controlli nei riepiloghi, non in questo
      // form → esclusi dai campi che ClientForm sincronizza. L'Omit li elenca
      // esplicitamente così, se domani ne nasce un altro, tsc lo segnala qui.
      // Il numero non è più nel form (L21-B): lo assegna il database al primo salvataggio.
      const prevFields: (keyof Omit<Preventivo, 'cliente' | 'numero' | 'includiCondizioni' | 'includiNotePagamento' | 'notePagamento'>)[] = ['data', 'validitaGiorni', 'oggettoPreventivo', 'note']

      const clientePatch: Partial<Cliente> = {}
      for (const key of clienteFields) {
        if (values[key] !== undefined) {
          clientePatch[key] = String(values[key] ?? '')
        }
      }
      setCliente(clientePatch)

      const prevPatch: Partial<Preventivo> = {}
      for (const key of prevFields) {
        const val = values[key]
        if (val !== undefined) {
          if (key === 'validitaGiorni') {
            prevPatch[key] = validitaOppureDefault(Number(val))
          } else {
            (prevPatch as Record<string, unknown>)[key] = String(val ?? '')
          }
        }
      }
      setPreventivo(prevPatch)
    })
    return () => subscription.unsubscribe()
  }, [watch, setCliente, setPreventivo])

  // Il cliente si sceglie nella finestra condivisa (barra, «Genera», qui): i
  // campi del form si leggono dallo store solo al montaggio, quindi quando il
  // cliente nello store cambia da fuori si riscrivono da lì. Si guarda il
  // cliente, non il suo id: riscegliere lo stesso cliente deve riallineare i
  // campi modificati a mano, o al tasto dopo il valore vecchio tornerebbe nello
  // store (revisione del 14/10, difetto 13). Quando cambia per un tasto nel
  // form, form e store coincidono già e non si riscrive niente.
  useEffect(() => {
    for (const k of CAMPI_CLIENTE) {
      const valore = clienteNelloStore[k] ?? ''
      if (getValues(k) !== valore) setValue(k, valore)
    }
  }, [clienteNelloStore, getValues, setValue])

  return (
    <div className="max-w-3xl space-y-8">
      <h2 className="font-display text-2xl text-ink-primary">Dati preventivo</h2>

      {/* Preventivo metadata */}
      <section className="rounded-lg bg-surface-secondary border border-separator-opaque shadow-apple-sm p-6 space-y-5">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-ink-tertiary">
          Documento
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Il numero è del database (L21-B: il PDF esce solo con quello) e non si scrive a mano. */}
          <Field
            label="N. Preventivo"
            value={salvato ? formatNumeroPreventivo(salvato) : 'Non ancora salvato'}
            readOnly
            aria-readonly="true"
            aria-describedby={salvato ? undefined : 'nota-numero'}
          />
          <Field label="Data" type="date" {...register('data')} />
          <Field
            label="Validità (giorni)"
            numerico
            placeholder={String(VALIDITA_DEFAULT)}
            {...register('validitaGiorni', {
              valueAsNumber: true,
              onBlur: () => {
                const v = getValues('validitaGiorni')
                if (validitaOppureDefault(v) !== v) setValue('validitaGiorni', VALIDITA_DEFAULT)
              },
            })}
          />
        </div>
        {!salvato && (
          <p id="nota-numero" className="text-xs text-ink-tertiary">
            Il numero arriva al primo salvataggio.
          </p>
        )}
        <Field label="Oggetto del preventivo" {...register('oggettoPreventivo')} placeholder="Cucina completa con top in gres..." />
      </section>

      {/* Cliente */}
      <section className="rounded-lg bg-surface-secondary border border-separator-opaque shadow-apple-sm p-6 space-y-5">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-ink-tertiary">
          Cliente
        </h3>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-ink-secondary">
            {clienteId ? 'Collegato a un cliente dell’anagrafica.' : 'Nessun cliente dell’anagrafica collegato.'}
          </p>
          {onScegliCliente && (
            <button
              type="button"
              onClick={onScegliCliente}
              className="min-h-11 rounded-sm border border-separator-opaque px-3 py-1.5 text-sm text-ink-primary hover:bg-surface-tertiary md:min-h-9"
            >
              {clienteId ? 'Cambia cliente' : 'Scegli il cliente'}
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* U16: Nome e Cognome non sono obbligatori da L21-B (serve un cliente collegato). */}
          <Field label="Nome" autoComplete="cliente-nome" {...register('nome')} />
          <Field label="Cognome" autoComplete="cliente-cognome" {...register('cognome')} />
          <Field label="Indirizzo" autoComplete="cliente-indirizzo" {...register('indirizzo')} />
          <Field label="Città" autoComplete="cliente-citta" {...register('citta')} />
          <Field label="Telefono" type="tel" autoComplete="cliente-telefono" {...register('telefono')} />
          <Field label="Email" type="email" autoComplete="cliente-email" {...register('email')} />
        </div>
      </section>

      {/* Note */}
      <section className="rounded-lg bg-surface-secondary border border-separator-opaque shadow-apple-sm p-6 space-y-5">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-ink-tertiary">
          Note
        </h3>
        <div className="space-y-1">
          <label htmlFor={idNote} className="block text-xs font-medium uppercase tracking-wider text-ink-tertiary">
            Note aggiuntive
          </label>
          <textarea
            id={idNote}
            {...register('note')}
            rows={4}
            className="w-full rounded-sm border border-separator-opaque bg-surface-tertiary px-3.5 py-2.5 text-[17px] text-ink-primary placeholder:text-ink-tertiary transition-[border-color,box-shadow] duration-150 focus:border-accent focus:ring-2 focus:ring-accent-light focus:outline-none resize-y"
            placeholder="Condizioni particolari, tempistiche, riferimenti..."
          />
        </div>
      </section>
    </div>
  )
}

// Reusable field component
interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string
  /** Il campo numerico del design system (`CampoNumero`, L24), non controllato: react-hook-form lo legge dal ref. */
  numerico?: boolean
}

/**
 * Etichetta sopra e campo, associati con `htmlFor`/`id` (revisione del 14/10,
 * difetto 16). L'id viene da `useId`, mai dal nome del campo: Chrome deduce il
 * tipo di Autofill anche dall'id (rule `ui`, O35).
 */
function Field({ label, id, numerico, ...props }: Readonly<FieldProps>) {
  const idAuto = useId()
  const idCampo = id ?? idAuto
  // U16: un campo in sola lettura non ha l'aspetto di un campo da scrivere.
  const classe = `w-full rounded-sm border px-3.5 py-2.5 ${props.readOnly ? 'border-dashed border-separator-opaque bg-transparent' : 'border-separator-opaque bg-surface-tertiary'} text-[17px] text-ink-primary placeholder:text-ink-tertiary transition-[border-color,box-shadow] duration-150 focus:border-accent focus:ring-2 focus:ring-accent-light focus:outline-none`
  return (
    <div className="space-y-1">
      <label htmlFor={idCampo} className="block text-xs font-medium uppercase tracking-wider text-ink-tertiary">
        {label}
      </label>
      {numerico ? (
        <CampoNumero id={idCampo} {...(props as Omit<typeof props, 'type' | 'value'>)} className={classe} />
      ) : (
        <input id={idCampo} {...props} className={classe} />
      )}
    </div>
  )
}
