import { useState, type ReactNode, type SubmitEvent } from 'react'
import { Loader2 } from 'lucide-react'
import { useAuthStore, MSG_LINK_INVIATO, MSG_TROPPE_RICHIESTE } from '@/store/authStore'
import { MSG_ERRORE_RETE } from '@/lib/erroriDb'
import { MessaggiAccesso } from './CartaAccesso'
import { ATTESA_INVIO_S, useContoAllaRovescia } from '@/hooks/useContoAllaRovescia'

/**
 * «Password dimenticata?» (L26): il form piccolo che la LoginPage mostra al
 * posto di quello di accesso. Il campo email è quello della LoginPage, così
 * l'indirizzo già scritto resta.
 */
export function FormPasswordDimenticata({
  email,
  campoEmail,
  onChiudi,
}: Readonly<{ email: string; campoEmail: ReactNode; onChiudi: () => void }>) {
  const [errore, setErrore] = useState<string | null>(null)
  const [successo, setSuccesso] = useState<string | null>(null)
  const [inviando, setInviando] = useState(false)
  const { attesa, inAttesa, avvia: setAttesa } = useContoAllaRovescia()
  const inviaLinkRecupero = useAuthStore((s) => s.inviaLinkRecupero)
  const avvisoAccesso = useAuthStore((s) => s.avvisoAccesso)
  const chiudiAvvisoAccesso = useAuthStore((s) => s.chiudiAvvisoAccesso)

  const handleInvia = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    setErrore(null)
    setSuccesso(null)
    chiudiAvvisoAccesso()
    if (!email.trim()) {
      setErrore('Scrivi la tua email.')
      return
    }
    setInviando(true)
    try {
      const esito = await inviaLinkRecupero(email.trim())
      // Rete giù: non è partito niente, si può riprovare subito.
      if (esito === 'rete') {
        setErrore(MSG_ERRORE_RETE)
        return
      }
      setAttesa(ATTESA_INVIO_S)
      if (esito === 'troppe-richieste') setErrore(MSG_TROPPE_RICHIESTE)
      else setSuccesso(MSG_LINK_INVIATO)
    } finally {
      setInviando(false)
    }
  }

  return (
    <form onSubmit={handleInvia} className="flex flex-col gap-4" noValidate>
      <div>
        <h2 className="text-[16px] font-semibold text-white">Password dimenticata?</h2>
        <p className="mt-1 text-[13px] text-white/70">
          Scrivi la tua email: ti mandiamo un link per scegliere una nuova password.
        </p>
      </div>
      {campoEmail}
      <MessaggiAccesso errore={errore} successo={successo} avviso={avvisoAccesso} />
      <button
        type="submit"
        disabled={inviando || inAttesa}
        className="mt-2 flex items-center justify-center gap-2 rounded-sm bg-brand-red px-4 py-3 text-[14px] font-semibold text-white transition-colors duration-150 hover:bg-brand-red/90 disabled:opacity-60 disabled:cursor-not-allowed"
        style={{ minHeight: 48 }}
      >
        {inviando && <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />}
        Invia il link{inAttesa && ` (${attesa} s)`}
      </button>
      <button
        type="button"
        onClick={onChiudi}
        className="self-center min-h-11 px-2 text-[13px] text-white/70 underline-offset-2 transition-colors hover:text-white hover:underline"
      >
        Torna all'accesso
      </button>
    </form>
  )
}
