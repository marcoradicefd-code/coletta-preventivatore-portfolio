import { useState, useEffect, useCallback } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Sidebar } from './Sidebar'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { FileUploadCard } from '@/components/shared/FileUploadCard'
import { PreventivoPrint } from '@/components/print/PreventivoPrint'
import { ClientForm } from '@/components/client/ClientForm'
import { ClientiPage } from '@/components/clienti/ClientiPage'
import { PreventiviPage } from '@/components/preventivi/PreventiviPage'
import { GestioneListini } from '@/components/admin/GestioneListini'
import { ImportaAnagrafica } from '@/components/admin/ImportaAnagrafica'
import { SECTION_TABS, OTHER_TABS, quoteHaDati, type TabId, type SezioneId } from './sections'
import { SezioneInArrivo } from './SezioneInArrivo'
import { BarraPreventivo } from './BarraPreventivo'
import { dimenticaSalvataggio, salvaAperto } from '@/store/salvataggioStore'
import { useConferma } from '@/hooks/useConferma'
import { useSceltaCliente } from '@/hooks/useSceltaCliente'
import { usePricelistStore, ETICHETTA } from '@/store/pricelistStore'
import { useQuoteStore, avvisoBlobIlleggibile, type AvvisoBlobIlleggibile } from '@/store/quoteStore'
import { useAuthStore } from '@/store/authStore'
import { usePrint } from '@/hooks/usePrint'
import { useToast } from '@/components/shared/toastContext'
import { PrintContext } from '@/hooks/usePrintAction'
import { fadeVariants } from '@/styles/variants'

/**
 * I due testi dell'avviso. Il secondo non dice «una copia è stata messa da
 * parte», che sarebbe falso se la scrittura della copia è fallita (quota).
 */
const TESTO_PREVENTIVO_ILLEGGIBILE: Record<AvvisoBlobIlleggibile, string> = {
  copiato:
    "Il preventivo salvato non era leggibile. L'app è ripartita da un preventivo vuoto; una copia è stata messa da parte.",
  'non-copiato':
    "Il preventivo salvato non era leggibile. L'app è ripartita da un preventivo vuoto; non è stato possibile conservarne una copia.",
}

