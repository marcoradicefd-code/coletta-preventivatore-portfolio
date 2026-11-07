import { useEffect, useState } from 'react'
import { motion, AnimatePresence, type Variants } from 'motion/react'
import {
  FileSpreadsheet,
  Bookmark,
  LogOut,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react'
import { MOTION } from '@/styles/motion'
import { useMotionConfig } from '@/hooks/useMotionConfig'
import { usePricelistStore, ETICHETTA } from '@/store/pricelistStore'
import { useQuoteStore } from '@/store/quoteStore'
import { useAuthStore } from '@/store/authStore'
import { useToast } from '@/components/shared/toastContext'
import logoColetta from '@/assets/brand/logo-coletta.png'
import { SECTION_TABS, OTHER_TABS, type TabId } from './sections'

interface SidebarProps {
  activeTab: TabId
  onTabChange: (tab: TabId) => void
  onOpenUpload: (type: 'sumisura' | 'marmeria') => void
}

// Spring calibrato: overshoot sottile + settle, usato in sync da handle e pannello.
const PANEL_SPRING = { type: 'spring' as const, stiffness: 320, damping: 34 }

// Stagger d'ingresso delle voci nav nel pannello slide-in.
const navListVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07, delayChildren: 0.08 } },
}
const navItemVariants: Variants = {
  hidden: { opacity: 0, x: 16 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: MOTION.normal / 1000, ease: [0.25, 0.46, 0.45, 0.94] },
  },
}

