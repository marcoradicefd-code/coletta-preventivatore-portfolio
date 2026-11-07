import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, act, fireEvent, within, waitFor } from '@testing-library/react'

// AppShell → stores → supabase: mock minimale per restare hermetici (nessun env,
// nessuna rete), come negli altri test di render.
vi.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: () => ({}) } },
  LISTINI_BUCKET: 'Listini',
}))

// `react-to-print` si mocka: qui si prova se "Genera" stampa o no, non la stampa.
const { stampaMock } = vi.hoisted(() => ({ stampaMock: vi.fn() }))
vi.mock('react-to-print', () => ({ useReactToPrint: () => stampaMock }))

import { AppShell } from '@/components/layout/AppShell'
import { ToastProvider } from '@/components/shared/Toast'
import { usePricelistStore } from '@/store/pricelistStore'
import { useQuoteStore } from '@/store/quoteStore'
import { useAuthStore } from '@/store/authStore'
import { validatoPerTest } from '@/test-utils/listinoValidato'
import { listinoCucinaFinto } from '@/test-utils/catalogoCucinaFinto'

type Errori = Partial<{ suMisura: string; marmeria: string; porte: string; cucine: string }>

const NESSUN_ERRORE = { suMisura: null, marmeria: null, porte: null, cucine: null }

/**
 * Sostituisce `loadDefaults` con una che non tocca la rete e lascia negli
 * `errors` esattamente quelli passati: lo store finisce nello stesso stato in
 * cui lo lascerebbe un parse fallito davvero.
 */
function mockLoadDefaultsWithErrors(errori: Errori) {
  return vi.spyOn(usePricelistStore.getState(), 'loadDefaults').mockImplementation(async () => {
    usePricelistStore.setState({
      errors: { ...NESSUN_ERRORE, ...errori },
      loadingDefaults: false,
    })
  })
}

function renderShell() {
  return render(
    <ToastProvider>
      <AppShell />
    </ToastProvider>
  )
}