export function AppShell() {
  const [activeTab, setActiveTab] = useState<TabId>('arredi')
  const [uploadType, setUploadType] = useState<'sumisura' | 'marmeria' | null>(null)
  const resetMarmeria = useQuoteStore((s) => s.resetMarmeria)
  const resetSuMisura = useQuoteStore((s) => s.resetSuMisura)
  const resetPorte = useQuoteStore((s) => s.resetPorte)
  const isAdmin = useAuthStore((s) => s.isAdmin)
  // Una finestra di scelta del cliente e una di conferma per tutta l'app: le
  // usano la barra del preventivo, «Genera» e la scheda Dati preventivo.
  const { chiedi, finestra: finestraConferma } = useConferma()
  const { scegli: scegliCliente, finestra: finestraCliente } = useSceltaCliente()
  const { contentRef, handlePrint, handleSalva } = usePrint({ chiedi, scegliCliente })
  const { setNotifica } = useToast()
  const errors = usePricelistStore((s) => s.errors)
  const avvisoFogli = usePricelistStore((s) => s.referti.suMisura?.avviso)

  useEffect(() => {
    // AuthGuard assicura che siamo autenticati prima di montare AppShell:
    // a questo punto RLS del bucket Listini accetta il nostro token.
    //
    // Questo effetto AVVIA e basta. Gli errori non li legge da qui: `loadDefaults`
    // li lascia nello store, e a mostrarli è il mirror qui sotto.
    let cancelled = false
    usePricelistStore
      .getState()
      .loadDefaults()
      .then(() => {
        if (cancelled) return
        // E3 — recupero delle righe porte salvate PRIMA dello snapshot. Il posto è
        // questo e non la migrate di zustand: quella gira alla reidratazione, cioè
        // all'import del modulo, quando il listino è ancora `null` e non c'è
        // nessun prezzo da leggere.
        //
        // SOLO all'avvio: dopo un upload manuale il listino è scientemente
        // diverso, e congelare da lì significherebbe promettere un prezzo che
        // nessuno ha promesso. Questo effetto gira una volta sola al mount, quindi
        // il `loadDefaults()` di GestioneListini non lo ri-scatena.
        useQuoteStore.getState().snapshottaPortePendenti()
      })
      .catch((e) => {
        if (cancelled) return
        // `loadDefaults` ha il suo try/catch e non dovrebbe rigettare: se lo fa,
        // è un imprevisto e resta a schermo come gli altri guasti di listino.
        setNotifica('listino:imprevisto', {
          message: 'Errore imprevisto nel caricamento dei listini.',
          type: 'error',
        })
        if (import.meta.env.DEV) {
          console.error('[AppShell] loadDefaults rejected:', e)
        }
      })
    return () => {
      cancelled = true
    }
  }, [setNotifica])

  /**
   * Il mirror: `errors` è STATO, non un evento.
   *
   * Prima gli errori venivano LETTI una volta dentro il `.then()` e SPINTI in un
   * provider che teneva un messaggio solo — da lì la coda, `TOAST_SLOT_MS`, e il
   * test che difendeva lo slot: tre pezzi d'impianto per un problema che non
   * esisteva. Qui ogni categoria ha la sua chiave, quindi tre listini rotti sono
   * tre notifiche e nessuna scrive nel posto di un'altra: il caso "si perde un
   * pezzo" non è gestito, è irrappresentabile.
   *
   * E siccome è una sottoscrizione e non uno sparo, quando il listino viene
   * riparato `errors` torna a null e la notifica si spegne DA SOLA. Prima
   * nessuna riparazione poteva farlo: restava a schermo finché non ricaricavi
   * la pagina.
   */
  useEffect(() => {
    setNotifica(
      'listino:suMisura',
      errors.suMisura ? { message: `${ETICHETTA.sumisura} — ${errors.suMisura}`, type: 'error' } : null
    )
    setNotifica(
      'listino:marmeria',
      errors.marmeria ? { message: `${ETICHETTA.marmeria} — ${errors.marmeria}`, type: 'error' } : null
    )
    setNotifica(
      'listino:porte',
      errors.porte ? { message: `${ETICHETTA.porte} — ${errors.porte}`, type: 'error' } : null
    )
    setNotifica(
      'listino:cucine',
      errors.cucine ? { message: `${ETICHETTA.cucine} — ${errors.cucine}`, type: 'error' } : null
    )
  }, [errors, setNotifica])

  // La scelta dei fogli di Su Misura non si è applicata (O9): nei prezzi possono
  // esserci fogli di lavoro. Come gli errori è STATO derivato, non un evento: vive
  // nel referto, che `impostaListino` sostituisce insieme al listino, quindi
  // ricaricato un listino pulito si spegne da sola; chiusa a mano vale per quel
  // messaggio. Niente `showToast`. Allo smontaggio (logout) si spegne, come
  // sotto: il provider della radice sopravvive alla shell.
  useEffect(() => {
    setNotifica(
      'listino:suMisura:fogli',
      avvisoFogli ? { message: `${ETICHETTA.sumisura} — ${avvisoFogli}`, type: 'error' } : null
    )
    return () => setNotifica('listino:suMisura:fogli', null)
  }, [avvisoFogli, setNotifica])

  // Il preventivo salvato non era leggibile e l'app è ripartita da vuoto (O10).
  // Persistente e chiudibile a mano, come i listini rotti: chi riapre l'app non
  // deve scoprire da un preventivo vuoto che c'era un lavoro. Si legge una volta
  // al montaggio: è l'esito del boot, non uno stato che cambia mentre l'app gira.
  // Allo smontaggio (logout) si spegne: la notifica vive nel provider della
  // radice e altrimenti resterebbe sulla pagina di accesso.
  useEffect(() => {
    const avviso = avvisoBlobIlleggibile()
    setNotifica(
      'preventivo:illeggibile',
      avviso ? { message: TESTO_PREVENTIVO_ILLEGGIBILE[avviso], type: 'error' } : null
    )
    return () => setNotifica('preventivo:illeggibile', null)
  }, [setNotifica])

  // Lo stato del salvataggio è della sessione: allo smontaggio (logout) si
  // dimentica, o il prossimo utente vedrebbe l'ultimo errore o «Salvato alle…».
  useEffect(() => () => dimenticaSalvataggio(), [])

  // Avvisa prima di chiudere la pagina se ci sono dati di preventivo non
  // persistiti (ricordaPreventivo=false) — evita perdita di lavoro silenziosa.
  // Cosa conta come lavoro lo decide `quoteHaDati`, su tutte e 5 le sezioni (A6).
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      const { ricordaPreventivo, preventivo, sezioni } = useQuoteStore.getState()
      if (ricordaPreventivo || !quoteHaDati(preventivo, sezioni)) return
      e.preventDefault()
      // Legacy, come da MDN: Chrome ed Edge prima della 119 ignorano preventDefault.
      e.returnValue = true
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  // Chi perde il ruolo admin con una tab dell'admin aperta (Gestione Listini,
  // Importa anagrafica) vede Arredi. Si ricava a ogni render invece di
  // riscrivere lo stato in un effect: chi riottiene il ruolo torna dov'era.
  const tabAdmin = (tab: TabId) => OTHER_TABS.some((t) => t.id === tab && t.adminOnly)
  const tabVisibile: TabId = tabAdmin(activeTab) && !isAdmin ? 'arredi' : activeTab

  const handleOpenUpload = useCallback((type: 'sumisura' | 'marmeria') => {
    setUploadType(type)
  }, [])

  // Copy + reset per le sezioni con ErrorBoundary (solo arredi/gres; le placeholder
  // non hanno boundary). `onReset` è un'azione dello store → mappa costruita qui.
  const erroriSezione: Partial<Record<SezioneId, { title: string; message: string; onReset: () => void }>> = {
    arredi: {
      title: `Errore listino ${ETICHETTA.sumisura}`,
      message: 'Il file Excel potrebbe avere un formato non riconosciuto. Carica nuovamente il file.',
      onReset: resetSuMisura,
    },
    gres: {
      title: `Errore listino ${ETICHETTA.marmeria}`,
      message: 'Il file Excel potrebbe avere un formato non riconosciuto. Carica nuovamente il file dalla marmeria De Bari.',
      onReset: resetMarmeria,
    },
    porte: {
      title: 'Errore listino porte',
      message: 'Il file Excel potrebbe avere un formato non riconosciuto. Carica nuovamente il listino porte.',
      onReset: resetPorte,
    },
  }

  return (
    <PrintContext.Provider value={handlePrint}>
      <div className="flex min-h-screen bg-surface-primary">
        <Sidebar
          activeTab={tabVisibile}
          onTabChange={setActiveTab}
          onOpenUpload={handleOpenUpload}
        />

        {/* Main content area — sidebar fissa solo da lg, sotto si usa l'handle a destra */}
        {/* Su mobile lo spazio in fondo è l'altezza misurata della barra del
            preventivo, fissa in basso (U3: un `pb-40` fisso restava sotto la
            barra quando cresceva col pannello d'errore). */}
        <main className="ml-0 lg:ml-[260px] flex-1 min-w-0 p-4 max-md:pb-[calc(var(--altezza-barra,10rem)+1rem)] md:p-6 lg:p-8">
          {!tabAdmin(tabVisibile) && (
            <BarraPreventivo
              onSalva={handleSalva}
              onScegliCliente={async (scopo) => {
                // «Salva» senza cliente: scelto il cliente, salva nello stesso gesto.
                if ((await scegliCliente(scopo)) && scopo === 'salvare') await salvaAperto()
              }}
            />
          )}
          <AnimatePresence mode="wait">
            {SECTION_TABS.map((sec) => {
              if (tabVisibile !== sec.id) return null
              const err = erroriSezione[sec.id]
              const Page = sec.Page
              return (
                <motion.div key={sec.id} variants={fadeVariants} initial="hidden" animate="visible" exit="exit">
                  {sec.implemented && Page ? (
                    err ? (
                      <ErrorBoundary fallbackTitle={err.title} fallbackMessage={err.message} onReset={err.onReset}>
                        <Page />
                      </ErrorBoundary>
                    ) : (
                      <Page />
                    )
                  ) : (
                    <SezioneInArrivo nome={sec.label} />
                  )}
                </motion.div>
              )
            })}

            {tabVisibile === 'cliente' && (
              <motion.div key="cliente" variants={fadeVariants} initial="hidden" animate="visible" exit="exit">
                <ClientForm onScegliCliente={() => void scegliCliente()} />
              </motion.div>
            )}

            {tabVisibile === 'preventivi' && (
              <motion.div key="preventivi" variants={fadeVariants} initial="hidden" animate="visible" exit="exit">
                <ErrorBoundary fallbackTitle="Errore preventivi salvati">
                  <PreventiviPage />
                </ErrorBoundary>
              </motion.div>
            )}

            {tabVisibile === 'clienti' && (
              <motion.div key="clienti" variants={fadeVariants} initial="hidden" animate="visible" exit="exit">
                <ErrorBoundary fallbackTitle="Errore anagrafica clienti">
                  <ClientiPage />
                </ErrorBoundary>
              </motion.div>
            )}

            {tabVisibile === 'admin' && (
              <motion.div key="admin" variants={fadeVariants} initial="hidden" animate="visible" exit="exit">
                <ErrorBoundary fallbackTitle="Errore gestione listini">
                  <GestioneListini />
                </ErrorBoundary>
              </motion.div>
            )}

            {tabVisibile === 'importa' && (
              <motion.div key="importa" variants={fadeVariants} initial="hidden" animate="visible" exit="exit">
                <ErrorBoundary fallbackTitle="Errore import dell’anagrafica">
                  <ImportaAnagrafica />
                </ErrorBoundary>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* Print view — off-screen but rendered for react-to-print */}
        <div style={{ position: 'fixed', left: '-9999px', top: 0 }}>
          {/* Un guasto del PDF (S3: un preventivo di forma sbagliata) non fa
              cadere l'app intera: senza PDF, «Genera» dice che non è pronto. */}
          <ErrorBoundary fallbackTitle="Errore nel PDF del preventivo">
            <PreventivoPrint ref={contentRef} />
          </ErrorBoundary>
        </div>

        {finestraCliente}
        {finestraConferma}

        {/* Upload modal overlay. Solo admin anche qui, oltre ai pulsanti della
            Sidebar: chi perde il ruolo con la modale aperta la vede chiudersi.
            Regola di prodotto, non confine di sicurezza: il bucket lo difendono le RLS. */}
        <AnimatePresence>
          {isAdmin && uploadType && (
            <FileUploadCard
              type={uploadType}
              onClose={() => setUploadType(null)}
            />
          )}
        </AnimatePresence>
      </div>
    </PrintContext.Provider>
  )
}