export function Sidebar({ activeTab, onTabChange, onOpenUpload }: SidebarProps) {
  const suMisura = usePricelistStore((s) => s.suMisura)
  const marmeria = usePricelistStore((s) => s.marmeria)
  const porte = usePricelistStore((s) => s.porte)
  const cucine = usePricelistStore((s) => s.cucine)
  const ricordaPreventivo = useQuoteStore((s) => s.ricordaPreventivo)
  const setRicordaPreventivo = useQuoteStore((s) => s.setRicordaPreventivo)
  const user = useAuthStore((s) => s.user)
  const isAdmin = useAuthStore((s) => s.isAdmin)
  const logout = useAuthStore((s) => s.logout)
  const { showToast } = useToast()
  const [panelOpen, setPanelOpen] = useState(false)
  const [listiniOpen, setListiniOpen] = useState(false)
  const [viewportW, setViewportW] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1024
  )
  const { prefersReduced } = useMotionConfig()

  // Nav guidata dal registry: 5 sezioni-preventivo + cliente + admin (solo admin).
  const navItems = [
    ...SECTION_TABS,
    ...OTHER_TABS.filter((t) => !t.adminOnly || isAdmin),
  ]

  // Larghezza pannello (= classi w-[86vw] max-w-[320px]): serve per traslare
  // l'handle esattamente sul bordo sinistro del pannello quando è aperto.
  const panelWidth = Math.min(320, Math.round(viewportW * 0.86))
  const breathing = !prefersReduced && !panelOpen

  const handleTabChange = (tab: TabId) => {
    onTabChange(tab)
    setPanelOpen(false)
  }

  const handleLogout = async () => {
    const { error } = await logout()
    setPanelOpen(false)
    // Un evento, non uno stato: `showToast` si spegne da solo. Il provider sta
    // sopra `App`, quindi l'avviso si vede anche sulla LoginPage che subentra.
    if (error) showToast(error, 'error')
  }

  // Tiene aggiornata la larghezza del pannello su resize/rotazione.
  useEffect(() => {
    const onResize = () => setViewportW(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Pannello mobile/tablet: chiudi con Esc e blocca lo scroll di sfondo mentre è aperto.
  useEffect(() => {
    if (!panelOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPanelOpen(false)
    }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [panelOpen])

  // Riga in sola lettura della sezione Listini: quale file è in uso, niente azioni.
  const rigaInUso = (etichetta: string, nomeFile: string | undefined) => (
    <p
      className="flex items-center gap-2 px-3 py-2 text-sm text-white/65"
      style={{ minHeight: 44 }}
      title={`Listino ${etichetta} in uso`}
    >
      <FileSpreadsheet className="h-4 w-4 shrink-0" strokeWidth={1.5} />
      <span className="truncate">{nomeFile ?? `${etichetta}: non caricato`}</span>
    </p>
  )

  // Contenuto sidebar/pannello. `stagger` attiva l'animazione d'ingresso delle
  // voci nav (solo nel pannello slide-in, non nella sidebar desktop sempre montata).
  const renderSidebar = (stagger: boolean) => {
    const animateNav = stagger && !prefersReduced
    const navContainerProps = animateNav
      ? { variants: navListVariants, initial: 'hidden' as const, animate: 'visible' as const }
      : {}
    const navItemProps = animateNav ? { variants: navItemVariants } : {}

    return (
      <>
        {/* Logo */}
        <div className="px-5 py-5">
          <img
            src={logoColetta}
            alt="Coletta — Cucine e Arredi a regola d'Arte"
            className="h-10 w-auto brightness-0 invert"
          />
          <p className="text-xs text-white/60 tracking-widest uppercase mt-2">
            Preventivi
          </p>
        </div>

        {/* Navigation */}
        <motion.nav aria-label="Menu principale" className="flex flex-col gap-1 px-3 mt-2" {...navContainerProps}>
          {navItems.map(({ id, label, icon: Icon }) => {
            const isActive = activeTab === id
            return (
              <motion.button
                key={id}
                onClick={() => handleTabChange(id)}
                aria-current={isActive ? 'page' : undefined}
                className="relative flex items-center gap-3 px-3 py-2.5 w-full rounded-sm transition-colors duration-150"
                style={{ minHeight: 44 }}
                {...navItemProps}
              >
                {isActive && (
                  <motion.div
                    layoutId="nav-active-pill"
                    className="absolute inset-0 rounded-sm bg-brand-red/15"
                    transition={MOTION.springGentle}
                  />
                )}
                <Icon
                  className={`h-5 w-5 relative z-10 shrink-0 transition-colors duration-150 ${
                    isActive ? 'text-brand-red-su-navy' : 'text-white/60'
                  }`}
                  strokeWidth={1.5}
                />
                <span
                  className={`text-sm relative z-10 transition-colors duration-150 ${
                    isActive ? 'text-brand-red-su-navy font-semibold' : 'text-white/85 font-medium'
                  }`}
                >
                  {label}
                </span>
              </motion.button>
            )
          })}
        </motion.nav>

        {/* Separator */}
        <div className="mx-5 my-4 h-px bg-white/8" />

        {/* Listini section — accordion collassabile (chiuso di default) */}
        <div className="flex flex-col px-5">
          <button
            type="button"
            onClick={() => setListiniOpen((v) => !v)}
            aria-expanded={listiniOpen}
            className="flex items-center gap-2 w-full px-1 py-2.5 mb-1 text-white/60 hover:text-white/85 transition-colors duration-150"
            style={{ minHeight: 40 }}
          >
            <motion.span
              aria-hidden="true"
              animate={{ rotate: listiniOpen ? 90 : 0 }}
              transition={{ duration: MOTION.fast / 1000, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="inline-flex"
            >
              <ChevronRight className="h-3 w-3" strokeWidth={2.5} />
            </motion.span>
            <span className="text-xs font-medium uppercase tracking-widest">Listini</span>
          </button>

          <AnimatePresence initial={false}>
            {listiniOpen && (
              <motion.div
                key="listini-content"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: MOTION.normal / 1000, ease: [0.25, 0.46, 0.45, 0.94] }}
                className="overflow-hidden"
              >
                {/* Caricare un listino locale è dell'admin (D5); gli altri vedono
                    solo quale listino è in uso. `aggiornato` è il nome del file. */}
                <div className="flex flex-col gap-2 pt-1">
                  {isAdmin ? (
                    <>
                      <button
                        onClick={() => onOpenUpload('sumisura')}
                        className="flex items-center gap-2 px-3 py-2 rounded-sm text-sm text-white/65 hover:text-white/85 hover:bg-white/6 transition-colors duration-150"
                        style={{ minHeight: 44 }}
                        title={`Carica listino ${ETICHETTA.sumisura}`}
                      >
                        <FileSpreadsheet className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                        <span className="truncate">
                          {suMisura ? suMisura.aggiornato : `Carica ${ETICHETTA.sumisura}`}
                        </span>
                      </button>
                      <button
                        onClick={() => onOpenUpload('marmeria')}
                        className="flex items-center gap-2 px-3 py-2 rounded-sm text-sm text-white/65 hover:text-white/85 hover:bg-white/6 transition-colors duration-150"
                        style={{ minHeight: 44 }}
                        title={`Carica listino ${ETICHETTA.marmeria}`}
                      >
                        <FileSpreadsheet className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                        <span className="truncate">
                          {marmeria ? marmeria.aggiornato : `Carica ${ETICHETTA.marmeria}`}
                        </span>
                      </button>
                    </>
                  ) : (
                    <>
                      {rigaInUso(ETICHETTA.sumisura, suMisura?.aggiornato)}
                      {rigaInUso(ETICHETTA.marmeria, marmeria?.aggiornato)}
                    </>
                  )}
                  {/* Porte e Cucine non hanno un caricamento locale per nessuno: si caricano da Gestione Listini. */}
                  {rigaInUso(ETICHETTA.porte, porte?.aggiornato)}
                  {rigaInUso(ETICHETTA.cucine, cucine?.aggiornato)}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer — bottom pinned */}
        <div className="mt-auto flex flex-col">
          {/* Separator */}
          <div className="mx-5 mb-3 h-px bg-white/8" />

          {/* User email */}
          {user?.email && (
            <div className="px-5 pb-2">
              <p className="text-xs font-medium uppercase tracking-widest text-white/60">
                Utente
              </p>
              <p className="text-[12px] text-white/70 truncate" title={user.email}>
                {user.email}
              </p>
            </div>
          )}

          {/* Logout */}
          <div className="px-3 pb-1">
            <button
              type="button"
              onClick={handleLogout}
              className="group flex items-center gap-3 w-full px-3 py-2.5 rounded-sm transition-colors duration-150 hover:bg-brand-red/15"
              style={{ minHeight: 44 }}
              title="Esci"
            >
              <LogOut
                className="h-5 w-5 shrink-0 text-white/55 group-hover:text-brand-red transition-colors duration-150"
                strokeWidth={1.5}
              />
              <span className="text-sm text-white/80 group-hover:text-brand-red font-medium transition-colors duration-150">
                Esci
              </span>
            </button>
          </div>

          {/* Ricorda preventivo toggle */}
          <div className="px-3 pb-2">
            <button
              type="button"
              role="switch"
              aria-checked={ricordaPreventivo}
              onClick={() => setRicordaPreventivo(!ricordaPreventivo)}
              className="group flex items-center gap-3 w-full px-3 py-2.5 rounded-sm transition-colors duration-150 hover:bg-white/6"
              style={{ minHeight: 44 }}
              title={
                ricordaPreventivo
                  ? 'Il preventivo verrà ripristinato alla prossima apertura'
                  : 'Il preventivo riparte da zero ad ogni apertura'
              }
            >
              <Bookmark
                className={`h-5 w-5 shrink-0 transition-colors duration-150 ${
                  ricordaPreventivo ? 'text-brand-red' : 'text-white/45'
                }`}
                strokeWidth={1.5}
                fill={ricordaPreventivo ? 'currentColor' : 'none'}
              />
              <span
                className={`text-sm flex-1 text-left transition-colors duration-150 ${
                  ricordaPreventivo ? 'text-white/90 font-medium' : 'text-white/70'
                }`}
              >
                Ricorda preventivo
              </span>
              <span
                aria-hidden="true"
                className={`relative h-[18px] w-[30px] rounded-full transition-colors duration-200 inline-block shrink-0 ${
                  ricordaPreventivo ? 'bg-brand-red' : 'bg-white/15'
                }`}
              >
                <span
                  className={`absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white transition-all duration-200 ${
                    ricordaPreventivo ? 'left-[14px]' : 'left-[2px]'
                  }`}
                />
              </span>
            </button>
          </div>

          {/* Version */}
          <div className="px-5 pb-4">
            <p className="text-xs text-white/60">Coletta Ebanisteria — v1.0</p>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      {/* Sidebar fissa — solo desktop (≥1024px) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden lg:flex w-[260px] flex-col bg-brand-navy border-r border-white/8">
        {renderSidebar(false)}
      </aside>

      {/* Handle sul bordo destro — mobile/tablet (<1024px).
          Elemento unico: a riposo "respira", trasla sul bordo del pannello
          quando aperto e fa ruotare il chevron di 180°. Funge anche da chiusura. */}
      <motion.button
        type="button"
        onClick={() => setPanelOpen((v) => !v)}
        aria-label={panelOpen ? 'Chiudi menu di navigazione' : 'Apri menu di navigazione'}
        aria-expanded={panelOpen}
        className="lg:hidden fixed right-0 top-1/2 z-40 flex h-20 w-8 items-center justify-center rounded-l-lg bg-brand-navy text-white shadow-apple-md border-y border-l border-white/10 border-r-[3px] border-r-brand-red"
        style={{ transformOrigin: '100% 50%' }}
        animate={{
          x: panelOpen ? -panelWidth : 0,
          y: '-50%',
          scaleX: breathing ? [1, 1.06, 1] : 1,
          scaleY: breathing ? [1, 1.06, 1] : 1,
        }}
        transition={{
          x: prefersReduced ? { duration: 0.2 } : PANEL_SPRING,
          scaleX: breathing
            ? { repeat: Infinity, duration: 2.4, ease: 'easeInOut' }
            : { duration: 0.25 },
          scaleY: breathing
            ? { repeat: Infinity, duration: 2.4, ease: 'easeInOut' }
            : { duration: 0.25 },
        }}
        whileHover={prefersReduced ? undefined : { scaleX: 1.3, scaleY: 1.04 }}
        whileTap={prefersReduced ? undefined : { scaleX: 0.94, scaleY: 0.94 }}
      >
        <motion.span
          className="inline-flex"
          animate={{ rotate: panelOpen ? 180 : 0 }}
          transition={
            prefersReduced
              ? { duration: 0.2 }
              : { duration: 0.45, ease: [0.34, 1.56, 0.64, 1] }
          }
        >
          <ChevronLeft className="h-5 w-5 text-white/85" strokeWidth={1.5} />
        </motion.span>
      </motion.button>

      {/* Pannello slide-in da destra — mobile/tablet (<1024px) */}
      <AnimatePresence>
        {panelOpen && (
          <div className="lg:hidden">
            {/* Overlay: scurisce e (se non reduced-motion) sfoca il contenuto dietro */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: MOTION.normal / 1000 }}
              className={`fixed inset-0 z-20 bg-black/45 ${
                prefersReduced ? '' : 'backdrop-blur-[3px]'
              }`}
              onClick={() => setPanelOpen(false)}
            />

            {/* Pannello (la larghezza deve combaciare con panelWidth) */}
            <motion.aside
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={prefersReduced ? { duration: 0.2 } : PANEL_SPRING}
              className="fixed inset-y-0 right-0 z-30 flex w-[86vw] max-w-[320px] flex-col bg-brand-navy"
              role="dialog"
              aria-modal="true"
              aria-label="Menu di navigazione"
            >
              <div className="flex h-full flex-col overflow-y-auto">
                {renderSidebar(true)}
              </div>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </>
  )
}