/** Lascia risolvere la promise di loadDefaults e sfilare i timer di `ms`. */
async function avanza(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

/** Gli errori sono `role="alert"`; i successi sono `role="status"` e non contano qui. */
function notifiche(): string[] {
  return screen.queryAllByRole('alert').map((n) => n.textContent ?? '')
}

function notificaCon(frammento: string): HTMLElement {
  const trovata = screen.queryAllByRole('alert').find((n) => (n.textContent ?? '').includes(frammento))
  if (!trovata) throw new Error(`Nessuna notifica contiene "${frammento}". Presenti: ${JSON.stringify(notifiche())}`)
  return trovata
}

/**
 * Chiude una notifica dalla sua X.
 *
 * L'`avanza(0)` non è scaramanzia: AnimatePresence smonta il nodo al giro DOPO
 * quello in cui React lo toglie dallo stato, anche con le animazioni spente.
 * Asserire subito dopo il click leggerebbe il frame precedente all'uscita.
 */
async function chiudiAMano(notifica: HTMLElement) {
  fireEvent.click(within(notifica).getByRole('button', { name: /chiudi/i }))
  await avanza(0)
}

/** Il listino viene riparato e ricaricato: lo store non ha più errori. */
async function riparaListini() {
  await act(async () => {
    usePricelistStore.setState({ errors: { ...NESSUN_ERRORE } })
  })
}

async function cambiaErrore(errori: Errori) {
  await act(async () => {
    usePricelistStore.setState({ errors: { ...NESSUN_ERRORE, ...errori } })
  })
}

// Messaggio reale che parsePorte lancia se l'intestazione cambia — es. il
// listino dell'anno prossimo con "PREZZO 2027" al posto di "PREZZO 2026".
const MSG_PORTE =
  'Errore lettura file Porte: Foglio "modello_porta": intestazione (MODELLO PORTA / PREZZO 2026 / H>215 / H>240) non trovata'

describe('AppShell — gli errori di listino sono STATO, non eventi', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    useQuoteStore.getState().resetAll()
    usePricelistStore.setState({
      suMisura: null,
      marmeria: null,
      porte: null,
      errors: { ...NESSUN_ERRORE },
    })
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('parse porte fallito: compare la notifica Porte col messaggio del parser', async () => {
    mockLoadDefaultsWithErrors({ porte: MSG_PORTE })
    renderShell()
    await avanza(0)

    expect(notificaCon('Porte —').textContent).toContain('non trovata')
  })

  it('listino cucine presente ma rotto: compare la notifica Cucine (PR 10b-1)', async () => {
    mockLoadDefaultsWithErrors({ cucine: 'Errore lettura file Cucine: Foglio CUCINA non trovato' })
    renderShell()
    await avanza(0)

    expect(notificaCon('Cucine —').textContent).toContain('Foglio CUCINA non trovato')
  })

  it('tutti e tre rotti: le tre notifiche stanno a schermo INSIEME, nessuna perde il posto', async () => {
    // Il caso che la coda a slot singolo non sapeva reggere: tre errori, un solo
    // posto, i primi due sovrascritti. Qui non è "gestito": è irrappresentabile,
    // perché ogni categoria ha la sua chiave e nessuna scrive nel posto di un'altra.
    mockLoadDefaultsWithErrors({
      suMisura: 'file su misura illeggibile',
      marmeria: 'file marmeria illeggibile',
      porte: MSG_PORTE,
    })
    renderShell()
    await avanza(0)

    expect(notifiche()).toHaveLength(3)
    expect(notificaCon('Arredi —')).toBeTruthy()
    expect(notificaCon('Gres —')).toBeTruthy()
    expect(notificaCon('Porte —')).toBeTruthy()
  })

  it('la notifica di errore NON scade: dopo 10s è ancora a schermo', async () => {
    // Il cuore della PR: 3,5s è il tempo di guardare altrove. Un listino rotto
    // resta rotto, quindi la sua notifica resta.
    mockLoadDefaultsWithErrors({ porte: MSG_PORTE })
    renderShell()
    await avanza(0)
    expect(notificaCon('Porte —')).toBeTruthy()

    await avanza(10_000)

    expect(notificaCon('Porte —')).toBeTruthy()
  })

  it('chiudere UNA notifica non tocca le altre', async () => {
    mockLoadDefaultsWithErrors({
      suMisura: 'file su misura illeggibile',
      marmeria: 'file marmeria illeggibile',
      porte: MSG_PORTE,
    })
    renderShell()
    await avanza(0)
    expect(notifiche()).toHaveLength(3)

    await chiudiAMano(notificaCon('Gres —'))

    expect(notifiche()).toHaveLength(2)
    expect(notificaCon('Arredi —')).toBeTruthy()
    expect(notificaCon('Porte —')).toBeTruthy()
  })

  it('RIPARAZIONE: gli errori tornano a null e la notifica sparisce DA SOLA, senza dismiss', async () => {
    // Il comportamento nuovo che prima non esisteva: la notifica è derivata
    // dallo stato, quindi muore quando muore la condizione. Prima era un evento
    // sparato una volta sola: nessuna riparazione poteva spegnerlo.
    //
    // I tempi sono scelti perché il test NON possa passare per auto-dismiss:
    // a t=150ms un toast da 3500ms sarebbe comunque ancora a schermo.
    mockLoadDefaultsWithErrors({ porte: MSG_PORTE })
    renderShell()
    await avanza(0)

    await avanza(100)
    expect(notificaCon('Porte —')).toBeTruthy()

    await riparaListini()
    await avanza(50)

    expect(notifiche()).toEqual([])
  })

  it('chiusa a mano e poi il messaggio CAMBIA: riappare (chiudere vale per QUEL messaggio)', async () => {
    mockLoadDefaultsWithErrors({ porte: MSG_PORTE })
    renderShell()
    await avanza(0)

    await chiudiAMano(notificaCon('Porte —'))
    expect(notifiche()).toEqual([])

    // Antonio ricarica un file diverso, e si rompe in un modo diverso: è una
    // notizia nuova, non quella che ha già letto e chiuso.
    await cambiaErrore({ porte: 'Errore lettura file Porte: foglio "modello_porta" assente' })

    expect(notificaCon('Porte —').textContent).toContain('assente')
  })

  it('chiusa a mano e lo STESSO messaggio si ripresenta: resta chiusa', async () => {
    // L'altra faccia: "ho visto" deve reggere a un re-render o a un reload dei
    // listini che ritrova lo stesso identico guasto, o la chiusura non serve.
    mockLoadDefaultsWithErrors({ porte: MSG_PORTE })
    renderShell()
    await avanza(0)

    await chiudiAMano(notificaCon('Porte —'))
    expect(notifiche()).toEqual([])

    await cambiaErrore({ porte: MSG_PORTE })

    expect(notifiche()).toEqual([])
  })

  it('riparato e poi rotto di nuovo allo stesso modo: la notifica torna', async () => {
    // La chiusura non deve sopravvivere alla riparazione: se il guasto sparisce
    // e ricompare, è un fatto nuovo anche se il testo è identico.
    mockLoadDefaultsWithErrors({ porte: MSG_PORTE })
    renderShell()
    await avanza(0)

    await chiudiAMano(notificaCon('Porte —'))
    await riparaListini()
    await cambiaErrore({ porte: MSG_PORTE })

    expect(notificaCon('Porte —')).toBeTruthy()
  })

  it('listini a posto: nessuna notifica', async () => {
    mockLoadDefaultsWithErrors({})
    renderShell()
    await avanza(10_000)

    expect(notifiche()).toEqual([])
  })
})

