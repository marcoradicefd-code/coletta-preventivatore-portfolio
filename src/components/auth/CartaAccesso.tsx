import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import { MSG_LINK_NON_VALIDO, MSG_SESSIONE_SCADUTA, type AvvisoAccesso } from '@/store/authStore'
import { fadeVariants, slideUpVariants } from '@/styles/variants'
import logoColetta from '@/assets/brand/logo-coletta.png'

/**
 * Sfondo e carta delle pagine fuori dall'app: accesso e nuova password (L26).
 * Overlay `fixed inset-0` navy con la carta centrata da `m-auto`: perché così,
 * vedi la rule `auth-supabase` (LoginPage).
 */
export function CartaAccesso({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <motion.div
      variants={fadeVariants}
      initial="hidden"
      animate="visible"
      className="fixed inset-0 flex overflow-y-auto bg-brand-navy px-4 py-8"
    >
      {/* Niente ombra (L26): `shadow-apple-xl` è navy, e sul fondo navy non dava
          profondità ma anelli agli angoli. Il bordo basta a staccare la carta. */}
      <motion.div
        variants={slideUpVariants}
        initial="hidden"
        animate="visible"
        className="m-auto w-full max-w-md rounded-lg border border-white/10 bg-white/[0.03] backdrop-blur-sm p-6 sm:p-8"
      >
        {/* Logo + titolo */}
        <div className="flex flex-col items-center text-center mb-6">
          <img
            src={logoColetta}
            alt="Coletta Ebanisteria Italiana"
            className="h-12 w-auto brightness-0 invert mb-4"
          />
          <h1
            className="text-white text-[22px] font-semibold"
            style={{ fontFamily: '"DM Serif Display", Georgia, serif' }}
          >
            Coletta Ebanisteria
          </h1>
          <p className="text-[13px] text-white/55 tracking-wide mt-1">Preventivatore</p>
        </div>
        {children}
      </motion.div>
    </motion.div>
  )
}

const ENTRATA = { initial: { opacity: 0, y: -4 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0 } }

/**
 * Errore, esito e avviso d'ingresso delle pagine di accesso. L'errore del
 * gesto vince; senza, il link non più valido è un errore, la sessione
 * scaduta e la `nota` (l'esito della registrazione) uno stato neutro (L26).
 */
export function MessaggiAccesso({
  errore,
  successo = null,
  nota = null,
  avviso,
}: Readonly<{ errore: string | null; successo?: string | null; nota?: string | null; avviso: AvvisoAccesso | null }>) {
  const testoErrore = errore ?? (avviso === 'link-non-valido' ? MSG_LINK_NON_VALIDO : null)
  const neutro = nota ?? (avviso === 'sessione-scaduta' ? MSG_SESSIONE_SCADUTA : null)
  const mostraNeutro = !testoErrore && !successo && neutro
  return (
    <AnimatePresence mode="wait">
      {testoErrore && (
        <motion.div
          key="err"
          {...ENTRATA}
          className="flex items-start gap-2 rounded-sm border border-error/40 bg-error/10 px-3 py-2.5 text-[13px] text-error-su-navy"
          role="alert"
        >
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" strokeWidth={1.5} />
          <span>{testoErrore}</span>
        </motion.div>
      )}
      {successo && (
        <motion.div
          key="ok"
          {...ENTRATA}
          className="flex items-start gap-2 rounded-sm border border-success/40 bg-success/10 px-3 py-2.5 text-[13px] text-success-su-navy"
          role="status"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" strokeWidth={1.5} />
          <span>{successo}</span>
        </motion.div>
      )}
      {mostraNeutro && (
        <motion.div
          key="avviso"
          {...ENTRATA}
          className="flex items-start gap-2 rounded-sm border border-white/15 bg-white/5 px-3 py-2.5 text-[13px] text-white/85"
          role="status"
        >
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" strokeWidth={1.5} />
          <span>{neutro}</span>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
