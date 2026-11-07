import { useId, useMemo, useState, type SubmitEvent } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Eye, EyeOff, Loader2, Mail, Lock, Check } from 'lucide-react'
import { useAuthStore, MSG_REGISTRAZIONE } from '@/store/authStore'
import { setRememberSession } from '@/lib/authStorage'
import { CartaAccesso, MessaggiAccesso } from './CartaAccesso'
import { FormPasswordDimenticata } from './FormPasswordDimenticata'
import { PASSWORD_MIN, erroreRegolaPassword, testoMancanti, valutaPassword } from '@/lib/regolaPassword'
import { IndicatorePassword } from './IndicatorePassword'
import { ATTESA_INVIO_S, useContoAllaRovescia } from '@/hooks/useContoAllaRovescia'

const ALLOWED_DOMAINS = ['colettaebanisteria.it', 'luxuryacademy.online']

function isAllowedEmail(email: string): boolean {
  const domain = email.trim().split('@')[1]?.toLowerCase()
  return !!domain && ALLOWED_DOMAINS.includes(domain)
}

type Mode = 'login' | 'register'

/** Il dominio fuori lista: non è un errore a schermo, ha l'esito di una registrazione inviata (L26). */
const FUORI_LISTA = 'fuori-lista'

/**
 * Il primo problema del form prima della chiamata: il testo dell'errore,
 * `FUORI_LISTA`, o `null`. In registrazione il dominio si guarda per ultimo:
 * prima, «password corta» comparirebbe solo per i domini ammessi (L26).
 */
function controllaForm(mode: Mode, email: string, password: string, conferma: string): string | null {
  if (!email || !password) return 'Compila tutti i campi.'
  if (mode === 'login') return null
  const regola = erroreRegolaPassword(password)
  if (regola) return regola
  if (password !== conferma) return 'Le password non corrispondono.'
  return isAllowedEmail(email) ? null : FUORI_LISTA
}