// O9: la scelta dei fogli di Su Misura non si è applicata. L'avviso sta nel
// referto (`store`); qui si prova solo il cablaggio: stato derivato, persistente,
// che si spegne quando il referto cambia.
describe('AppShell — avviso della selezione fogli (O9)', () => {
  const NESSUN_REFERTO = { suMisura: null, marmeria: null, porte: null, cucine: null }
  const AVVISO =
    "La scelta dei fogli non è stata applicata. Nei prezzi possono esserci anche fogli di lavoro. Avvisa l'amministratore: il listino va ricaricato da Gestione Listini."
  const referto = (extra: { avviso?: string; note?: string[] } = {}) => ({
    file: 'sumisura_default.xlsx',
    caricati: [{ nome: 'ANTE', voci: 2 }],
    esclusi: [],
    note: [],
    ...extra,
  })

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    useQuoteStore.getState().resetAll()
    usePricelistStore.setState({ errors: { ...NESSUN_ERRORE }, referti: { ...NESSUN_REFERTO } })
    mockLoadDefaultsWithErrors({})
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
    usePricelistStore.setState({ referti: { ...NESSUN_REFERTO } })
  })

  it('avviso nel referto Su Misura: notifica persistente che non scade', async () => {
    usePricelistStore.setState({ referti: { ...NESSUN_REFERTO, suMisura: referto({ avviso: AVVISO }) } })
    renderShell()
    await avanza(0)

    expect(notificaCon('La scelta dei fogli').textContent).toContain(`Arredi — ${AVVISO}`)

    await avanza(10_000)

    expect(notificaCon('La scelta dei fogli')).toBeTruthy()
  })

  it('listino ricaricato senza avviso: la notifica si spegne da sola', async () => {
    usePricelistStore.setState({ referti: { ...NESSUN_REFERTO, suMisura: referto({ avviso: AVVISO }) } })
    renderShell()
    await avanza(0)
    expect(notificaCon('La scelta dei fogli')).toBeTruthy()

    // L'admin ricarica il file scegliendo i fogli: `impostaListino` sostituisce il referto.
    await act(async () => {
      usePricelistStore.setState({ referti: { ...NESSUN_REFERTO, suMisura: referto() } })
    })
    await avanza(0)

    expect(notifiche()).toEqual([])
  })

  it('note senza avviso (es. una nota di Cucine): nessuna notifica', async () => {
    // `note` è il dettaglio tecnico per l'admin e porta anche gli avvisi di
    // Marmeria e Cucine: specchiarle riempirebbe lo schermo di chi non può correggere.
    usePricelistStore.setState({
      referti: {
        ...NESSUN_REFERTO,
        suMisura: referto({ note: ['selezione fogli ignorata: il file della selezione non si è potuto leggere'] }),
        cucine: referto({ note: ["percentuale casse: nel file 15%, l'app usa 10%"] }),
      },
    })
    renderShell()
    await avanza(10_000)

    expect(notifiche()).toEqual([])
  })
})

