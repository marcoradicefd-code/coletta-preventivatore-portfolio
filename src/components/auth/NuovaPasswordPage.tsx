import { useId, useMemo, useState, type SubmitEvent } from 'react'
import { Eye, EyeOff, Loader2, Lock, AlertCircle } from 'lucide-react'
import { useAuthStore, MSG_PASSWORD_AGGIORNATA } from '@/store/authStore'
import { useToast } from '@/components/shared/toastContext'
import { CartaAccesso } from './CartaAccesso'
import { IndicatorePassword } from './IndicatorePassword'
import { testoMancanti, valutaPassword } from '@/lib/regolaPassword'

const STILE_CAMPO =
  'w-full rounded-sm bg-white/5 border border-white/10 pl-10 pr-11 py-2.5 text-[14px] text-white placeholder-white/30 outline-none focus:border-brand-red focus:bg-white/[0.07] transition-colors'
const STILE_ETICHETTA = 'text-[12px] font-medium uppercase tracking-widest text-white/55'
const STILE_LINK =
  'self-center min-h-11 px-2 text-[13px] text-white/70 underline-offset-2 transition-colors hover:text-white hover:underline'

/**
 * «Imposta una nuova password» (L26): la mostra `AuthGuard` al posto dell'app
 * durante la sessione di recupero. Dopo il salvataggio si entra nell'app con
 * l'avviso: la sessione è già aperta, e uscire passerebbe da `logout`, che
 * spegne «Ricordami» e toglie il preventivo ricordato. Per uscire senza
 * scegliere la password, «Torna all'accesso» (mai «Annulla», rule `ui`).
 */
export function NuovaPasswordPage() {
  const [nuova, setNuova] = useState('')
  const [ripeti, setRipeti] = useState('')
  const [mostra, setMostra] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const [linkNonValido, setLinkNonValido] = useState(false)
  const [occupato, setOccupato] = useState(false)
  const idNuova = useId()
  const idRipeti = useId()
  const idIndicatore = useId()
  const idMotivo = useId()

  const aggiornaPassword = useAuthStore((s) => s.aggiornaPassword)
  const richiediNuovoLink = useAuthStore((s) => s.richiediNuovoLink)
  const logout = useAuthStore((s) => s.logout)
  const email = useAuthStore((s) => s.user?.email)
  // L29: la stessa barra di «Registrati»; si salva solo coi due obbligatori.
  const valutazione = useMemo(() => valutaPassword(nuova, email), [nuova, email])
  const mancaRegola = !valutazione.valida
  const { showToast } = useToast()

  const handleSalva = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    setErrore(null)
    setLinkNonValido(false)
    if (!nuova || !ripeti) {
      setErrore('Scrivi la nuova password nei due campi.')
      return
    }
    if (nuova !== ripeti) {
      setErrore('Le due password non sono uguali.')
      return
    }
    setOccupato(true)
    const esito = await aggiornaPassword(nuova)
    if (esito.error) {
      setErrore(esito.error)
      setLinkNonValido(Boolean(esito.linkNonValido))
      setOccupato(false)
      return
    }
    // Lo store ha già spento il recupero: AuthGuard monta l'app, il toast sta sopra.
    showToast(MSG_PASSWORD_AGGIORNATA, 'success')
  }

  const esci = async () => {
    setOccupato(true)
    const { error } = await logout()
    if (error) showToast(error, 'error')
  }

  const campo = (
    id: string,
    etichetta: string,
    valore: string,
    cambia: (v: string) => void,
    conOcchio: boolean,
    descrittoDa?: string
  ) => (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={STILE_ETICHETTA}>
        {etichetta}
      </label>
      <div className="relative">
        <Lock
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40"
          strokeWidth={1.5}
        />
        <input
          id={id}
          type={mostra ? 'text' : 'password'}
          autoComplete="new-password"
          value={valore}
          onChange={(e) => cambia(e.target.value)}
          aria-describedby={descrittoDa}
          className={STILE_CAMPO}
          style={{ minHeight: 44 }}
        />
        {conOcchio && (
          <button
            type="button"
            onClick={() => setMostra((v) => !v)}
            aria-label={mostra ? 'Nascondi password' : 'Mostra password'}
            className="absolute right-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-xs text-white/50 hover:text-white/85 transition-colors"
          >
            {mostra ? <EyeOff className="h-4 w-4" strokeWidth={1.5} /> : <Eye className="h-4 w-4" strokeWidth={1.5} />}
          </button>
        )}
      </div>
    </div>
  )

  return (
    <CartaAccesso>
      <form onSubmit={handleSalva} className="flex flex-col gap-4" noValidate>
        <div>
          <h2 className="text-[16px] font-semibold text-white">Imposta una nuova password</h2>
          <p className="mt-1 text-[13px] text-white/70">
            Scegli la password con cui entrerai d&apos;ora in poi.
          </p>
        </div>
        {campo(idNuova, 'Nuova password', nuova, setNuova, true, idIndicatore)}
        <IndicatorePassword id={idIndicatore} password={nuova} valutazione={valutazione} />
        {campo(idRipeti, 'Ripeti la password', ripeti, setRipeti, false)}

        {errore && (
          <div
            className="flex items-start gap-2 rounded-sm border border-error/40 bg-error/10 px-3 py-2.5 text-[13px] text-error-su-navy"
            role="alert"
          >
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" strokeWidth={1.5} />
            <span>{errore}</span>
          </div>
        )}

        {linkNonValido ? (
          <button
            type="button"
            onClick={() => void richiediNuovoLink()}
            className="mt-2 flex items-center justify-center rounded-sm bg-brand-red px-4 py-3 text-[14px] font-semibold text-white transition-colors duration-150 hover:bg-brand-red/90"
            style={{ minHeight: 48 }}
          >
            Chiedi un nuovo link
          </button>
        ) : (
          <>
          {mancaRegola && (
            <p id={idMotivo} className="-mb-2 text-[12px] text-white/70">
              Per salvare manca: {testoMancanti(valutazione)}.
            </p>
          )}
          <button
            type="submit"
            disabled={occupato || mancaRegola}
            aria-describedby={mancaRegola ? idMotivo : undefined}
            className="mt-2 flex items-center justify-center gap-2 rounded-sm bg-brand-red px-4 py-3 text-[14px] font-semibold text-white transition-colors duration-150 hover:bg-brand-red/90 disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ minHeight: 48 }}
          >
            {occupato && <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />}
            Salva la nuova password
          </button>
          </>
        )}
        <button type="button" onClick={() => void esci()} disabled={occupato} className={STILE_LINK}>
          Torna all&apos;accesso
        </button>
      </form>
    </CartaAccesso>
  )
}