export function LoginPage() {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  // Sessione di login: OFF (default) → sessionStorage (esce alla chiusura del
  // browser, sicuro su postazioni condivise). NB: diverso da "Ricorda preventivo".
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // L'esito della registrazione: uno stato neutro, uguale per ogni esito (L26).
  const [nota, setNota] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // L29: dopo una registrazione inviata «Registrati» resta spento 60 s, come «Invia il link».
  const { attesa, inAttesa, avvia: avviaAttesa } = useContoAllaRovescia()
  // «Password dimenticata?» (L26): il form piccolo al posto di quello di accesso.
  // Aperto da subito se si arriva da un link di recupero non più valido (L26).
  const [recupero, setRecupero] = useState(
    () => useAuthStore.getState().avvisoAccesso === 'link-non-valido'
  )

  const login = useAuthStore((s) => s.login)
  const register = useAuthStore((s) => s.register)
  const avvisoAccesso = useAuthStore((s) => s.avvisoAccesso)
  const chiudiAvvisoAccesso = useAuthStore((s) => s.chiudiAvvisoAccesso)
  const prefersReduced = useReducedMotion()
  const idIndicatore = useId()
  const idMotivo = useId()

  // L29: la barra e l'elenco solo in «Registrati»; il pulsante parte solo coi due obbligatori.
  const valutazione = useMemo(() => valutaPassword(password, email), [password, email])
  const mancaRegola = mode === 'register' && !valutazione.valida
  const registrazioneInAttesa = mode === 'register' && inAttesa

  const resetMessages = () => {
    setError(null)
    setNota(null)
    // L'avviso d'ingresso vale fino al primo gesto.
    chiudiAvvisoAccesso()
  }

  const apriRecupero = (aperto: boolean) => {
    resetMessages()
    setRecupero(aperto)
  }

  const handleModeChange = (next: Mode) => {
    if (next === mode) return
    setMode(next)
    resetMessages()
    setPassword('')
    setConfirmPassword('')
  }

  /** Account creato, già esistente o dominio fuori lista: la pagina fa e dice la stessa cosa, conto alla rovescia compreso. */
  const chiudiRegistrazione = () => {
    avviaAttesa(ATTESA_INVIO_S)
    setNota(MSG_REGISTRAZIONE)
    setMode('login')
    setPassword('')
    setConfirmPassword('')
  }

  const handleSubmit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    // Invio col tasto a pulsante spento: il browser lo blocca già, qui per sicurezza.
    if (registrazioneInAttesa) return
    resetMessages()

    const problema = controllaForm(mode, email, password, confirmPassword)
    // Fuori lista: bloccato qui, prima della chiamata, ma con lo stesso esito
    // di una registrazione inviata (aggiunta L26).
    if (problema === FUORI_LISTA) {
      chiudiRegistrazione()
      return
    }
    if (problema) {
      setError(problema)
      return
    }

    setSubmitting(true)
    try {
      // Imposta la persistenza PRIMA del login, così la sessione che Supabase
      // sta per scrivere finisce nello store giusto. In registrazione forziamo
      // OFF (niente sessione "ricordata" per un account appena creato).
      setRememberSession(mode === 'login' ? rememberMe : false)
      const action = mode === 'login' ? login : register
      const result = await action(email.trim(), password)
      if (result.error) {
        setError(result.error)
      } else if (mode === 'register') {
        chiudiRegistrazione()
      }
    } finally {
      setSubmitting(false)
    }
  }

  const campoEmail = (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium uppercase tracking-widest text-white/55">
        Email
      </span>
      <div className="relative">
        <Mail
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40"
          strokeWidth={1.5}
        />
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-sm bg-white/5 border border-white/10 pl-10 pr-3 py-2.5 text-[14px] text-white placeholder-white/30 outline-none focus:border-brand-red focus:bg-white/[0.07] transition-colors"
          style={{ minHeight: 44 }}
        />
      </div>
    </label>
  )

  const messaggi = <MessaggiAccesso errore={error} nota={nota} avviso={avvisoAccesso} />

  // Lo stesso testo nelle due modalità: la pagina non dice quali domini sono ammessi (L26).
  const piede = (
    <p className="mt-6 text-center text-[12px] text-white/60">
      Accesso riservato al personale Coletta Ebanisteria.
    </p>
  )

  if (recupero) {
    return (
      <CartaAccesso>
        <FormPasswordDimenticata
          email={email}
          campoEmail={campoEmail}
          onChiudi={() => apriRecupero(false)}
        />
        {piede}
      </CartaAccesso>
    )
  }

  return (
    <CartaAccesso>
        {/* Tabs — pillolo unico mosso via transform translateX (GPU, niente
            layout animation): scorrimento fluido senza rimbalzo né stutter. */}
        <div className="relative flex rounded-sm bg-white/5 p-1 mb-6">
          <motion.div
            aria-hidden="true"
            className="absolute top-1 bottom-1 left-1 w-[calc(50%-0.25rem)] rounded-xs bg-brand-red"
            animate={{ x: mode === 'login' ? '0%' : '100%' }}
            transition={
              prefersReduced ? { duration: 0 } : { duration: 0.26, ease: [0.25, 0.46, 0.45, 0.94] }
            }
          />
          {(['login', 'register'] as Mode[]).map((m) => {
            const isActive = mode === m
            return (
              <button
                key={m}
                type="button"
                onClick={() => handleModeChange(m)}
                className="relative z-10 flex-1 rounded-xs py-2 text-sm font-medium transition-colors duration-200"
                style={{ minHeight: 40 }}
              >
                <span className={isActive ? 'text-white' : 'text-white/60'}>
                  {m === 'login' ? 'Accedi' : 'Registrati'}
                </span>
              </button>
            )
          })}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          {campoEmail}

          {/* Password */}
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium uppercase tracking-widest text-white/55">
              Password
            </span>
            <div className="relative">
              <Lock
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40"
                strokeWidth={1.5}
              />
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-describedby={mode === 'register' ? idIndicatore : undefined}
                placeholder={mode === 'register' ? `Minimo ${PASSWORD_MIN} caratteri` : '••••••••'}
                className="w-full rounded-sm bg-white/5 border border-white/10 pl-10 pr-11 py-2.5 text-[14px] text-white placeholder-white/30 outline-none focus:border-brand-red focus:bg-white/[0.07] transition-colors"
                style={{ minHeight: 44 }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Nascondi password' : 'Mostra password'}
                className="absolute right-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-xs text-white/50 hover:text-white/85 transition-colors"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" strokeWidth={1.5} />
                ) : (
                  <Eye className="h-4 w-4" strokeWidth={1.5} />
                )}
              </button>
            </div>
          </label>

          {mode === 'register' && (
            <IndicatorePassword id={idIndicatore} password={password} valutazione={valutazione} />
          )}

          {mode === 'login' && (
            <button
              type="button"
              onClick={() => apriRecupero(true)}
              className="-mt-2 self-end min-h-11 px-1 text-[13px] text-white/70 underline-offset-2 transition-colors hover:text-white hover:underline"
            >
              Password dimenticata?
            </button>
          )}

          {/* Conferma password — solo registrazione */}
          <AnimatePresence initial={false}>
            {mode === 'register' && (
              <motion.label
                key="confirm"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col gap-1.5 overflow-hidden"
              >
                <span className="text-[12px] font-medium uppercase tracking-widest text-white/55">
                  Conferma password
                </span>
                <div className="relative">
                  <Lock
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40"
                    strokeWidth={1.5}
                  />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Ripeti la password"
                    className="w-full rounded-sm bg-white/5 border border-white/10 pl-10 pr-3 py-2.5 text-[14px] text-white placeholder-white/30 outline-none focus:border-brand-red focus:bg-white/[0.07] transition-colors"
                    style={{ minHeight: 44 }}
                  />
                </div>
              </motion.label>
            )}
          </AnimatePresence>

          {/* Ricordami — solo in modalità login. Default OFF: su postazioni
              condivise la sessione esce alla chiusura del browser. */}
          {mode === 'login' && (
            <label
              className="flex items-center gap-2.5 cursor-pointer select-none"
              style={{ minHeight: 44 }}
            >
              {/* Checkbox custom: l'input nativo (appearance auto) verrebbe dipinto
                  come scatola bianca opaca da spento — qui è sr-only e il box è uno
                  span stilizzato che si fonde col navy, brand-red da spuntato. */}
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="peer sr-only"
              />
              <span
                aria-hidden="true"
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-white/20 bg-white/5 text-transparent transition-colors peer-checked:border-brand-red peer-checked:bg-brand-red peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-brand-red/50"
              >
                <Check className="h-3 w-3" strokeWidth={3} />
              </span>
              <span className="text-[13px] text-white/80">Ricordami su questo dispositivo</span>
            </label>
          )}

          {messaggi}

          {/* Submit */}
          {mancaRegola && (
            <p id={idMotivo} className="-mb-2 text-[12px] text-white/70">
              Per registrarti manca: {testoMancanti(valutazione)}.
            </p>
          )}
          <button
            type="submit"
            disabled={submitting || mancaRegola || registrazioneInAttesa}
            aria-describedby={mancaRegola ? idMotivo : undefined}
            className="mt-2 flex items-center justify-center gap-2 rounded-sm bg-brand-red px-4 py-3 text-[14px] font-semibold text-white transition-colors duration-150 hover:bg-brand-red/90 disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ minHeight: 48 }}
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />}
            {mode === 'login' ? 'Accedi' : 'Registrati'}
            {registrazioneInAttesa && ` (${attesa} s)`}
          </button>
        </form>

        {piede}
    </CartaAccesso>
  )
}