describe('AppShell — backfill snapshot porte (E3)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    useQuoteStore.getState().resetAll()
    usePricelistStore.setState({ errors: { ...NESSUN_ERRORE } })
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('gira DOPO loadDefaults: alla reidratazione il listino non c è ancora', async () => {
    // È il motivo per cui il backfill non può stare nella migrate di zustand:
    // quella gira all'import del modulo, quando `porte` è ancora null.
    const ordine: string[] = []
    vi.spyOn(useQuoteStore.getState(), 'snapshottaPortePendenti').mockImplementation(() => {
      ordine.push('backfill')
    })
    vi.spyOn(usePricelistStore.getState(), 'loadDefaults').mockImplementation(async () => {
      ordine.push('loadDefaults')
    })
    renderShell()
    await avanza(0)

    expect(ordine).toEqual(['loadDefaults', 'backfill'])
  })

  it('un UPLOAD non ri-scatena il backfill: quel listino è scientemente diverso', async () => {
    // GestioneListini dopo un upload fa `await loadDefaults()` (:281). Se il
    // backfill ripartisse da lì, congelerebbe sulle righe vecchie i prezzi del
    // listino NUOVO — un prezzo che nessuno ha promesso al cliente.
    const backfill = vi
      .spyOn(useQuoteStore.getState(), 'snapshottaPortePendenti')
      .mockImplementation(() => {})
    vi.spyOn(usePricelistStore.getState(), 'loadDefaults').mockImplementation(async () => {})
    renderShell()
    await avanza(0)
    expect(backfill).toHaveBeenCalledTimes(1)

    await act(async () => {
      await usePricelistStore.getState().loadDefaults()
    })

    expect(backfill).toHaveBeenCalledTimes(1)
  })
})

// La tab mostrata si ricava a ogni render dal ruolo, invece di riscrivere lo
// stato in un effect (react-hooks/set-state-in-effect). Differenza voluta:
// chi perde il ruolo admin vede Arredi, chi lo riottiene torna dove era.
describe('AppShell — tab admin e cambio di ruolo', () => {
  beforeEach(() => {
    mockLoadDefaultsWithErrors({})
    useAuthStore.setState({ isAdmin: true })
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    useAuthStore.setState({ isAdmin: false })
  })

  it('perso il ruolo: Arredi; riottenuto: di nuovo Gestione Listini', async () => {
    renderShell()
    fireEvent.click(screen.getAllByRole('button', { name: /Gestione Listini/ })[0])
    expect(await screen.findByText('File nel bucket')).toBeTruthy()

    act(() => useAuthStore.setState({ isAdmin: false }))
    await waitFor(() => expect(screen.queryByText('File nel bucket')).toBeNull())

    act(() => useAuthStore.setState({ isAdmin: true }))
    expect(await screen.findByText('File nel bucket')).toBeTruthy()
  })

  it('Importa anagrafica (L21, PR C): solo l’admin la vede, senza la barra del preventivo; perso il ruolo, Arredi', async () => {
    renderShell()
    fireEvent.click(screen.getAllByRole('button', { name: /Importa anagrafica/ })[0])
    expect(await screen.findByLabelText('File dell’anagrafica (.csv)')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Genera Preventivo' })).toBeNull()

    act(() => useAuthStore.setState({ isAdmin: false }))
    await waitFor(() => expect(screen.queryByLabelText('File dell’anagrafica (.csv)')).toBeNull())
    expect(screen.queryAllByRole('button', { name: /Importa anagrafica/ })).toEqual([])
  })
})

// D5 (O58 della review): caricare un listino locale è dell'admin. Chi non lo è
// vede nella sezione Listini quale file è in uso (`aggiornato` = nome del file,
// come lo lascia `loadDefaults`), senza pulsanti.
describe('AppShell — upload del listino locale solo per admin', () => {
  beforeEach(() => {
    mockLoadDefaultsWithErrors({})
    // I tipi `Validato<…>` si ottengono solo da `validaListino`: qui basta il nome.
    usePricelistStore.setState({
      suMisura: { fogli: [], aggiornato: 'SuMisura_Rev12_ottobre.xlsx' } as never,
      marmeria: { aggiornato: 'marmeria_Rev_83.xlsx' } as never,
      porte: null,
    })
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    useAuthStore.setState({ isAdmin: false })
    usePricelistStore.setState({ suMisura: null, marmeria: null, porte: null, cucine: null })
  })

  const apriListini = () => fireEvent.click(screen.getAllByRole('button', { name: 'Listini' })[0])

  it('non admin: vede i listini in uso in sola lettura, nessun pulsante di caricamento', () => {
    useAuthStore.setState({ isAdmin: false })
    renderShell()
    apriListini()

    expect(screen.getByTitle('Listino Arredi in uso').textContent).toBe('SuMisura_Rev12_ottobre.xlsx')
    expect(screen.getByTitle('Listino Gres in uso').textContent).toBe('marmeria_Rev_83.xlsx')
    expect(screen.getByTitle('Listino Porte in uso').textContent).toBe('Porte: non caricato')
    expect(screen.getByTitle('Listino Cucine in uso').textContent).toBe('Cucine: non caricato')
    expect(screen.queryByTitle(/^Carica listino/)).toBeNull()
    expect(screen.queryByRole('button', { name: /Rev/ })).toBeNull()
  })

  it('admin: i pulsanti aprono la modale; Porte e Cucine restano in sola lettura', async () => {
    useAuthStore.setState({ isAdmin: true })
    usePricelistStore.setState({
      cucine: validatoPerTest({ ...listinoCucinaFinto, aggiornato: 'LISTINO CUCINA COLETTA.xls' }),
    })
    renderShell()
    apriListini()

    expect(screen.getByTitle('Listino Porte in uso')).toBeTruthy()
    expect(screen.getByTitle('Listino Cucine in uso').textContent).toBe('LISTINO CUCINA COLETTA.xls')
    expect(screen.queryByTitle('Carica listino Cucine')).toBeNull()
    fireEvent.click(screen.getByTitle('Carica listino Gres'))
    expect(await screen.findByText('Aggiorna Listino Gres')).toBeTruthy()
  })

  it('ruolo perso con la modale aperta: la modale si chiude e i pulsanti spariscono', async () => {
    useAuthStore.setState({ isAdmin: true })
    renderShell()
    apriListini()
    fireEvent.click(screen.getByTitle('Carica listino Arredi'))
    expect(await screen.findByText('Aggiorna Listino Arredi')).toBeTruthy()

    act(() => useAuthStore.setState({ isAdmin: false }))
    await waitFor(() => expect(screen.queryByText('Aggiorna Listino Arredi')).toBeNull())
    expect(screen.queryByTitle(/^Carica listino/)).toBeNull()
    expect(screen.getByTitle('Listino Arredi in uso')).toBeTruthy()
  })
})

// A6: cosa conta come lavoro lo provano i test di `quoteHaDati`. Qui si prova
// solo il cablaggio del gestore: quando chiede la conferma, e in che modo.
describe('AppShell — avviso di uscita', () => {
  beforeEach(() => {
    mockLoadDefaultsWithErrors({})
    useQuoteStore.getState().resetAll()
    useQuoteStore.getState().setRicordaPreventivo(false)
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    useQuoteStore.getState().resetAll()
    useQuoteStore.getState().setRicordaPreventivo(false)
  })

  /**
   * jsdom non costruisce un `BeforeUnloadEvent` («Illegal constructor») e su un
   * `Event` normale `returnValue = true` non lascia traccia: il setter si
   * cattura sull'istanza.
   */
  function chiudiTab(): { confermaChiesta: boolean; returnValue: unknown } {
    const ev = new Event('beforeunload', { cancelable: true })
    let returnValue: unknown
    Object.defineProperty(ev, 'returnValue', {
      set: (v: unknown) => { returnValue = v },
      get: () => returnValue,
    })
    window.dispatchEvent(ev)
    return { confermaChiesta: ev.defaultPrevented, returnValue }
  }

  it('con dati non salvati: preventDefault e returnValue = true (Chrome ed Edge prima della 119)', () => {
    renderShell()
    act(() => useQuoteStore.getState().setGiorniExtra(3))
    expect(chiudiTab()).toEqual({ confermaChiesta: true, returnValue: true })
  })

  it('stato iniziale: nessuna conferma', () => {
    renderShell()
    expect(chiudiTab()).toEqual({ confermaChiesta: false, returnValue: undefined })
  })

  it('«Ricorda preventivo» attivo: nessuna conferma, i dati restano salvati', () => {
    renderShell()
    act(() => {
      useQuoteStore.getState().setGiorniExtra(3)
      useQuoteStore.getState().setRicordaPreventivo(true)
    })
    expect(chiudiTab()).toEqual({ confermaChiesta: false, returnValue: undefined })
  })
})

// O10: se il preventivo salvato non era leggibile l'app riparte da vuoto, e lo
// dice. Qui `rehydrate()` dopo l'import basta (la shell legge l'esito, il TDZ
// del boot non c'entra); il percorso vero del boot è in `quoteIdratazioneGuasta`.
describe('AppShell — preventivo salvato illeggibile', () => {
  const CHIAVE = 'coletta-quote-v1'
  const COPIA = 'coletta-quote-v1-illeggibile'
  const GREZZO = '{"cliente":"Cognomesentinella" ??'
  const INIZIO = 'Il preventivo salvato non era leggibile. L\'app è ripartita da un preventivo vuoto; '

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    localStorage.clear()
    // Azzera anche copia e avviso, che sono stato di modulo.
    useQuoteStore.getState().resetAll()
    usePricelistStore.setState({ suMisura: null, marmeria: null, porte: null, errors: { ...NESSUN_ERRORE } })
    mockLoadDefaultsWithErrors({})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
    useQuoteStore.getState().resetAll()
    localStorage.clear()
  })

  it('blob messo da parte: notifica persistente con il testo della copia', async () => {
    localStorage.setItem(CHIAVE, GREZZO)
    await useQuoteStore.persist.rehydrate()

    const { rerender } = renderShell()
    await avanza(0)

    expect(notifiche()).toEqual([INIZIO + 'una copia è stata messa da parte.'])
    // Non scade: è l'esito del boot, non una notizia di un istante.
    await avanza(10_000)
    expect(notificaCon('non era leggibile')).toBeTruthy()

    // Logout: la shell si smonta, il provider della radice no. La notifica va
    // con la shell, o resterebbe sulla pagina di accesso.
    rerender(
      <ToastProvider>
        <div />
      </ToastProvider>
    )
    await avanza(0)
    expect(notifiche()).toEqual([])
  })

  it('copia non riuscita (quota): notifica con il testo senza copia', async () => {
    localStorage.setItem(CHIAVE, GREZZO)
    const setItemVero = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, chiave: string, valore: string) {
      if (chiave === COPIA) throw new DOMException('quota piena', 'QuotaExceededError')
      setItemVero.call(this, chiave, valore)
    })
    await useQuoteStore.persist.rehydrate()

    renderShell()
    await avanza(0)

    expect(notifiche()).toEqual([INIZIO + 'non è stato possibile conservarne una copia.'])
    expect(localStorage.getItem(COPIA)).toBeNull()
  })
})

// L21-B: «Genera» e «Salva» stanno nella barra del preventivo e, senza
// cliente, aprono la scelta del cliente. I rami di «Genera» hanno i loro test
// (usePrint); qui si prova la colla che gli altri non vedono: la barra montata
// in AppShell, `PrintContext`, la finestra condivisa col suo titolo.
// Progetto a valore perché non richiede nessun listino.
describe('AppShell — «Genera» e «Salva» senza cliente aprono la scelta del cliente', () => {
  beforeEach(() => {
    stampaMock.mockClear()
    mockLoadDefaultsWithErrors({})
    useQuoteStore.getState().resetAll()
    useQuoteStore.getState().addRigaProgettoValore({ descrizione: 'Voce di prova', prezzo: 1 })
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    useQuoteStore.getState().resetAll()
  })

  it('da Progetto a valore: «Genera» apre «Scegli il cliente per generare il preventivo», Esc chiude e non stampa', async () => {
    renderShell()
    fireEvent.click(screen.getAllByRole('button', { name: /Progetto a valore/ })[0])
    const barra = screen.getByRole('region', { name: 'Barra del preventivo' })
    fireEvent.click(within(barra).getByRole('button', { name: /Genera Preventivo/ }))

    const scelta = await screen.findByRole('dialog', { name: 'Scegli il cliente per generare il preventivo' })
    expect(within(scelta).getByRole('combobox')).toBeTruthy()
    expect(stampaMock).not.toHaveBeenCalled()

    fireEvent(scelta, new Event('cancel', { cancelable: true }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(stampaMock).not.toHaveBeenCalled()
  })

  it('«Salva» senza cliente apre la stessa finestra con «Scegli il cliente per salvare»', async () => {
    renderShell()
    const barra = screen.getByRole('region', { name: 'Barra del preventivo' })
    fireEvent.click(within(barra).getByRole('button', { name: 'Salva' }))
    expect(await screen.findByRole('dialog', { name: 'Scegli il cliente per salvare' })).toBeTruthy()
  })
})

// L21-B, § 3.6: «Cliente» e «Clienti» uno sotto l'altro confondevano.
describe('AppShell — nomi del menu', () => {
  beforeEach(() => mockLoadDefaultsWithErrors({}))
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('«Dati preventivo» e «Anagrafica clienti»; «Cliente» e «Clienti» non ci sono più', () => {
    renderShell()
    expect(screen.getAllByRole('button', { name: 'Dati preventivo' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: 'Anagrafica clienti' }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Cliente' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Clienti' })).toBeNull()
  })
})
